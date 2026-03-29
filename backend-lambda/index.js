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
          // Verificar se o usuário existe no DynamoDB
          try {
            const userResult = await dynamodb.query({
              TableName: 'gres-prod-usuarios',
              IndexName: 'email-index',
              KeyConditionExpression: 'email = :email',
              ExpressionAttributeValues: { ':email': email }
            }).promise();

            // Se não existe, criar automaticamente
            if (!userResult.Items || userResult.Items.length === 0) {
              // Buscar primeira unidade
              const unidadesResult = await dynamodb.scan({
                TableName: 'gres-prod-unidades',
                Limit: 1
              }).promise();

              const unitId = unidadesResult.Items && unidadesResult.Items.length > 0 
                ? unidadesResult.Items[0].id 
                : 'default';

              // Criar usuário
              await dynamodb.put({
                TableName: 'gres-prod-usuarios',
                Item: {
                  id: `${email}-${Date.now()}`,
                  email: email,
                  nome: email.split('@')[0],
                  perfil: 'operador',
                  unitId: unitId,
                  ativo: true,
                  timestamp: new Date().toISOString()
                }
              }).promise();
            }
          } catch (dbError) {
            console.error('Erro ao verificar/criar usuário:', dbError.message);
            // Continuar mesmo se houver erro
          }

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

    // POST CAIXA - Registro único por dia/turno
    if ((rawPath === '/caixa' || rawPath.includes('/caixa')) && httpMethod === 'POST') {
      const { id, unitId, data, hora, periodo, responsavel, responsavelNome, abertura, maq1, maq2, maq3, maq4, maq5, maq6, ifood, dinheiro, pix, fiado, sangria, total, sistemaPdv, diferenca, referencia } = body;

      if (!unitId || !data || !periodo) {
        return response(400, { error: 'unitId, data e periodo são obrigatórios' });
      }

      try {
        const item = {
          id: id || `${unitId}-${data}-${periodo}-${Date.now()}`,
          unitId,
          data,
          hora: hora || new Date().toTimeString().split(' ')[0],
          periodo,
          responsavel: responsavel || '',
          responsavelNome: responsavelNome || '',
          abertura: parseFloat(abertura) || 0,
          maq1: parseFloat(maq1) || 0,
          maq2: parseFloat(maq2) || 0,
          maq3: parseFloat(maq3) || 0,
          maq4: parseFloat(maq4) || 0,
          maq5: parseFloat(maq5) || 0,
          maq6: parseFloat(maq6) || 0,
          ifood: parseFloat(ifood) || 0,
          dinheiro: parseFloat(dinheiro) || 0,
          pix: parseFloat(pix) || 0,
          fiado: parseFloat(fiado) || 0,
          sangria: parseFloat(sangria) || 0,
          total: parseFloat(total) || 0,
          sistemaPdv: parseFloat(sistemaPdv) || 0,
          diferenca: parseFloat(diferenca) || 0,
          referencia: parseFloat(referencia) || 0,
          timestamp: new Date().toISOString()
        };

        await dynamodb.put({
          TableName: 'gres-prod-caixa',
          Item: item
        }).promise();

        return response(201, { success: true, id: item.id, message: 'Registro salvo com sucesso' });
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao salvar caixa: ' + error.message });
      }
    }

    // GET CAIXA - Filtrar por unitId e data
    if ((rawPath === '/caixa' || rawPath.includes('/caixa')) && httpMethod === 'GET') {
      const unitId = queryParams.unitId;
      const data = queryParams.data;

      try {
        let result;
        
        // Usar scan para filtrar, pois o índice pode não existir
        result = await dynamodb.scan({
          TableName: 'gres-prod-caixa',
          FilterExpression: unitId && data ? 'unitId = :uid AND #d = :data' : (unitId ? 'unitId = :uid' : undefined),
          ExpressionAttributeNames: unitId && data ? { '#d': 'data' } : (unitId ? {} : undefined),
          ExpressionAttributeValues: unitId && data ? { ':uid': unitId, ':data': data } : (unitId ? { ':uid': unitId } : undefined)
        }).promise();

        return response(200, result.Items || []);
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao buscar caixa: ' + error.message });
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

    // PUT CAIXA - Atualizar registro
    if ((rawPath.includes('/caixa/') || rawPath === '/caixa') && httpMethod === 'PUT') {
      const caixaId = rawPath.split('/').pop();
      const { abertura, maq1, maq2, maq3, maq4, maq5, maq6, ifood, dinheiro, pix, fiado, sangria, total, sistemaPdv, diferenca, referencia, periodo, responsavel, responsavelNome, hora } = body;

      if (!caixaId) {
        return response(400, { error: 'ID do movimento é obrigatório' });
      }

      try {
        const updateExpression = 'SET abertura = :abertura, maq1 = :maq1, maq2 = :maq2, maq3 = :maq3, maq4 = :maq4, maq5 = :maq5, maq6 = :maq6, ifood = :ifood, dinheiro = :dinheiro, #pix = :pix, fiado = :fiado, sangria = :sangria, #total = :total, sistemaPdv = :sistemaPdv, diferenca = :diferenca, referencia = :referencia, #periodo = :periodo, responsavel = :responsavel, responsavelNome = :responsavelNome, #hora = :hora';
        const expressionAttributeNames = { '#pix': 'pix', '#total': 'total', '#periodo': 'periodo', '#hora': 'hora' };
        const expressionAttributeValues = {
          ':abertura': parseFloat(abertura) || 0,
          ':maq1': parseFloat(maq1) || 0,
          ':maq2': parseFloat(maq2) || 0,
          ':maq3': parseFloat(maq3) || 0,
          ':maq4': parseFloat(maq4) || 0,
          ':maq5': parseFloat(maq5) || 0,
          ':maq6': parseFloat(maq6) || 0,
          ':ifood': parseFloat(ifood) || 0,
          ':dinheiro': parseFloat(dinheiro) || 0,
          ':pix': parseFloat(pix) || 0,
          ':fiado': parseFloat(fiado) || 0,
          ':sangria': parseFloat(sangria) || 0,
          ':total': parseFloat(total) || 0,
          ':sistemaPdv': parseFloat(sistemaPdv) || 0,
          ':diferenca': parseFloat(diferenca) || 0,
          ':referencia': parseFloat(referencia) || 0,
          ':periodo': periodo || 'Dia',
          ':responsavel': responsavel || '',
          ':responsavelNome': responsavelNome || '',
          ':hora': hora || new Date().toTimeString().split(' ')[0]
        };

        await dynamodb.update({
          TableName: 'gres-prod-caixa',
          Key: { id: caixaId },
          UpdateExpression: updateExpression,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues
        }).promise();

        return response(200, { success: true, message: 'Registro atualizado com sucesso' });
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao atualizar registro: ' + error.message });
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
