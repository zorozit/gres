const AWS = require('aws-sdk');

const cognito = new AWS.CognitoIdentityServiceProvider({
  region: 'us-east-2'
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

    // LOGIN com DynamoDB
    if ((rawPath === '/auth/login' || rawPath.includes('/auth/login')) && httpMethod === 'POST') {
      const { email, password } = body;

      if (!email || !password) {
        return response(400, { error: 'Email e senha são obrigatórios' });
      }

      try {
        // Buscar usuário no DynamoDB por email
        const userResult = await dynamodb.scan({
          TableName: 'gres-prod-usuarios',
          FilterExpression: 'email = :email',
          ExpressionAttributeValues: { ':email': email }
        }).promise();

        if (!userResult.Items || userResult.Items.length === 0) {
          return response(401, { error: 'Usuário não encontrado' });
        }

        const user = userResult.Items[0];
        
        // Validar senha
        if (user.senha !== password) {
          return response(401, { error: 'Senha incorreta' });
        }

        // Gerar token JWT simples
        const token = Buffer.from(JSON.stringify({
          email: user.email,
          id: user.id,
          perfil: user.perfil,
          iat: Math.floor(Date.now() / 1000)
        })).toString('base64');

        return response(200, {
          success: true,
          token: token,
          accessToken: token,
          refreshToken: token,
          user: { 
            email: user.email, 
            id: user.id,
            perfil: user.perfil || 'operador', 
            unitId: user.unitId || 'default',
            nome: user.nome
          }
        });
      } catch (error) {
        console.error('Login error:', error.message);
        return response(401, { error: 'Erro ao fazer login' });
      }
    }

    // POST CHANGE PASSWORD
    if ((rawPath === '/auth/change-password' || rawPath.includes('/auth/change-password')) && httpMethod === 'POST') {
      const { email, newPassword } = body;

      if (!email || !newPassword) {
        return response(400, { error: 'Email e nova senha são obrigatórios' });
      }

      if (newPassword.length < 8) {
        return response(400, { error: 'A senha deve ter no mínimo 8 caracteres' });
      }

      try {
        // Buscar usuário no DynamoDB
        const userResult = await dynamodb.scan({
          TableName: 'gres-prod-usuarios',
          FilterExpression: 'email = :email',
          ExpressionAttributeValues: { ':email': email }
        }).promise();

        if (!userResult.Items || userResult.Items.length === 0) {
          return response(401, { error: 'Usuário não encontrado' });
        }

        const user = userResult.Items[0];

        // Atualizar senha no DynamoDB
        await dynamodb.update({
          TableName: 'gres-prod-usuarios',
          Key: { id: user.id },
          UpdateExpression: 'SET senha = :newPassword',
          ExpressionAttributeValues: {
            ':newPassword': newPassword
          }
        }).promise();

        return response(200, { success: true, message: 'Senha alterada com sucesso' });
      } catch (error) {
        console.error('Erro ao alterar senha:', error.message);
        return response(400, { error: 'Erro ao alterar senha: ' + error.message });
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
      const dataInicio = queryParams.dataInicio;
      const dataFim = queryParams.dataFim;
      const periodo = queryParams.periodo;
      const responsavel = queryParams.responsavel;

      try {
        // Buscar usuários para relacionamento
        const usuariosResult = await dynamodb.scan({
          TableName: 'gres-prod-usuarios'
        }).promise();
        const usuarios = usuariosResult.Items || [];
        const usuariosMap = {};
        usuarios.forEach(u => {
          usuariosMap[u.email] = u.nome;
        });

        // Buscar colaboradores para relacionamento
        const colaboradoresResult = await dynamodb.scan({
          TableName: 'gres-prod-colaboradores'
        }).promise();
        const colaboradores = colaboradoresResult.Items || [];
        const colaboradoresMap = {};
        colaboradores.forEach(c => {
          colaboradoresMap[c.nome] = c.id;
        });

        // Sempre fazer scan sem filtro e depois filtrar em memória
        const result = await dynamodb.scan({
          TableName: 'gres-prod-saidas'
        }).promise();

        let items = result.Items || [];
        console.log('Total de itens no banco:', items.length);

        // Filtrar em memória e enriquecer dados
        items = items.filter(item => {
          // Filtrar por data específica
          if (data && item.data !== data) {
            console.log('Filtrando por data:', item.data, '!==', data);
            return false;
          }
          
          // Filtrar por unidade (ignorar se unitId for 'null' ou vazio)
          if (unitId && unitId !== 'null' && unitId !== '') {
            const itemUnitId = item.unitId || item.unidade_id;
            const unitIdCnpj = unitId.substring(0, 14);
            const itemCnpj = itemUnitId ? itemUnitId.substring(0, 14) : '';
            console.log('Filtrando por unitId:', itemCnpj, 'vs', unitIdCnpj);
            if (itemCnpj !== unitIdCnpj) {
              return false;
            }
          }
          
          return true;
        }).map(item => {
          // Enriquecer com informações de responsável
          if (item.responsavel && item.responsavel !== 'Não informado') {
            item.responsavelNome = usuariosMap[item.responsavel] || item.responsavel;
          } else {
            item.responsavelNome = 'Não informado';
          }

          // Enriquecer com nome do colaborador (buscar pelo ID)
          if (item.colaboradorId) {
            const colaborador = colaboradores.find(c => c.id === item.colaboradorId);
            item.colaboradorNome = colaborador ? colaborador.nome : 'Colaborador não encontrado';
          } else if (item.colaborador) {
            // Fallback para dados históricos com nome
            item.colaboradorNome = item.colaborador;
            item.colaboradorId = colaboradoresMap[item.colaborador];
          }

          return item;
        });

        console.log('Itens após filtro:', items.length);
        return response(200, items);
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
      const { responsavel, responsavelId, colaboradorId, descricao, valor, data, origem, dataPagamento, unitId, viagens, caixinha, turno } = body;

      if (!responsavel || !descricao || !valor || !data || !colaboradorId) {
        return response(400, { error: 'Campos obrigatórios faltando' });
      }

      try {
        // Buscar nome do responsável via email
        let responsavelNome = '';
        let responsavelIdResolved = responsavelId || '';
        const usuariosResult2 = await dynamodb.scan({
          TableName: 'gres-prod-usuarios',
          FilterExpression: 'email = :email',
          ExpressionAttributeValues: { ':email': responsavel }
        }).promise();
        if (usuariosResult2.Items && usuariosResult2.Items.length > 0) {
          responsavelNome = usuariosResult2.Items[0].nome || responsavel;
          if (!responsavelIdResolved) responsavelIdResolved = usuariosResult2.Items[0].id || '';
        } else {
          responsavelNome = responsavel;
        }

        // Verificar se o colaborador existe
        const colaboradorResult = await dynamodb.get({
          TableName: 'gres-prod-colaboradores',
          Key: { id: colaboradorId }
        }).promise();

        if (!colaboradorResult.Item) {
          return response(400, { error: 'Colaborador não encontrado' });
        }

        const colaborador = colaboradorResult.Item;
        // Pegar unitId do body, ou do colaborador como fallback
        const itemUnitId = unitId || colaborador.unitId || '';

        const item = {
          id: `saida-${Date.now()}`,
          responsavel,
          responsavelId: responsavelIdResolved,
          responsavelNome,
          colaboradorId,
          colaborador: colaborador.nome || '',
          favorecido: colaborador.nome || '',
          descricao,
          valor: parseFloat(valor),
          data,
          turno: turno || '',
          origem: origem || 'Sangria',
          referencia: origem || 'Sangria',
          dataPagamento: dataPagamento || '',
          viagens: viagens !== undefined ? parseInt(viagens) || 0 : 0,
          caixinha: caixinha !== undefined ? parseFloat(caixinha) || 0 : 0,
          unitId: itemUnitId,
          timestamp: new Date().toISOString(),
          createdAt: new Date().toISOString()
        };

        await dynamodb.put({
          TableName: 'gres-prod-saidas',
          Item: item
        }).promise();

        return response(201, { success: true, id: item.id, item });
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao salvar saída' });
      }
    }

    // TEST ENDPOINT
    if (rawPath === '/test-users' && httpMethod === 'GET') {
      return response(200, { message: 'Endpoint de teste funcionando', timestamp: new Date().toISOString() });
    }

    // GET USERS
    if (rawPath === '/users' && httpMethod === 'GET') {
      console.log('GET /users - Endpoint chamado');
      try {
        const result = await dynamodb.scan({ TableName: 'gres-prod-usuarios' }).promise();
        const usuarios = (result.Items || []).map(user => ({
          id: user.id,
          email: user.email,
          nome: user.nome,
          cpf: user.cpf,
          celular: user.celular,
          perfil: user.perfil,
          ativo: user.ativo,
          unitIds: user.unitIds || [user.unitId] || []
        }));
        console.log('Retornando usuários:', usuarios.length);
        return response(200, usuarios);
      } catch (error) {
        console.error('Erro ao buscar usuários:', error.message);
        return response(500, { error: 'Erro ao buscar usuários', details: error.message });
      }
    }

    // GET SAIDAS
    if ((rawPath === '/saidas' || rawPath.includes('/saidas')) && httpMethod === 'GET') {
      const data        = queryParams.data;        // filtro por dia exato
      const dataInicio  = queryParams.dataInicio;  // filtro por período
      const dataFim     = queryParams.dataFim;
      const unitId      = queryParams.unitId;

      console.log('GET /saidas - queryParams:', queryParams);

      try {
        // Buscar usuários para relacionamento
        const usuariosResult = await dynamodb.scan({ TableName: 'gres-prod-usuarios' }).promise();
        const usuariosMap = {};
        (usuariosResult.Items || []).forEach(u => { usuariosMap[u.email] = u.nome; });

        // Buscar colaboradores para relacionamento
        const colaboradoresResult = await dynamodb.scan({ TableName: 'gres-prod-colaboradores' }).promise();
        const colaboradores = colaboradoresResult.Items || [];
        const colaboradoresMap = {};
        colaboradores.forEach(c => { colaboradoresMap[c.nome] = c.id; });

        // Scan completo e filtro em memória
        const result = await dynamodb.scan({ TableName: 'gres-prod-saidas' }).promise();
        let items = result.Items || [];
        console.log('Total de itens no banco:', items.length);

        // --- CNPJ da unidade solicitante (primeiros 14 chars) ---
        const unitCnpj = (unitId && unitId !== 'null' && unitId !== '')
          ? unitId.substring(0, 14)
          : null;

        items = items.filter(item => {
          // Filtro por data exata (aba Novo Registro)
          if (data) {
            return item.data === data;
          }

          // Filtro por período (aba Movimentos)
          if (dataInicio && dataFim) {
            if (!item.data || item.data < dataInicio || item.data > dataFim) return false;
          }

          // Filtro por unidade — aceita itens sem unitId (dados históricos)
          if (unitCnpj) {
            const itemUnitId = item.unitId || item.unidade_id || '';
            // Se item não tem unitId, inclui (dados históricos pertencem à unidade)
            if (itemUnitId !== '') {
              const itemCnpj = itemUnitId.substring(0, 14);
              if (itemCnpj !== unitCnpj) return false;
            }
          }

          return true;
        }).map(item => {
          // Enriquecer responsável
          // Enriquecer responsável: tentar por email, depois por id, depois pelo campo responsavelNome já salvo
          if (item.responsavelNome && item.responsavelNome !== 'Não informado') {
            // já tem nome salvo diretamente no registro — mantém
          } else if (item.responsavel && item.responsavel !== 'Não informado') {
            item.responsavelNome = usuariosMap[item.responsavel] || item.responsavel;
          } else {
            item.responsavelNome = 'Não informado';
          }

          // Enriquecer colaborador
          if (item.colaboradorId) {
            const col = colaboradores.find(c => c.id === item.colaboradorId);
            item.colaboradorNome = col ? col.nome : (item.colaborador || 'Não encontrado');
          } else if (item.colaborador) {
            item.colaboradorNome = item.colaborador;
            item.colaboradorId = colaboradoresMap[item.colaborador] || '';
          }

          return item;
        });

        // Ordenar por data desc
        items.sort((a, b) => (b.data || '').localeCompare(a.data || ''));

        console.log('Itens após filtro:', items.length);
        return response(200, items);
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao buscar saídas: ' + error.message });
      }
    }

    // PUT SAIDAS - Editar saída
    if (rawPath.includes('/saidas/') && httpMethod === 'PUT') {
      const saidaId = rawPath.split('/').pop();
      const { responsavel, responsavelId, colaboradorId, descricao, valor, data, origem, dataPagamento, viagens, caixinha, turno } = body;

      if (!saidaId || !responsavel || !descricao || !valor || !colaboradorId) {
        return response(400, { error: 'Campos obrigatórios faltando' });
      }

      try {
        // Buscar registro original para preservar campos imutáveis (unitId, createdAt)
        const originalResult = await dynamodb.get({
          TableName: 'gres-prod-saidas',
          Key: { id: saidaId }
        }).promise();
        const original = originalResult.Item || {};

        // Buscar nome do responsável via email
        let responsavelNome = '';
        let responsavelIdResolved = responsavelId || '';
        const usuariosLookup = await dynamodb.scan({
          TableName: 'gres-prod-usuarios',
          FilterExpression: 'email = :email',
          ExpressionAttributeValues: { ':email': responsavel }
        }).promise();
        if (usuariosLookup.Items && usuariosLookup.Items.length > 0) {
          responsavelNome = usuariosLookup.Items[0].nome || responsavel;
          if (!responsavelIdResolved) responsavelIdResolved = usuariosLookup.Items[0].id || '';
        } else {
          responsavelNome = responsavel;
        }

        // Verificar se o colaborador existe
        const colaboradorResult = await dynamodb.get({
          TableName: 'gres-prod-colaboradores',
          Key: { id: colaboradorId }
        }).promise();

        if (!colaboradorResult.Item) {
          return response(400, { error: 'Colaborador não encontrado' });
        }

        const colaborador = colaboradorResult.Item;

        const item = {
          ...original,                          // preserve all original fields (unitId, createdAt, etc.)
          id: saidaId,
          responsavel,
          responsavelId: responsavelIdResolved,
          responsavelNome,
          colaboradorId,
          colaborador: colaborador.nome || original.colaborador || '',
          favorecido: colaborador.nome || original.favorecido || '',
          descricao,
          valor: parseFloat(valor),
          data,
          turno: turno !== undefined ? turno : (original.turno || ''),
          origem: origem || original.origem || 'Sangria',
          referencia: origem || original.referencia || 'Sangria',
          dataPagamento: dataPagamento || original.dataPagamento || '',
          viagens: viagens !== undefined ? parseInt(viagens) || 0 : (original.viagens || 0),
          caixinha: caixinha !== undefined ? parseFloat(caixinha) || 0 : (original.caixinha || 0),
          updatedAt: new Date().toISOString()
        };

        await dynamodb.put({
          TableName: 'gres-prod-saidas',
          Item: item
        }).promise();

        return response(200, { success: true, id: item.id, item });
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao atualizar saída' });
      }
    }

    // DELETE SAIDAS - Deletar saída
    if (rawPath.includes('/saidas/') && httpMethod === 'DELETE') {
      const saidaId = rawPath.split('/').pop();

      if (!saidaId) {
        return response(400, { error: 'ID da saída não fornecido' });
      }

      try {
        await dynamodb.delete({
          TableName: 'gres-prod-saidas',
          Key: { id: saidaId }
        }).promise();

        return response(200, { success: true });
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao deletar saída' });
      }
    }

    // DELETE CAIXA - Deletar registro (apenas admin)
    if ((rawPath.includes('/caixa/') || rawPath === '/caixa') && httpMethod === 'DELETE') {
      const caixaId = rawPath.split('/').pop();

      if (!caixaId) {
        return response(400, { error: 'ID do registro é obrigatório' });
      }

      try {
        await dynamodb.delete({
          TableName: 'gres-prod-caixa',
          Key: { id: caixaId }
        }).promise();

        return response(200, { success: true, message: 'Registro deletado com sucesso' });
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao deletar registro: ' + error.message });
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
