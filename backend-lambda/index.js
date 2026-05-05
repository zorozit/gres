// Import only specific services to avoid loading all AWS SDK clients
const DynamoDB = require('aws-sdk/clients/dynamodb');
const CognitoIdentityServiceProvider = require('aws-sdk/clients/cognitoidentityserviceprovider');

const cognito = new CognitoIdentityServiceProvider({
  region: 'us-east-2'
});

const dynamodb = new DynamoDB.DocumentClient({
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

// ─────────────────────────────────────────────────────────
// Helpers de normalização de IDs
// ─────────────────────────────────────────────────────────

/** Extrai CNPJ (14 chars) de qualquer formato de unitId */
const toCnpj = (val) => {
  if (!val || val === 'null') return '';
  // Se já tem exatamente 14 chars numéricos, é o CNPJ
  if (/^\d{14}$/.test(val)) return val;
  // Se veio como CNPJ-timestamp, pega só os 14 primeiros
  return val.substring(0, 14);
};

/** Resolve unitId do frontend (pode vir como CNPJ-timestamp ou CNPJ) */
const resolveUnitId = (val) => toCnpj(val);

/** Gera ID de registro de caixa no formato canônico */
const caixaId = (unitId, data, periodo) =>
  `${toCnpj(unitId)}-${data}-${(periodo || 'dia').toLowerCase()}`;

/**
 * Registra log de alteracao de escala em gres-prod-escalas-log.
 * Sempre best-effort: se falhar, nao quebra a operacao principal.
 * Campos chave: escalaId (HASH do GSI), timestamp (RANGE do GSI), evento, valoresAntes/Depois
 */
async function logEscalaAlteracao({ escalaId, evento, valoresAntes, valoresDepois, usuarioId, usuarioNome, observacao }) {
  try {
    const ts = new Date().toISOString();
    const item = {
      id: `log-esc-${escalaId}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      escalaId,
      timestamp: ts,
      evento: evento || 'alterado',         // criado | confirmado | desconfirmado | alterado | observacao | deletado
      valoresAntes: valoresAntes || null,
      valoresDepois: valoresDepois || null,
      usuarioId: usuarioId || 'desconhecido',
      usuarioNome: usuarioNome || 'desconhecido',
      observacao: observacao || '',
    };
    await dynamodb.put({ TableName: 'gres-prod-escalas-log', Item: item }).promise();
  } catch (e) {
    console.warn('logEscalaAlteracao falhou (best-effort):', e.message);
  }
}

/** Diff helper: retorna campos que mudaram entre 2 objetos (escalas) */
function diffEscala(antes, depois) {
  const campos = ['turno', 'presenca', 'presencaNoite', 'observacao', 'colaboradorId', 'data'];
  const diffs = {};
  for (const c of campos) {
    if ((antes?.[c] ?? null) !== (depois?.[c] ?? null)) diffs[c] = { antes: antes?.[c] ?? null, depois: depois?.[c] ?? null };
  }
  return Object.keys(diffs).length > 0 ? diffs : null;
}

/**
 * Registra log de alteracao de colaborador em gres-prod-colaboradores-log.
 * Sempre best-effort. Auditoria/ordem judicial: timestamp, usuario, antes, depois.
 */
async function logColaboradorAlteracao({ colaboradorId, evento, valoresAntes, valoresDepois, usuarioId, usuarioNome, usuarioEmail, unitId, userAgent, observacao }) {
  try {
    const ts = new Date().toISOString();
    const item = {
      id: `log-col-${colaboradorId}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      colaboradorId,
      timestamp: ts,
      evento: evento || 'alterado',         // criado | alterado | desativado | reativado | deletado
      valoresAntes: valoresAntes || null,
      valoresDepois: valoresDepois || null,
      usuarioId: usuarioId || 'desconhecido',
      usuarioNome: usuarioNome || 'desconhecido',
      usuarioEmail: usuarioEmail || '',
      unitId: unitId || '',
      userAgent: userAgent || '',
      observacao: observacao || '',
    };
    await dynamodb.put({ TableName: 'gres-prod-colaboradores-log', Item: item }).promise();
  } catch (e) {
    console.warn('logColaboradorAlteracao falhou (best-effort):', e.message);
  }
}

/**
 * Helper GENERICO de auditoria. Tabela = `gres-prod-${entidade}-log`.
 * Aceita qualquer entidade. Captura responsavel + userAgent + diff.
 * Best-effort: nunca quebra a operação principal se logar falhar.
 */
async function logAlteracaoGenerica({ tabela, entidadeId, evento, valoresAntes, valoresDepois, usuarioId, usuarioNome, usuarioEmail, unitId, userAgent, observacao }) {
  if (!tabela || !entidadeId) return;
  try {
    const ts = new Date().toISOString();
    const item = {
      id: `log-${tabela}-${entidadeId}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      entidadeId,
      tabela,
      timestamp: ts,
      evento: evento || 'alterado',
      valoresAntes: valoresAntes || null,
      valoresDepois: valoresDepois || null,
      usuarioId: usuarioId || 'desconhecido',
      usuarioNome: usuarioNome || 'desconhecido',
      usuarioEmail: usuarioEmail || '',
      unitId: unitId || '',
      userAgent: userAgent || '',
      observacao: observacao || '',
    };
    await dynamodb.put({ TableName: `gres-prod-${tabela}-log`, Item: item }).promise();
  } catch (e) {
    console.warn(`logAlteracaoGenerica(${tabela}) falhou (best-effort):`, e.message);
  }
}

/** Extrai metadados de auditoria de um body de request (sem expor PII) */
function extrairAuditoria(body, event) {
  return {
    usuarioId: body?.responsavelId || body?.usuarioId || '',
    usuarioNome: body?.responsavelNome || body?.usuarioNome || '',
    usuarioEmail: body?.responsavelEmail || body?.usuarioEmail || '',
    userAgent: (event?.headers && (event.headers['user-agent'] || event.headers['User-Agent'])) || '',
  };
}

/** Diff helper para colaboradores: retorna apenas campos relevantes que mudaram */
function diffColaborador(antes, depois) {
  const campos = [
    'nome', 'cpf', 'celular', 'telefone', 'email',
    'tipoContrato', 'cargo', 'tipo', 'funcao', 'area',
    'salario', 'periculosidade', 'valorDia', 'valorNoite',
    'valorTransporte', 'valorChegadaDia', 'valorChegadaNoite', 'valorEntrega', 'contribuicaoAssistencial',
    'chavePix', 'dataAdmissao', 'dataDemissao',
    'unitId', 'ativo', 'horarioEntrada', 'horarioSaida',
    'isMotoboy', 'tipoAcordo', 'valeAlimentacao',
    'podeTrabalharDia', 'podeTrabalharNoite',
  ];
  const diffs = {};
  for (const c of campos) {
    const a = antes?.[c] ?? null;
    const d = depois?.[c] ?? null;
    // Comparacao laxa para arrays/objetos, estrita para primitivos
    const eq = JSON.stringify(a) === JSON.stringify(d);
    if (!eq) diffs[c] = { antes: a, depois: d };
  }
  return Object.keys(diffs).length > 0 ? diffs : null;
}

// ─────────────────────────────────────────────────────────
// Helpers de integridade do DynamoDB
// Garantem referências cruzadas entre entidades para
// preservar a consistência dos dados sem chaves estrangeiras
// nativas (DynamoDB é schemaless).
// ─────────────────────────────────────────────────────────

/**
 * Verifica se uma unidade existe no banco.
 * Retorna o item da unidade ou null se não encontrado.
 */
const validarUnidade = async (unitId) => {
  if (!unitId) return null;
  const cnpj = toCnpj(unitId);
  try {
    // Tenta busca direta pelo CNPJ (chave primária)
    const r = await dynamodb.get({
      TableName: 'gres-prod-unidades',
      Key: { cnpj }
    }).promise();
    if (r.Item) return r.Item;
    // Fallback: scan por id
    const rs = await dynamodb.scan({
      TableName: 'gres-prod-unidades',
      FilterExpression: 'id = :id OR cnpj = :cnpj',
      ExpressionAttributeValues: { ':id': unitId, ':cnpj': cnpj }
    }).promise();
    return rs.Items && rs.Items.length > 0 ? rs.Items[0] : null;
  } catch (e) {
    console.warn('validarUnidade error:', e.message);
    return null;
  }
};

/**
 * Verifica se um usuário existe e retorna {id, nome, email}.
 * Aceita e-mail ou ID do usuário.
 */
const validarUsuario = async (identificador) => {
  if (!identificador) return null;
  try {
    // Tenta busca direta por ID
    const r = await dynamodb.get({
      TableName: 'gres-prod-usuarios',
      Key: { id: identificador }
    }).promise();
    if (r.Item) return r.Item;
    // Fallback: scan por e-mail
    const rs = await dynamodb.scan({
      TableName: 'gres-prod-usuarios',
      FilterExpression: 'email = :e',
      ExpressionAttributeValues: { ':e': identificador }
    }).promise();
    return rs.Items && rs.Items.length > 0 ? rs.Items[0] : null;
  } catch (e) {
    console.warn('validarUsuario error:', e.message);
    return null;
  }
};

/**
 * Verifica se um colaborador existe.
 * Retorna o item ou null.
 */
const validarColaborador = async (colaboradorId) => {
  if (!colaboradorId) return null;
  try {
    const r = await dynamodb.get({
      TableName: 'gres-prod-colaboradores',
      Key: { id: colaboradorId }
    }).promise();
    return r.Item || null;
  } catch (e) {
    console.warn('validarColaborador error:', e.message);
    return null;
  }
};

/**
 * Verifica se um motoboy existe.
 * Retorna o item ou null.
 */
const validarMotoboy = async (motoboyId) => {
  if (!motoboyId) return null;
  try {
    const r = await dynamodb.get({
      TableName: 'gres-prod-motoboys',
      Key: { id: motoboyId }
    }).promise();
    return r.Item || null;
  } catch (e) {
    console.warn('validarMotoboy error:', e.message);
    return null;
  }
};

/**
 * Resolve responsável: dado um identificador (ID ou e-mail),
 * devolve { responsavel, responsavelId, responsavelNome }.
 * Nunca lança erro — retorna os valores originais se não encontrar.
 */
const resolverResponsavel = async (identificador, fallbackNome) => {
  const usuario = await validarUsuario(identificador);
  if (usuario) {
    return {
      responsavel:       usuario.email || identificador,
      responsavelId:     usuario.id    || identificador,
      responsavelNome:   usuario.nome  || fallbackNome || identificador
    };
  }
  return {
    responsavel:     identificador || '',
    responsavelId:   identificador || '',
    responsavelNome: fallbackNome  || identificador || ''
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
            unitIds: user.unitIds || (user.unitId ? [user.unitId] : []),
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

    // POST UNIDADES — ID é o CNPJ (14 dígitos)
    if ((rawPath === '/unidades' || rawPath.includes('/unidades')) && httpMethod === 'POST') {
      const { nome, endereco, telefone, email, cnpj, gerente } = body;

      if (!nome || !cnpj) {
        return response(400, { error: 'Nome e CNPJ são obrigatórios' });
      }

      const cnpjClean = cnpj.replace(/\D/g, '').substring(0, 14);
      if (cnpjClean.length !== 14) {
        return response(400, { error: 'CNPJ inválido — deve ter 14 dígitos' });
      }

      try {
        // Verifica se já existe unidade com esse CNPJ
        const existing = await dynamodb.get({
          TableName: 'gres-prod-unidades',
          Key: { id: cnpjClean }
        }).promise();
        if (existing.Item) {
          return response(409, { error: 'Já existe uma unidade com esse CNPJ' });
        }

        const item = {
          id: cnpjClean,          // CNPJ puro como PK
          cnpj: cnpjClean,
          nome,
          endereco: endereco || '',
          telefone: telefone || '',
          email: email || '',
          gerente: gerente || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
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

    // POST USUARIOS — ID = usr-{uuid}; unitId = CNPJ
    if ((rawPath === '/usuarios' || rawPath.includes('/usuarios')) && httpMethod === 'POST') {
      const { email, nome, perfil, unitId, unitIds, ativo, cpf, celular, senha } = body;

      if (!email || !nome || !unitId) {
        return response(400, { error: 'Email, nome e unitId são obrigatórios' });
      }

      const unitIdClean = resolveUnitId(unitId);

      try {
        // Evitar duplicata de email
        const dup = await dynamodb.scan({
          TableName: 'gres-prod-usuarios',
          FilterExpression: 'email = :e',
          ExpressionAttributeValues: { ':e': email }
        }).promise();
        if (dup.Items && dup.Items.length > 0) {
          return response(409, { error: 'Já existe um usuário com esse email' });
        }

        const newId = 'usr-' + require('crypto').randomBytes(4).toString('hex');
        const item = {
          id: newId,
          email,
          nome,
          perfil: perfil || 'operador',
          unitId: unitIdClean,
          unitIds: unitIds ? unitIds.map(resolveUnitId) : [unitIdClean],
          cpf: cpf || '',
          celular: celular || '',
          senha: senha || '',
          ativo: ativo !== false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
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

    // GET USUARIOS — filtra por unitId (CNPJ)
    if ((rawPath === '/usuarios' || rawPath.includes('/usuarios')) && httpMethod === 'GET') {
      try {
        const unitIdRaw = queryParams.unitId;
        const unitIdClean = unitIdRaw ? resolveUnitId(unitIdRaw) : null;
        let params = { TableName: 'gres-prod-usuarios' };

        if (unitIdClean) {
          params.FilterExpression = 'unitId = :uid OR contains(unitIds, :uid)';
          params.ExpressionAttributeValues = { ':uid': unitIdClean };
        }

        const result = await dynamodb.scan(params).promise();
        // Remove senha do retorno
        const items = (result.Items || []).map(u => { const c = {...u}; delete c.senha; return c; });
        return response(200, items);
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao buscar usuários' });
      }
    }

    // POST COLABORADORES — ID = col-{uuid}; obrigatórios = Nome + CPF + celular/telefone + unitId
    if ((rawPath === '/colaboradores' || rawPath.includes('/colaboradores')) && httpMethod === 'POST') {
      const {
        nome, email, telefone, celular, cpf,
        tipoContrato, cargo, tipo, funcao, area,
        valorDia, valorNoite, valorTransporte, valeAlimentacao,
        salario, periculosidade, chavePix, dataAdmissao, dataNascimento,
        endereco, numero, complemento, cidade, estado, cep,
        diasDisponiveis, podeTrabalharDia, podeTrabalharNoite,
        unitId, ativo,
        isMotoboy, tipoAcordo, acordo,
        valorChegadaDia, valorChegadaNoite, valorEntrega,
        horarioEntrada, horarioSaida,
        contribuicaoAssistencial,  // NOVO
        // Auditoria - obrigatoria a partir desta versao
        responsavelId, responsavelNome, responsavelEmail,
      } = body;

      const celularFinal = celular || telefone || '';
      const cargoFinal   = cargo   || tipo     || '';

      if (!nome || !cpf || !celularFinal || !unitId) {
        return response(400, { error: 'Nome, CPF, celular e unitId são obrigatórios' });
      }

      const unitIdClean = resolveUnitId(unitId);

      try {
        // Verificar duplicata de CPF na mesma unidade
        const dup = await dynamodb.scan({
          TableName: 'gres-prod-colaboradores',
          FilterExpression: 'cpf = :cpf AND unitId = :uid',
          ExpressionAttributeValues: { ':cpf': cpf, ':uid': unitIdClean }
        }).promise();
        if (dup.Items && dup.Items.length > 0) {
          return response(409, { error: 'Já existe um colaborador com esse CPF nesta unidade' });
        }

        const newId = 'col-' + require('crypto').randomBytes(4).toString('hex');
        const item = {
          id:               newId,
          nome,
          cpf,
          celular:          celularFinal,
          telefone:         celularFinal,          // retrocompat
          email:            email || '',
          tipoContrato:     tipoContrato || 'CLT',
          cargo:            cargoFinal,
          tipo:             cargoFinal,            // retrocompat
          funcao:           funcao || cargoFinal || '',  // função para escala
          area:             area || '',            // área de trabalho (Salão, Cozinha, etc)
          valorDia:         parseFloat(valorDia)          || 0,
          valorNoite:       parseFloat(valorNoite)        || 0,
          valorTransporte:  parseFloat(valorTransporte)   || 0,
          valeAlimentacao:  valeAlimentacao === true || valeAlimentacao === 'true' || false,
          salario:          parseFloat(salario)           || 0,
          chavePix:         chavePix         || '',
          dataAdmissao:     dataAdmissao     || new Date().toISOString().split('T')[0],
          dataNascimento:   dataNascimento   || '',
          endereco:         endereco         || '',
          numero:           numero           || '',
          complemento:      complemento      || '',
          cidade:           cidade           || '',
          estado:           estado           || '',
          cep:              cep              || '',
          diasDisponiveis:  Array.isArray(diasDisponiveis)  ? diasDisponiveis  : [],
          podeTrabalharDia:   podeTrabalharDia   === true || podeTrabalharDia   === 'true' || false,
          podeTrabalharNoite: podeTrabalharNoite === true || podeTrabalharNoite === 'true' || false,
          unitId:           unitIdClean,
          ativo:            ativo !== false,
          dataCadastro:     new Date().toISOString().split('T')[0],
          createdAt:        new Date().toISOString(),
          updatedAt:        new Date().toISOString(),
          // Tipos de acordo freelancer
          isMotoboy:        isMotoboy === true || isMotoboy === 'true' || false,
          tipoAcordo:       tipoAcordo || (isMotoboy ? 'motoboy' : null),
          acordo:           acordo || null,
          // Campos de chegada motoboy (retrocompat)
          valorChegadaDia:  parseFloat(valorChegadaDia) || 0,
          valorChegadaNoite:parseFloat(valorChegadaNoite) || 0,
          valorEntrega:     parseFloat(valorEntrega) || 0,
          // Periculosidade (CLT motoboy)
          periculosidade:   parseFloat(periculosidade) || 0,
          // Horário de trabalho
          horarioEntrada:   horarioEntrada || '',
          horarioSaida:     horarioSaida || '',
          // Contribuição Assistencial (cod 1000 / 1305 da folha)
          contribuicaoAssistencial: parseFloat(contribuicaoAssistencial) || 0,
          // Auditoria
          criadoPor:        responsavelId || '',
          criadoPorNome:    responsavelNome || '',
        };

        await dynamodb.put({
          TableName: 'gres-prod-colaboradores',
          Item: item
        }).promise();

        // Log de criação (auditoria)
        await logColaboradorAlteracao({
          colaboradorId: item.id,
          evento: 'criado',
          valoresAntes: null,
          valoresDepois: item,
          usuarioId: responsavelId,
          usuarioNome: responsavelNome,
          usuarioEmail: responsavelEmail,
          unitId: unitIdClean,
          userAgent: (event.headers && (event.headers['user-agent'] || event.headers['User-Agent'])) || '',
        });

        return response(201, { success: true, id: item.id });
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao salvar colaborador' });
      }
    }

    // PUT COLABORADORES — atualiza colaborador existente
    if (rawPath.includes('/colaboradores/') && httpMethod === 'PUT') {
      const colaboradorId = rawPath.split('/').pop();
      if (!colaboradorId) return response(400, { error: 'ID do colaborador é obrigatório' });

      const {
        nome, email, telefone, celular, cpf,
        tipoContrato, cargo, tipo, funcao, area,
        valorDia, valorNoite, valorTransporte, valeAlimentacao,
        salario, periculosidade, chavePix, dataAdmissao, dataDemissao, dataNascimento,
        endereco, numero, complemento, cidade, estado, cep,
        diasDisponiveis, podeTrabalharDia, podeTrabalharNoite,
        unitId,
        ativo,
        isMotoboy, tipoAcordo, acordo,
        valorChegadaDia, valorChegadaNoite, valorEntrega,
        horarioEntrada, horarioSaida,
        contribuicaoAssistencial,  // NOVO
        // Auditoria
        responsavelId, responsavelNome, responsavelEmail, observacaoAlteracao,
      } = body;

      const celularFinal = celular || telefone || '';
      const cargoFinal   = cargo   || tipo     || '';

      try {
        // Busca registro original para preservar campos imutáveis
        const original = await dynamodb.get({
          TableName: 'gres-prod-colaboradores',
          Key: { id: colaboradorId }
        }).promise();

        if (!original.Item) {
          return response(404, { error: 'Colaborador não encontrado' });
        }

        const updated = {
          ...original.Item,
          nome:             nome             || original.Item.nome,
          cpf:              cpf              || original.Item.cpf,
          celular:          celularFinal     || original.Item.celular || original.Item.telefone || '',
          telefone:         celularFinal     || original.Item.telefone || '',
          email:            email            !== undefined ? email : (original.Item.email || ''),
          tipoContrato:     tipoContrato     || original.Item.tipoContrato || 'CLT',
          cargo:            cargoFinal       || original.Item.cargo || original.Item.tipo || '',
          tipo:             cargoFinal       || original.Item.tipo  || original.Item.cargo || '',
          funcao:           funcao           !== undefined ? funcao : (original.Item.funcao || cargoFinal || original.Item.cargo || ''),
          area:             area             !== undefined ? area   : (original.Item.area   || ''),
          valorDia:         valorDia         !== undefined ? (parseFloat(valorDia)         || 0) : (original.Item.valorDia         || 0),
          valorNoite:       valorNoite       !== undefined ? (parseFloat(valorNoite)       || 0) : (original.Item.valorNoite       || 0),
          valorTransporte:  valorTransporte  !== undefined ? (parseFloat(valorTransporte)  || 0) : (original.Item.valorTransporte  || 0),
          valeAlimentacao:  valeAlimentacao  !== undefined ? (valeAlimentacao === true || valeAlimentacao === 'true') : (original.Item.valeAlimentacao || false),
          salario:          salario          !== undefined ? (parseFloat(salario)          || 0) : (original.Item.salario          || 0),
          chavePix:         chavePix         !== undefined ? chavePix         : (original.Item.chavePix         || ''),
          dataAdmissao:     dataAdmissao     || original.Item.dataAdmissao     || '',
          dataDemissao:     dataDemissao     !== undefined ? dataDemissao : (original.Item.dataDemissao || ''),
          dataNascimento:   dataNascimento   || original.Item.dataNascimento   || '',
          endereco:         endereco         !== undefined ? endereco     : (original.Item.endereco     || ''),
          numero:           numero           !== undefined ? numero       : (original.Item.numero       || ''),
          complemento:      complemento      !== undefined ? complemento  : (original.Item.complemento  || ''),
          cidade:           cidade           !== undefined ? cidade       : (original.Item.cidade       || ''),
          estado:           estado           !== undefined ? estado       : (original.Item.estado       || ''),
          cep:              cep              !== undefined ? cep          : (original.Item.cep          || ''),
          diasDisponiveis:  Array.isArray(diasDisponiveis) ? diasDisponiveis : (original.Item.diasDisponiveis || []),
          podeTrabalharDia:   podeTrabalharDia   !== undefined ? (podeTrabalharDia   === true || podeTrabalharDia   === 'true') : (original.Item.podeTrabalharDia   || false),
          podeTrabalharNoite: podeTrabalharNoite !== undefined ? (podeTrabalharNoite === true || podeTrabalharNoite === 'true') : (original.Item.podeTrabalharNoite || false),
          ativo:            ativo !== undefined ? (ativo === true || ativo === 'true') : (original.Item.ativo !== false),
          updatedAt:        new Date().toISOString(),
          // Tipos de acordo freelancer
          isMotoboy:        isMotoboy !== undefined ? (isMotoboy === true || isMotoboy === 'true') : (original.Item.isMotoboy || false),
          tipoAcordo:       tipoAcordo !== undefined ? tipoAcordo : (original.Item.tipoAcordo || null),
          acordo:           acordo !== undefined ? acordo : (original.Item.acordo || null),
          // Campos de chegada motoboy (retrocompat)
          valorChegadaDia:  valorChegadaDia !== undefined ? (parseFloat(valorChegadaDia) || 0) : (original.Item.valorChegadaDia || 0),
          valorChegadaNoite:valorChegadaNoite !== undefined ? (parseFloat(valorChegadaNoite) || 0) : (original.Item.valorChegadaNoite || 0),
          valorEntrega:     valorEntrega !== undefined ? (parseFloat(valorEntrega) || 0) : (original.Item.valorEntrega || 0),
          // Periculosidade
          periculosidade:   periculosidade !== undefined ? (parseFloat(periculosidade) || 0) : (original.Item.periculosidade || 0),
          // Horário de trabalho
          horarioEntrada:   horarioEntrada !== undefined ? horarioEntrada : (original.Item.horarioEntrada || ''),
          horarioSaida:     horarioSaida !== undefined ? horarioSaida : (original.Item.horarioSaida || ''),
          // Contribuição Assistencial (cod 1000 / 1305 da folha)
          contribuicaoAssistencial: contribuicaoAssistencial !== undefined ? (parseFloat(contribuicaoAssistencial) || 0) : (original.Item.contribuicaoAssistencial || 0),
          // Permite mudança de unidade (transferência)
          unitId:           unitId !== undefined ? resolveUnitId(unitId) : (original.Item.unitId || ''),
        };

        await dynamodb.put({
          TableName: 'gres-prod-colaboradores',
          Item: updated
        }).promise();

        // Detectar diff e logar (auditoria)
        const diffs = diffColaborador(original.Item, updated);
        if (diffs) {
          // Detectar evento específico
          let evento = 'alterado';
          if (diffs.ativo) evento = updated.ativo ? 'reativado' : 'desativado';
          else if (diffs.unitId) evento = 'transferido';
          else if (diffs.salario || diffs.valorDia || diffs.valorNoite || diffs.valorEntrega || diffs.valorChegadaDia || diffs.valorChegadaNoite || diffs.valorTransporte) evento = 'remuneracao_alterada';
          else if (diffs.cargo || diffs.tipo || diffs.funcao || diffs.area) evento = 'cargo_alterado';
          else if (diffs.tipoContrato) evento = 'contrato_alterado';

          await logColaboradorAlteracao({
            colaboradorId,
            evento,
            valoresAntes: original.Item,
            valoresDepois: updated,
            usuarioId: responsavelId,
            usuarioNome: responsavelNome,
            usuarioEmail: responsavelEmail,
            unitId: updated.unitId,
            userAgent: (event.headers && (event.headers['user-agent'] || event.headers['User-Agent'])) || '',
            observacao: observacaoAlteracao || '',
          });
        }

        return response(200, { success: true, id: colaboradorId, item: updated, diffs });
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao atualizar colaborador: ' + error.message });
      }
    }

    // DELETE COLABORADORES
    if (rawPath.includes('/colaboradores/') && httpMethod === 'DELETE') {
      const colaboradorId = rawPath.split('/').pop();
      if (!colaboradorId) return response(400, { error: 'ID do colaborador é obrigatório' });

      try {
        await dynamodb.delete({
          TableName: 'gres-prod-colaboradores',
          Key: { id: colaboradorId }
        }).promise();

        return response(200, { success: true, message: 'Colaborador deletado com sucesso' });
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao deletar colaborador: ' + error.message });
      }
    }

    // GET COLABORADORES — filtra por unitId (CNPJ)
    if ((rawPath === '/colaboradores' || rawPath.includes('/colaboradores')) && httpMethod === 'GET') {
      try {
        const unitIdRaw = queryParams.unitId;
        const unitIdClean = unitIdRaw ? resolveUnitId(unitIdRaw) : null;
        let params = { TableName: 'gres-prod-colaboradores' };

        if (unitIdClean) {
          params.FilterExpression = 'unitId = :uid';
          params.ExpressionAttributeValues = { ':uid': unitIdClean };
        }

        const result = await dynamodb.scan(params).promise();
        const items = (result.Items || []).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
        return response(200, items);
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao buscar colaboradores' });
      }
    }

    // ── FUNÇÕES DE ESCALA (regras por função/área) ─────────────────────────────
    // POST /funcoes-escala — salva regra de função
    if (rawPath === '/funcoes-escala' && httpMethod === 'POST') {
      const { id, nome, area, cor, diasTrabalho, turnoNoite, unitId: fUnitId } = body;
      if (!nome || !fUnitId) return response(400, { error: 'nome e unitId são obrigatórios' });
      try {
        const itemId = id || ('func-' + require('crypto').randomBytes(4).toString('hex'));
        const item = {
          id: itemId, nome, area: area || '', cor: cor || '#1976d2',
          diasTrabalho: Array.isArray(diasTrabalho) ? diasTrabalho : [2,3,4,5,6],
          turnoNoite: Array.isArray(turnoNoite) ? turnoNoite : [],
          unitId: resolveUnitId(fUnitId),
          updatedAt: new Date().toISOString()
        };
        await dynamodb.put({ TableName: 'gres-prod-funcoes-escala', Item: item }).promise();
        return response(201, { success: true, id: itemId, item });
      } catch (err) {
        console.error('funcoes-escala POST error:', err);
        return response(500, { error: 'Erro ao salvar função: ' + err.message });
      }
    }
    // GET /funcoes-escala?unitId=xxx
    if (rawPath === '/funcoes-escala' && httpMethod === 'GET') {
      const fUnitId = queryParams.unitId;
      try {
        let items = [];
        if (fUnitId) {
          const r = await dynamodb.scan({
            TableName: 'gres-prod-funcoes-escala',
            FilterExpression: 'unitId = :uid',
            ExpressionAttributeValues: { ':uid': resolveUnitId(fUnitId) }
          }).promise();
          items = r.Items || [];
        } else {
          const r = await dynamodb.scan({ TableName: 'gres-prod-funcoes-escala' }).promise();
          items = r.Items || [];
        }
        return response(200, items.sort((a,b) => (a.area||'').localeCompare(b.area||'') || (a.nome||'').localeCompare(b.nome||'')));
      } catch (err) {
        console.error('funcoes-escala GET error:', err);
        return response(500, { error: 'Erro ao buscar funções: ' + err.message });
      }
    }
    // DELETE /funcoes-escala/{id}
    if (rawPath.includes('/funcoes-escala/') && httpMethod === 'DELETE') {
      const fid = rawPath.split('/').pop();
      try {
        await dynamodb.delete({ TableName: 'gres-prod-funcoes-escala', Key: { id: fid } }).promise();
        return response(200, { success: true });
      } catch (err) { return response(500, { error: err.message }); }
    }

    // POST MOTOBOYS — ID = mot-{uuid}; obrigatório = CPF + telefone
    if ((rawPath === '/motoboys' || rawPath.includes('/motoboys')) && httpMethod === 'POST') {
      const { nome, telefone, cpf, placa, dataAdmissao, dataDemissao,
              comissao, chavePix, unitId, vinculo, ativo } = body;

      if (!nome || !cpf || !telefone) {
        return response(400, { error: 'Nome, CPF e telefone são obrigatórios' });
      }

      const unitIdClean = unitId ? resolveUnitId(unitId) : '';

      try {
        const newId = 'mot-' + require('crypto').randomBytes(4).toString('hex');
        const item = {
          id: newId,
          nome,
          cpf,
          telefone,
          placa: placa || '',
          dataAdmissao: dataAdmissao || new Date().toISOString().split('T')[0],
          dataDemissao: dataDemissao || '',
          comissao: parseFloat(comissao) || 0,
          chavePix: chavePix || '',
          vinculo: vinculo || 'Freelancer',
          unitId: unitIdClean,
          ativo: ativo !== undefined ? ativo : true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
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

    // GET MOTOBOYS — fonte única: colaboradores com isMotoboy=true
    if ((rawPath === '/motoboys' || rawPath.includes('/motoboys')) && httpMethod === 'GET') {
      try {
        const unitIdRaw = queryParams.unitId;
        const unitIdClean = unitIdRaw ? resolveUnitId(unitIdRaw) : null;

        // Buscar colaboradores com isMotoboy = true (fonte única de verdade)
        let params = {
          TableName: 'gres-prod-colaboradores',
          FilterExpression: 'isMotoboy = :true AND (#at = :atTrue OR attribute_not_exists(#at))',
          ExpressionAttributeNames: { '#at': 'ativo' },
          ExpressionAttributeValues: { ':true': true, ':atTrue': true },
        };

        if (unitIdClean) {
          params.FilterExpression += ' AND unitId = :uid';
          params.ExpressionAttributeValues[':uid'] = unitIdClean;
        }

        const result = await dynamodb.scan(params).promise();
        const motoboys = (result.Items || []).map(c => ({
          // Compatibilidade com campos esperados pelo frontend Motoboys.tsx
          id: c.id,
          colaboradorId: c.id,
          nome: c.nome,
          cpf: c.cpf || '',
          telefone: c.telefone || c.celular || '',
          placa: c.placa || '',
          dataAdmissao: c.dataAdmissao || '',
          dataDemissao: c.dataDemissao || '',
          comissao: c.comissao || 0,
          chavePix: c.chavePix || '',
          unitId: c.unitId || '',
          vinculo: c.tipoContrato || c.vinculo || 'Freelancer',
          salario: c.salario || 0,
          periculosidade: c.periculosidade || 0,
          valorChegadaDia:   c.valorChegadaDia   || c.valorDia   || 0,
          valorChegadaNoite: c.valorChegadaNoite || c.valorNoite || 0,
          valorEntrega:      c.valorEntrega || c.valorTransporte || 0,
          isMotoboy: true,
          ativo: c.ativo !== false,
          // Preservar tipoAcordo para uso futuro
          tipoAcordo: c.tipoAcordo || 'motoboy',
          acordo: c.acordo || null,
        }));

        return response(200, motoboys.sort((a, b) => (a.nome || '').localeCompare(b.nome || '')));
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao buscar motoboys' });
      }
    }

    // PUT MOTOBOYS — Editar motoboy
    if (rawPath.includes('/motoboys/') && httpMethod === 'PUT') {
      const motoboyId = rawPath.split('/').pop();
      if (!motoboyId) {
        return response(400, { error: 'ID do motoboy é obrigatório' });
      }

      const { nome, cpf, telefone, placa, dataAdmissao, dataDemissao, comissao,
              chavePix, unitId, vinculo, ativo } = body;

      if (!nome || !cpf || !telefone) {
        return response(400, { error: 'Nome, CPF e telefone são obrigatórios' });
      }

      try {
        // Load original to preserve createdAt
        const orig = await dynamodb.get({ TableName: 'gres-prod-motoboys', Key: { id: motoboyId } }).promise();
        if (!orig.Item) {
          return response(404, { error: 'Motoboy não encontrado' });
        }

        const unitIdClean = unitId ? resolveUnitId(unitId) : (orig.Item.unitId || '');

        const item = {
          ...orig.Item,
          nome,
          cpf,
          telefone,
          placa: placa || orig.Item.placa || '',
          dataAdmissao: dataAdmissao || orig.Item.dataAdmissao || '',
          dataDemissao: dataDemissao || orig.Item.dataDemissao || '',
          comissao: parseFloat(comissao) || 0,
          chavePix: chavePix || orig.Item.chavePix || '',
          vinculo: vinculo || orig.Item.vinculo || 'Freelancer',
          ativo: ativo !== undefined ? ativo : orig.Item.ativo,
          unitId: unitIdClean,
          updatedAt: new Date().toISOString(),
        };

        await dynamodb.put({ TableName: 'gres-prod-motoboys', Item: item }).promise();
        return response(200, { success: true, id: motoboyId });
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao atualizar motoboy' });
      }
    }

    // DELETE MOTOBOYS — Deletar motoboy
    if (rawPath.includes('/motoboys/') && httpMethod === 'DELETE') {
      const motoboyId = rawPath.split('/').pop();
      if (!motoboyId) {
        return response(400, { error: 'ID do motoboy é obrigatório' });
      }
      try {
        await dynamodb.delete({
          TableName: 'gres-prod-motoboys',
          Key: { id: motoboyId }
        }).promise();
        return response(200, { success: true, message: 'Motoboy deletado com sucesso' });
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao deletar motoboy' });
      }
    }

    // POST CAIXA — ID canônico: CNPJ-data-turno; unitId = CNPJ
    if ((rawPath === '/caixa' || rawPath.includes('/caixa')) && httpMethod === 'POST') {
      const { unitId, data, hora, periodo, responsavel, responsavelId, responsavelNome,
              abertura, maq1, maq2, maq3, maq4, maq5, maq6, ifood, dinheiro, pix,
              fiado, sangria, total, sistemaPdv, diferenca, referencia } = body;

      if (!unitId || !data || !periodo) {
        return response(400, { error: 'unitId, data e periodo são obrigatórios' });
      }

      const unitClean = resolveUnitId(unitId);
      const itemId = caixaId(unitClean, data, periodo);

      try {
        // Resolve responsável usando helper de integridade
        const resp = await resolverResponsavel(responsavel || responsavelId, responsavelNome);
        const respNome = responsavelNome || resp.responsavelNome;
        const respId   = responsavelId   || resp.responsavelId;

        // Server-side recalculation — never trust client-provided totals
        const p_ab  = parseFloat(abertura)   || 0;
        const p_m1  = parseFloat(maq1)       || 0;
        const p_m2  = parseFloat(maq2)       || 0;
        const p_m3  = parseFloat(maq3)       || 0;
        const p_m4  = parseFloat(maq4)       || 0;
        const p_m5  = parseFloat(maq5)       || 0;
        const p_m6  = parseFloat(maq6)       || 0;
        const p_if  = parseFloat(ifood)      || 0;
        const p_din = parseFloat(dinheiro)   || 0;
        const p_pix = parseFloat(pix)        || 0;
        const p_fia = parseFloat(fiado)      || 0;
        const p_san = parseFloat(sangria)    || 0;
        const p_pdv = parseFloat(sistemaPdv) || 0;
        // total = soma das entradas (sangria NÃO entra)
        const p_tot = p_ab + p_m1 + p_m2 + p_m3 + p_m4 + p_m5 + p_m6 + p_if + p_din + p_pix + p_fia;
        const p_dif = p_pdv - p_tot;

        const item = {
          id: itemId,
          unitId: unitClean,
          data,
          data_periodo: `${data}#${periodo}`,
          hora: hora || new Date().toTimeString().split(' ')[0],
          periodo,
          responsavel: responsavel || '',
          responsavelId: respId,
          responsavelNome: respNome,
          abertura:   p_ab,
          maq1:       p_m1,
          maq2:       p_m2,
          maq3:       p_m3,
          maq4:       p_m4,
          maq5:       p_m5,
          maq6:       p_m6,
          ifood:      p_if,
          dinheiro:   p_din,
          pix:        p_pix,
          fiado:      p_fia,
          sangria:    p_san,
          total:      p_tot,
          sistema:    p_pdv,
          sistemaPdv: p_pdv,
          diferenca:  p_dif,
          referencia: referencia || '',
          createdAt:  new Date().toISOString(),
          updatedAt:  new Date().toISOString()
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

    // GET CAIXA — filtra por unitId (CNPJ), data/período
    if ((rawPath === '/caixa' || rawPath.includes('/caixa')) && httpMethod === 'GET') {
      const unitIdRaw  = queryParams.unitId;
      const unitIdClean = unitIdRaw ? resolveUnitId(unitIdRaw) : null;
      const data       = queryParams.data;
      const dataInicio = queryParams.dataInicio;
      const dataFim    = queryParams.dataFim;
      const periodo    = queryParams.periodo;

      try {
        // Mapa de usuários (id ou email → nome)
        const usersRaw = await dynamodb.scan({ TableName: 'gres-prod-usuarios' }).promise();
        const usersById = {}, usersByEmail = {};
        (usersRaw.Items || []).forEach(u => {
          usersById[u.id] = u.nome;
          usersByEmail[u.email] = u.nome;
        });
        const resolveRespNome = (item) => {
          if (item.responsavelNome && item.responsavelNome !== 'Não informado') return item.responsavelNome;
          if (item.responsavelId && usersById[item.responsavelId]) return usersById[item.responsavelId];
          if (item.responsavel && usersByEmail[item.responsavel]) return usersByEmail[item.responsavel];
          return item.responsavelNome || 'Não informado';
        };

        const result = await dynamodb.scan({ TableName: 'gres-prod-caixa' }).promise();
        let items = result.Items || [];
        console.log('caixa total:', items.length);

        items = items.filter(item => {
          const itemUnit = toCnpj(item.unitId || item.unidade_id || item.unidadeId || '');
          if (unitIdClean && itemUnit && itemUnit !== unitIdClean) return false;
          if (data && item.data !== data) return false;
          if (dataInicio && item.data && item.data < dataInicio) return false;
          if (dataFim   && item.data && item.data > dataFim)   return false;
          if (periodo && item.periodo && item.periodo.toLowerCase() !== periodo.toLowerCase()) return false;
          return true;
        }).map(item => ({
          ...item,
          unitId: toCnpj(item.unitId || item.unidade_id || item.unidadeId || ''),
          sistemaPdv: item.sistemaPdv || item.sistema || 0,
          sistema:    item.sistema    || item.sistemaPdv || 0,
          responsavelNome: resolveRespNome(item),
        }));

        items.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
        console.log('caixa após filtro:', items.length);
        return response(200, items);
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao buscar caixa: ' + error.message });
      }
    }

    // POST ESCALAS
    if (rawPath === '/escalas' && httpMethod === 'POST') {
      const uid = body.unitId || body.unidadeId;
      const { data, colaboradorId, turno, observacao } = body;
      if (!uid || !data || !colaboradorId || !turno) {
        return response(400, { error: 'unitId, data, colaboradorId e turno são obrigatórios' });
      }
      try {
        const item = {
          id: `esc-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
          unitId: uid, unidadeId: uid, data, colaboradorId, turno,
          observacao: observacao || '',
          timestamp: new Date().toISOString(), createdAt: new Date().toISOString()
        };
        await dynamodb.put({ TableName: 'gres-prod-escalas', Item: item }).promise();
        await logEscalaAlteracao({
          escalaId: item.id,
          evento: 'criado',
          valoresAntes: null,
          valoresDepois: { data, colaboradorId, turno, observacao: observacao || '' },
          usuarioId: body.responsavelId || body.responsavel || '',
          usuarioNome: body.responsavelNome || body.responsavel || '',
          observacao: 'Escala criada',
        });
        return response(201, { success: true, id: item.id });
      } catch (err) {
        console.error('DynamoDB error:', err);
        return response(500, { error: 'Erro ao salvar escala' });
      }
    }

    // GET ESCALAS — suporta unitId, unidadeId, mes (YYYY-MM)
    if (rawPath === '/escalas' && httpMethod === 'GET') {
      const uid = queryParams.unitId || queryParams.unidadeId;
      const mes = queryParams.mes; // ex: 2026-03
      try {
        let items = [];
        if (uid) {
          // Tenta query pelo índice, fallback para scan filtrado
          try {
            const r = await dynamodb.query({
              TableName: 'gres-prod-escalas',
              IndexName: 'unidadeId-timestamp-index',
              KeyConditionExpression: 'unidadeId = :uid',
              ExpressionAttributeValues: { ':uid': uid }
            }).promise();
            items = r.Items || [];
          } catch {
            const r = await dynamodb.scan({ TableName: 'gres-prod-escalas' }).promise();
            items = (r.Items || []).filter(i => i.unitId === uid || i.unidadeId === uid);
          }
        } else {
          const r = await dynamodb.scan({ TableName: 'gres-prod-escalas' }).promise();
          items = r.Items || [];
        }
        if (mes) items = items.filter(i => (i.data || '').startsWith(mes));
        // Filter out soft-deleted items
        items = items.filter(i => !i._deleted && i.turno !== 'Deletado');
        return response(200, items);
      } catch (err) {
        console.error('DynamoDB error:', err);
        return response(500, { error: 'Erro ao buscar escalas' });
      }
    }

    // PUT ESCALA — atualiza turno, presença ou observação
    if (rawPath.match(/\/escalas\/.+/) && httpMethod === 'PUT') {
      const escId = rawPath.split('/').pop();
      if (!escId) return response(400, { error: 'ID obrigatório' });
      try {
        // Try direct get first
        let originalItem = null;
        try {
          const r = await dynamodb.get({ TableName: 'gres-prod-escalas', Key: { id: escId } }).promise();
          originalItem = r.Item || null;
        } catch (e) {
          console.warn('PUT escalas direct get failed, trying scan:', e.message);
        }
        // Fallback: scan to find by id field
        if (!originalItem) {
          const scan = await dynamodb.scan({
            TableName: 'gres-prod-escalas',
            FilterExpression: 'id = :eid',
            ExpressionAttributeValues: { ':eid': escId }
          }).promise();
          originalItem = (scan.Items && scan.Items.length > 0) ? scan.Items[0] : null;
        }
        if (!originalItem) return response(404, { error: 'Escala não encontrada' });
        const updated = {
          ...originalItem,
          ...(body.turno         !== undefined ? { turno: body.turno }              : {}),
          ...(body.observacao    !== undefined ? { observacao: body.observacao }    : {}),
          ...(body.presenca      !== undefined ? { presenca: body.presenca }        : {}),
          ...(body.presencaNoite !== undefined ? { presencaNoite: body.presencaNoite } : {}),
          updatedAt: new Date().toISOString(),
        };
        await dynamodb.put({ TableName: 'gres-prod-escalas', Item: updated }).promise();
        // ── LOG ──
        const diffs = diffEscala(originalItem, updated);
        if (diffs) {
          // Determinar evento mais específico
          let evento = 'alterado';
          if (diffs.presenca || diffs.presencaNoite) {
            const newPres = updated.presenca || updated.presencaNoite;
            const oldPres = originalItem.presenca || originalItem.presencaNoite;
            if (newPres === 'presente' || newPres === 'presente_parcial') evento = 'confirmado';
            else if ((oldPres === 'presente' || oldPres === 'presente_parcial') && (!newPres || newPres === 'pendente' || newPres === 'falta')) evento = 'desconfirmado';
            else if (newPres === 'falta') evento = 'falta';
          } else if (diffs.observacao && !diffs.turno) {
            evento = 'observacao';
          }
          await logEscalaAlteracao({
            escalaId: escId,
            evento,
            valoresAntes: { turno: originalItem.turno, presenca: originalItem.presenca, presencaNoite: originalItem.presencaNoite, observacao: originalItem.observacao },
            valoresDepois: { turno: updated.turno, presenca: updated.presenca, presencaNoite: updated.presencaNoite, observacao: updated.observacao },
            usuarioId: body.responsavelId || body.responsavel || '',
            usuarioNome: body.responsavelNome || body.responsavel || '',
            observacao: body.motivoAlteracao || '',
          });
        }
        return response(200, { success: true, id: escId });
      } catch (err) {
        return response(500, { error: 'Erro ao atualizar escala: ' + err.message });
      }
    }

    // DELETE ESCALA
    if (rawPath.match(/\/escalas\/.+/) && httpMethod === 'DELETE') {
      const escId = rawPath.split('/').pop();
      if (!escId) return response(400, { error: 'ID obrigatório' });
      try {
        // Pegar item antes de deletar (para o log)
        let originalItem = null;
        try {
          const r = await dynamodb.get({ TableName: 'gres-prod-escalas', Key: { id: escId } }).promise();
          originalItem = r.Item || null;
        } catch (e) { /* ignore */ }
        if (!originalItem) {
          const scan = await dynamodb.scan({
            TableName: 'gres-prod-escalas',
            FilterExpression: 'id = :eid',
            ExpressionAttributeValues: { ':eid': escId }
          }).promise();
          originalItem = (scan.Items && scan.Items.length > 0) ? scan.Items[0] : null;
        }
        // Try direct delete first (works if 'id' is the partition key)
        let deleted = false;
        try {
          await dynamodb.delete({ TableName: 'gres-prod-escalas', Key: { id: escId } }).promise();
          deleted = true;
        } catch (e) {
          console.warn('DELETE escalas direct failed:', e.message);
        }
        // If direct delete failed or item might have different key, mark as deleted via PUT
        if (!deleted && originalItem) {
          // Mark as deleted (soft delete - update turno to empty string to exclude from results)
          await dynamodb.put({
            TableName: 'gres-prod-escalas',
            Item: { ...originalItem, turno: 'Deletado', _deleted: true, updatedAt: new Date().toISOString() }
          }).promise();
        }
        if (originalItem) {
          await logEscalaAlteracao({
            escalaId: escId,
            evento: 'deletado',
            valoresAntes: { turno: originalItem.turno, presenca: originalItem.presenca, presencaNoite: originalItem.presencaNoite, observacao: originalItem.observacao, data: originalItem.data, colaboradorId: originalItem.colaboradorId },
            valoresDepois: null,
            usuarioId: queryParams?.responsavelId || '',
            usuarioNome: queryParams?.responsavelNome || '',
            observacao: queryParams?.motivo || 'Escala removida',
          });
        }
        return response(200, { success: true });
      } catch (err) {
        return response(500, { error: 'Erro ao deletar escala' });
      }
    }

    // GET /escalas-log/:escalaId — historico de uma escala
    if (rawPath.match(/\/escalas-log\/.+/) && httpMethod === 'GET') {
      const escalaId = rawPath.split('/').pop();
      if (!escalaId) return response(400, { error: 'escalaId obrigatorio' });
      try {
        const r = await dynamodb.query({
          TableName: 'gres-prod-escalas-log',
          IndexName: 'escalaId-timestamp-index',
          KeyConditionExpression: 'escalaId = :eid',
          ExpressionAttributeValues: { ':eid': escalaId },
          ScanIndexForward: true,  // ordem cronológica
        }).promise();
        return response(200, r.Items || []);
      } catch (err) {
        console.error('GET escalas-log error:', err);
        return response(500, { error: 'Erro ao buscar historico de escala' });
      }
    }

    // GET /escalas-log?unitId=&dataIni=&dataFim= — logs por unidade/período
    if (rawPath === '/escalas-log' && httpMethod === 'GET') {
      try {
        const r = await dynamodb.scan({ TableName: 'gres-prod-escalas-log' }).promise();
        let items = r.Items || [];
        // Filtros opcionais
        if (queryParams.dataIni && queryParams.dataFim) {
          items = items.filter(i => i.timestamp >= queryParams.dataIni && i.timestamp <= queryParams.dataFim + 'T23:59:59');
        }
        if (queryParams.escalaId) {
          items = items.filter(i => i.escalaId === queryParams.escalaId);
        }
        items.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
        return response(200, items);
      } catch (err) {
        return response(500, { error: 'Erro ao buscar logs de escala' });
      }
    }

    // GET /colaboradores-log/:colaboradorId — historico de um colaborador
    if (rawPath.match(/\/colaboradores-log\/.+/) && httpMethod === 'GET') {
      const colId = rawPath.split('/').pop();
      if (!colId) return response(400, { error: 'colaboradorId obrigatorio' });
      try {
        // Tenta query pelo índice; fallback para scan filtrado
        let items = [];
        try {
          const r = await dynamodb.query({
            TableName: 'gres-prod-colaboradores-log',
            IndexName: 'colaboradorId-timestamp-index',
            KeyConditionExpression: 'colaboradorId = :cid',
            ExpressionAttributeValues: { ':cid': colId },
            ScanIndexForward: false, // mais recente primeiro
          }).promise();
          items = r.Items || [];
        } catch (idxErr) {
          // Índice ainda não criado: scan + filter
          const r = await dynamodb.scan({
            TableName: 'gres-prod-colaboradores-log',
            FilterExpression: 'colaboradorId = :cid',
            ExpressionAttributeValues: { ':cid': colId },
          }).promise();
          items = r.Items || [];
          items.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
        }
        return response(200, items);
      } catch (err) {
        console.error('GET colaboradores-log/:id error:', err);
        return response(500, { error: 'Erro ao buscar historico do colaborador: ' + err.message });
      }
    }

    // GET /auditoria?tabela=&unitId=&dataIni=&dataFim=&entidadeId=&usuarioId=
    // Endpoint generico que consulta as tabelas de log: colaboradores, folha-pagamento, saidas, controle-motoboy, escalas
    if (rawPath === '/auditoria' && httpMethod === 'GET') {
      try {
        const tabela = queryParams.tabela || 'colaboradores';
        const TABELAS_VALIDAS = ['colaboradores', 'folha-pagamento', 'saidas', 'controle-motoboy', 'escalas'];
        if (!TABELAS_VALIDAS.includes(tabela)) {
          return response(400, { error: `tabela invalida. Use uma de: ${TABELAS_VALIDAS.join(', ')}` });
        }
        const tableName = `gres-prod-${tabela}-log`;
        const r = await dynamodb.scan({ TableName: tableName }).promise();
        let items = r.Items || [];

        // Filtros
        if (queryParams.dataIni && queryParams.dataFim) {
          items = items.filter(i => i.timestamp >= queryParams.dataIni && i.timestamp <= queryParams.dataFim + 'T23:59:59');
        }
        const entId = queryParams.entidadeId || queryParams.colaboradorId || queryParams.escalaId;
        if (entId) {
          items = items.filter(i => i.entidadeId === entId || i.colaboradorId === entId || i.escalaId === entId);
        }
        if (queryParams.usuarioId) {
          items = items.filter(i => i.usuarioId === queryParams.usuarioId);
        }
        if (queryParams.unitId) {
          const cnpjFiltro = toCnpj(queryParams.unitId);
          items = items.filter(i => !i.unitId || toCnpj(i.unitId) === cnpjFiltro);
        }
        if (queryParams.evento) {
          items = items.filter(i => i.evento === queryParams.evento);
        }
        items.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
        // Paginação simples
        const limit = parseInt(queryParams.limit) || 500;
        return response(200, { items: items.slice(0, limit), total: items.length, tabela });
      } catch (err) {
        console.error('auditoria error:', err);
        return response(500, { error: 'Erro ao buscar auditoria: ' + err.message });
      }
    }

    // GET /colaboradores-log?unitId=&dataIni=&dataFim= — logs por unidade/período
    if (rawPath === '/colaboradores-log' && httpMethod === 'GET') {
      try {
        const r = await dynamodb.scan({ TableName: 'gres-prod-colaboradores-log' }).promise();
        let items = r.Items || [];
        if (queryParams.dataIni && queryParams.dataFim) {
          items = items.filter(i => i.timestamp >= queryParams.dataIni && i.timestamp <= queryParams.dataFim + 'T23:59:59');
        }
        if (queryParams.colaboradorId) {
          items = items.filter(i => i.colaboradorId === queryParams.colaboradorId);
        }
        if (queryParams.unitId) {
          const cnpjFiltro = toCnpj(queryParams.unitId);
          items = items.filter(i => !i.unitId || toCnpj(i.unitId) === cnpjFiltro);
        }
        items.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
        return response(200, items);
      } catch (err) {
        return response(500, { error: 'Erro ao buscar logs de colaboradores: ' + err.message });
      }
    }

    // ── CONTROLE DIÁRIO MOTOBOY ────────────────────────────────────────
    // POST /controle-motoboy — salva array de linhas do mês
    if (rawPath === '/controle-motoboy' && httpMethod === 'POST') {
      const { motoboyId, mes, unitId, linhas } = body;
      if (!motoboyId || !mes || !Array.isArray(linhas)) {
        return response(400, { error: 'motoboyId, mes e linhas são obrigatórios' });
      }
      try {
        // Upsert em lote (DynamoDB transact ou batch write)
        const chunks = [];
        for (let i = 0; i < linhas.length; i += 25) chunks.push(linhas.slice(i, i + 25));
        for (const chunk of chunks) {
          await dynamodb.batchWrite({
            RequestItems: {
              'gres-prod-controle-motoboy': chunk.map(l => ({
                PutRequest: {
                  Item: {
                    id: `${motoboyId}_${l.data}`,
                    motoboyId, data: l.data,
                    diaSemana: l.diaSemana != null ? Number(l.diaSemana) : 0,
                    salDia: parseFloat(l.salDia) || 0,
                    entDia: parseFloat(l.entDia) || 0,
                    caixinhaDia: parseFloat(l.caixinhaDia) || 0,
                    chegadaDia: parseFloat(l.chegadaDia) || 0,
                    entNoite: parseFloat(l.entNoite) || 0,
                    caixinhaNoite: parseFloat(l.caixinhaNoite) || 0,
                    chegadaNoite: parseFloat(l.chegadaNoite) || 0,
                    vlVariavel: parseFloat(l.vlVariavel) || 0,
                    pgto: parseFloat(l.pgto) || 0,
                    variavel: parseFloat(l.variavel) || 0,
                    unitId: unitId || l.unitId || '',
                    updatedAt: new Date().toISOString()
                  }
                }
              }))
            }
          }).promise();
        }
        // Auditoria: log de save (1 entrada por POST, não por linha)
        const audCtrl = extrairAuditoria(body, event);
        await logAlteracaoGenerica({
          tabela: 'controle-motoboy',
          entidadeId: `${motoboyId}_${mes}`,
          evento: 'alterado',
          valoresAntes: null, // gravação em batch — omitir antes (custoso reler 30+ itens)
          valoresDepois: { motoboyId, mes, totalLinhas: linhas.length, datas: linhas.map(l => l.data).slice(0, 50) },
          ...audCtrl,
          unitId: unitId,
        });
        return response(200, { success: true, total: linhas.length });
      } catch (err) {
        console.error('controle-motoboy error:', err);
        return response(500, { error: 'Erro ao salvar controle: ' + err.message });
      }
    }

    // GET /controle-motoboy?motoboyId=xxx&mes=2026-03&unitId=xxx
    if (rawPath === '/controle-motoboy' && httpMethod === 'GET') {
      const { motoboyId, mes, unitId } = queryParams;
      if (!motoboyId) return response(400, { error: 'motoboyId obrigatório' });
      try {
        const result = await dynamodb.query({
          TableName: 'gres-prod-controle-motoboy',
          KeyConditionExpression: 'motoboyId = :mid',
          ExpressionAttributeValues: { ':mid': motoboyId }
        }).promise();
        let items = result.Items || [];
        if (mes) items = items.filter(i => (i.data || '').startsWith(mes));
        items.sort((a, b) => (a.data || '').localeCompare(b.data || ''));
        return response(200, items);
      } catch (err) {
        console.error('controle-motoboy GET error:', err);
        return response(500, { error: 'Erro ao buscar controle: ' + err.message });
      }
    }

    // ── FOLHA DE PAGAMENTO ──────────────────────────────────────────────
    // POST /folha-pagamento — salva pagamento
    // Novo modelo: body.dias = [{data, turno, valor}] → 1 registro por dia/turno
    // Legado: body.semana (sem dias) → 1 registro por semana (retrocompatível)
    if (rawPath === '/folha-pagamento' && httpMethod === 'POST') {
      const { colaboradorId, mes, semana, unitId, pago, dataPagamento, saldoFinal,
              valorBruto, valorTransporte, transporteCalculado, transporteAdiantado,
              desconto, caixinha, totalFinal, obs, formaPagamento, diasPagos,
              dias,
              // NOVO: campos específicos CLT
              pagoAdiantamento, dataPgtoAdiantamento, pagoVariavel, dataPgtoVariavel,
              logPagamentos } = body;
      if (!colaboradorId || !mes) return response(400, { error: 'colaboradorId e mes são obrigatórios' });
      try {
        const now = new Date().toISOString();
        const normalizedUnitId = toCnpj(unitId || '') || unitId || '';
        const dtPgto = pago ? (dataPagamento || now.split('T')[0]) : null;

        // ── NOVO MODELO: array de dias ──────────────────────────────────────
        if (Array.isArray(dias) && dias.length > 0) {
          const saved = [];
          const isFazendoPagamento = pago !== false;

          // Gerar pagamentoId único para amarrar todos os turnos deste lote.
          // Se for desfazer (pago=false), não gera lote — cada turno é revertido individualmente.
          // Campo transacaoBancariaId reservado para futura conciliação bancária (MVP fase 3).
          const pagamentoId = isFazendoPagamento
            ? (body.pagamentoId || `pgto-${colaboradorId}-${now.replace(/[:.]/g, '').slice(0,17)}`)
            : null;

          for (const d of dias) {
            const { data, turno, valor, tipoCodigo } = d;
            if (!data || !turno) continue;
            const dayId = `folha-${colaboradorId}-${data}-${turno}`;
            const item = {
              id: dayId,
              tipo: 'freelancer-dia',
              tipoCodigo: tipoCodigo || (turno === 'Dia' ? 'freelancer-dia' : 'freelancer-noite'),
              colaboradorId, data, turno, mes,
              semana: semana || null,
              unitId: normalizedUnitId,
              valor: parseFloat(valor) || 0,
              pago: isFazendoPagamento,
              dataPagamento: isFazendoPagamento ? dtPgto : null,
              formaPagamento: isFazendoPagamento ? (formaPagamento || 'PIX') : null,
              pagamentoId: pagamentoId,           // amarra todos os turnos deste ato de pagamento
              transacaoBancariaId: null,           // reservado para conciliação bancária (fase 3 MVP)
              confiabilidade: 'real',              // gerado pelo sistema — não recalculado
              obs: obs || '',
              updatedAt: now,
            };
            await dynamodb.put({ TableName: 'gres-prod-folha-pagamento', Item: item }).promise();
            saved.push(dayId);
          }
          // Auditoria: log de pagamento (1 entrada por lote, não por dia)
          const audPag = extrairAuditoria(body, event);
          await logAlteracaoGenerica({
            tabela: 'folha-pagamento',
            entidadeId: pagamentoId || `${colaboradorId}_${mes}`,
            evento: isFazendoPagamento ? 'pago' : 'desfeito',
            valoresAntes: null,
            valoresDepois: { colaboradorId, mes, semana, dias, formaPagamento, dataPagamento: dtPgto, ids: saved },
            ...audPag,
            unitId: normalizedUnitId,
          });
          return response(200, { success: true, ids: saved, count: saved.length, pagamentoId });
        }

        // ── LEGADO: registro semanal agrupado (CLT ou desfazer pagamento antigo) ──
        const itemId = semana ? `${colaboradorId}_${mes}_${semana}` : `${colaboradorId}_${mes}`;

        // Buscar item original para mesclar (preservar pagoAdto se só vier pagoVar e vice-versa)
        let origItemPreserve = null;
        try {
          const o = await dynamodb.get({ TableName: 'gres-prod-folha-pagamento', Key: { id: itemId } }).promise();
          origItemPreserve = o.Item || null;
        } catch {}

        const item = {
          ...(origItemPreserve || {}),
          id: itemId,
          colaboradorId, mes, semana: semana || null,
          unitId: normalizedUnitId,
          pago: pago === true,
          dataPagamento: dtPgto,
          formaPagamento: formaPagamento || (origItemPreserve && origItemPreserve.formaPagamento) || 'PIX',
          saldoFinal: saldoFinal !== undefined ? (parseFloat(saldoFinal) || 0) : (origItemPreserve?.saldoFinal || 0),
          valorBruto: valorBruto !== undefined ? (parseFloat(valorBruto) || 0) : (origItemPreserve?.valorBruto || 0),
          valorTransporte: valorTransporte !== undefined ? (parseFloat(valorTransporte) || 0) : (origItemPreserve?.valorTransporte || 0),
          transporteCalculado: transporteCalculado !== undefined ? (parseFloat(transporteCalculado) || 0) : (origItemPreserve?.transporteCalculado || 0),
          transporteAdiantado: transporteAdiantado !== undefined ? (parseFloat(transporteAdiantado) || 0) : (origItemPreserve?.transporteAdiantado || 0),
          desconto: desconto !== undefined ? (parseFloat(desconto) || 0) : (origItemPreserve?.desconto || 0),
          caixinha: caixinha !== undefined ? (parseFloat(caixinha) || 0) : (origItemPreserve?.caixinha || 0),
          totalFinal: totalFinal !== undefined ? (parseFloat(totalFinal) || 0) : (origItemPreserve?.totalFinal || 0),
          diasPagos: Array.isArray(diasPagos) ? diasPagos : (origItemPreserve?.diasPagos || []),
          // CLT - flags separadas para Pgto Dia 20 e Pgto Dia 5
          // Quando o body envia, prevalece. Senão preserva o existente.
          pagoAdiantamento: pagoAdiantamento !== undefined ? !!pagoAdiantamento : (origItemPreserve?.pagoAdiantamento || false),
          dataPgtoAdiantamento: dataPgtoAdiantamento !== undefined ? dataPgtoAdiantamento : (origItemPreserve?.dataPgtoAdiantamento || null),
          pagoVariavel: pagoVariavel !== undefined ? !!pagoVariavel : (origItemPreserve?.pagoVariavel || false),
          dataPgtoVariavel: dataPgtoVariavel !== undefined ? dataPgtoVariavel : (origItemPreserve?.dataPgtoVariavel || null),
          // Log de pagamentos cumulativo (acumula entradas)
          logPagamentos: Array.isArray(logPagamentos)
            ? [...((origItemPreserve?.logPagamentos) || []), ...logPagamentos]
            : (origItemPreserve?.logPagamentos || []),
          obs: obs !== undefined ? obs : (origItemPreserve?.obs || ''),
          updatedAt: now,
        };
        await dynamodb.put({ TableName: 'gres-prod-folha-pagamento', Item: item }).promise();

        // Auditoria (usa origItemPreserve carregado acima)
        const audFol = extrairAuditoria(body, event);
        const origItem = origItemPreserve;
        await logAlteracaoGenerica({
          tabela: 'folha-pagamento',
          entidadeId: itemId,
          evento: origItem ? (item.pago && !origItem.pago ? 'pago' : (!item.pago && origItem.pago ? 'desfeito' : 'alterado')) : 'criado',
          valoresAntes: origItem,
          valoresDepois: item,
          ...audFol,
          unitId: normalizedUnitId,
        });

        return response(200, { success: true, id: itemId });
      } catch (err) {
        console.error('folha-pagamento error:', err);
        return response(500, { error: 'Erro ao salvar folha: ' + err.message });
      }
    }

    // GET /folha-pagamento?unitId=xxx&mes=2026-03[&colaboradorId=xxx]
    if (rawPath === '/folha-pagamento' && httpMethod === 'GET') {
      const { unitId, mes, colaboradorId } = queryParams;
      const unitCnpj = unitId ? toCnpj(unitId) : null;
      try {
        // Paginated scan (DynamoDB truncates at 1MB per call)
        let items = [];
        const filters = [];
        const exprVals = {};
        if (mes) { filters.push('mes = :m'); exprVals[':m'] = mes; }
        if (colaboradorId) { filters.push('colaboradorId = :c'); exprVals[':c'] = colaboradorId; }
        const scanParams = {
          TableName: 'gres-prod-folha-pagamento',
          ...(filters.length > 0 ? { FilterExpression: filters.join(' AND '), ExpressionAttributeValues: exprVals } : {}),
        };
        let lastKey = undefined;
        do {
          const r = await dynamodb.scan({ ...scanParams, ...(lastKey ? { ExclusiveStartKey: lastKey } : {}) }).promise();
          items = items.concat(r.Items || []);
          lastKey = r.LastEvaluatedKey;
        } while (lastKey);
        // Filter unitId client-side with CNPJ normalization
        if (unitCnpj) {
          items = items.filter(i => {
            const iCnpj = toCnpj(i.unitId || '');
            return !i.unitId || iCnpj === unitCnpj || i.unitId === unitId;
          });
        }
        return response(200, items);
      } catch (err) {
        console.error('folha-pagamento GET error:', err);
        return response(500, { error: 'Erro ao buscar folha: ' + err.message });
      }
    }

    // GET /folha-pagamento/historico?unitId=xxx&colaboradorId=xxx — histórico analítico
    if (rawPath === '/folha-pagamento/historico' && httpMethod === 'GET') {
      const { unitId, colaboradorId } = queryParams;
      try {
        const filters = [];
        const exprVals = {};
        if (unitId) { filters.push('unitId = :u'); exprVals[':u'] = unitId; }
        if (colaboradorId) { filters.push('colaboradorId = :c'); exprVals[':c'] = colaboradorId; }
        const r = await dynamodb.scan({
          TableName: 'gres-prod-folha-pagamento',
          ...(filters.length > 0 ? { FilterExpression: filters.join(' AND '), ExpressionAttributeValues: exprVals } : {}),
        }).promise();
        const items = (r.Items || []).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
        return response(200, items);
      } catch (err) {
        return response(500, { error: 'Erro ao buscar histórico: ' + err.message });
      }
    }

    // POST SAIDAS
    if ((rawPath === '/saidas' || rawPath.includes('/saidas')) && httpMethod === 'POST') {
      const { responsavel, responsavelId, colaboradorId, descricao, valor, data,
              origem, tipo, dataPagamento, unitId, viagens, caixinha, turno, observacao, formaPagamento } = body;

      if (!responsavel || !descricao || !valor || !data || !colaboradorId) {
        return response(400, { error: 'Campos obrigatórios faltando' });
      }

      try {
        // Resolve responsável usando helper de integridade
        const respSaida = await resolverResponsavel(responsavel || responsavelId, '');
        const responsavelNome      = respSaida.responsavelNome;
        const responsavelIdResolved = responsavelId || respSaida.responsavelId;

        // Verificar se o colaborador existe (integridade referencial)
        const colaborador = await validarColaborador(colaboradorId);
        if (!colaborador) {
          return response(400, { error: 'Colaborador não encontrado' });
        }
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
          tipo: tipo || origem || 'A pagar',
          origem: tipo || origem || 'A pagar',
          referencia: tipo || origem || 'A pagar',
          dataPagamento: dataPagamento || '',
          observacao: observacao || '',
          viagens: viagens !== undefined ? parseInt(viagens) || 0 : 0,
          caixinha: caixinha !== undefined ? parseFloat(caixinha) || 0 : 0,
          formaPagamento: formaPagamento || 'PIX',
          unitId: itemUnitId,
          timestamp: new Date().toISOString(),
          createdAt: new Date().toISOString()
        };

        await dynamodb.put({
          TableName: 'gres-prod-saidas',
          Item: item
        }).promise();

        // Auditoria: log de criação
        const audSaida = extrairAuditoria(body, event);
        await logAlteracaoGenerica({
          tabela: 'saidas',
          entidadeId: item.id,
          evento: 'criado',
          valoresAntes: null,
          valoresDepois: item,
          ...audSaida,
          unitId: itemUnitId,
        });

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
      const { responsavel, responsavelId, colaboradorId, descricao, valor, data,
              origem, tipo, dataPagamento, viagens, caixinha, turno, observacao } = body;

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

        // Resolve responsável usando helper de integridade
        const respPut = await resolverResponsavel(responsavel || responsavelId, '');
        const responsavelNome      = respPut.responsavelNome;
        const responsavelIdResolved = responsavelId || respPut.responsavelId;

        // Verificar se o colaborador existe (integridade referencial)
        const colaborador = await validarColaborador(colaboradorId);
        if (!colaborador) {
          return response(400, { error: 'Colaborador não encontrado' });
        }

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
          tipo: tipo || origem || original.tipo || original.origem || 'A pagar',
          origem: tipo || origem || original.origem || 'A pagar',
          referencia: tipo || origem || original.referencia || 'A pagar',
          dataPagamento: dataPagamento || original.dataPagamento || '',
          observacao: observacao !== undefined ? observacao : (original.observacao || ''),
          viagens: viagens !== undefined ? parseInt(viagens) || 0 : (original.viagens || 0),
          caixinha: caixinha !== undefined ? parseFloat(caixinha) || 0 : (original.caixinha || 0),
          updatedAt: new Date().toISOString()
        };

        await dynamodb.put({
          TableName: 'gres-prod-saidas',
          Item: item
        }).promise();

        // Auditoria: log de alteração
        const audPut = extrairAuditoria(body, event);
        await logAlteracaoGenerica({
          tabela: 'saidas',
          entidadeId: saidaId,
          evento: 'alterado',
          valoresAntes: original,
          valoresDepois: item,
          ...audPut,
          unitId: item.unitId,
        });

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
        // Buscar item antes de deletar (para log)
        const orig = await dynamodb.get({
          TableName: 'gres-prod-saidas',
          Key: { id: saidaId }
        }).promise();

        await dynamodb.delete({
          TableName: 'gres-prod-saidas',
          Key: { id: saidaId }
        }).promise();

        // Auditoria: log de delete
        const audDel = extrairAuditoria(body || {}, event);
        await logAlteracaoGenerica({
          tabela: 'saidas',
          entidadeId: saidaId,
          evento: 'deletado',
          valoresAntes: orig.Item || null,
          valoresDepois: null,
          ...audDel,
          unitId: orig.Item?.unitId,
        });

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

    // PUT CAIXA — atualiza sem perder campos de relacionamento
    if ((rawPath.includes('/caixa/') || rawPath === '/caixa') && httpMethod === 'PUT') {
      const caixaRecordId = rawPath.split('/').pop();
      const { abertura, maq1, maq2, maq3, maq4, maq5, maq6, ifood, dinheiro, pix,
              fiado, sangria, total, sistemaPdv, diferenca, referencia,
              periodo, responsavel, responsavelId, responsavelNome, hora } = body;

      if (!caixaRecordId) {
        return response(400, { error: 'ID do movimento é obrigatório' });
      }

      try {
        // Resolve responsável usando helper de integridade
        const respData = await resolverResponsavel(responsavel || responsavelId, responsavelNome);
        const respNome = responsavelNome || respData.responsavelNome;
        const respId   = responsavelId   || respData.responsavelId;

        // Server-side recalculation — never trust client-provided totals
        const _ab  = parseFloat(abertura)  || 0;
        const _m1  = parseFloat(maq1)      || 0;
        const _m2  = parseFloat(maq2)      || 0;
        const _m3  = parseFloat(maq3)      || 0;
        const _m4  = parseFloat(maq4)      || 0;
        const _m5  = parseFloat(maq5)      || 0;
        const _m6  = parseFloat(maq6)      || 0;
        const _if  = parseFloat(ifood)     || 0;
        const _din = parseFloat(dinheiro)  || 0;
        const _pix = parseFloat(pix)       || 0;
        const _fia = parseFloat(fiado)     || 0;
        const pdv  = parseFloat(sistemaPdv) || 0;
        // total = soma das entradas (sangria NÃO entra no total)
        const computedTotal    = _ab + _m1 + _m2 + _m3 + _m4 + _m5 + _m6 + _if + _din + _pix + _fia;
        const computedDiferenca = pdv - computedTotal;
        const updateExpression =
          'SET abertura = :abertura, maq1 = :maq1, maq2 = :maq2, maq3 = :maq3, ' +
          'maq4 = :maq4, maq5 = :maq5, maq6 = :maq6, ifood = :ifood, ' +
          'dinheiro = :dinheiro, #pix = :pix, fiado = :fiado, sangria = :sangria, ' +
          '#total = :total, sistemaPdv = :sistemaPdv, sistema = :sistemaPdv, ' +
          'diferenca = :diferenca, referencia = :referencia, ' +
          '#periodo = :periodo, responsavel = :responsavel, ' +
          'responsavelId = :responsavelId, responsavelNome = :responsavelNome, ' +
          '#hora = :hora, updatedAt = :ts';

        await dynamodb.update({
          TableName: 'gres-prod-caixa',
          Key: { id: caixaRecordId },
          UpdateExpression: updateExpression,
          ExpressionAttributeNames: { '#pix': 'pix', '#total': 'total', '#periodo': 'periodo', '#hora': 'hora' },
          ExpressionAttributeValues: {
            ':abertura':       _ab,
            ':maq1':           _m1,
            ':maq2':           _m2,
            ':maq3':           _m3,
            ':maq4':           _m4,
            ':maq5':           _m5,
            ':maq6':           _m6,
            ':ifood':          _if,
            ':dinheiro':       _din,
            ':pix':            _pix,
            ':fiado':          _fia,
            ':sangria':        parseFloat(sangria)   || 0,
            ':total':          computedTotal,
            ':sistemaPdv':     pdv,
            ':diferenca':      computedDiferenca,
            ':referencia':     referencia || '',
            ':periodo':        periodo || 'Dia',
            ':responsavel':    responsavel || '',
            ':responsavelId':  respId,
            ':responsavelNome': respNome,
            ':hora':           hora || new Date().toTimeString().split(' ')[0],
            ':ts':             new Date().toISOString()
          }
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
      const { nome, perfil, unitId, unitIds, ativo, cpf, celular } = body;

      if (!usuarioId || !nome) {
        return response(400, { error: 'ID do usuário e nome são obrigatórios' });
      }

      try {
        const unitIdClean = unitId ? resolveUnitId(unitId) : undefined;
        const unitIdsClean = unitIds ? unitIds.map(resolveUnitId) : undefined;

        let updateExpr = 'SET #nome = :nome, perfil = :perfil, ativo = :ativo, updatedAt = :ts';
        const exprNames = { '#nome': 'nome' };
        const exprVals = {
          ':nome':   nome,
          ':perfil': perfil || 'operador',
          ':ativo':  ativo !== false,
          ':ts':     new Date().toISOString()
        };
        if (unitIdClean !== undefined) {
          updateExpr += ', unitId = :uid';
          exprVals[':uid'] = unitIdClean;
        }
        if (unitIdsClean !== undefined) {
          updateExpr += ', unitIds = :uids';
          exprVals[':uids'] = unitIdsClean;
        }
        if (cpf !== undefined) { updateExpr += ', cpf = :cpf'; exprVals[':cpf'] = cpf; }
        if (celular !== undefined) { updateExpr += ', celular = :cel'; exprVals[':cel'] = celular; }

        await dynamodb.update({
          TableName: 'gres-prod-usuarios',
          Key: { id: usuarioId },
          UpdateExpression: updateExpr,
          ExpressionAttributeNames: exprNames,
          ExpressionAttributeValues: exprVals
        }).promise();

        return response(200, { success: true, message: 'Usuário atualizado' });
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao atualizar usuário' });
      }
    }

    // ─── POST /freelancers ──────────────────────────────────────────────
    if ((rawPath === '/freelancers' || rawPath.includes('/freelancers')) && httpMethod === 'POST' && !rawPath.match(/\/freelancers\/.+/)) {
      const { nome, chavePix, telefone, cargo, funcao, area, valorDobra, ativo, unitId: uid } = body;
      if (!nome) return response(400, { error: 'Nome é obrigatório' });
      try {
        const id = `freel-${Date.now()}`;
        await dynamodb.put({
          TableName: 'gres-prod-freelancers',
          Item: {
            id, nome,
            chavePix: chavePix || '', telefone: telefone || '',
            cargo: cargo || '', funcao: funcao || cargo || '',
            area: area || '',
            valorDobra: parseFloat(valorDobra) || 120,
            ativo: ativo !== false, unitId: uid || '',
            createdAt: new Date().toISOString(),
          }
        }).promise();
        return response(201, { id, nome });
      } catch (err) {
        console.error('freelancers POST error:', err);
        return response(500, { error: 'Erro ao salvar freelancer: ' + err.message });
      }
    }

    // ─── GET /freelancers ───────────────────────────────────────────────
    if ((rawPath === '/freelancers' || rawPath.includes('/freelancers')) && httpMethod === 'GET' && !rawPath.match(/\/freelancers\/.+/)) {
      const uid = queryParams.unitId;
      try {
        let items = [];
        if (uid) {
          const r = await dynamodb.scan({
            TableName: 'gres-prod-freelancers',
            FilterExpression: 'unitId = :uid',
            ExpressionAttributeValues: { ':uid': uid }
          }).promise();
          items = r.Items || [];
        } else {
          const r = await dynamodb.scan({ TableName: 'gres-prod-freelancers' }).promise();
          items = r.Items || [];
        }
        return response(200, items);
      } catch (err) {
        console.error('freelancers GET error:', err);
        return response(500, { error: 'Erro ao buscar freelancers: ' + err.message });
      }
    }

    // ─── PUT /freelancers/:id ───────────────────────────────────────────
    if (rawPath.match(/\/freelancers\/.+/) && httpMethod === 'PUT') {
      const freId = rawPath.split('/').pop();
      const { nome, chavePix, telefone, cargo, funcao, area, valorDobra, ativo } = body;
      try {
        await dynamodb.update({
          TableName: 'gres-prod-freelancers',
          Key: { id: freId },
          UpdateExpression: 'SET #nome = :nome, chavePix = :pix, telefone = :tel, cargo = :cargo, funcao = :funcao, area = :area, valorDobra = :vd, ativo = :at, updatedAt = :ts',
          ExpressionAttributeNames: { '#nome': 'nome' },
          ExpressionAttributeValues: {
            ':nome': nome, ':pix': chavePix || '', ':tel': telefone || '',
            ':cargo': cargo || '', ':funcao': funcao || cargo || '',
            ':area': area || '',
            ':vd': parseFloat(valorDobra) || 120,
            ':at': ativo !== false, ':ts': new Date().toISOString()
          }
        }).promise();
        return response(200, { success: true });
      } catch (err) {
        return response(500, { error: 'Erro ao atualizar freelancer: ' + err.message });
      }
    }

    // ─── DELETE /freelancers/:id ────────────────────────────────────────
    if (rawPath.match(/\/freelancers\/.+/) && httpMethod === 'DELETE') {
      const freId = rawPath.split('/').pop();
      try {
        await dynamodb.delete({ TableName: 'gres-prod-freelancers', Key: { id: freId } }).promise();
        return response(200, { success: true });
      } catch (err) {
        return response(500, { error: 'Erro ao excluir freelancer: ' + err.message });
      }
    }

    // ─── GET /perfis-permissoes — carrega config salva ou retorna default ───
    if (rawPath === '/perfis-permissoes' && httpMethod === 'GET') {
      try {
        const result = await dynamodb.get({
          TableName: 'gres-prod-usuarios',
          Key: { id: 'config-perfis-permissoes' }
        }).promise();
        if (result.Item && result.Item.permissoes) {
          return response(200, { permissoes: result.Item.permissoes, updatedAt: result.Item.updatedAt });
        }
        // Retorna default vazio — frontend usa seus próprios defaults
        return response(200, { permissoes: null, updatedAt: null });
      } catch (err) {
        return response(500, { error: 'Erro ao carregar permissões: ' + err.message });
      }
    }

    // ─── PUT /perfis-permissoes — salva config de permissões por perfil ───
    if (rawPath === '/perfis-permissoes' && httpMethod === 'PUT') {
      const { permissoes } = body;
      if (!permissoes || typeof permissoes !== 'object') {
        return response(400, { error: 'Campo permissoes é obrigatório e deve ser um objeto' });
      }
      try {
        await dynamodb.put({
          TableName: 'gres-prod-usuarios',
          Item: {
            id: 'config-perfis-permissoes',
            permissoes,
            updatedAt: new Date().toISOString()
          }
        }).promise();
        return response(200, { success: true, updatedAt: new Date().toISOString() });
      } catch (err) {
        return response(500, { error: 'Erro ao salvar permissões: ' + err.message });
      }
    }

    // Rota não encontrada
    return response(404, { error: `Rota não encontrada: ${rawPath}` });

  } catch (error) {
    console.error('Erro geral:', error);
    return response(500, { error: 'Erro interno do servidor' });
  }
};
