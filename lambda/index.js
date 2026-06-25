// Import only specific services to avoid loading all AWS SDK clients
const DynamoDB = require('aws-sdk/clients/dynamodb');
const CognitoIdentityServiceProvider = require('aws-sdk/clients/cognitoidentityserviceprovider');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// JWT secret — em produção deveria ser env var
const JWT_SECRET = process.env.JWT_SECRET || 'gires-jwt-secret-2026-prod';
const JWT_EXPIRES_IN = '8h';

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
// P2.1 — Structured Error Response Helpers
// ─────────────────────────────────────────────────────────
const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  AUTH_ERROR: 'AUTH_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
  FORBIDDEN: 'FORBIDDEN'
};

/** Structured success response (for create/update/delete) */
const successResponse = (statusCode, data, meta) => {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return response(statusCode, body);
};

/** Structured error response */
const errorResponse = (statusCode, code, message, details) => {
  const body = { success: false, code, message };
  if (details) body.details = details;
  return response(statusCode, body);
};

/** Paginated list response — returns array for backward compat, adds meta header */
const listResponse = (items, meta) => {
  if (meta && (meta.cursor || meta.hasMore)) {
    return response(200, { success: true, data: items, meta });
  }
  return response(200, items);
};

// ─────────────────────────────────────────────────────────
// P2.4 — Pagination Helper
// ─────────────────────────────────────────────────────────
const parsePagination = (queryParams) => {
  const limit = queryParams.limit ? Math.min(Math.max(parseInt(queryParams.limit, 10) || 200, 1), 1000) : null;
  let cursor = null;
  if (queryParams.cursor) {
    try { cursor = JSON.parse(Buffer.from(queryParams.cursor, 'base64').toString('utf8')); } catch(e) {}
  }
  return { limit, cursor };
};

const encodeCursor = (lastKey) => {
  if (!lastKey) return null;
  return Buffer.from(JSON.stringify(lastKey)).toString('base64');
};

/** Query GSI with optional pagination */
const queryGSI = async (tableName, indexName, keyExpr, exprVals, filterExpr, limit, cursor) => {
  const params = {
    TableName: tableName,
    IndexName: indexName,
    KeyConditionExpression: keyExpr,
    ExpressionAttributeValues: exprVals,
    ScanIndexForward: false
  };
  if (filterExpr) params.FilterExpression = filterExpr;
  if (limit) params.Limit = limit;
  if (cursor) params.ExclusiveStartKey = cursor;
  
  const result = await dynamodb.query(params).promise();
  return {
    items: result.Items || [],
    lastKey: result.LastEvaluatedKey || null,
    count: result.Count || 0
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
 * Resolve o valor correto de um turno para um colaborador com base no acordo.
 * Suporta: valor fixo (valorDia/valorNoite) e tabela variável por dia da semana.
 * @param {object} colaborador - Item do DynamoDB (gres-prod-colaboradores)
 * @param {string} dataISO - Data no formato YYYY-MM-DD
 * @param {string} turno - 'Dia' ou 'Noite'
 * @returns {number} Valor correto do turno
 */
const resolverValorTurnoServidor = (colaborador, dataISO, turno) => {
  if (!colaborador || !dataISO) return 0;
  const acordo = colaborador.acordo || {};
  const tabela = acordo.tabela || null;
  const temTabela = tabela && typeof tabela === 'object' && Object.keys(tabela).length > 0;

  if (colaborador.tipoAcordo === 'valor_turno' && temTabela) {
    // Tabela variável por dia da semana
    const dias = ['dom','seg','ter','qua','qui','sex','sab'];
    const d = new Date(dataISO + 'T12:00:00');
    const diaSemana = dias[d.getDay()];
    const entrada = tabela[diaSemana];
    if (entrada) {
      const chave = turno === 'Noite' ? 'N' : 'D';
      const val = parseFloat(entrada[chave]) || 0;
      if (val > 0) return val;
    }
    // Fallback: valorDia/valorNoite médio
  }
  // Valor fixo
  return turno === 'Noite'
    ? (parseFloat(colaborador.valorNoite) || 0)
    : (parseFloat(colaborador.valorDia) || 0);
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

// ─────────────────────────────────────────────────────────
// JWT helpers
// ─────────────────────────────────────────────────────────

/** Gera JWT assinado com dados do usuário */
function gerarToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      perfil: user.perfil || 'operador',
      unitIds: user.unitIds || [],
      isMaster: user.email === 'admin@gres.com',
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/** Verifica token e retorna payload ou null */
function verificarToken(authHeader) {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  try {
    return jwt.verify(parts[1], JWT_SECRET);
  } catch {
    return null;
  }
}

// Rotas públicas que não exigem JWT
const ROTAS_PUBLICAS = ['/auth/login', '/health'];

// ─────────────────────────────────────────────────────────
// Bcrypt helpers
// ─────────────────────────────────────────────────────────
const BCRYPT_ROUNDS = 10;

/** Verifica se string já é hash bcrypt */
function isBcryptHash(str) {
  return typeof str === 'string' && str.startsWith('$2');
}

/**
 * Compara senha digitada com armazenada.
 * Se armazenada for texto plano, faz compare direto e regrava como hash (migração transparente).
 */
async function compararSenha(senhaDigitada, senhaArmazenada, userId) {
  if (isBcryptHash(senhaArmazenada)) {
    return bcrypt.compareSync(senhaDigitada, senhaArmazenada);
  }
  // Senha em texto plano — compare direto
  if (senhaDigitada !== senhaArmazenada) return false;
  // Auto-migrar para hash
  try {
    const hash = bcrypt.hashSync(senhaDigitada, BCRYPT_ROUNDS);
    await dynamodb.update({
      TableName: 'gres-prod-usuarios',
      Key: { id: userId },
      UpdateExpression: 'SET senha = :h',
      ExpressionAttributeValues: { ':h': hash },
    }).promise();
    console.log(`Auto-migrou senha de ${userId} para bcrypt`);
  } catch (e) {
    console.warn('Falha ao auto-migrar senha (best-effort):', e.message);
  }
  return true;
}

// Handler principal
exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    const httpMethod = event.requestContext?.http?.method || event.httpMethod || 'GET';
    const rawPath = event.rawPath || event.path || '/';
    const body = event.body ? (typeof event.body === 'string' ? JSON.parse(event.body) : event.body) : {};
    const queryParams = event.queryStringParameters || {};
    const headers = event.headers || {};

    console.log(`Method: ${httpMethod}, Path: ${rawPath}`);

    // OPTIONS para CORS
    if (httpMethod === 'OPTIONS') {
      return response(200, { ok: true });
    }

    // ── JWT Auth middleware ──────────────────────────────
    const isRotaPublica = ROTAS_PUBLICAS.some(r => rawPath === r || rawPath.includes(r));
    if (!isRotaPublica) {
      const tokenPayload = verificarToken(headers.authorization || headers.Authorization);
      if (!tokenPayload) {
        return response(401, { error: 'Token inválido ou ausente. Faça login novamente.' });
      }
      // Injeta dados do token no body pra uso interno (não sobrescreve body do POST)
      event._auth = tokenPayload;
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
        
        // Validar senha (bcrypt ou texto plano com auto-migração)
        const senhaOk = await compararSenha(password, user.senha || '', user.id);
        if (!senhaOk) {
          return response(401, { error: 'Senha incorreta' });
        }

        // Gerar JWT assinado
        const token = gerarToken(user);

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
            nome: user.nome,
            isMaster: email === 'admin@gres.com'
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

        // Hash da nova senha com bcrypt
        const hashedPassword = bcrypt.hashSync(newPassword, BCRYPT_ROUNDS);

        // Atualizar senha no DynamoDB
        await dynamodb.update({
          TableName: 'gres-prod-usuarios',
          Key: { id: user.id },
          UpdateExpression: 'SET senha = :newPassword',
          ExpressionAttributeValues: {
            ':newPassword': hashedPassword
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
          senha: senha ? bcrypt.hashSync(senha, BCRYPT_ROUNDS) : '',
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
          // Campos raiz de chegada/entrega — sincronizados com acordo{} para garantir
          // que o módulo motoboys leia os valores corretos mesmo se o frontend
          // enviou os campos raiz zerados mas o acordo tem os valores.
          valorChegadaDia:  parseFloat(valorChegadaDia) || (acordo || {}).chegadaDia || 0,
          valorChegadaNoite:parseFloat(valorChegadaNoite) || (acordo || {}).chegadaNoite || 0,
          valorEntrega:     parseFloat(valorEntrega) || (acordo || {}).valorEntrega || 0,
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
          // Campos de chegada/entrega motoboy — campos raiz são a fonte de verdade lida pelo módulo.
          // Ao salvar: sincronizar a partir do acordo{} como fallback para corrigir registros legados
          // onde buildAcordoCompatFields não propagava esses campos para o nível raiz.
          valorChegadaDia:  valorChegadaDia !== undefined
            ? (parseFloat(valorChegadaDia) || 0)
            : (original.Item.valorChegadaDia || (acordo || original.Item.acordo || {}).chegadaDia || original.Item.valorDia || 0),
          valorChegadaNoite: valorChegadaNoite !== undefined
            ? (parseFloat(valorChegadaNoite) || 0)
            : (original.Item.valorChegadaNoite || (acordo || original.Item.acordo || {}).chegadaNoite || original.Item.valorNoite || 0),
          valorEntrega: valorEntrega !== undefined
            ? (parseFloat(valorEntrega) || 0)
            : (original.Item.valorEntrega || (acordo || original.Item.acordo || {}).valorEntrega || original.Item.valorTransporte || 0),
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
          else if (diffs.salario || diffs.valorDia || diffs.valorNoite || diffs.valorEntrega || diffs.valorChegadaDia || diffs.valorChegadaNoite || diffs.valorTransporte || diffs.periculosidade || diffs.contribuicaoAssistencial || diffs.isMotoboy || diffs.tipoAcordo || diffs.acordo) evento = 'remuneracao_alterada';
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

    // DELETE COLABORADORES — soft delete (marca ativo=false em vez de apagar)
    if (rawPath.includes('/colaboradores/') && httpMethod === 'DELETE') {
      const colaboradorId = rawPath.split('/').pop();
      if (!colaboradorId) return response(400, { error: 'ID do colaborador é obrigatório' });

      try {
        // Buscar colaborador atual
        const original = await dynamodb.get({
          TableName: 'gres-prod-colaboradores',
          Key: { id: colaboradorId }
        }).promise();

        if (!original.Item) {
          return response(404, { error: 'Colaborador não encontrado' });
        }

        // Verificar dependências (registros vinculados)
        const dependencias = {};
        const [folhaRes, saidasRes, escalasRes] = await Promise.all([
          dynamodb.scan({
            TableName: 'gres-prod-folha-pagamento',
            FilterExpression: 'colaboradorId = :cid',
            ExpressionAttributeValues: { ':cid': colaboradorId },
            Select: 'COUNT',
          }).promise(),
          dynamodb.scan({
            TableName: 'gres-prod-saidas',
            FilterExpression: 'colaboradorId = :cid',
            ExpressionAttributeValues: { ':cid': colaboradorId },
            Select: 'COUNT',
          }).promise(),
          dynamodb.scan({
            TableName: 'gres-prod-escalas',
            FilterExpression: 'colaboradorId = :cid',
            ExpressionAttributeValues: { ':cid': colaboradorId },
            Select: 'COUNT',
          }).promise(),
        ]);
        if (folhaRes.Count > 0) dependencias.folhaPagamento = folhaRes.Count;
        if (saidasRes.Count > 0) dependencias.saidas = saidasRes.Count;
        if (escalasRes.Count > 0) dependencias.escalas = escalasRes.Count;

        const authData = event._auth || {};

        // Soft delete: marca ativo=false
        await dynamodb.update({
          TableName: 'gres-prod-colaboradores',
          Key: { id: colaboradorId },
          UpdateExpression: 'SET ativo = :f, desativadoEm = :ts, desativadoPor = :uid, desativadoPorNome = :un, updatedAt = :ts',
          ExpressionAttributeValues: {
            ':f': false,
            ':ts': new Date().toISOString(),
            ':uid': authData.sub || body.responsavelId || '',
            ':un': authData.email || body.responsavelNome || '',
          },
        }).promise();

        // Log de auditoria
        await logColaboradorAlteracao({
          colaboradorId,
          evento: 'desativado',
          valoresAntes: { ativo: original.Item.ativo },
          valoresDepois: { ativo: false },
          usuarioId: authData.sub || body.responsavelId || '',
          usuarioNome: authData.email || body.responsavelNome || '',
          unitId: original.Item.unitId || '',
        });

        const temDependencias = Object.keys(dependencias).length > 0;
        return response(200, {
          success: true,
          softDelete: true,
          message: temDependencias
            ? `Colaborador desativado (tem ${Object.values(dependencias).reduce((a,b)=>a+b,0)} registros vinculados — dados preservados)`
            : 'Colaborador desativado com sucesso',
          dependencias: temDependencias ? dependencias : undefined,
        });
      } catch (error) {
        console.error('DynamoDB error:', error);
        return response(500, { error: 'Erro ao desativar colaborador: ' + error.message });
      }
    }

    // GET COLABORADORES — filtra por unitId (CNPJ); exclui inativos por padrão
    if ((rawPath === '/colaboradores' || rawPath.includes('/colaboradores')) && httpMethod === 'GET') {
      try {
        const unitIdRaw = queryParams.unitId;
        const unitIdClean = unitIdRaw ? resolveUnitId(unitIdRaw) : null;
        const incluirInativos = queryParams.incluirInativos === 'true';
        let params = { TableName: 'gres-prod-colaboradores' };

        const filters = [];
        const exprValues = {};

        if (unitIdClean) {
          filters.push('unitId = :uid');
          exprValues[':uid'] = unitIdClean;
        }

        if (!incluirInativos) {
          filters.push('(ativo <> :inativo OR attribute_not_exists(ativo))');
          exprValues[':inativo'] = false;
        }

        if (filters.length > 0) {
          params.FilterExpression = filters.join(' AND ');
          params.ExpressionAttributeValues = exprValues;
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
        const motoboys = (result.Items || []).map(c => {
          // Normalizar acordo: fonte primária de valorChegadaDia/Noite e valorEntrega
          // para colaboradores salvos via módulo unificado (campo raiz pode estar zerado
          // se buildAcordoCompatFields não propagava — retrocompatibilidade).
          const ac = c.acordo || {};
          const valorChegadaDia   = c.valorChegadaDia   || ac.chegadaDia   || c.valorDia   || 0;
          const valorChegadaNoite = c.valorChegadaNoite || ac.chegadaNoite || c.valorNoite  || 0;
          const valorEntrega      = c.valorEntrega      || ac.valorEntrega  || c.valorTransporte || 0;

          return {
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
            valorChegadaDia,
            valorChegadaNoite,
            valorEntrega,
            isMotoboy: true,
            ativo: c.ativo !== false,
            tipoAcordo: c.tipoAcordo || 'motoboy',
            acordo: c.acordo || null,
          };
        });

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

    // POST ESCALAS — com check de duplicata
    if (rawPath === '/escalas' && httpMethod === 'POST') {
      const uid = body.unitId || body.unidadeId;
      const { data, colaboradorId, turno, observacao } = body;
      if (!uid || !data || !colaboradorId || !turno) {
        return response(400, { error: 'unitId, data, colaboradorId e turno são obrigatórios' });
      }
      try {
        // ID determinístico: garante idempotência natural
        const escalaId = `esc-${colaboradorId}-${data}-${turno}-${toCnpj(uid)}`;

        // Check duplicata: já existe escala ativa com mesmo colab+data+turno+unit?
        const dupCheck = await dynamodb.get({
          TableName: 'gres-prod-escalas',
          Key: { id: escalaId },
        }).promise();
        if (dupCheck.Item && !dupCheck.Item._deleted && dupCheck.Item.turno !== 'Deletado') {
          return response(409, {
            error: 'Já existe escala para este colaborador neste dia/turno/unidade',
            existingId: dupCheck.Item.id,
          });
        }

        const item = {
          id: escalaId,
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
      const { unitId, mes, data, colaboradorId } = queryParams;
      const unitCnpj = unitId ? toCnpj(unitId) : null;
      const { limit, cursor } = parsePagination(queryParams);
      try {
        let items = [];
        let lastKey = null;
        // P2.4: Use GSI query when unitId + date filter
        if (unitCnpj && (mes || data)) {
          const exprVals = { ':uid': unitCnpj };
          let keyExpr = 'unitId = :uid';
          if (data) {
            keyExpr += ' AND #dt = :d';
            exprVals[':d'] = data;
          } else if (mes) {
            keyExpr += ' AND begins_with(#dt, :m)';
            exprVals[':m'] = mes;
          }
          const filterParts = [];
          if (colaboradorId) { filterParts.push('colaboradorId = :c'); exprVals[':c'] = colaboradorId; }
          const params = {
            TableName: 'gres-prod-escalas',
            IndexName: 'unitId-data-index',
            KeyConditionExpression: keyExpr,
            ExpressionAttributeValues: exprVals,
            ExpressionAttributeNames: { '#dt': 'data' },
            ScanIndexForward: false
          };
          if (filterParts.length > 0) params.FilterExpression = filterParts.join(' AND ');
          if (limit) params.Limit = limit;
          if (cursor) params.ExclusiveStartKey = cursor;
          const result = await dynamodb.query(params).promise();
          items = result.Items || [];
          lastKey = result.LastEvaluatedKey;
        } else {
          // Fallback scan
          const filters = [];
          const exprVals = {};
          if (colaboradorId) { filters.push('colaboradorId = :c'); exprVals[':c'] = colaboradorId; }
          const scanParams = {
            TableName: 'gres-prod-escalas',
            ...(filters.length > 0 ? { FilterExpression: filters.join(' AND '), ExpressionAttributeValues: exprVals } : {})
          };
          let scanKey = cursor || undefined;
          do {
            const r = await dynamodb.scan({ ...scanParams, ...(scanKey ? { ExclusiveStartKey: scanKey } : {}), ...(limit ? { Limit: limit } : {}) }).promise();
            items = items.concat(r.Items || []);
            scanKey = r.LastEvaluatedKey;
            if (limit && items.length >= limit) { lastKey = scanKey; break; }
          } while (scanKey);
          if (unitCnpj) items = items.filter(i => toCnpj(i.unitId || '') === unitCnpj);
          if (mes) items = items.filter(i => (i.data || '').startsWith(mes));
        }
        if (limit) {
          return listResponse(items, { count: items.length, cursor: encodeCursor(lastKey), hasMore: !!lastKey });
        }
        return response(200, items);
      } catch (err) {
        console.error('escalas GET error:', err);
        return errorResponse(500, ERROR_CODES.SERVER_ERROR, 'Erro ao buscar escalas: ' + err.message);
      }
    }

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
              // Campos estruturados de auditoria Opção B (novos registros granulares)
              valorDescSaidas, valorAbatEsp, valorLiquido,
              // NOVO: campos específicos CLT
              pagoAdiantamento, dataPgtoAdiantamento, pagoVariavel, dataPgtoVariavel,
              logPagamentos,
              // Importação contábil (EMS): não sobrescrever dados operacionais
              mergeMode, valorLiquidoContabil, obsEMS } = body;
      if (!colaboradorId || !mes) return response(400, { error: 'colaboradorId e mes são obrigatórios' });
      try {
        const now = new Date().toISOString();
        const normalizedUnitId = toCnpj(unitId || '') || unitId || '';
        const dtPgto = pago ? (dataPagamento || now.split('T')[0]) : null;

        // ── P0.3: Validar colaborador existe ────────────────────────────────
        const colaborador = await validarColaborador(colaboradorId);
        if (!colaborador) {
          return response(400, { error: 'Colaborador não encontrado', colaboradorId });
        }
        if (normalizedUnitId && colaborador.unitId && toCnpj(colaborador.unitId) !== normalizedUnitId) {
          console.warn(`P0.3 unit mismatch: colab ${colaboradorId} unitId=${colaborador.unitId} vs payload=${normalizedUnitId}`);
        }

        // ── NOVO MODELO: array de dias ──────────────────────────────────────
        if (Array.isArray(dias) && dias.length > 0) {
          const saved = [];
          const isFazendoPagamento = pago !== false;
          const valorCorrecoes = [];

          // Gerar pagamentoId único para amarrar todos os turnos deste lote.
          // Se for desfazer (pago=false), não gera lote — cada turno é revertido individualmente.
          // Campo transacaoBancariaId reservado para futura conciliação bancária (MVP fase 3).
          const pagamentoId = isFazendoPagamento
            ? (body.pagamentoId || `pgto-${colaboradorId}-${now.replace(/[:.]/g, '').slice(0,17)}`)
            : null;

          for (const d of dias) {
            const { data, turno, valor, tipoCodigo } = d;
            if (!data || !turno) continue;

            // ── P0.1: Validação server-side do valor do turno ───────────────
            let valorFinal = parseFloat(valor) || 0;
            if (turno !== 'Transporte' && isFazendoPagamento) {
              const valorEsperado = resolverValorTurnoServidor(colaborador, data, turno);
              if (valorEsperado > 0 && Math.abs(valorFinal - valorEsperado) > 0.01) {
                console.warn(`P0.1 valor corrigido: colab=${colaboradorId} data=${data} turno=${turno} frontend=${valorFinal} servidor=${valorEsperado}`);
                valorCorrecoes.push({ data, turno, frontendVal: valorFinal, servidorVal: valorEsperado });
                valorFinal = valorEsperado;
              }
            }

            const dayId = `folha-${colaboradorId}-${data}-${turno}`;
            const item = {
              id: dayId,
              tipo: 'freelancer-dia',
              tipoCodigo: tipoCodigo || (turno === 'Dia' ? 'freelancer-dia' : 'freelancer-noite'),
              colaboradorId, data, turno, mes,
              semana: semana || null,
              unitId: normalizedUnitId,
              valor: valorFinal,
              pago: isFazendoPagamento,
              dataPagamento: isFazendoPagamento ? dtPgto : null,
              formaPagamento: isFazendoPagamento ? (formaPagamento || 'PIX') : null,
              pagamentoId: pagamentoId,           // amarra todos os turnos deste ato de pagamento
              transacaoBancariaId: null,           // reservado para conciliação bancária (fase 3 MVP)
              confiabilidade: 'real',              // gerado pelo sistema — não recalculado
              // Campos estruturados de auditoria Opção B — propagados do payload do lote.
              // Presença destes campos habilita temCampoEstruturado=true no Extrato,
              // evitando fallback para parsing de obs (Opção A legado).
              ...(valorBruto      !== undefined ? { valorBruto:      parseFloat(valorBruto)      || 0 } : {}),
              ...(valorDescSaidas !== undefined ? { valorDescSaidas: parseFloat(valorDescSaidas) || 0 } : {}),
              ...(valorAbatEsp    !== undefined ? { valorAbatEsp:    parseFloat(valorAbatEsp)    || 0 } : {}),
              ...(valorLiquido    !== undefined ? { valorLiquido:    parseFloat(valorLiquido)    || 0 } : {}),
              obs: obs || '',
              updatedAt: now,
            };
            // ── P0.2: Idempotência — não sobrescreve registro existente ────
            try {
              await dynamodb.put({
                TableName: 'gres-prod-folha-pagamento',
                Item: item,
                ConditionExpression: 'attribute_not_exists(id) OR pago = :false',
                ExpressionAttributeValues: { ':false': false },
              }).promise();
              saved.push(dayId);
            } catch (condErr) {
              if (condErr.code === 'ConditionalCheckFailedException') {
                console.warn(`P0.2 idempotência: ${dayId} já existe e pago=true, pulando`);
                continue;
              }
              throw condErr;
            }
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
          return response(200, {
            success: true, ids: saved, count: saved.length, pagamentoId,
            ...(valorCorrecoes.length > 0 ? { valorCorrecoes, aviso: 'Alguns valores foram corrigidos pelo servidor' } : {}),
          });
        }

        // ── LEGADO: registro semanal agrupado (CLT ou desfazer pagamento antigo) ──
        const itemId = semana ? `${colaboradorId}_${mes}_${semana}` : `${colaboradorId}_${mes}`;

        // Buscar item original para mesclar (preservar pagoAdto se só vier pagoVar e vice-versa)
        let origItemPreserve = null;
        try {
          const o = await dynamodb.get({ TableName: 'gres-prod-folha-pagamento', Key: { id: itemId } }).promise();
          origItemPreserve = o.Item || null;
        } catch {}

        // ── mergeMode='contabil': importação EMS — só gravar campos contábeis sem pisar nos operacionais ──
        if (mergeMode === 'contabil' && origItemPreserve) {
          const contabUpdate = {
            ...origItemPreserve,
            valorBruto: valorBruto !== undefined ? (parseFloat(valorBruto) || 0) : origItemPreserve.valorBruto,
            valorLiquidoContabil: valorLiquidoContabil !== undefined ? parseFloat(valorLiquidoContabil) || 0 : origItemPreserve.valorLiquidoContabil,
            salContrInss: body.salContrInss !== undefined ? parseFloat(body.salContrInss) || 0 : origItemPreserve.salContrInss,
            inssValor: body.inssValor !== undefined ? parseFloat(body.inssValor) || 0 : origItemPreserve.inssValor,
            valeTransporteContabil: body.valeTransporte !== undefined ? parseFloat(body.valeTransporte) || 0 : origItemPreserve.valeTransporteContabil,
            feriadoContabil: body.feriado !== undefined ? parseFloat(body.feriado) || 0 : origItemPreserve.feriadoContabil,
            obsEMS: obsEMS || origItemPreserve.obsEMS || '',
            // NAO sobrescrever: saldoFinal, totalFinal, pago, dataPagamento, logPagamentos, pagoAdiantamento, pagoVariavel
            updatedAt: now,
          };
          await dynamodb.put({ TableName: 'gres-prod-folha-pagamento', Item: contabUpdate }).promise();
          const audContab = extrairAuditoria(body, event);
          await logAlteracaoGenerica({
            tabela: 'folha-pagamento', entidadeId: itemId, evento: 'contabil-importado',
            valoresAntes: origItemPreserve, valoresDepois: contabUpdate, ...audContab, unitId: normalizedUnitId,
          });
          return response(200, { success: true, id: itemId, mode: 'contabil-merge' });
        }

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
          obsEMS: origItemPreserve?.obsEMS || null,
          valorLiquidoContabil: origItemPreserve?.valorLiquidoContabil || null,
          updatedAt: now,
        };
        // Deduplicar logPagamentos: por id E por (valor+data+tipo)
        // Previne duplicatas de double-click (ids diferentes mas mesmo pagamento)
        if (Array.isArray(item.logPagamentos)) {
          const seenIds = new Set();
          const seenKeys = new Set();
          item.logPagamentos = item.logPagamentos.filter(lp => {
            if (!lp) return false;
            // Dedup por id
            if (lp.id && seenIds.has(lp.id)) return false;
            if (lp.id) seenIds.add(lp.id);
            // Dedup por (valor, data, tipo) — previne multi-clique
            const key = `${lp.valor || 0}_${lp.data || ''}_${lp.tipo || ''}`;
            if (seenKeys.has(key)) return false;
            seenKeys.add(key);
            return true;
          });
        }
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

    // GET /folha-pagamento?unitId=xxx&mes=2026-03[&colaboradorId=xxx][&limit=N&cursor=xxx]
    if (rawPath === '/folha-pagamento' && httpMethod === 'GET') {
      const { unitId, mes, colaboradorId } = queryParams;
      const unitCnpj = unitId ? toCnpj(unitId) : null;
      const { limit, cursor } = parsePagination(queryParams);
      try {
        let items = [];
        let lastKey = null;
        // P2.4: Use GSI query when unitId+mes provided
        if (unitCnpj && mes) {
          const filterParts = [];
          const exprVals = { ':uid': unitCnpj, ':m': mes };
          if (colaboradorId) { filterParts.push('colaboradorId = :c'); exprVals[':c'] = colaboradorId; }
          const result = await queryGSI(
            'gres-prod-folha-pagamento', 'unitId-mes-index',
            'unitId = :uid AND mes = :m', exprVals,
            filterParts.length > 0 ? filterParts.join(' AND ') : null,
            limit, cursor
          );
          items = result.items;
          lastKey = result.lastKey;
        } else {
          // Fallback to scan
          const filters = [];
          const exprVals = {};
          if (mes) { filters.push('mes = :m'); exprVals[':m'] = mes; }
          if (colaboradorId) { filters.push('colaboradorId = :c'); exprVals[':c'] = colaboradorId; }
          const scanParams = {
            TableName: 'gres-prod-folha-pagamento',
            ...(filters.length > 0 ? { FilterExpression: filters.join(' AND '), ExpressionAttributeValues: exprVals } : {}),
          };
          let scanKey = cursor || undefined;
          do {
            const r = await dynamodb.scan({ ...scanParams, ...(scanKey ? { ExclusiveStartKey: scanKey } : {}), ...(limit ? { Limit: limit } : {}) }).promise();
            items = items.concat(r.Items || []);
            scanKey = r.LastEvaluatedKey;
            if (limit && items.length >= limit) { lastKey = scanKey; break; }
          } while (scanKey);
          if (unitCnpj) {
            items = items.filter(i => {
              const iCnpj = toCnpj(i.unitId || '');
              return !i.unitId || iCnpj === unitCnpj || i.unitId === unitId;
            });
          }
        }
        if (limit) {
          return listResponse(items, { count: items.length, cursor: encodeCursor(lastKey), hasMore: !!lastKey });
        }
        return response(200, items);
      } catch (err) {
        console.error('folha-pagamento GET error:', err);
        return errorResponse(500, ERROR_CODES.SERVER_ERROR, 'Erro ao buscar folha: ' + err.message);
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
              origem, tipo, dataPagamento, unitId, viagens, caixinha, turno, observacao, obs, formaPagamento,
              adiantamentoId, pago,
              pagamentoIdLigado, excedeAdto } = body;

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
          pago: pago !== undefined ? pago : true,
          obs: obs || observacao || '',
          ...(adiantamentoId ? { adiantamentoId } : {}),
          // Rastreabilidade de lote: amarra a saída auto-gerada ao pagamentoId do lote que a criou.
          // Permite filtrar saídas como "Desconto Transporte" e "Desconto Adiantamento Especial"
          // fora da lista geral do Extrato (elas aparecem como sub-linhas dentro do grupo expandido).
          ...(pagamentoIdLigado ? { pagamentoIdLigado } : {}),
          ...(excedeAdto !== undefined ? { excedeAdto: !!excedeAdto } : {}),
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
      const { unitId, colaboradorId, dataInicio, dataFim, tipo, mes } = queryParams;
      const unitCnpj = unitId ? toCnpj(unitId) : null;
      const { limit, cursor } = parsePagination(queryParams);
      try {
        let items = [];
        let lastKey = null;
        // P2.4: Use GSI query when unitId + date range provided
        if (unitCnpj && (dataInicio || mes)) {
          const exprVals = { ':uid': unitCnpj };
          let keyExpr = 'unitId = :uid';
          if (dataInicio && dataFim) {
            keyExpr += ' AND #dt BETWEEN :di AND :df';
            exprVals[':di'] = dataInicio;
            exprVals[':df'] = dataFim;
          } else if (dataInicio) {
            keyExpr += ' AND #dt >= :di';
            exprVals[':di'] = dataInicio;
          } else if (mes) {
            keyExpr += ' AND begins_with(#dt, :m)';
            exprVals[':m'] = mes;
          }
          const filterParts = [];
          if (colaboradorId) { filterParts.push('colaboradorId = :c'); exprVals[':c'] = colaboradorId; }
          if (tipo) { filterParts.push('tipo = :t'); exprVals[':t'] = tipo; }
          const params = {
            TableName: 'gres-prod-saidas',
            IndexName: 'unitId-data-index',
            KeyConditionExpression: keyExpr,
            ExpressionAttributeValues: exprVals,
            ExpressionAttributeNames: { '#dt': 'data' },
            ScanIndexForward: false
          };
          if (filterParts.length > 0) params.FilterExpression = filterParts.join(' AND ');
          if (limit) params.Limit = limit;
          if (cursor) params.ExclusiveStartKey = cursor;
          const result = await dynamodb.query(params).promise();
          items = result.Items || [];
          lastKey = result.LastEvaluatedKey;
        } else {
          // Fallback to scan (backward compat)
          const filters = [];
          const exprVals = {};
          const exprNames = {};
          if (colaboradorId) { filters.push('colaboradorId = :c'); exprVals[':c'] = colaboradorId; }
          if (dataInicio) { filters.push('#dt >= :di'); exprVals[':di'] = dataInicio; exprNames['#dt'] = 'data'; }
          if (dataFim) { filters.push('#dt <= :df'); exprVals[':df'] = dataFim; if (!exprNames['#dt']) exprNames['#dt'] = 'data'; }
          if (tipo) { filters.push('tipo = :t'); exprVals[':t'] = tipo; }
          if (mes) { filters.push('begins_with(mes, :m)'); exprVals[':m'] = mes; }
          const scanParams = {
            TableName: 'gres-prod-saidas',
            ...(filters.length > 0 ? { FilterExpression: filters.join(' AND '), ExpressionAttributeValues: exprVals } : {}),
            ...(Object.keys(exprNames).length > 0 ? { ExpressionAttributeNames: exprNames } : {})
          };
          let scanKey = cursor || undefined;
          do {
            const r = await dynamodb.scan({ ...scanParams, ...(scanKey ? { ExclusiveStartKey: scanKey } : {}), ...(limit ? { Limit: limit } : {}) }).promise();
            items = items.concat(r.Items || []);
            scanKey = r.LastEvaluatedKey;
            if (limit && items.length >= limit) { lastKey = scanKey; break; }
          } while (scanKey);
          if (unitCnpj) {
            items = items.filter(i => toCnpj(i.unitId || '') === unitCnpj);
          }
        }
        if (limit) {
          return listResponse(items, { count: items.length, cursor: encodeCursor(lastKey), hasMore: !!lastKey });
        }
        return response(200, items);
      } catch (err) {
        console.error('saidas GET error:', err);
        return errorResponse(500, ERROR_CODES.SERVER_ERROR, 'Erro ao buscar saídas: ' + err.message);
      }
    }

    if (rawPath.includes('/saidas/') && httpMethod === 'PUT') {
      const saidaId = rawPath.split('/').pop();
      const { responsavel, responsavelId, colaboradorId, descricao, valor, data,
              origem, tipo, dataPagamento, viagens, caixinha, turno, observacao,
              obs, adiantamentoId, pago, formaPagamento } = body;

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
          obs: obs !== undefined ? obs : (original.obs || ''),
          adiantamentoId: adiantamentoId !== undefined ? adiantamentoId : (original.adiantamentoId || undefined),
          pago: pago !== undefined ? pago : (original.pago !== undefined ? original.pago : true),
          formaPagamento: formaPagamento !== undefined ? formaPagamento : (original.formaPagamento || 'PIX'),
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
    // Se ?unitId=xxx → busca override config-perfis-permissoes-{unitId}, senão busca global
    if (rawPath === '/perfis-permissoes' && httpMethod === 'GET') {
      try {
        const unitIdParam = queryParams.unitId;
        const docId = unitIdParam
          ? `config-perfis-permissoes-${toCnpj(unitIdParam)}`
          : 'config-perfis-permissoes';
        const result = await dynamodb.get({
          TableName: 'gres-prod-usuarios',
          Key: { id: docId }
        }).promise();
        if (result.Item && result.Item.permissoes) {
          return response(200, {
            permissoes: result.Item.permissoes,
            updatedAt: result.Item.updatedAt,
            unitId: result.Item.unitId || null,
            isOverride: !!result.Item.unitId
          });
        }
        // Retorna default vazio — frontend usa seus próprios defaults
        return response(200, { permissoes: null, updatedAt: null, unitId: null, isOverride: false });
      } catch (err) {
        return response(500, { error: 'Erro ao carregar permissões: ' + err.message });
      }
    }

    // ─── PUT /perfis-permissoes — salva config de permissões por perfil ───
    // Se body.unitId → salva como override config-perfis-permissoes-{unitId}, senão salva global
    if (rawPath === '/perfis-permissoes' && httpMethod === 'PUT') {
      const { permissoes, unitId: bodyUnitId } = body;
      if (!permissoes || typeof permissoes !== 'object') {
        return response(400, { error: 'Campo permissoes é obrigatório e deve ser um objeto' });
      }
      try {
        const now = new Date().toISOString();
        if (bodyUnitId) {
          const cnpj = toCnpj(bodyUnitId);
          await dynamodb.put({
            TableName: 'gres-prod-usuarios',
            Item: {
              id: `config-perfis-permissoes-${cnpj}`,
              unitId: cnpj,
              permissoes,
              updatedAt: now
            }
          }).promise();
        } else {
          await dynamodb.put({
            TableName: 'gres-prod-usuarios',
            Item: {
              id: 'config-perfis-permissoes',
              permissoes,
              updatedAt: now
            }
          }).promise();
        }
        return response(200, { success: true, updatedAt: now });
      } catch (err) {
        return response(500, { error: 'Erro ao salvar permissões: ' + err.message });
      }
    }

    // ─── DELETE /perfis-permissoes?unitId=xxx — remove override da unidade ───
    if (rawPath === '/perfis-permissoes' && httpMethod === 'DELETE') {
      const unitIdParam = queryParams.unitId;
      if (!unitIdParam) {
        return response(400, { error: 'unitId é obrigatório para deletar override' });
      }
      try {
        const cnpj = toCnpj(unitIdParam);
        await dynamodb.delete({
          TableName: 'gres-prod-usuarios',
          Key: { id: `config-perfis-permissoes-${cnpj}` }
        }).promise();
        return response(200, { success: true, message: 'Override removido, usando padrão global' });
      } catch (err) {
        return response(500, { error: 'Erro ao remover override: ' + err.message });
      }
    }

// ─── GET /vagas-publicas — busca vaga pelo ID (sem auth) ───
    // Suporta: /vagas-publicas?vagaId=xxx (link por vaga) OU /vagas-publicas?unitId=xxx (link por unidade legado)
    if (rawPath === '/vagas-publicas' && httpMethod === 'GET') {
      const { unitId, vagaId } = queryParams;
      try {
        // Modo 1: link por vaga individual
        if (vagaId) {
          const vagaRes = await dynamodb.get({
            TableName: 'gres-prod-vagas',
            Key: { id: vagaId }
          }).promise();
          const vaga = vagaRes.Item;
          if (!vaga || vaga.status !== 'aberta') {
            return response(200, { vaga: null, nomeUnidade: '', encerrada: true });
          }
          let nomeUnidade = '';
          try {
            const unidadeRes = await dynamodb.get({ TableName: 'gres-prod-unidades', Key: { id: vaga.unitId } }).promise();
            nomeUnidade = unidadeRes.Item?.nome || '';
          } catch (_) {}
          // Buscar todas as vagas abertas da unidade para o multiselect
          const vagasRes = await dynamodb.scan({
            TableName: 'gres-prod-vagas',
            FilterExpression: 'unitId = :uid AND #s = :status',
            ExpressionAttributeNames: { '#s': 'status' },
            ExpressionAttributeValues: { ':uid': vaga.unitId, ':status': 'aberta' }
          }).promise();
          return response(200, { vaga, vagas: vagasRes.Items || [], nomeUnidade, encerrada: false });
        }
        // Modo 2: link por unitId (legado)
        if (unitId) {
          let nomeUnidade = '';
          try {
            const unidadeRes = await dynamodb.get({ TableName: 'gres-prod-unidades', Key: { id: unitId } }).promise();
            nomeUnidade = unidadeRes.Item?.nome || '';
          } catch (_) {}
          const result = await dynamodb.scan({
            TableName: 'gres-prod-vagas',
            FilterExpression: 'unitId = :uid AND #s = :status',
            ExpressionAttributeNames: { '#s': 'status' },
            ExpressionAttributeValues: { ':uid': unitId, ':status': 'aberta' }
          }).promise();
          return response(200, { vagas: result.Items || [], nomeUnidade, encerrada: false });
        }
        return response(400, { error: 'vagaId ou unitId obrigatório' });
      } catch (err) {
        return response(500, { error: 'Erro ao buscar vagas: ' + err.message });
      }
    }

    // ─── POST /candidatos-publico — submissão do formulário público (sem auth) ───
    if (rawPath === '/candidatos-publico' && httpMethod === 'POST') {
      const { unitId, nome, email: emailCandidato, celular } = body;
      if (!unitId || !nome || !emailCandidato || !celular) {
        return response(400, { error: 'unitId, nome, email e celular são obrigatórios' });
      }
      try {
        const { v4: uuidv4 } = require('uuid');
        const id = uuidv4();
        const now = new Date().toISOString();
        const item = {
          id,
          unitId,
          status: 'novo',
          nome: body.nome || '',
          email: body.email || '',
          celular: body.celular || '',
          cidadeBairro: body.cidadeBairro || '',
          vagasInteresse: body.vagasInteresse || [],
          tipoContratacao: body.tipoContratacao || '',
          pretensaoGanho: body.pretensaoGanho || '',
          tempoExperiencia: body.tempoExperiencia || '',
          transporteProprio: body.transporteProprio || '',
          gastoTransporte: body.gastoTransporte || 0,
          referencia: body.referencia || '',
          idade: body.idade || 0,
          quandoComeca: body.quandoComeca || '',
          trabalhouBuffet: body.trabalhouBuffet || '',
          segmentosExperiencia: body.segmentosExperiencia || [],
          turnoPref: body.turnoPref || '',
          diasDisponiveis: body.diasDisponiveis || [],
          trabalhaFds: body.trabalhaFds || '',
          fazDobras: body.fazDobras || '',
          lidarPressao: body.lidarPressao || '',
          resumoExperiencia: body.resumoExperiencia || '',
          curriculo: body.curriculo || '',
          notas: '',
          createdAt: now,
          updatedAt: now
        };
        await dynamodb.put({ TableName: 'gres-prod-candidatos', Item: item }).promise();
        return response(200, { success: true, id });
      } catch (err) {
        return response(500, { error: 'Erro ao salvar candidatura: ' + err.message });
      }
    }

    // ─── GET /vagas — lista vagas da unidade (protegido) ───
    if (rawPath === '/vagas' && httpMethod === 'GET') {
      const { unitId } = queryParams;
      if (!unitId) return response(400, { error: 'unitId obrigatório' });
      try {
        const result = await dynamodb.scan({
          TableName: 'gres-prod-vagas',
          FilterExpression: 'unitId = :uid',
          ExpressionAttributeValues: { ':uid': unitId }
        }).promise();
        // Contar candidatos por vaga
        const vagas = result.Items || [];
        const candidResult = await dynamodb.scan({
          TableName: 'gres-prod-candidatos',
          FilterExpression: 'unitId = :uid',
          ExpressionAttributeValues: { ':uid': unitId }
        }).promise();
        const candidatos = candidResult.Items || [];
        const vagasComCount = vagas.map(v => ({
          ...v,
          totalCandidatos: candidatos.filter(c => 
            c.vagasInteresse && c.vagasInteresse.includes(v.titulo)
          ).length
        }));
        vagasComCount.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        return response(200, { vagas: vagasComCount });
      } catch (err) {
        return response(500, { error: 'Erro ao listar vagas: ' + err.message });
      }
    }

    // ─── POST /vagas — criar vaga (protegido) ───
    if (rawPath === '/vagas' && httpMethod === 'POST') {
      const { unitId, titulo, tipo, descricao } = body;
      if (!unitId || !titulo) return response(400, { error: 'unitId e titulo são obrigatórios' });
      try {
        const { v4: uuidv4 } = require('uuid');
        const id = uuidv4();
        const now = new Date().toISOString();
        const item = {
          id, unitId, titulo,
          tipo: tipo || 'Ambos',
          descricao: body.descricao || '',
          nomeRestaurante: body.nomeRestaurante || '',
          endereco: body.endereco || '',
          horarios: body.horarios || '',
          beneficios: body.beneficios || '',
          proximoPasso: body.proximoPasso || '',
          status: 'aberta', createdAt: now, updatedAt: now
        };
        await dynamodb.put({ TableName: 'gres-prod-vagas', Item: item }).promise();
        return response(200, { success: true, id, item });
      } catch (err) {
        return response(500, { error: 'Erro ao criar vaga: ' + err.message });
      }
    }

    // ─── PUT /vagas/:id — atualizar vaga (protegido) ───
    if (rawPath.match(/\/vagas\/.+/) && httpMethod === 'PUT') {
      const id = rawPath.split('/vagas/')[1];
      try {
        const now = new Date().toISOString();
        const updates = { ...body, updatedAt: now };
        delete updates.id;
        const exprs = Object.keys(updates).map((k, i) => `#k${i} = :v${i}`);
        const names = {};
        const vals = {};
        Object.keys(updates).forEach((k, i) => { names[`#k${i}`] = k; vals[`:v${i}`] = updates[k]; });
        await dynamodb.update({
          TableName: 'gres-prod-vagas',
          Key: { id },
          UpdateExpression: 'SET ' + exprs.join(', '),
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: vals
        }).promise();
        return response(200, { success: true });
      } catch (err) {
        return response(500, { error: 'Erro ao atualizar vaga: ' + err.message });
      }
    }

    // ─── DELETE /vagas/:id — fechar vaga (soft delete, protegido) ───
    if (rawPath.match(/\/vagas\/.+/) && httpMethod === 'DELETE') {
      const id = rawPath.split('/vagas/')[1];
      try {
        await dynamodb.update({
          TableName: 'gres-prod-vagas',
          Key: { id },
          UpdateExpression: 'SET #s = :s, updatedAt = :u',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: { ':s': 'fechada', ':u': new Date().toISOString() }
        }).promise();
        return response(200, { success: true });
      } catch (err) {
        return response(500, { error: 'Erro ao fechar vaga: ' + err.message });
      }
    }

    // ─── GET /candidatos — lista candidatos da unidade (protegido) ───
    if (rawPath === '/candidatos' && httpMethod === 'GET') {
      const { unitId, status: statusFiltro, vagaTitulo } = queryParams;
      if (!unitId) return response(400, { error: 'unitId obrigatório' });
      try {
        let filterExpr = 'unitId = :uid';
        const exprVals = { ':uid': unitId };
        if (statusFiltro) { filterExpr += ' AND #s = :sf'; exprVals[':sf'] = statusFiltro; }
        const params = {
          TableName: 'gres-prod-candidatos',
          FilterExpression: filterExpr,
          ExpressionAttributeValues: exprVals
        };
        if (statusFiltro) params.ExpressionAttributeNames = { '#s': 'status' };
        const result = await dynamodb.scan(params).promise();
        let items = result.Items || [];
        if (vagaTitulo) {
          items = items.filter(c => c.vagasInteresse && c.vagasInteresse.includes(vagaTitulo));
        }
        items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        return response(200, { candidatos: items });
      } catch (err) {
        return response(500, { error: 'Erro ao listar candidatos: ' + err.message });
      }
    }

    // ─── PUT /candidatos/:id — atualizar status/notas do candidato (protegido) ───
    if (rawPath.match(/\/candidatos\/.+/) && httpMethod === 'PUT') {
      const id = rawPath.split('/candidatos/')[1];
      try {
        const now = new Date().toISOString();
        const updates = { ...body, updatedAt: now };
        delete updates.id;
        const exprs = Object.keys(updates).map((k, i) => `#k${i} = :v${i}`);
        const names = {};
        const vals = {};
        Object.keys(updates).forEach((k, i) => { names[`#k${i}`] = k; vals[`:v${i}`] = updates[k]; });
        await dynamodb.update({
          TableName: 'gres-prod-candidatos',
          Key: { id },
          UpdateExpression: 'SET ' + exprs.join(', '),
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: vals
        }).promise();
        return response(200, { success: true });
      } catch (err) {
        return response(500, { error: 'Erro ao atualizar candidato: ' + err.message });
      }
    }

    // ─── DELETE /candidatos/:id — arquivar candidato (protegido) ───
    if (rawPath.match(/\/candidatos\/.+/) && httpMethod === 'DELETE') {
      const id = rawPath.split('/candidatos/')[1];
      try {
        await dynamodb.update({
          TableName: 'gres-prod-candidatos',
          Key: { id },
          UpdateExpression: 'SET #s = :s, updatedAt = :u',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: { ':s': 'arquivado', ':u': new Date().toISOString() }
        }).promise();
        return response(200, { success: true });
      } catch (err) {
        return response(500, { error: 'Erro ao arquivar candidato: ' + err.message });
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // FORNECEDORES
    // ═══════════════════════════════════════════════════════════════

    // ─── GET /fornecedores — lista fornecedores da unidade ───────────
    if (rawPath === '/fornecedores' && httpMethod === 'GET') {
      const { unitId } = queryParams;
      if (!unitId) return response(400, { error: 'unitId obrigatório' });
      try {
        const result = await dynamodb.scan({
          TableName: 'gres-prod-fornecedores',
          FilterExpression: 'unitId = :uid',
          ExpressionAttributeValues: { ':uid': unitId }
        }).promise();
        const items = (result.Items || []).sort((a, b) =>
          (a.razaoSocial || '').localeCompare(b.razaoSocial || '', 'pt-BR'));
        return response(200, items);
      } catch (err) {
        return response(500, { error: 'Erro ao listar fornecedores: ' + err.message });
      }
    }

    // ─── POST /fornecedores — criar fornecedor ───────────────────────
    if (rawPath === '/fornecedores' && httpMethod === 'POST') {
      try {
        const now = new Date().toISOString();
        const item = {
          id: `fornecedor-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
          ...body,
          ativo: body.ativo !== false,
          createdAt: now,
          updatedAt: now
        };
        await dynamodb.put({ TableName: 'gres-prod-fornecedores', Item: item }).promise();
        return response(201, item);
      } catch (err) {
        return response(500, { error: 'Erro ao criar fornecedor: ' + err.message });
      }
    }

    // ─── PUT /fornecedores/:id — atualizar fornecedor ─────────────────
    if (rawPath.match(/\/fornecedores\/.+/) && httpMethod === 'PUT') {
      const id = rawPath.split('/fornecedores/')[1];
      try {
        const now = new Date().toISOString();
        const updates = { ...body, updatedAt: now };
        delete updates.id;
        const exprs = Object.keys(updates).map((k, i) => `#k${i} = :v${i}`);
        const names = {};
        const vals  = {};
        Object.keys(updates).forEach((k, i) => { names[`#k${i}`] = k; vals[`:v${i}`] = updates[k]; });
        await dynamodb.update({
          TableName: 'gres-prod-fornecedores',
          Key: { id },
          UpdateExpression: 'SET ' + exprs.join(', '),
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: vals
        }).promise();
        return response(200, { success: true, id });
      } catch (err) {
        return response(500, { error: 'Erro ao atualizar fornecedor: ' + err.message });
      }
    }

    // ─── DELETE /fornecedores/:id — excluir fornecedor ────────────────
    if (rawPath.match(/\/fornecedores\/.+/) && httpMethod === 'DELETE') {
      const id = rawPath.split('/fornecedores/')[1];
      try {
        await dynamodb.delete({ TableName: 'gres-prod-fornecedores', Key: { id } }).promise();
        return response(200, { success: true });
      } catch (err) {
        return response(500, { error: 'Erro ao excluir fornecedor: ' + err.message });
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // DESPESAS
    // ═══════════════════════════════════════════════════════════════

    // ─── GET /despesas — lista despesas da unidade ───────────────────
    if (rawPath === '/despesas' && httpMethod === 'GET') {
      const { unitId, status: statusFiltro, categoria, dataInicio, dataFim } = queryParams;
      if (!unitId) return response(400, { error: 'unitId obrigatório' });
      try {
        const result = await dynamodb.scan({
          TableName: 'gres-prod-despesas',
          FilterExpression: 'unitId = :uid',
          ExpressionAttributeValues: { ':uid': unitId }
        }).promise();
        let items = result.Items || [];
        // Filtros opcionais
        if (statusFiltro) items = items.filter(d => d.status === statusFiltro);
        if (categoria)    items = items.filter(d => d.categoria === categoria);
        if (dataInicio)   items = items.filter(d => (d.dataVencimento || '') >= dataInicio);
        if (dataFim)      items = items.filter(d => (d.dataVencimento || '') <= dataFim);
        items.sort((a, b) => (b.dataVencimento || '').localeCompare(a.dataVencimento || ''));
        return response(200, items);
      } catch (err) {
        return response(500, { error: 'Erro ao listar despesas: ' + err.message });
      }
    }

    // ─── POST /despesas — criar despesa ──────────────────────────────
    if (rawPath === '/despesas' && httpMethod === 'POST') {
      try {
        const now = new Date().toISOString();
        const item = {
          id: `despesa-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
          ...body,
          status: body.status || 'pendente',
          createdAt: body.createdAt || now,
          updatedAt: now
        };
        await dynamodb.put({ TableName: 'gres-prod-despesas', Item: item }).promise();
        return response(201, item);
      } catch (err) {
        return response(500, { error: 'Erro ao criar despesa: ' + err.message });
      }
    }

    // ─── PUT /despesas/:id — atualizar despesa ────────────────────────
    if (rawPath.match(/\/despesas\/.+/) && httpMethod === 'PUT') {
      const id = rawPath.split('/despesas/')[1];
      try {
        const now = new Date().toISOString();
        const updates = { ...body, updatedAt: now };
        delete updates.id;
        const exprs = Object.keys(updates).map((k, i) => `#k${i} = :v${i}`);
        const names = {};
        const vals  = {};
        Object.keys(updates).forEach((k, i) => { names[`#k${i}`] = k; vals[`:v${i}`] = updates[k]; });
        await dynamodb.update({
          TableName: 'gres-prod-despesas',
          Key: { id },
          UpdateExpression: 'SET ' + exprs.join(', '),
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: vals
        }).promise();
        return response(200, { success: true, id });
      } catch (err) {
        return response(500, { error: 'Erro ao atualizar despesa: ' + err.message });
      }
    }

    // ─── DELETE /despesas/:id — excluir despesa ───────────────────────
    if (rawPath.match(/\/despesas\/.+/) && httpMethod === 'DELETE') {
      const id = rawPath.split('/despesas/')[1];
      try {
        await dynamodb.delete({ TableName: 'gres-prod-despesas', Key: { id } }).promise();
        return response(200, { success: true });
      } catch (err) {
        return response(500, { error: 'Erro ao excluir despesa: ' + err.message });
      }
    }


    // ═══════════════════════════════════════════════════════════
    // P2.2 — REMUNERAÇÕES (Pay Rate History)
    // ═══════════════════════════════════════════════════════════

    // GET /remuneracoes?colaboradorId=xxx — histórico de remunerações
    if (rawPath === '/remuneracoes' && httpMethod === 'GET') {
      const { colaboradorId } = queryParams;
      if (!colaboradorId) return errorResponse(400, ERROR_CODES.VALIDATION_ERROR, 'colaboradorId é obrigatório');
      try {
        const result = await dynamodb.query({
          TableName: 'gres-prod-remuneracoes',
          IndexName: 'colaborador-vigencia-index',
          KeyConditionExpression: 'colaboradorId = :cid',
          ExpressionAttributeValues: { ':cid': colaboradorId },
          ScanIndexForward: false
        }).promise();
        return response(200, result.Items || []);
      } catch (err) {
        return errorResponse(500, ERROR_CODES.SERVER_ERROR, 'Erro ao buscar remunerações: ' + err.message);
      }
    }

    // GET /remuneracoes/vigente?colaboradorId=xxx&data=YYYY-MM-DD — remuneração vigente
    if ((rawPath === '/remuneracoes/vigente' || rawPath.includes('/remuneracoes/vigente')) && httpMethod === 'GET') {
      const { colaboradorId, data } = queryParams;
      if (!colaboradorId) return errorResponse(400, ERROR_CODES.VALIDATION_ERROR, 'colaboradorId é obrigatório');
      const refDate = data || new Date().toISOString().slice(0, 10);
      try {
        const result = await dynamodb.query({
          TableName: 'gres-prod-remuneracoes',
          IndexName: 'colaborador-vigencia-index',
          KeyConditionExpression: 'colaboradorId = :cid AND effectiveDate <= :dt',
          ExpressionAttributeValues: { ':cid': colaboradorId, ':dt': refDate },
          ScanIndexForward: false,
          Limit: 1
        }).promise();
        const vigente = (result.Items || [])[0];
        if (!vigente) return errorResponse(404, ERROR_CODES.NOT_FOUND, 'Nenhuma remuneração vigente encontrada');
        if (vigente.endDate && vigente.endDate < refDate) {
          return errorResponse(404, ERROR_CODES.NOT_FOUND, 'Remuneração encerrada em ' + vigente.endDate);
        }
        return successResponse(200, vigente);
      } catch (err) {
        return errorResponse(500, ERROR_CODES.SERVER_ERROR, 'Erro ao buscar remuneração vigente: ' + err.message);
      }
    }

    // POST /remuneracoes — criar nova remuneração (fecha a anterior automaticamente)
    if (rawPath === '/remuneracoes' && httpMethod === 'POST') {
      const { colaboradorId, unitId, tipoAcordo, acordo, valorDia, valorNoite, valorTransporte, effectiveDate, observacao } = body || {};
      if (!colaboradorId || !effectiveDate) {
        return errorResponse(400, ERROR_CODES.VALIDATION_ERROR, 'colaboradorId e effectiveDate são obrigatórios');
      }
      try {
        // Fechar remuneração anterior
        const prev = await dynamodb.query({
          TableName: 'gres-prod-remuneracoes',
          IndexName: 'colaborador-vigencia-index',
          KeyConditionExpression: 'colaboradorId = :cid',
          ExpressionAttributeValues: { ':cid': colaboradorId },
          ScanIndexForward: false,
          Limit: 1
        }).promise();
        const prevItem = (prev.Items || [])[0];
        if (prevItem && !prevItem.endDate) {
          const dayBefore = new Date(effectiveDate);
          dayBefore.setDate(dayBefore.getDate() - 1);
          const endDateStr = dayBefore.toISOString().slice(0, 10);
          await dynamodb.update({
            TableName: 'gres-prod-remuneracoes',
            Key: { id: prevItem.id },
            UpdateExpression: 'SET endDate = :ed',
            ExpressionAttributeValues: { ':ed': endDateStr }
          }).promise();
        }
        const now = new Date().toISOString();
        const newId = 'rem-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
        const item = {
          id: newId, colaboradorId, unitId: unitId || '', tipoAcordo: tipoAcordo || null,
          acordo: acordo || null, valorDia: valorDia || 0, valorNoite: valorNoite || 0,
          valorTransporte: valorTransporte || 0, effectiveDate,
          criadoPor: (event._auth && event._auth.email) || 'system',
          criadoEm: now, observacao: observacao || ''
        };
        await dynamodb.put({ TableName: 'gres-prod-remuneracoes', Item: item }).promise();
        return successResponse(201, item);
      } catch (err) {
        return errorResponse(500, ERROR_CODES.SERVER_ERROR, 'Erro ao criar remuneração: ' + err.message);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // P2.3 — PAYSLIPS (Payment Summaries)
    // ═══════════════════════════════════════════════════════════

    // GET /payslips?unitId=xxx&mes=2026-06 — listar payslips por unidade/mês
    if (rawPath === '/payslips' && httpMethod === 'GET') {
      const { unitId, mes, colaboradorId } = queryParams;
      try {
        let items = [];
        if (unitId && mes) {
          const periodoPrefix = mes; // 2026-06
          const result = await dynamodb.query({
            TableName: 'gres-prod-payslips',
            IndexName: 'unidade-periodo-index',
            KeyConditionExpression: 'unitId = :uid AND begins_with(periodo, :p)',
            ExpressionAttributeValues: { ':uid': toCnpj(unitId), ':p': periodoPrefix }
          }).promise();
          items = result.Items || [];
        } else {
          const filters = [];
          const exprVals = {};
          if (unitId) { filters.push('unitId = :uid'); exprVals[':uid'] = toCnpj(unitId); }
          if (mes) { filters.push('begins_with(periodo, :m)'); exprVals[':m'] = mes; }
          if (colaboradorId) { filters.push('colaboradorId = :cid'); exprVals[':cid'] = colaboradorId; }
          const result = await dynamodb.scan({
            TableName: 'gres-prod-payslips',
            ...(filters.length > 0 ? { FilterExpression: filters.join(' AND '), ExpressionAttributeValues: exprVals } : {})
          }).promise();
          items = result.Items || [];
        }
        items.sort((a, b) => (b.periodo || '').localeCompare(a.periodo || ''));
        return response(200, items);
      } catch (err) {
        return errorResponse(500, ERROR_CODES.SERVER_ERROR, 'Erro ao buscar payslips: ' + err.message);
      }
    }

    // GET /payslips/:id — detalhe de payslip
    if (rawPath.match(/\/payslips\/.+/) && httpMethod === 'GET') {
      const id = rawPath.split('/payslips/')[1];
      try {
        const result = await dynamodb.get({ TableName: 'gres-prod-payslips', Key: { id } }).promise();
        if (!result.Item) return errorResponse(404, ERROR_CODES.NOT_FOUND, 'Payslip não encontrado');
        return successResponse(200, result.Item);
      } catch (err) {
        return errorResponse(500, ERROR_CODES.SERVER_ERROR, 'Erro ao buscar payslip: ' + err.message);
      }
    }

    // POST /payslips — criar/atualizar payslip
    if (rawPath === '/payslips' && httpMethod === 'POST') {
      const { colaboradorId, nomeColaborador, unitId, periodo, periodoInicio, periodoFim, mes, bruto, transporte, descontos, adiantamentos, liquido, status, pagamentos } = body || {};
      if (!colaboradorId || !periodo) {
        return errorResponse(400, ERROR_CODES.VALIDATION_ERROR, 'colaboradorId e periodo são obrigatórios');
      }
      try {
        const now = new Date().toISOString();
        const psId = 'ps-' + colaboradorId + '-' + periodo;
        const existing = await dynamodb.get({ TableName: 'gres-prod-payslips', Key: { id: psId } }).promise();
        const item = {
          id: psId, colaboradorId, nomeColaborador: nomeColaborador || '',
          unitId: toCnpj(unitId || ''), periodo, periodoInicio: periodoInicio || '',
          periodoFim: periodoFim || '', mes: mes || periodo.slice(0, 7),
          bruto: bruto || 0, transporte: transporte || 0, descontos: descontos || 0,
          adiantamentos: adiantamentos || 0, liquido: liquido || 0,
          status: status || 'pendente',
          pagamentos: pagamentos || [],
          criadoEm: (existing.Item && existing.Item.criadoEm) || now,
          atualizadoEm: now
        };
        await dynamodb.put({ TableName: 'gres-prod-payslips', Item: item }).promise();
        return successResponse(existing.Item ? 200 : 201, item);
      } catch (err) {
        return errorResponse(500, ERROR_CODES.SERVER_ERROR, 'Erro ao salvar payslip: ' + err.message);
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // POST /pagamento-batch — Pagamento atômico (TransactWriteItems)
    // Recebe todas as operações de um pagamento (folha + saídas + payslip)
    // e executa atomicamente: tudo salva ou nada salva.
    // ════════════════════════════════════════════════════════════════════
    if (rawPath === '/pagamento-batch' && httpMethod === 'POST') {
      const { colaboradorId, unitId, mes, semana, operacoes } = body;

      if (!colaboradorId || !mes || !unitId) {
        return errorResponse(400, ERROR_CODES.VALIDATION_ERROR, 'colaboradorId, mes e unitId são obrigatórios');
      }
      if (!Array.isArray(operacoes) || operacoes.length === 0) {
        return errorResponse(400, ERROR_CODES.VALIDATION_ERROR, 'operacoes deve ser um array não vazio');
      }
      // DynamoDB TransactWriteItems limit: 100 items
      if (operacoes.length > 100) {
        return errorResponse(400, ERROR_CODES.VALIDATION_ERROR, 'Máximo 100 operações por batch');
      }

      try {
        const now = new Date().toISOString();
        const normalizedUnitId = toCnpj(unitId || '') || unitId || '';

        // Validar colaborador
        const colaborador = await validarColaborador(colaboradorId);
        if (!colaborador) {
          return errorResponse(400, ERROR_CODES.VALIDATION_ERROR, 'Colaborador não encontrado', { colaboradorId });
        }

        // Gerar pagamentoId do lote
        const pagamentoId = body.pagamentoId || `pgto-${colaboradorId}-${now.replace(/[:.]/g, '').slice(0, 17)}`;

        const transactItems = [];
        const savedIds = [];
        const valorCorrecoes = [];

        for (const op of operacoes) {
          switch (op.tipo) {

            // ── FOLHA-PAGAMENTO (turno individual) ─────────────────────────
            case 'folha-turno': {
              const { data, turno, valor, tipoCodigo, obs: opObs, dataPagamento: opDtPgto, formaPagamento: opForma } = op;
              if (!data || !turno) break;
              let valorFinal = parseFloat(valor) || 0;

              // P0.1: Validação server-side
              if (turno !== 'Transporte') {
                const valorEsperado = resolverValorTurnoServidor(colaborador, data, turno);
                if (valorEsperado > 0 && Math.abs(valorFinal - valorEsperado) > 0.01) {
                  valorCorrecoes.push({ data, turno, frontendVal: valorFinal, servidorVal: valorEsperado });
                  valorFinal = valorEsperado;
                }
              }

              const dayId = `folha-${colaboradorId}-${data}-${turno}`;
              const item = {
                id: dayId,
                tipo: 'freelancer-dia',
                tipoCodigo: tipoCodigo || (turno === 'Dia' ? 'freelancer-dia' : 'freelancer-noite'),
                colaboradorId, data, turno, mes,
                semana: semana || null,
                unitId: normalizedUnitId,
                valor: valorFinal,
                pago: true,
                dataPagamento: opDtPgto || body.dataPagamento || now.split('T')[0],
                formaPagamento: opForma || body.formaPagamento || 'PIX',
                pagamentoId,
                transacaoBancariaId: null,
                confiabilidade: 'real',
                ...(body.valorBruto !== undefined ? { valorBruto: parseFloat(body.valorBruto) || 0 } : {}),
                ...(body.valorDescSaidas !== undefined ? { valorDescSaidas: parseFloat(body.valorDescSaidas) || 0 } : {}),
                ...(body.valorAbatEsp !== undefined ? { valorAbatEsp: parseFloat(body.valorAbatEsp) || 0 } : {}),
                ...(body.valorLiquido !== undefined ? { valorLiquido: parseFloat(body.valorLiquido) || 0 } : {}),
                obs: opObs || body.obs || '',
                updatedAt: now,
              };
              transactItems.push({
                Put: {
                  TableName: 'gres-prod-folha-pagamento',
                  Item: item,
                  ConditionExpression: 'attribute_not_exists(id) OR pago = :false',
                  ExpressionAttributeValues: { ':false': false },
                },
              });
              savedIds.push(dayId);
              break;
            }

            // ── FOLHA-PAGAMENTO (transporte) ───────────────────────────────
            case 'folha-transporte': {
              const { data: tData, valor: tValor, obs: tObs, dataPagamento: tDtPgto, formaPagamento: tForma } = op;
              const dayId = `folha-${colaboradorId}-${tData || semana}-Transporte`;
              const item = {
                id: dayId,
                tipo: 'freelancer-dia',
                tipoCodigo: 'transporte-freelancer',
                colaboradorId, data: tData || semana, turno: 'Transporte', mes,
                semana: semana || null,
                unitId: normalizedUnitId,
                valor: parseFloat(tValor) || 0,
                pago: true,
                dataPagamento: tDtPgto || body.dataPagamento || now.split('T')[0],
                formaPagamento: tForma || body.formaPagamento || 'PIX',
                pagamentoId,
                transacaoBancariaId: null,
                confiabilidade: 'real',
                obs: tObs || '',
                updatedAt: now,
              };
              transactItems.push({
                Put: {
                  TableName: 'gres-prod-folha-pagamento',
                  Item: item,
                  ConditionExpression: 'attribute_not_exists(id) OR pago = :false',
                  ExpressionAttributeValues: { ':false': false },
                },
              });
              savedIds.push(dayId);
              break;
            }

            // ── SAÍDA (criar nova) ─────────────────────────────────────────
            case 'saida-criar': {
              const saidaId = op.id || `saida-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
              const item = {
                id: saidaId,
                responsavel: op.responsavel || '',
                responsavelId: op.responsavelId || '',
                responsavelNome: op.responsavelNome || op.responsavel || '',
                colaboradorId,
                colaborador: colaborador.nome || '',
                favorecido: colaborador.nome || '',
                descricao: op.descricao || '',
                valor: parseFloat(op.valor) || 0,
                data: op.data || now.split('T')[0],
                turno: op.turno || '',
                tipo: op.tipoSaida || op.tipo || 'A pagar',
                origem: op.tipoSaida || op.tipo || 'A pagar',
                referencia: op.tipoSaida || op.tipo || 'A pagar',
                dataPagamento: op.dataPagamento || '',
                observacao: op.observacao || '',
                viagens: 0,
                caixinha: 0,
                formaPagamento: op.formaPagamento || 'PIX',
                pago: op.pago !== undefined ? op.pago : true,
                obs: op.obs || '',
                pagamentoIdLigado: pagamentoId,
                ...(op.excedeAdto !== undefined ? { excedeAdto: !!op.excedeAdto } : {}),
                unitId: normalizedUnitId,
                timestamp: now,
                createdAt: now,
              };
              transactItems.push({
                Put: {
                  TableName: 'gres-prod-saidas',
                  Item: item,
                },
              });
              savedIds.push(saidaId);
              break;
            }

            // ── SAÍDA (atualizar existente — marcar caixinha como paga) ────
            case 'saida-atualizar': {
              if (!op.id) break;
              transactItems.push({
                Update: {
                  TableName: 'gres-prod-saidas',
                  Key: { id: op.id },
                  UpdateExpression: 'SET pago = :pago, pagamentoIdLigado = :pgtoId, obs = :obs, updatedAt = :now',
                  ExpressionAttributeValues: {
                    ':pago': true,
                    ':pgtoId': pagamentoId,
                    ':obs': op.obs || '',
                    ':now': now,
                  },
                },
              });
              savedIds.push(op.id);
              break;
            }

            // ── PAYSLIP ────────────────────────────────────────────────────
            case 'payslip': {
              const psId = op.id || `ps-${colaboradorId}-${mes}-${(semana || 'full').replace(/[^\w]/g, '')}`;
              const psItem = {
                id: psId,
                colaboradorId,
                nomeColaborador: op.nomeColaborador || colaborador.nome || '',
                unitId: normalizedUnitId,
                periodo: op.periodo || mes,
                periodoInicio: op.periodoInicio || '',
                periodoFim: op.periodoFim || '',
                mes,
                bruto: parseFloat(op.bruto) || 0,
                transporte: parseFloat(op.transporte) || 0,
                descontos: parseFloat(op.descontos) || 0,
                adiantamentos: parseFloat(op.adiantamentos) || 0,
                liquido: parseFloat(op.liquido) || 0,
                status: op.status || 'pago',
                pagamentos: [pagamentoId],
                criadoEm: now,
                atualizadoEm: now,
              };
              transactItems.push({
                Put: {
                  TableName: 'gres-prod-payslips',
                  Item: psItem,
                },
              });
              savedIds.push(psId);
              break;
            }

            default:
              console.warn(`[pagamento-batch] tipo de operação desconhecido: ${op.tipo}`);
          }
        }

        if (transactItems.length === 0) {
          return errorResponse(400, ERROR_CODES.VALIDATION_ERROR, 'Nenhuma operação válida para executar');
        }

        // ── EXECUTAR TRANSAÇÃO ATÔMICA ──────────────────────────────────────
        // DynamoDB limit: 100 items per TransactWriteItems call
        // Se tiver mais de 25, precisa fazer em batches (DynamoDB aceita até 100 mas
        // recomenda batches menores para evitar throttle)
        if (transactItems.length <= 25) {
          await dynamodb.transactWrite({ TransactItems: transactItems }).promise();
        } else {
          // Batch in groups of 25
          for (let i = 0; i < transactItems.length; i += 25) {
            const batch = transactItems.slice(i, i + 25);
            await dynamodb.transactWrite({ TransactItems: batch }).promise();
          }
        }

        // Auditoria
        const audBatch = extrairAuditoria(body, event);
        await logAlteracaoGenerica({
          tabela: 'folha-pagamento',
          entidadeId: pagamentoId,
          evento: 'pagamento-batch',
          valoresAntes: null,
          valoresDepois: { colaboradorId, mes, semana, operacoes: operacoes.length, ids: savedIds },
          ...audBatch,
          unitId: normalizedUnitId,
        });

        return successResponse(200, {
          pagamentoId,
          ids: savedIds,
          count: savedIds.length,
          transacoes: transactItems.length,
          atomico: true,
          ...(valorCorrecoes.length > 0 ? { valorCorrecoes, aviso: 'Alguns valores foram corrigidos pelo servidor' } : {}),
        });

      } catch (err) {
        console.error('[pagamento-batch] Erro:', err);
        // TransactionCanceledException = uma ou mais condições falharam
        if (err.code === 'TransactionCanceledException') {
          const reasons = (err.CancellationReasons || []).map((r, i) => ({
            index: i,
            code: r.Code,
            message: r.Message || '',
            item: r.Item,
          })).filter(r => r.code !== 'None');
          return errorResponse(409, ERROR_CODES.CONFLICT,
            'Transação cancelada — uma ou mais operações conflitaram (ex: turno já pago)',
            { reasons }
          );
        }
        return errorResponse(500, ERROR_CODES.SERVER_ERROR, 'Erro no pagamento batch: ' + err.message);
      }
    }

    // Rota não encontrada
    return errorResponse(404, ERROR_CODES.NOT_FOUND, `Rota não encontrada: ${rawPath}`);

  } catch (error) {
    console.error('Erro geral:', error);
    return errorResponse(500, ERROR_CODES.SERVER_ERROR, 'Erro interno do servidor');
  }
};
