const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-2' }));

(async () => {
  let items = [], ExclusiveStartKey;
  do {
    const r = await client.send(new ScanCommand({
      TableName: 'gres-prod-saidas',
      ExclusiveStartKey,
    }));
    items.push(...(r.Items || []));
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  console.log('TOTAL saidas:', items.length);

  // Tipos que aparecem como pendentes anteriores no FreelancerPagamento
  const TIPOS_PEND = new Set(['A pagar','A receber','Consumo Interno','Caixinha','Desconto']);
  
  const orfas = items.filter(s => {
    const t = s.tipo || s.origem || '';
    return s.pago !== true && s.pago !== 'true' && !s.pagamentoIdLigado
      && (TIPOS_PEND.has(t) || String(t).toLowerCase().includes('desconto') || String(t).toLowerCase().includes('consumo') || String(t).toLowerCase().includes('receber'));
  });

  console.log('TOTAL orfas (pago=false + sem pagamentoIdLigado):', orfas.length);

  // Agrupar por colaborador
  const byColab = {};
  for (const s of orfas) {
    const cid = s.colaboradorId || 'SEM_COLAB';
    if (!byColab[cid]) byColab[cid] = { count: 0, total: 0, items: [] };
    byColab[cid].count++;
    byColab[cid].total += parseFloat(s.valor) || 0;
    byColab[cid].items.push({
      id: s.id,
      tipo: s.tipo || s.origem,
      valor: s.valor,
      data: s.data || s.dataPagamento,
      descricao: s.descricao || s.obs || '',
      unitId: s.unitId,
    });
  }

  // Buscar nomes
  const colabRes = await client.send(new ScanCommand({ TableName: 'gres-prod-colaboradores' }));
  const nomes = {};
  for (const c of (colabRes.Items || [])) nomes[c.id] = { nome: c.nome, tipoContrato: c.tipoContrato || c.contrato, unitId: c.unitId };

  const linhas = Object.entries(byColab).map(([cid, d]) => ({
    cid,
    nome: nomes[cid]?.nome || '(sem cadastro)',
    contrato: nomes[cid]?.tipoContrato || '?',
    unitId: nomes[cid]?.unitId || d.items[0]?.unitId,
    count: d.count,
    total: d.total,
  })).sort((a,b) => b.total - a.total);

  console.log('\n=== ÓRFÃS POR COLABORADOR ===');
  console.log('Contrato\tCount\tTotal\tUnit\tNome');
  for (const l of linhas) {
    console.log(`${l.contrato}\t${l.count}\tR$ ${l.total.toFixed(2)}\t${l.unitId||'?'}\t${l.nome}`);
  }

  // Salvar detalhes num JSON
  require('fs').writeFileSync('/tmp/orfas_detalhe.json', JSON.stringify({ byColab, nomes }, null, 2));
  console.log('\nDetalhes salvos em /tmp/orfas_detalhe.json');

  // Sumário por contrato
  const porContrato = {};
  for (const l of linhas) {
    const c = l.contrato || '?';
    if (!porContrato[c]) porContrato[c] = { colabs: 0, saidas: 0, total: 0 };
    porContrato[c].colabs++;
    porContrato[c].saidas += l.count;
    porContrato[c].total += l.total;
  }
  console.log('\n=== SUMÁRIO POR CONTRATO ===');
  for (const [c, s] of Object.entries(porContrato)) {
    console.log(`${c}: ${s.colabs} colabs, ${s.saidas} saidas, R$ ${s.total.toFixed(2)}`);
  }
})().catch(e => { console.error('ERRO:', e); process.exit(1); });
