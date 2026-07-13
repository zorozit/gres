#!/usr/bin/env python3
"""
Enriquece payslips com composicao[] detalhada — CRÉDITOS + DÉBITOS.

Créditos (cada um individualmente):
  - Cada turno trabalhado (data, valor, turno)
  - Cada dia de transporte (data, valor)
  - Cada caixinha (data, valor, descrição)

Débitos (cada um individualmente):
  - Cada saída de desconto (Consumo Interno, Desc Adto Esp, A pagar, etc.)
"""

import boto3
from decimal import Decimal
from datetime import datetime, timedelta

dynamodb = boto3.resource('dynamodb', region_name='us-east-2')
payslips_table = dynamodb.Table('gres-prod-payslips')
saidas_table = dynamodb.Table('gres-prod-saidas')
folha_table = dynamodb.Table('gres-prod-folha-pagamento')

TIPOS_DESCONTO = {'A pagar', 'A receber', 'Consumo Interno', 'Desconto Adiantamento Especial'}

def scan_all(table, **kwargs):
    items = []
    resp = table.scan(**kwargs)
    items.extend(resp.get('Items', []))
    while 'LastEvaluatedKey' in resp:
        resp = table.scan(ExclusiveStartKey=resp['LastEvaluatedKey'], **kwargs)
        items.extend(resp.get('Items', []))
    return items

def fmt_data(d):
    """2026-07-03 → 03/07"""
    if not d or len(d) < 10:
        return d or ''
    return f"{d[8:10]}/{d[5:7]}"

def main():
    payslips = scan_all(payslips_table)
    print(f"Total payslips: {len(payslips)}")

    # Buscar TODOS os registros de folha (turnos + transporte)
    print("Buscando folha-pagamento...")
    folha_all = scan_all(folha_table)
    print(f"  Total registros folha: {len(folha_all)}")

    # Index: folha por colaboradorId
    folha_por_colab = {}
    for f in folha_all:
        cid = str(f.get('colaboradorId', ''))
        if cid not in folha_por_colab:
            folha_por_colab[cid] = []
        folha_por_colab[cid].append(f)

    # Buscar todas as saídas
    print("Buscando saídas...")
    saidas = scan_all(saidas_table)
    print(f"  Total saídas: {len(saidas)}")

    saidas_por_colab = {}
    for s in saidas:
        cid = str(s.get('colaboradorId', ''))
        if cid not in saidas_por_colab:
            saidas_por_colab[cid] = []
        saidas_por_colab[cid].append(s)

    updated = 0
    errors = 0

    for ps in payslips:
        ps_id = ps['id']
        cid = str(ps.get('colaboradorId', ''))
        nome = str(ps.get('nomeColaborador', ''))
        bruto = float(ps.get('bruto', 0))
        transporte_ps = float(ps.get('transporte', 0))
        descontos_ps = float(ps.get('descontos', 0))
        liquido_ps = float(ps.get('liquido', 0))
        periodo_ini = str(ps.get('periodoInicio', ''))
        periodo_fim = str(ps.get('periodoFim', ''))

        if not cid or not periodo_ini or not periodo_fim:
            print(f"  SKIP {ps_id}: dados incompletos")
            continue

        # Expandir range +2 dias pro fim
        try:
            fim_dt = datetime.strptime(periodo_fim, '%Y-%m-%d')
            fim_exp = (fim_dt + timedelta(days=2)).strftime('%Y-%m-%d')
        except:
            fim_exp = periodo_fim

        composicao = []

        # ========== CRÉDITOS ==========

        # 1) Turnos trabalhados (registros freelancer-dia que NÃO são transporte)
        folha_colab = folha_por_colab.get(cid, [])
        turnos = []
        transportes = []
        for f in folha_colab:
            tipo = str(f.get('tipo', ''))
            tipoCodigo = str(f.get('tipoCodigo', ''))
            data = str(f.get('data', ''))
            if tipo != 'freelancer-dia':
                continue
            if not data or data < periodo_ini or data > periodo_fim:
                continue
            valor = float(f.get('valor', 0))
            if valor <= 0:
                continue
            turno_label = str(f.get('turno', ''))
            if tipoCodigo == 'transporte-freelancer':
                transportes.append({'data': data, 'valor': valor})
            else:
                turnos.append({'data': data, 'valor': valor, 'turno': turno_label})

        # Agrupar turnos por data (pode ter 2 turnos no mesmo dia = dobra)
        turnos_by_date = {}
        for t in sorted(turnos, key=lambda x: x['data']):
            d = t['data']
            if d not in turnos_by_date:
                turnos_by_date[d] = {'valor': 0, 'turnos': []}
            turnos_by_date[d]['valor'] += t['valor']
            if t['turno']:
                turnos_by_date[d]['turnos'].append(t['turno'])

        for d in sorted(turnos_by_date.keys()):
            info = turnos_by_date[d]
            turno_names = info['turnos']
            if len(turno_names) > 1:
                label = f"Dobra {fmt_data(d)} ({' + '.join(turno_names)})"
            elif turno_names:
                label = f"Turno {fmt_data(d)} ({turno_names[0]})"
            else:
                label = f"Turno {fmt_data(d)}"
            composicao.append({
                'descricao': label,
                'valor': Decimal(str(round(info['valor'], 2))),
                'tipo': 'vencimento',
                'data': d,
            })

        # 2) Transporte por dia
        for t in sorted(transportes, key=lambda x: x['data']):
            composicao.append({
                'descricao': f"Transporte {fmt_data(t['data'])}",
                'valor': Decimal(str(round(t['valor'], 2))),
                'tipo': 'vencimento',
                'data': t['data'],
            })

        # 3) Caixinhas (saídas tipo Caixinha no período)
        saidas_colab = saidas_por_colab.get(cid, [])
        for s in sorted(saidas_colab, key=lambda x: str(x.get('data', ''))):
            tipo = str(s.get('tipo', '')) or str(s.get('origem', ''))
            if tipo != 'Caixinha':
                continue
            dt = str(s.get('dataPagamento', '')) or str(s.get('data', ''))
            if not dt or dt < periodo_ini or dt > fim_exp:
                continue
            valor_cx = float(s.get('valor', 0))
            if valor_cx <= 0:
                continue
            desc_cx = str(s.get('descricao', ''))
            composicao.append({
                'descricao': f"Caixinha {desc_cx}".strip() if desc_cx else f"Caixinha {fmt_data(dt)}",
                'valor': Decimal(str(round(valor_cx, 2))),
                'tipo': 'variavel',
                'data': dt,
            })

        # ========== DÉBITOS ==========

        for s in sorted(saidas_colab, key=lambda x: str(x.get('data', ''))):
            tipo = str(s.get('tipo', '')) or str(s.get('origem', ''))
            if tipo not in TIPOS_DESCONTO:
                continue
            dt = str(s.get('dataPagamento', '')) or str(s.get('data', ''))
            if not dt or dt < periodo_ini or dt > fim_exp:
                continue
            valor_s = float(s.get('valor', 0))
            if valor_s <= 0:
                continue
            desc_texto = str(s.get('descricao', '')) or tipo
            composicao.append({
                'descricao': desc_texto,
                'valor': Decimal(str(round(-valor_s, 2))),
                'tipo': 'desconto-operacional',
                'data': dt,
            })

        # ========== FALLBACK ==========
        if not composicao:
            # Pelo menos bruto genérico
            if bruto > 0:
                composicao.append({
                    'descricao': 'Valor bruto',
                    'valor': Decimal(str(bruto)),
                    'tipo': 'vencimento',
                })

        # Estatísticas
        n_creditos = sum(1 for c in composicao if float(c['valor']) > 0)
        n_debitos = sum(1 for c in composicao if float(c['valor']) < 0)
        total_comp = sum(float(c['valor']) for c in composicao)

        # Atualizar no DDB
        try:
            payslips_table.update_item(
                Key={'id': ps_id},
                UpdateExpression='SET composicao = :c, tipoContrato = :tc, atualizadoEm = :ts',
                ExpressionAttributeValues={
                    ':c': composicao,
                    ':tc': ps.get('tipoContrato', 'Freelancer'),
                    ':ts': datetime.now().isoformat() + 'Z',
                },
            )
            print(f"  ✅ {nome[:30]:30s} ({periodo_ini}→{periodo_fim}): {len(composicao)} itens ({n_creditos}↑ {n_debitos}↓) total={total_comp:.2f} liq={liquido_ps:.2f}")
            updated += 1
        except Exception as e:
            print(f"  ❌ {nome}: {e}")
            errors += 1

    print(f"\nResultado: {updated} atualizados, {errors} erros")

if __name__ == '__main__':
    main()
