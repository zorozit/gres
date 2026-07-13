#!/usr/bin/env python3
"""
Enriquece payslips existentes com composicao[] a partir das saídas reais.

Para cada payslip sem composicao:
1. Busca saídas do colaborador no período (periodoInicio..periodoFim +2 dias)
2. Busca registros folha-pagamento do período (pra pegar turnos/entregas)
3. Monta composicao[] com:
   - Turnos/entregas (bruto - transporte)
   - Transporte (se > 0)
   - Cada desconto individual (Consumo Interno, Desc Adto Esp, A pagar, etc.)
4. Atualiza o payslip no DynamoDB (preserva todos os campos existentes)
"""

import boto3
import json
from decimal import Decimal
from datetime import datetime, timedelta

dynamodb = boto3.resource('dynamodb', region_name='us-east-2')
payslips_table = dynamodb.Table('gres-prod-payslips')
saidas_table = dynamodb.Table('gres-prod-saidas')
folha_table = dynamodb.Table('gres-prod-folha-pagamento')

TIPOS_DESCONTO = {'A pagar', 'A receber', 'Consumo Interno', 'Desconto Adiantamento Especial'}

def decimal_default(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError

def scan_all(table, **kwargs):
    items = []
    resp = table.scan(**kwargs)
    items.extend(resp.get('Items', []))
    while 'LastEvaluatedKey' in resp:
        resp = table.scan(ExclusiveStartKey=resp['LastEvaluatedKey'], **kwargs)
        items.extend(resp.get('Items', []))
    return items

def main():
    # Buscar todos os payslips
    payslips = scan_all(payslips_table)
    print(f"Total payslips: {len(payslips)}")
    
    sem_comp = [p for p in payslips if 'composicao' not in p or not p['composicao']]
    print(f"Sem composicao: {len(sem_comp)}")
    
    if not sem_comp:
        print("Nada a fazer!")
        return
    
    # Buscar todas as saídas
    print("Buscando saídas...")
    saidas = scan_all(saidas_table)
    print(f"  Total saídas: {len(saidas)}")
    
    # Index saídas por colaboradorId
    saidas_por_colab = {}
    for s in saidas:
        cid = s.get('colaboradorId', '')
        if cid not in saidas_por_colab:
            saidas_por_colab[cid] = []
        saidas_por_colab[cid].append(s)
    
    updated = 0
    errors = 0
    
    for ps in sem_comp:
        ps_id = ps['id']
        cid = ps.get('colaboradorId', '')
        nome = ps.get('nomeColaborador', '')
        bruto = float(ps.get('bruto', 0))
        transporte = float(ps.get('transporte', 0))
        descontos = float(ps.get('descontos', 0))
        liquido = float(ps.get('liquido', 0))
        periodo_ini = ps.get('periodoInicio', '')
        periodo_fim = ps.get('periodoFim', '')
        
        if not cid or not periodo_ini or not periodo_fim:
            print(f"  SKIP {ps_id}: dados incompletos")
            continue
        
        # Expandir range +2 dias pro fim (descontos podem cair no dia do pagamento)
        try:
            fim_dt = datetime.strptime(periodo_fim, '%Y-%m-%d')
            fim_exp = (fim_dt + timedelta(days=2)).strftime('%Y-%m-%d')
        except:
            fim_exp = periodo_fim
        
        # Buscar saídas do colaborador no período
        saidas_colab = saidas_por_colab.get(cid, [])
        saidas_periodo = []
        for s in saidas_colab:
            dt = s.get('dataPagamento', '') or s.get('data', '') or ''
            if dt and dt >= periodo_ini and dt <= fim_exp:
                saidas_periodo.append(s)
        
        # Montar composição
        composicao = []
        
        # 1) Turnos/entregas = bruto - transporte (o que sobra é trabalho)
        valor_trabalho = round(bruto - transporte, 2)
        if valor_trabalho > 0:
            composicao.append({
                'descricao': 'Turnos/entregas',
                'valor': Decimal(str(valor_trabalho)),
                'tipo': 'vencimento',
            })
        
        # 2) Transporte
        if transporte > 0:
            composicao.append({
                'descricao': 'Transporte (saldo)',
                'valor': Decimal(str(transporte)),
                'tipo': 'vencimento',
            })
        
        # 3) Descontos individuais
        total_desc_encontrado = 0
        for s in saidas_periodo:
            tipo = s.get('tipo', '') or s.get('origem', '') or s.get('referencia', '')
            if tipo not in TIPOS_DESCONTO:
                continue
            
            valor_s = float(s.get('valor', 0))
            if valor_s <= 0:
                continue
            
            desc_texto = s.get('descricao', '') or tipo
            data_s = s.get('dataPagamento', '') or s.get('data', '')
            
            composicao.append({
                'descricao': desc_texto,
                'valor': Decimal(str(-valor_s)),
                'tipo': 'desconto-operacional',
                'data': data_s,
            })
            total_desc_encontrado += valor_s
        
        # Se não encontrou descontos individuais mas o payslip tem valor > 0, adicionar genérico
        if descontos > 0 and total_desc_encontrado == 0:
            composicao.append({
                'descricao': 'Descontos (sem detalhe)',
                'valor': Decimal(str(-descontos)),
                'tipo': 'desconto-operacional',
            })
        
        # 4) Caixinhas (saídas tipo Caixinha no período)
        for s in saidas_periodo:
            tipo = s.get('tipo', '') or s.get('origem', '') or ''
            if tipo != 'Caixinha':
                continue
            if s.get('pagamentoIdLigado'):
                continue  # já processada num batch
            valor_cx = float(s.get('valor', 0))
            if valor_cx > 0:
                data_cx = s.get('dataPagamento', '') or s.get('data', '')
                composicao.append({
                    'descricao': f"Caixinha {s.get('descricao', '')}".strip(),
                    'valor': Decimal(str(valor_cx)),
                    'tipo': 'variavel',
                    'data': data_cx,
                })
        
        if not composicao:
            # Pelo menos colocar o bruto
            composicao.append({
                'descricao': 'Valor bruto',
                'valor': Decimal(str(bruto)),
                'tipo': 'vencimento',
            })
        
        # Atualizar no DDB
        try:
            payslips_table.update_item(
                Key={'id': ps_id},
                UpdateExpression='SET composicao = :c, tipoContrato = :tc, atualizadoEm = :ts',
                ExpressionAttributeValues={
                    ':c': composicao,
                    ':tc': 'Freelancer',
                    ':ts': datetime.utcnow().isoformat() + 'Z',
                },
            )
            n_desc = sum(1 for c in composicao if float(c['valor']) < 0)
            print(f"  ✅ {nome} ({periodo_ini}→{periodo_fim}): {len(composicao)} itens ({n_desc} descontos)")
            updated += 1
        except Exception as e:
            print(f"  ❌ {nome}: {e}")
            errors += 1
    
    print(f"\nResultado: {updated} atualizados, {errors} erros")

if __name__ == '__main__':
    main()
