#!/usr/bin/env python3
"""
Retroactive transport discount linking script.
- Links existing 'Desconto Transporte' records (sem adiantamentoId) to the correct
  'Adiantamento Transporte' contracts (oldest first).
- DRY RUN by default. Pass --execute to actually write.
"""
import boto3, sys, json
from decimal import Decimal

DRY_RUN = '--execute' not in sys.argv
if DRY_RUN:
    print("=== DRY RUN === (pass --execute to apply)\n")
else:
    print("=== EXECUTING WRITES ===\n")

ddb = boto3.resource('dynamodb', region_name='us-east-2')
table = ddb.Table('gres-prod-saidas')

# Scan all transport-related records
print("Scanning saidas...")
items = []
params = {
    'FilterExpression': '#t IN (:t1, :t2)',
    'ExpressionAttributeNames': {'#t': 'tipo'},
    'ExpressionAttributeValues': {':t1': 'Adiantamento Transporte', ':t2': 'Desconto Transporte'}
}
while True:
    resp = table.scan(**params)
    items.extend(resp['Items'])
    if 'LastEvaluatedKey' not in resp:
        break
    params['ExclusiveStartKey'] = resp['LastEvaluatedKey']

adtos = [i for i in items if i.get('tipo') == 'Adiantamento Transporte']
descs = [i for i in items if i.get('tipo') == 'Desconto Transporte']

print(f"Found {len(adtos)} adiantamentos, {len(descs)} descontos\n")

# Group adiantamentos by colaborador, sorted by date (oldest first)
from collections import defaultdict
adto_by_colab = defaultdict(list)
for a in adtos:
    adto_by_colab[a['colaboradorId']].append(a)
for cid in adto_by_colab:
    adto_by_colab[cid].sort(key=lambda x: x.get('data', ''))

# Group descontos by colaborador
desc_by_colab = defaultdict(list)
for d in descs:
    desc_by_colab[d['colaboradorId']].append(d)
for cid in desc_by_colab:
    desc_by_colab[cid].sort(key=lambda x: x.get('data', ''))

# For each colaborador with adiantamentos, calculate saldos and link descontos
total_linked = 0
total_already_linked = 0
summary = {}

for cid, colab_adtos in sorted(adto_by_colab.items()):
    colab_descs = desc_by_colab.get(cid, [])
    
    # Build contract saldo tracker
    contracts = []
    for a in colab_adtos:
        aid = a.get('adiantamentoId') or a['id']
        contracts.append({
            'id': aid,
            'valor': float(a.get('valor', 0)),
            'data': a.get('data', ''),
            'saldo': float(a.get('valor', 0)),
        })
    
    # First pass: apply already-linked descontos
    linked_descs = [d for d in colab_descs if d.get('adiantamentoId')]
    unlinked_descs = [d for d in colab_descs if not d.get('adiantamentoId')]
    
    for d in linked_descs:
        aid = d['adiantamentoId']
        val = float(d.get('valor', 0))
        for c in contracts:
            if c['id'] == aid:
                c['saldo'] = max(0, c['saldo'] - val)
                break
        total_already_linked += 1
    
    # Second pass: link unlinked descontos to oldest contract with saldo
    to_update = []
    for d in unlinked_descs:
        val = float(d.get('valor', 0))
        # Find oldest contract with saldo
        target = None
        for c in contracts:
            if c['saldo'] > 0.01:
                target = c
                break
        if target:
            target['saldo'] = max(0, target['saldo'] - val)
            to_update.append((d['id'], target['id']))
            total_linked += 1
    
    # Summary
    colab_name = colab_adtos[0].get('colaborador', '') or colab_adtos[0].get('favorecido', '') or cid
    total_adto = sum(float(a.get('valor', 0)) for a in colab_adtos)
    total_desc_val = sum(float(d.get('valor', 0)) for d in colab_descs)
    saldo_final = sum(c['saldo'] for c in contracts)
    
    summary[cid] = {
        'nome': colab_name,
        'adtos': len(colab_adtos),
        'totalAdto': total_adto,
        'descs': len(colab_descs),
        'totalDesc': total_desc_val,
        'linked': len([d for d in linked_descs]),
        'toLink': len(to_update),
        'saldoFinal': saldo_final,
        'contracts': [(c['id'], c['data'], c['valor'], c['saldo']) for c in contracts],
    }
    
    # Execute updates
    if to_update and not DRY_RUN:
        for (desc_id, adto_id) in to_update:
            table.update_item(
                Key={'id': desc_id},
                UpdateExpression='SET adiantamentoId = :aid',
                ExpressionAttributeValues={':aid': adto_id}
            )

# Print summary
print("=" * 100)
print(f"{'Colaborador':<35} {'Adtos':>5} {'TotAdto':>10} {'Descs':>6} {'TotDesc':>10} {'Linked':>7} {'ToLink':>7} {'Saldo':>10}")
print("-" * 100)
for cid, s in sorted(summary.items(), key=lambda x: -x[1]['saldoFinal']):
    print(f"{s['nome'][:35]:<35} {s['adtos']:>5} R${s['totalAdto']:>8.2f} {s['descs']:>6} R${s['totalDesc']:>8.2f} {s['linked']:>7} {s['toLink']:>7} R${s['saldoFinal']:>8.2f}")
    for (cid2, cdata, cval, csaldo) in s['contracts']:
        status = '✅ quitado' if csaldo <= 0.01 else f'⚠️ R${csaldo:.2f} restante'
        print(f"   └─ {cdata} R${cval:.2f} → {status}")

print(f"\n{'=' * 60}")
print(f"Total already linked:    {total_already_linked}")
print(f"Total newly linked:      {total_linked}")
print(f"Total descontos orphans: {sum(1 for d in descs if not d.get('adiantamentoId') and d['colaboradorId'] not in adto_by_colab)}")
if DRY_RUN:
    print(f"\n⚠️ DRY RUN — no changes written. Pass --execute to apply.")
else:
    print(f"\n✅ All {total_linked} records updated in DynamoDB.")
