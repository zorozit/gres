#!/usr/bin/env node
/**
 * Script de Importação de Movimentos de Caixa - Restaurante Porta
 * 
 * Este script importa movimentos de caixa históricos de um arquivo CSV
 * para o DynamoDB (tabela: gres-prod-caixa)
 * 
 * Uso:
 *   node importar-caixa-porta.js --unitId=12345678901234 --csv=movimentos-caixa-porta.csv [--dry-run]
 */

const DynamoDB = require('aws-sdk/clients/dynamodb');
const fs = require('fs');
const path = require('path');

const dynamodb = new DynamoDB.DocumentClient({
  region: 'us-east-2'
});

// Argumentos de linha de comando
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.split('=');
  acc[key.replace('--', '')] = value || true;
  return acc;
}, {});

const UNIT_ID = args.unitId || '00000000000000';
const CSV_FILE = args.csv || 'movimentos-caixa-porta.csv';
const DRY_RUN = args['dry-run'] || false;

// Helper: converter data DD/MM/YYYY para YYYY-MM-DD
function parseData(dataStr) {
  const [dia, mes, ano] = dataStr.split('/');
  return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
}

// Helper: converter valor para float
function parseValor(valorStr) {
  if (!valorStr || valorStr.trim() === '' || valorStr === 'null') return 0;
  return parseFloat(valorStr.replace(',', '.'));
}

// Helper: gerar ID único
function gerarId(data, periodo) {
  const timestamp = new Date(data + 'T00:00:00').getTime();
  const random = Math.random().toString(36).substring(2, 8);
  return `caixa-${timestamp}-${random}`;
}

// Ler e processar CSV
function lerCSV(filePath) {
  const conteudo = fs.readFileSync(filePath, 'utf-8');
  const linhas = conteudo.trim().split('\n');
  const cabecalho = linhas[0].split(',');
  
  return linhas.slice(1).map(linha => {
    const valores = linha.split(',');
    const obj = {};
    
    cabecalho.forEach((campo, i) => {
      obj[campo] = valores[i];
    });
    
    return obj;
  });
}

// Importar um movimento
async function importarMovimento(mov) {
  try {
    const dataISO = parseData(mov.data);
    const id = gerarId(dataISO, mov.periodo);

    const item = {
      id,
      unitId: UNIT_ID,
      data: dataISO,
      diaSemana: parseInt(mov.diaSemana),
      periodo: mov.periodo,
      
      // Valores de abertura e máquinas
      abertura: parseValor(mov.abertura),
      maq1: parseValor(mov.maq1),
      maq2: parseValor(mov.maq2),
      maq3: parseValor(mov.maq3),
      maq4: parseValor(mov.maq4),
      maq5: parseValor(mov.maq5),
      maq6: parseValor(mov.maq6),
      maq7: parseValor(mov.maq7),
      
      // Formas de pagamento
      ifood: parseValor(mov.ifood),
      dinheiro: parseValor(mov.dinheiro),
      pix: parseValor(mov.pix),
      fiado: parseValor(mov.fiado),
      
      // Totais e conferência
      total: parseValor(mov.total),
      sangria: parseValor(mov.sangria),
      sistema: parseValor(mov.sistema),
      diferenca: parseValor(mov.diferenca),
      
      // Metadados
      responsavel: mov.conferencia || 'Sistema',
      responsavelNome: mov.conferencia || 'Sistema',
      status: 'fechado',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (DRY_RUN) {
      console.log(`[DRY-RUN] ${mov.data} ${mov.periodo} - R$ ${mov.total}`);
      return { success: true, id, dryRun: true };
    }

    await dynamodb.put({
      TableName: 'gres-prod-caixa',
      Item: item
    }).promise();

    console.log(`✓ ${mov.data} ${mov.periodo} - R$ ${mov.total}`);
    return { success: true, id };
    
  } catch (error) {
    console.error(`✗ ${mov.data} ${mov.periodo}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Função principal
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  IMPORTAÇÃO DE MOVIMENTOS DE CAIXA - RESTAURANTE PORTA      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  if (DRY_RUN) {
    console.log('⚠️  MODO DRY-RUN ATIVADO - Nenhum dado será gravado\n');
  }
  
  // Verificar arquivo CSV
  const csvPath = path.resolve(__dirname, CSV_FILE);
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ Arquivo CSV não encontrado: ${csvPath}`);
    process.exit(1);
  }
  
  // Ler movimentos
  console.log(`📂 Lendo arquivo: ${CSV_FILE}`);
  const movimentos = lerCSV(csvPath);
  console.log(`📊 Total de movimentos: ${movimentos.length}`);
  console.log(`🏢 Unit ID: ${UNIT_ID}\n`);
  
  let sucessos = 0;
  let erros = 0;
  
  for (const mov of movimentos) {
    const resultado = await importarMovimento(mov);
    if (resultado.success) {
      sucessos++;
    } else {
      erros++;
    }
    
    // Aguardar 100ms entre importações
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  RESUMO DA IMPORTAÇÃO`);
  console.log(`║  ✅ Sucessos: ${sucessos}`);
  console.log(`║  ❌ Erros: ${erros}`);
  console.log(`║  📊 Total: ${movimentos.length}`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  if (DRY_RUN) {
    console.log('\n💡 Execute sem --dry-run para importar de fato');
  }
}

// Executar
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('\n❌ Erro fatal:', error);
    process.exit(1);
  });
