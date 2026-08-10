#!/usr/bin/env python3
"""
Link orphan 'Desconto Adiantamento Especial' records to the correct
'Adiantamento Especial' contracts. Uses same logic as AdiantamentosSaldos:
oldest contract first.
DRY RUN by default. Pass --execute to write.
"""
import boto3, sys, json

DRY_RUN = '--execute' not in sys.argv
print(f"=== {'DRY RUN' if DRY_RUN else 'EXECUTING'} ===\n")

ddb = boto3.resource('dynamodb', region_name='us-east-2')
table = ddb.Table('gres-prod-saidas')

# Scan all especial-related records
print("Scanning...")
items = []
params = {
    'FilterExpression': '#t IN (:t1, :t2)',
    'ExpressionAttributeNames': {'#t': 'tipo'},
    'ExpressionAttributeValues': {':t1': 'Adiantamento Especial', ':t2': 'Desconto Adiantamento Especial'}
}
while True:
    resp = table.scan(**params)
    items.extend(resp['Items'])
    if 'LastEvaluatedKey' not in resp:
        break
    params['ExclusiveStartKey'] = resp['LastEvaluatedKey']

adtos = [i for i in items if i.get('tipo') == 'Adiantamento Especial']
descs = [i for i in items if i.get('tipo') == 'Desconto Adiantamento Especial']
orphans = [d for d in descs if not d.get('adiantamentoId')]

print(f"Adiantamentos: {len(adtos)}, Descontos: {len(descs)}, Orphans: {len(orphans)}\n")

from collections import defaultdict
orphans_by_colab = defaultdict(list)
for o in orphans:
    orphans_by_colab[o['colaboradorId']].append(o)

total_linked = 0

for cid, colab_orphans in sorted(orphans_by_colab.items()):
    # Get all adiantamentos for this person
    colab_adtos = sorted(
        [a for a in adtos if a['colaboradorId'] == cid],
        key=lambda x: x.get('data', '')
    )
    # Get all linked descontos
    colab_descs_linked = [d for d in descs if d['colaboradorId'] == cid and d.get('adiantamentoId')]
    
    # Build contract saldo tracker
    contracts = []
    for a in colab_adtos:
        aid = a.get('adiantamentoId') or a['id']
        vinc = [d for d in colab_descs_linked if d.get('adiantamentoId') == aid]
        total_desc = sum(float(d.get('valor', 0)) for d in vinc)
        saldo = float(a.get('valor', 0)) - total_desc
        contracts.append({'id': aid, 'saldo': saldo, 'data': a.get('data', ''), 'valor': float(a.get('valor', 0))})
    
    nome = colab_orphans[0].get('colaborador', '') or colab_orphans[0].get('favorecido', '') or cid
    print(f"--- {nome} ({cid}) ---")
    print(f"  Contratos: {len(contracts)}")
    for c in contracts:
        print(f"    {c['data']} R${c['valor']:.2f} saldo=R${c['saldo']:.2f} id={c['id'][:30]}")
    
    # Sort orphans by date
    colab_orphans.sort(key=lambda x: x.get('data', ''))
    
    linked = 0
    for o in colab_orphans:
        val = float(o.get('valor', 0))
        # Find oldest contract with saldo > 0
        target = None
        for c in contracts:
            if c['saldo'] > 0.01:
                target = c
                break
        
        if target:
            target['saldo'] = round(target['saldo'] - val, 2)
            print(f"  LINK: {o.get('data','')} R${val:.2f} → {target['id'][:30]} (saldo depois: R${target['saldo']:.2f})")
            
            if not DRY_RUN:
                table.update_item(
                    Key={'id': o['id']},
                    UpdateExpression='SET adiantamentoId = :aid',
                    ExpressionAttributeValues={':aid': target['id']}
                )
            linked += 1
        else:
            print(f"  ⚠️ SEM CONTRATO: {o.get('data','')} R${val:.2f} — nenhum contrato com saldo")
    
    total_linked += linked
    print(f"  Linked: {linked}\n")
    print(f"  Saldos finais:")
    for c in contracts:
        status = '✅' if c['saldo'] <= 0.01 else f'⚠️ R${c["saldo"]:.2f}'
        print(f"    {c['data']} R${c['valor']:.2f} → {status}")
    print()

print(f"Total linked: {total_linked}")
if DRY_RUN:
    print("⚠️ DRY RUN. Pass --execute to apply.")
else:
    print(f"✅ {total_linked} records updated.")
