#!/usr/bin/env python3
"""
Generate retroactive 'Desconto Transporte' for CLT employees who have
'Adiantamento Transporte' records but no corresponding descontos.
Uses escalas (presence data) to determine which days to generate.
DRY RUN by default. Pass --execute to write.
"""
import boto3, sys, json
from collections import defaultdict
from decimal import Decimal

DRY_RUN = '--execute' not in sys.argv
if DRY_RUN:
    print("=== DRY RUN === (pass --execute to apply)\n")
else:
    print("=== EXECUTING WRITES ===\n")

ddb = boto3.resource('dynamodb', region_name='us-east-2')
saidas_table = ddb.Table('gres-prod-saidas')
escalas_table = ddb.Table('gres-prod-escalas')
colabs_table = ddb.Table('gres-prod-colaboradores')

# 1. Get CLT employees with valorTransporte > 0
print("Loading CLT employees...")
colabs = []
params = {
    'FilterExpression': 'tipoContrato = :clt',
    'ExpressionAttributeValues': {':clt': 'CLT'}
}
while True:
    resp = colabs_table.scan(**params)
    colabs.extend(resp['Items'])
    if 'LastEvaluatedKey' not in resp:
        break
    params['ExclusiveStartKey'] = resp['LastEvaluatedKey']

clt_with_vt = {c['id']: {
    'nome': c.get('nome', '?'),
    'vtDia': float(c.get('valorTransporte', 0)),
    'unitId': c.get('unitId', ''),
} for c in colabs if float(c.get('valorTransporte', 0)) > 0}

print(f"CLT employees with VT > 0: {len(clt_with_vt)}")
for cid, info in clt_with_vt.items():
    print(f"  {cid}: {info['nome']} — R${info['vtDia']:.2f}/dia")

# 2. Get all transport-related saidas
print("\nLoading saidas...")
saidas = []
params = {
    'FilterExpression': '#t IN (:t1, :t2)',
    'ExpressionAttributeNames': {'#t': 'tipo'},
    'ExpressionAttributeValues': {':t1': 'Adiantamento Transporte', ':t2': 'Desconto Transporte'}
}
while True:
    resp = saidas_table.scan(**params)
    saidas.extend(resp['Items'])
    if 'LastEvaluatedKey' not in resp:
        break
    params['ExclusiveStartKey'] = resp['LastEvaluatedKey']

# 3. For each CLT employee with VT
print("\nLoading escalas...")
all_escalas = []
params = {}
while True:
    resp = escalas_table.scan(**params)
    all_escalas.extend(resp['Items'])
    if 'LastEvaluatedKey' not in resp:
        break
    params = {'ExclusiveStartKey': resp['LastEvaluatedKey']}
print(f"Total escalas: {len(all_escalas)}")

import time
total_created = 0
results = {}

for cid, info in clt_with_vt.items():
    vtDia = info['vtDia']
    nome = info['nome']
    
    # Get adiantamentos for this person
    adtos = [s for s in saidas if s['colaboradorId'] == cid and s.get('tipo') == 'Adiantamento Transporte']
    adtos.sort(key=lambda x: x.get('data', ''))
    
    if not adtos:
        results[cid] = {'nome': nome, 'adtos': 0, 'created': 0, 'msg': 'Sem adiantamentos'}
        continue
    
    # Get existing descontos
    descs = [s for s in saidas if s['colaboradorId'] == cid and s.get('tipo') == 'Desconto Transporte']
    desc_dates = set(d.get('data', '') for d in descs)
    
    # Calculate saldo per contract
    contracts = []
    for a in adtos:
        aid = a.get('adiantamentoId') or a['id']
        vinc = [d for d in descs if d.get('adiantamentoId') == aid]
        total_desc = sum(float(d.get('valor', 0)) for d in vinc)
        saldo = float(a.get('valor', 0)) - total_desc
        if saldo > 0.01:
            contracts.append({'id': aid, 'saldo': saldo, 'data': a.get('data', '')})
    
    # Unlinked descontos: deduct from oldest
    unlinked = [d for d in descs if not d.get('adiantamentoId')]
    for ul in sorted(unlinked, key=lambda x: x.get('data', '')):
        for c in contracts:
            if c['saldo'] > 0.01:
                c['saldo'] = max(0, c['saldo'] - float(ul.get('valor', 0)))
                break
    
    # Earliest adiantamento date
    earliest = adtos[0].get('data', '2026-04-01')
    
    # Presence days from escalas
    esc = [e for e in all_escalas if e.get('colaboradorId') == cid and (e.get('data', '') >= earliest)]
    present_days = set()
    for e in esc:
        if e.get('presenca') == 'presente' or e.get('presencaNoite') == 'presente':
            present_days.add(e['data'])
    
    # Filter out days already with descontos
    new_days = sorted(present_days - desc_dates)
    
    created = 0
    ct_idx = 0
    for dia in new_days:
        while ct_idx < len(contracts) and contracts[ct_idx]['saldo'] <= 0.01:
            ct_idx += 1
        if ct_idx >= len(contracts):
            break
        ct = contracts[ct_idx]
        valor = min(vtDia, ct['saldo'])
        
        if not DRY_RUN:
            saida_id = f"saida-retro-{int(time.time()*1000)}-{created}"
            saidas_table.put_item(Item={
                'id': saida_id,
                'colaboradorId': cid,
                'colaborador': nome,
                'favorecido': nome,
                'unitId': info['unitId'],
                'tipo': 'Desconto Transporte',
                'descricao': f'Transporte do dia {dia} (consumo do adto.)',
                'valor': Decimal(str(round(valor, 2))),
                'data': dia,
                'dataPagamento': dia,
                'pago': True,
                'responsavel': 'Sistema',
                'responsavelNome': 'Sistema',
                'adiantamentoId': ct['id'],
                'obs': f'Retroativo — baixa automática baseada em presença',
                'createdAt': f'2026-08-05T19:00:00Z',
                'updatedAt': f'2026-08-05T19:00:00Z',
            })
            time.sleep(0.05)  # throttle writes
        
        ct['saldo'] = round(ct['saldo'] - valor, 2)
        created += 1
    
    total_adto = sum(float(a.get('valor', 0)) for a in adtos)
    total_desc_val = sum(float(d.get('valor', 0)) for d in descs) + (created * vtDia)
    saldo_final = sum(c['saldo'] for c in contracts)
    
    results[cid] = {
        'nome': nome,
        'adtos': len(adtos),
        'totalAdto': total_adto,
        'vtDia': vtDia,
        'diasPresenca': len(present_days),
        'diasJaBaixados': len(desc_dates),
        'created': created,
        'saldoFinal': saldo_final,
        'contracts': [(c['id'], c['data'], c['saldo']) for c in contracts],
    }
    total_created += created

# Report
print("\n" + "=" * 110)
print(f"{'Colaborador':<35} {'Adtos':>5} {'TotAdto':>10} {'VT/dia':>8} {'Dias':>5} {'JáBaix':>7} {'Novos':>6} {'Saldo':>10}")
print("-" * 110)
for cid, r in sorted(results.items(), key=lambda x: -x[1].get('saldoFinal', 0)):
    if r.get('msg'):
        print(f"{r['nome'][:35]:<35} {r.get('msg')}")
        continue
    print(f"{r['nome'][:35]:<35} {r['adtos']:>5} R${r['totalAdto']:>8.2f} R${r['vtDia']:>6.2f} {r['diasPresenca']:>5} {r['diasJaBaixados']:>7} {r['created']:>6} R${r['saldoFinal']:>8.2f}")
    for (cid2, cdata, csaldo) in r['contracts']:
        status = '✅ quitado' if csaldo <= 0.01 else f'⚠️ R${csaldo:.2f} restante'
        print(f"   └─ {cdata} → {status}")

print(f"\n{'=' * 60}")
print(f"Total descontos criados: {total_created}")
if DRY_RUN:
    print("⚠️ DRY RUN — no changes. Pass --execute to apply.")
else:
    print(f"✅ {total_created} descontos criados no DynamoDB.")
