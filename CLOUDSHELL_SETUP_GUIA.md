# Guia: Executar Setup no AWS CloudShell

## 🎯 Objetivo

Configurar toda a infraestrutura AWS (Cognito, DynamoDB, S3, Lambda) em ~5 minutos usando CloudShell.

## 📋 Pré-requisitos

- ✅ Conta AWS ativa
- ✅ Acesso ao AWS Console
- ✅ Projeto GRES publicado no GitHub

## 🚀 Passo 1: Acessar AWS CloudShell

1. Abra [AWS Console](https://console.aws.amazon.com/)
2. Faça login com sua conta AWS
3. No canto **superior direito**, clique no ícone **>_** (CloudShell)
4. Aguarde o ambiente carregar (~30 segundos)

Você verá um terminal preto com `$` no final.

## 🔧 Passo 2: Clonar o Repositório GRES

No CloudShell, execute:

```bash
git clone https://github.com/zorozit/gres.git
cd gres
```

**Resultado esperado:**
```
Cloning into 'gres'...
remote: Enumerating objects: 24, done.
...
ubuntu@cloudshell:~/gres $
```

## ⚙️ Passo 3: Executar o Script de Setup

Execute o script que configura tudo automaticamente:

```bash
bash infra/cloudshell-setup.sh
```

## ⏱️ Passo 4: Acompanhar a Execução

O script mostrará o progresso em tempo real:

```
╔════════════════════════════════════════════════════════════╗
║ VERIFICAÇÕES INICIAIS
╚════════════════════════════════════════════════════════════╝

▶ Verificando AWS CLI...
✓ AWS CLI encontrado

▶ Verificando credenciais AWS...
✓ Credenciais AWS válidas

ℹ Região: us-east-1
ℹ Account ID: 123456789012
ℹ Projeto: gres

╔════════════════════════════════════════════════════════════╗
║ FASE 1: CONFIGURAR COGNITO
╚════════════════════════════════════════════════════════════╝

▶ Criando User Pool...
✓ User Pool criado: us-east-1_xxxxxxxxx

▶ Criando grupos de acesso...
✓ Grupos criados

▶ Criando App Client...
✓ App Client criado: xxxxxxxxxxxxxxxxxxxxxxxxxx

▶ Criando usuário de teste...
✓ Usuário de teste criado

[... continua ...]
```

**Tempo estimado:** 3-5 minutos

## ✅ Passo 5: Verificar Sucesso

Ao final, você verá:

```
✅ SETUP CONCLUÍDO COM SUCESSO!

Informações Importantes:

Cognito:
  User Pool ID: us-east-1_xxxxxxxxx
  App Client ID: xxxxxxxxxxxxxxxxxxxxxxxxxx
  Usuário Teste: admin@gres.com
  Senha Teste: GresAdmin123!@#

DynamoDB:
  Tabelas criadas: 7
  Modo: Pay-per-request (sem custo fixo)

Lambda:
  IAM Role: arn:aws:iam::123456789012:role/gres-lambda-role

S3:
  Bucket: gres-prod-uploads

Variáveis de Ambiente:

export AWS_REGION=us-east-1
export COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
export COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
export DYNAMODB_PREFIX=gres-prod
export LAMBDA_ROLE_ARN=arn:aws:iam::123456789012:role/gres-lambda-role
export S3_BUCKET=gres-prod-uploads

Próximos Passos:
1. Revisar arquivo: gres-setup-config.json
2. Copiar variáveis de ambiente para .env
3. Fazer deploy do frontend no GitHub Pages
4. Fazer deploy do backend no Lambda
5. Testar a aplicação

Custo Estimado: $10-15/mês
```

## 📥 Passo 6: Salvar Arquivo de Configuração

O script gera um arquivo `gres-setup-config.json` com todas as informações. **IMPORTANTE: Salve este arquivo!**

### Opção A: Fazer Download

1. No CloudShell, clique no ícone de **ações** (três pontos)
2. Selecione **Download file**
3. Digite: `gres-setup-config.json`
4. Clique em Download

### Opção B: Copiar Conteúdo

```bash
cat gres-setup-config.json
```

Copie todo o conteúdo e salve em um arquivo local.

## 🔐 Passo 7: Atualizar Variáveis de Ambiente

### Frontend (.env.local)

```bash
cd ~/gres/frontend
cat > .env.local << 'EOF'
VITE_COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_COGNITO_REGION=us-east-1
VITE_COGNITO_DOMAIN=gres-prod
VITE_API_ENDPOINT=http://localhost:3000/api
VITE_S3_BUCKET=gres-prod-uploads
VITE_S3_REGION=us-east-1
VITE_ENVIRONMENT=development
EOF
```

### Backend (.env)

```bash
cd ~/gres/backend
cat > .env << 'EOF'
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=123456789012
COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
DYNAMODB_PREFIX=gres-prod
S3_BUCKET=gres-prod-uploads
API_PORT=3000
API_ENV=development
CORS_ORIGIN=http://localhost:5173
EOF
```

## 🧪 Passo 8: Testar Autenticação

No CloudShell, teste o login com o usuário de teste:

```bash
aws cognito-idp admin-initiate-auth \
  --user-pool-id us-east-1_xxxxxxxxx \
  --client-id xxxxxxxxxxxxxxxxxxxxxxxxxx \
  --auth-flow ADMIN_NO_SRP_AUTH \
  --auth-parameters USERNAME=admin@gres.com,PASSWORD=GresAdmin123!@# \
  --region us-east-1
```

**Resultado esperado:**
```json
{
  "AuthenticationResult": {
    "AccessToken": "eyJraWQiOiJ...",
    "ExpiresIn": 3600,
    "TokenType": "Bearer",
    "IdToken": "eyJraWQiOiJ...",
    "RefreshToken": "eyJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwi..."
  }
}
```

## 📊 Passo 9: Verificar Recursos Criados

### Verificar Cognito

```bash
aws cognito-idp list-user-pools --max-results 10 --region us-east-1
```

### Verificar DynamoDB

```bash
aws dynamodb list-tables --region us-east-1
```

### Verificar S3

```bash
aws s3 ls
```

## 🚀 Próximos Passos

### 1. Instalar Dependências Localmente

```bash
cd ~/gres/frontend
npm install

cd ~/gres/backend
npm install
```

### 2. Executar Localmente

```bash
# Terminal 1: Frontend
cd ~/gres/frontend
npm run dev
# Acesse: http://localhost:5173

# Terminal 2: Backend
cd ~/gres/backend
npm run dev
# API em: http://localhost:3000
```

### 3. Fazer Deploy

- **Frontend:** GitHub Pages
- **Backend:** AWS Lambda + API Gateway

## ⚠️ Troubleshooting

### Problema: "aws: command not found"

**Solução:** AWS CLI já está instalado no CloudShell. Se não funcionar, tente:
```bash
which aws
```

### Problema: "Credenciais não configuradas"

**Solução:** CloudShell já tem credenciais. Se receber erro, faça logout e login novamente no console AWS.

### Problema: "DynamoDB table already exists"

**Solução:** O script é idempotente (pode rodar múltiplas vezes). Se a tabela já existe, o script a reutiliza.

### Problema: "Permission denied"

**Solução:** Sua conta IAM não tem permissões. Você precisa:
- Ser administrador da conta AWS, OU
- Ter políticas IAM que permitam criar Cognito, DynamoDB, S3, Lambda

## 💡 Dicas Importantes

1. **Salve o arquivo `gres-setup-config.json`** - Contém todas as informações
2. **Não compartilhe credenciais** - O arquivo contém dados sensíveis
3. **Teste tudo localmente** - Antes de fazer deploy
4. **Monitore custos** - Use AWS Cost Explorer

## 📞 Suporte

Se encontrar problemas:
1. Verificar logs do CloudShell
2. Consultar [AWS Documentation](https://docs.aws.amazon.com/)
3. Abrir issue no [GitHub](https://github.com/zorozit/gres/issues)

---

**Versão:** 1.0.0  
**Última atualização:** 28/03/2024
