# 🐛 Troubleshooting: Erro "PUT falhou: 404" em Lançar Turno

## Problema

Ao tentar marcar ou desmarcar turnos na tela **Gestão de Escalas → Lançar Turnos**, o console do navegador exibe:

```
Erro ao salvar turno: Error: PUT falhou: 404
```

## Causa Raiz

O backend Lambda estava usando uma abordagem simplificada para atualizar registros de escalas:

```javascript
// Código antigo (PROBLEMA):
const original = await dynamodb.get({ 
  TableName: 'gres-prod-escalas', 
  Key: { id: escId } 
}).promise();

if (!original.Item) return response(404, { error: 'Escala não encontrada' });
```

**Por que isso falha?**

Os **31 registros de escalas importados** foram criados fora do fluxo normal da aplicação e podem ter:

1. **Estrutura de chave primária diferente** no DynamoDB (ex: chave composta `colaboradorId + data`)
2. **Campo `id` presente mas não usado como partition key** na tabela
3. **Formato de ID incompatível** com o esperado pelo `dynamodb.get()`

Quando o `GET /escalas` faz um **scan** (que retorna todos os registros independente da chave), os itens aparecem normalmente no frontend. Mas quando o `PUT` tenta fazer um **get direto** usando `Key: { id }`, o DynamoDB não encontra o item porque a chave primária da tabela não é simplesmente `id`.

## Solução Implementada

Adicionado **scan fallback** nos handlers PUT e DELETE:

```javascript
// Código novo (SOLUÇÃO):
let originalItem = null;

// 1. Tenta get direto (rápido)
try {
  const r = await dynamodb.get({ 
    TableName: 'gres-prod-escalas', 
    Key: { id: escId } 
  }).promise();
  originalItem = r.Item || null;
} catch (e) {
  console.warn('PUT escalas direct get failed, trying scan:', e.message);
}

// 2. Se falhar, usa scan com filtro (fallback)
if (!originalItem) {
  const scan = await dynamodb.scan({
    TableName: 'gres-prod-escalas',
    FilterExpression: 'id = :eid',
    ExpressionAttributeValues: { ':eid': escId }
  }).promise();
  originalItem = (scan.Items && scan.Items.length > 0) ? scan.Items[0] : null;
}

if (!originalItem) return response(404, { error: 'Escala não encontrada' });

// Continua com o update normalmente...
```

### Melhorias Adicionais

1. **DELETE também usa scan fallback**: Se delete direto falhar, marca o item como `_deleted` via soft-delete
2. **GET filtra soft-deletes**: Registros com `_deleted = true` ou `turno === 'Deletado'` são filtrados
3. **POST route fix**: Mudado de `rawPath.includes('/escalas')` para `rawPath === '/escalas'` para evitar conflitos

## Como Aplicar a Correção

### 1. Fazer merge do PR #17

```bash
gh pr merge 17 --merge
```

### 2. Deploy do backend Lambda

```bash
cd /path/to/gres
bash infra/deploy-lambda.sh
```

O script automaticamente:
- Descobre o nome da função Lambda
- Empacota o código atualizado
- Faz upload para AWS Lambda
- Testa o endpoint

### 3. Verificação

Após o deploy, teste na interface:

1. Acesse **Gestão de Escalas → Lançar Turnos**
2. Clique em "D" (Dia) ou "N" (Noite) para um colaborador
3. Verifique no console do navegador (F12) que não há mais erros 404
4. Confirme que o turno foi salvo corretamente

## Prevenção Futura

### Opção 1: Normalizar chaves no DynamoDB

Se você tem acesso ao DynamoDB, crie um script de migração para garantir que todos os registros usem o mesmo formato de chave:

```javascript
// migration-script.js
const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient({ region: 'us-east-2' });

async function migrateEscalas() {
  const result = await dynamodb.scan({ 
    TableName: 'gres-prod-escalas' 
  }).promise();
  
  for (const item of result.Items) {
    // Recria o item com id no formato correto
    const newId = `esc-${Date.now()}-${item.colaboradorId.slice(-4)}`;
    await dynamodb.put({
      TableName: 'gres-prod-escalas',
      Item: { ...item, id: newId }
    }).promise();
  }
}
```

### Opção 2: Sempre usar scan + filtro (mais lento mas mais seguro)

Se a tabela for pequena (< 1000 registros), o scan com filtro é aceitável.

### Opção 3: Criar índice secundário global (GSI)

Configure um GSI no DynamoDB com `id` como partition key:

```json
{
  "GlobalSecondaryIndexes": [
    {
      "IndexName": "id-index",
      "KeySchema": [{ "AttributeName": "id", "KeyType": "HASH" }],
      "Projection": { "ProjectionType": "ALL" }
    }
  ]
}
```

E use query ao invés de get:

```javascript
const result = await dynamodb.query({
  TableName: 'gres-prod-escalas',
  IndexName: 'id-index',
  KeyConditionExpression: 'id = :id',
  ExpressionAttributeValues: { ':id': escId }
}).promise();
```

## Referências

- [AWS DynamoDB Get vs Query vs Scan](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-query-scan.html)
- [DynamoDB Key Design Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)
- [PR #17 - Fix completo](https://github.com/zorozit/gres/pull/17)

---

**📌 Última atualização**: 2026-04-08  
**🔗 PR relacionado**: #17  
**✅ Status**: Resolvido (pendente deploy)
