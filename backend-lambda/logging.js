const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient({ region: 'us-east-2' });
const { v4: uuidv4 } = require('uuid');

/**
 * Registra uma ação no sistema para auditoria
 * @param {string} modulo - Nome do módulo (caixa, saidas, colaboradores, etc)
 * @param {string} acao - Tipo de ação (CREATE, READ, UPDATE, DELETE, EXPORT)
 * @param {string} usuario - Email do usuário que realizou a ação
 * @param {string} unitId - ID da unidade
 * @param {object} dados - Dados completos da transação
 * @param {object} dadosAntigos - Dados anteriores (para UPDATE)
 * @param {string} status - Status da operação (success, error)
 * @param {string} erro - Mensagem de erro (se houver)
 */
async function registrarLog(modulo, acao, usuario, unitId, dados, dadosAntigos = null, status = 'success', erro = null) {
  try {
    const logId = `${modulo}-${uuidv4()}`;
    const timestamp = new Date().toISOString();

    const logItem = {
      logId,
      timestamp,
      modulo,
      acao,
      usuario,
      unitId,
      status,
      dados: JSON.stringify(dados),
      dadosAntigos: dadosAntigos ? JSON.stringify(dadosAntigos) : null,
      erro: erro || null,
      ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 dias de retenção
    };

    await dynamodb.put({
      TableName: 'gres-prod-logs',
      Item: logItem
    }).promise();

    console.log(`✅ Log registrado: ${modulo} - ${acao} - ${usuario}`);
    return logId;
  } catch (error) {
    console.error('❌ Erro ao registrar log:', error);
    // Não lançar erro para não interromper a operação principal
    return null;
  }
}

/**
 * Busca logs com filtros
 * @param {string} modulo - Filtro por módulo
 * @param {string} usuario - Filtro por usuário
 * @param {string} acao - Filtro por ação
 * @param {string} dataInicio - Data inicial (ISO)
 * @param {string} dataFim - Data final (ISO)
 * @param {number} limit - Número máximo de registros
 */
async function buscarLogs(modulo = null, usuario = null, acao = null, dataInicio = null, dataFim = null, limit = 100) {
  try {
    let params = {
      TableName: 'gres-prod-logs',
      Limit: limit
    };

    if (modulo) {
      params.IndexName = 'modulo-timestamp-index';
      params.KeyConditionExpression = 'modulo = :modulo';
      params.ExpressionAttributeValues = { ':modulo': modulo };

      if (dataInicio && dataFim) {
        params.KeyConditionExpression += ' AND #ts BETWEEN :dataInicio AND :dataFim';
        params.ExpressionAttributeNames = { '#ts': 'timestamp' };
        params.ExpressionAttributeValues[':dataInicio'] = dataInicio;
        params.ExpressionAttributeValues[':dataFim'] = dataFim;
      }
    } else if (usuario) {
      params.IndexName = 'usuario-timestamp-index';
      params.KeyConditionExpression = 'usuario = :usuario';
      params.ExpressionAttributeValues = { ':usuario': usuario };

      if (dataInicio && dataFim) {
        params.KeyConditionExpression += ' AND #ts BETWEEN :dataInicio AND :dataFim';
        params.ExpressionAttributeNames = { '#ts': 'timestamp' };
        params.ExpressionAttributeValues[':dataInicio'] = dataInicio;
        params.ExpressionAttributeValues[':dataFim'] = dataFim;
      }
    } else if (acao) {
      params.IndexName = 'acao-timestamp-index';
      params.KeyConditionExpression = 'acao = :acao';
      params.ExpressionAttributeValues = { ':acao': acao };

      if (dataInicio && dataFim) {
        params.KeyConditionExpression += ' AND #ts BETWEEN :dataInicio AND :dataFim';
        params.ExpressionAttributeNames = { '#ts': 'timestamp' };
        params.ExpressionAttributeValues[':dataInicio'] = dataInicio;
        params.ExpressionAttributeValues[':dataFim'] = dataFim;
      }
    } else {
      // Scan sem índice (menos eficiente, usar com cuidado)
      params.ScanFilter = {};
      if (dataInicio && dataFim) {
        params.ScanFilter['timestamp'] = {
          AttributeValueList: [dataInicio, dataFim],
          ComparisonOperator: 'BETWEEN'
        };
      }
      const result = await dynamodb.scan(params).promise();
      return result.Items || [];
    }

    const result = await dynamodb.query(params).promise();
    return result.Items || [];
  } catch (error) {
    console.error('❌ Erro ao buscar logs:', error);
    return [];
  }
}

module.exports = {
  registrarLog,
  buscarLogs
};
