const AWS = require('aws-sdk');

const cognito = new AWS.CognitoIdentityServiceProvider({
  region: 'us-east-1'
});

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: 'us-east-2'
});

// Função auxiliar para resposta CORS
const response = (statusCode, body) => {
  const responseBody = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    statusCode,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    },
    body: responseBody
  };
};

// Handler principal
exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    const httpMethod = event.requestContext?.http?.method || event.httpMethod || 'GET';
    const rawPath = event.rawPath || event.path || '/';
    const body = event.body ? (typeof event.body === 'string' ? JSON.parse(event.body) : event.body) : {};
    const queryParams = event.queryStringParameters || {};

    console.log(`Method: ${httpMethod}, Path: ${rawPath}`);

    // OPTIONS para CORS
    if (httpMethod === 'OPTIONS') {
      return response(200, { ok: true });
    }

    // LOGIN com Cognito
    if ((rawPath === '/auth/login' || rawPath.includes('/auth/login')) && httpMethod === 'POST') {
      const { email, password } = body;

      if (!email || !password) {
        return response(400, { error: 'Email e senha são obrigatórios' });
      }

      try {
        const result = await cognito.adminInitiateAuth({
          UserPoolId: 'us-east-1_PETovl6rf',
          ClientId: '6frd2mgr45hjv5nit883p6f62f',
          AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
          AuthParameters: {
            USERNAME: email,
            PASSWORD: password
          }
        }).promise();

        if (result.AuthenticationResult) {
          return response(200, {
            success: true,
            token: result.AuthenticationResult.IdToken,
            accessToken: result.AuthenticationResult.AccessToken,
            refreshToken: result.AuthenticationResult.RefreshToken,
            user: { email }
          });
        } else {
          return response(401, { error: 'Credenciais inválidas' });
        }
      } catch (error) {
        console.error('Cognito error:', error.message);
        return response(401, { error: 'Credenciais inválidas' });
      }
    }

    // POST UNIDADES
    if ((rawPath === '/unidades' || rawPath.includes('/unidades')) && httpMethod === 'POST') {
      const { nome, endereco, telefone, email, cnpj, gerente } = body;

      if (!nome) {
        return response(400, { error: 'Nome é obrigatório' });
      }

      try {
        const item = {
          id: `${cnpj || nome}-${Date.now()}`,
          nome,
          endereco: endereco || '',
          telefone: telefone || '',
          email: email || '',
          cnpj: cnpj || '',
          gerente: gerente || '',
          timestamp: new Date().toISOString()
        };

        await dynamodb.put({
          TableName: 'gres-prod-unidades',
          Item: item
        }).promise();

        return response(201, { success: true, id: item.id });
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao salvar unidade' });
      }
    }

    // GET UNIDADES
    if ((rawPath === '/unidades' || rawPath.includes('/unidades')) && httpMethod === 'GET') {
      try {
        const result = await dynamodb.scan({
          TableName: 'gres-prod-unidades'
        }).promise();

        return response(200, result.Items || []);
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao buscar unidades' });
      }
    }

    // POST USUARIOS
    if ((rawPath === '/usuarios' || rawPath.includes('/usuarios')) && httpMethod === 'POST') {
      const { email, nome, perfil, unitId, ativo } = body;

      if (!email || !nome || !unitId) {
        return response(400, { error: 'Email, nome e unitId são obrigatórios' });
      }

      try {
        const item = {
          id: `${email}-${Date.now()}`,
          email,
          nome,
          perfil: perfil || 'operador',
          unitId: unitId,
          ativo: ativo !== false,
          timestamp: new Date().toISOString()
        };

        await dynamodb.put({
          TableName: 'gres-prod-usuarios',
          Item: item
        }).promise();

        return response(201, { success: true, id: item.id });
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao salvar usuário' });
      }
    }

    // GET USUARIOS
    if ((rawPath === '/usuarios' || rawPath.includes('/usuarios')) && httpMethod === 'GET') {
      try {
        const unitId = queryParams.unitId;
        let params = { TableName: 'gres-prod-usuarios' };
        
        if (unitId) {
          params.FilterExpression = 'unitId = :unitId';
          params.ExpressionAttributeValues = { ':unitId': unitId };
        }
        
        const result = await dynamodb.scan(params).promise();
        return response(200, result.Items || []);
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao buscar usuários' });
      }
    }

    // POST COLABORADORES
    if ((rawPath === '/colaboradores' || rawPath.includes('/colaboradores')) && httpMethod === 'POST') {
      const { nome, email, telefone, cpf, dataAdmissao, salario, chavePixe, cargo, unitId } = body;

      if (!nome || !cpf || !unitId) {
        return response(400, { error: 'Nome, CPF e unitId são obrigatórios' });
      }

      try {
        const item = {
          id: `${cpf}-${Date.now()}`,
          nome,
          email: email || '',
          telefone: telefone || '',
          cpf,
          dataAdmissao: dataAdmissao || new Date().toISOString().split('T')[0],
          salario: parseFloat(salario || 0),
          chavePixe: chavePixe || '',
          cargo: cargo || '',
          unitId: unitId,
          timestamp: new Date().toISOString()
        };

        await dynamodb.put({
          TableName: 'gres-prod-colaboradores',
          Item: item
        }).promise();

        return response(201, { success: true, id: item.id });
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao salvar colaborador' });
      }
    }

    // GET COLABORADORES
    if ((rawPath === '/colaboradores' || rawPath.includes('/colaboradores')) && httpMethod === 'GET') {
      try {
        const unitId = queryParams.unitId;
        let params = { TableName: 'gres-prod-colaboradores' };
        
        if (unitId) {
          params.FilterExpression = 'unitId = :unitId';
          params.ExpressionAttributeValues = { ':unitId': unitId };
        }
        
        const result = await dynamodb.scan(params).promise();
        return response(200, result.Items || []);
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao buscar colaboradores' });
      }
    }

    // POST MOTOBOYS
    if ((rawPath === '/motoboys' || rawPath.includes('/motoboys')) && httpMethod === 'POST') {
      const { nome, telefone, cpf, placa, dataAdmissao, comissao, chavePixe, unitId } = body;

      if (!nome || !cpf || !unitId) {
        return response(400, { error: 'Nome, CPF e unitId são obrigatórios' });
      }

      try {
        const item = {
          id: `${cpf}-${Date.now()}`,
          nome,
          telefone: telefone || '',
          cpf,
          placa: placa || '',
          dataAdmissao: dataAdmissao || new Date().toISOString().split('T')[0],
          comissao: parseFloat(comissao || 0),
          chavePixe: chavePixe || '',
          unitId: unitId,
          timestamp: new Date().toISOString()
        };

        await dynamodb.put({
          TableName: 'gres-prod-motoboys',
          Item: item
        }).promise();

        return response(201, { success: true, id: item.id });
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao salvar motoboy' });
      }
    }

    // GET MOTOBOYS
    if ((rawPath === '/motoboys' || rawPath.includes('/motoboys')) && httpMethod === 'GET') {
      try {
        const unitId = queryParams.unitId;
        let params = { TableName: 'gres-prod-motoboys' };
        
        if (unitId) {
          params.FilterExpression = 'unitId = :unitId';
          params.ExpressionAttributeValues = { ':unitId': unitId };
        }
        
        const result = await dynamodb.scan(params).promise();
        return response(200, result.Items || []);
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao buscar motoboys' });
      }
    }

    // POST CAIXA
    if ((rawPath === '/caixa' || rawPath.includes('/caixa')) && httpMethod === 'POST') {
      const { unidadeId, data, valor, descricao } = body;

      if (!unidadeId || !data || !valor) {
        return response(400, { error: 'Campos obrigatórios faltando' });
      }

      try {
        const item = {
          id: `${unidadeId}-${Date.now()}`,
          unidadeId,
          data,
          valor: parseFloat(valor),
          descricao: descricao || '',
          timestamp: new Date().toISOString()
        };

        await dynamodb.put({
          TableName: 'gres-prod-caixa',
          Item: item
        }).promise();

        return response(201, { success: true, id: item.id });
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao salvar caixa' });
      }
    }

    // GET CAIXA
    if ((rawPath === '/caixa' || rawPath.includes('/caixa')) && httpMethod === 'GET') {
      const unidadeId = queryParams.unidadeId;

      try {
        let result;
        if (unidadeId) {
          result = await dynamodb.query({
            TableName: 'gres-prod-caixa',
            IndexName: 'unidadeId-timestamp-index',
            KeyConditionExpression: 'unidadeId = :uid',
            ExpressionAttributeValues: {
              ':uid': unidadeId
            }
          }).promise();
        } else {
          result = await dynamodb.scan({
            TableName: 'gres-prod-caixa'
          }).promise();
        }

        return response(200, result.Items || []);
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao buscar caixa' });
      }
    }

    // POST ESCALAS
    if ((rawPath === '/escalas' || rawPath.includes('/escalas')) && httpMethod === 'POST') {
      const { unidadeId, data, colaboradorId, turno } = body;

      if (!unidadeId || !data || !colaboradorId || !turno) {
        return response(400, { error: 'Campos obrigatórios faltando' });
      }

      try {
        const item = {
          id: `${unidadeId}-${Date.now()}`,
          unidadeId,
          data,
          colaboradorId,
          turno,
          timestamp: new Date().toISOString()
        };

        await dynamodb.put({
          TableName: 'gres-prod-escalas',
          Item: item
        }).promise();

        return response(201, { success: true, id: item.id });
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao salvar escala' });
      }
    }

    // GET ESCALAS
    if ((rawPath === '/escalas' || rawPath.includes('/escalas')) && httpMethod === 'GET') {
      const unidadeId = queryParams.unidadeId;

      try {
        let result;
        if (unidadeId) {
          result = await dynamodb.query({
            TableName: 'gres-prod-escalas',
            IndexName: 'unidadeId-timestamp-index',
            KeyConditionExpression: 'unidadeId = :uid',
            ExpressionAttributeValues: {
              ':uid': unidadeId
            }
          }).promise();
        } else {
          result = await dynamodb.scan({
            TableName: 'gres-prod-escalas'
          }).promise();
        }

        return response(200, result.Items || []);
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao buscar escalas' });
      }
    }

    // POST SAIDAS
    if ((rawPath === '/saidas' || rawPath.includes('/saidas')) && httpMethod === 'POST') {
      const { unidadeId, data, descricao, valor } = body;

      if (!unidadeId || !data || !descricao || !valor) {
        return response(400, { error: 'Campos obrigatórios faltando' });
      }

      try {
        const item = {
          id: `${unidadeId}-${Date.now()}`,
          unidadeId,
          data,
          descricao,
          valor: parseFloat(valor),
          timestamp: new Date().toISOString()
        };

        await dynamodb.put({
          TableName: 'gres-prod-saidas',
          Item: item
        }).promise();

        return response(201, { success: true, id: item.id });
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao salvar saída' });
      }
    }

    // GET SAIDAS
    if ((rawPath === '/saidas' || rawPath.includes('/saidas')) && httpMethod === 'GET') {
      const unidadeId = queryParams.unidadeId;

      try {
        let result;
        if (unidadeId) {
          result = await dynamodb.query({
            TableName: 'gres-prod-saidas',
            IndexName: 'unidadeId-timestamp-index',
            KeyConditionExpression: 'unidadeId = :uid',
            ExpressionAttributeValues: {
              ':uid': unidadeId
            }
          }).promise();
        } else {
          result = await dynamodb.scan({
            TableName: 'gres-prod-saidas'
          }).promise();
        }

        return response(200, result.Items || []);
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao buscar saídas' });
      }
    }

    // PUT USUARIOS (atualizar)
    if ((rawPath.includes('/usuarios/') || rawPath === '/usuarios') && httpMethod === 'PUT') {
      const usuarioId = rawPath.split('/').pop();
      const { nome, perfil, unitId, ativo } = body;

      if (!usuarioId || !nome) {
        return response(400, { error: 'ID do usuário e nome são obrigatórios' });
      }

      try {
        const updateExpression = 'SET #nome = :nome, perfil = :perfil, unitId = :unitId, ativo = :ativo';
        const expressionAttributeNames = { '#nome': 'nome' };
        const expressionAttributeValues = {
          ':nome': nome,
          ':perfil': perfil || 'operador',
          ':unitId': unitId || '',
          ':ativo': ativo !== false
        };

        await dynamodb.update({
          TableName: 'gres-prod-usuarios',
          Key: { id: usuarioId },
          UpdateExpression: updateExpression,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues
        }).promise();

        return response(200, { success: true, message: 'Usuário atualizado' });
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao atualizar usuário' });
      }
    }

    // Rota não encontrada
    return response(404, { error: `Rota não encontrada: ${rawPath}` });

  } catch (error) {
    console.error('Erro geral:', error);
    return response(500, { error: 'Erro interno do servidor' });
  }
};
