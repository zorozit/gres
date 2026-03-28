# Guia de Setup - GRES

## 🚀 Quick Start (5 minutos)

### 1. Clonar Repositório

```bash
git clone https://github.com/zorozit/gres.git
cd gres
```

### 2. Setup da Infraestrutura AWS (via CloudShell)

1. Abra [AWS Console](https://console.aws.amazon.com/)
2. Clique no ícone **>_** (CloudShell) no canto superior direito
3. Aguarde o ambiente carregar
4. Execute:

```bash
# Copiar e colar o script
bash infra/cloudshell-setup.sh
```

5. Aguarde ~3 minutos
6. Salve o arquivo `gres-setup-config.json` gerado

### 3. Configurar Variáveis de Ambiente

**Frontend:**
```bash
cd frontend
cp .env.example .env.local

# Editar .env.local com valores do gres-setup-config.json
# VITE_COGNITO_USER_POOL_ID=...
# VITE_COGNITO_CLIENT_ID=...
```

**Backend:**
```bash
cd ../backend
cp .env.example .env

# Editar .env com valores do gres-setup-config.json
# COGNITO_USER_POOL_ID=...
# COGNITO_CLIENT_ID=...
# DYNAMODB_PREFIX=...
```

### 4. Instalar Dependências

```bash
# Frontend
cd frontend
npm install

# Backend
cd ../backend
npm install
```

### 5. Executar Localmente

**Terminal 1 - Frontend:**
```bash
cd frontend
npm run dev
# Acesse: http://localhost:5173
```

**Terminal 2 - Backend:**
```bash
cd backend
npm run dev
# API rodando em: http://localhost:3000
```

## 📋 Estrutura de Pastas

```
gres/
├── frontend/              # Aplicação React
│   ├── src/
│   │   ├── components/   # Componentes reutilizáveis
│   │   ├── pages/        # Páginas da aplicação
│   │   ├── services/     # Serviços (API, Auth)
│   │   ├── types/        # TypeScript types
│   │   └── utils/        # Utilitários
│   ├── public/           # Arquivos estáticos
│   └── package.json
│
├── backend/               # API Node.js
│   ├── src/
│   │   ├── handlers/     # Funções Lambda
│   │   ├── services/     # Lógica de negócio
│   │   ├── models/       # Modelos de dados
│   │   └── middleware/   # Middlewares
│   └── package.json
│
├── infra/                # Infraestrutura
│   └── cloudshell-setup.sh
│
├── docs/                 # Documentação
│   ├── SETUP.md
│   ├── API.md
│   └── DEPLOY.md
│
└── README.md
```

## 🔧 Configuração Detalhada

### Frontend (React + Vite)

**Instalar dependências:**
```bash
cd frontend
npm install
```

**Variáveis de ambiente (.env.local):**
```env
VITE_COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_COGNITO_REGION=us-east-1
VITE_COGNITO_DOMAIN=gres-prod
VITE_API_ENDPOINT=http://localhost:3000/api
VITE_S3_BUCKET=gres-prod-uploads
VITE_S3_REGION=us-east-1
VITE_ENVIRONMENT=development
```

**Executar em desenvolvimento:**
```bash
npm run dev
```

**Build para produção:**
```bash
npm run build
# Arquivos gerados em: dist/
```

### Backend (Node.js + Express)

**Instalar dependências:**
```bash
cd backend
npm install
```

**Variáveis de ambiente (.env):**
```env
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=123456789012
COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
DYNAMODB_PREFIX=gres-prod
S3_BUCKET=gres-prod-uploads
API_PORT=3000
API_ENV=development
CORS_ORIGIN=http://localhost:5173
```

**Executar em desenvolvimento:**
```bash
npm run dev
```

**Build para produção:**
```bash
npm run build
# Arquivos gerados em: dist/
```

## 🧪 Testar Localmente

### 1. Verificar API

```bash
curl http://localhost:3000/health
```

**Resposta esperada:**
```json
{
  "status": "ok",
  "timestamp": "2024-03-28T14:00:00Z",
  "environment": "development"
}
```

### 2. Testar Autenticação Cognito

```bash
# Fazer login
aws cognito-idp admin-initiate-auth \
  --user-pool-id us-east-1_xxxxxxxxx \
  --client-id xxxxxxxxxxxxxxxxxxxxxxxxxx \
  --auth-flow ADMIN_NO_SRP_AUTH \
  --auth-parameters USERNAME=admin@gres.com,PASSWORD=GresAdmin123!@# \
  --region us-east-1
```

### 3. Testar DynamoDB

```bash
# Inserir unidade de teste
aws dynamodb put-item \
  --table-name gres-prod-unidades \
  --item '{
    "id": {"S": "unidade-001"},
    "nome": {"S": "Restaurante Centro"},
    "cidade": {"S": "São Paulo"},
    "status": {"S": "ativo"}
  }' \
  --region us-east-1

# Ler item
aws dynamodb get-item \
  --table-name gres-prod-unidades \
  --key '{"id": {"S": "unidade-001"}}' \
  --region us-east-1
```

## 🚀 Deploy

### Deploy Frontend (GitHub Pages)

1. **Fazer build:**
```bash
cd frontend
npm run build
```

2. **Fazer push para GitHub:**
```bash
git add .
git commit -m "Deploy frontend"
git push origin main
```

3. **Ativar GitHub Pages:**
   - Ir para Settings → Pages
   - Source: Deploy from a branch
   - Branch: main / folder: /docs
   - Salvar

4. **Acessar em:**
```
https://zorozit.github.io/gres
```

### Deploy Backend (AWS Lambda)

1. **Fazer build:**
```bash
cd backend
npm run build
```

2. **Criar função Lambda:**
```bash
# Criar arquivo ZIP
zip -r function.zip dist node_modules

# Criar função
aws lambda create-function \
  --function-name gres-api \
  --runtime nodejs18.x \
  --role arn:aws:iam::123456789012:role/gres-lambda-role \
  --handler dist/index.handler \
  --zip-file fileb://function.zip \
  --region us-east-1
```

3. **Criar API Gateway:**
```bash
# Criar API
aws apigateway create-rest-api \
  --name gres-api \
  --description "GRES API" \
  --region us-east-1
```

## 📚 Documentação Adicional

- [API Documentation](./API.md) - Endpoints e payloads
- [Architecture](./ARQUITETURA.md) - Detalhes técnicos
- [Deployment Guide](./DEPLOY.md) - Guia completo de deploy

## 🆘 Troubleshooting

### Problema: "Credenciais AWS não configuradas"

**Solução:**
```bash
aws configure
# Insira suas credenciais AWS
```

### Problema: "Porta 3000 já está em uso"

**Solução:**
```bash
# Usar porta diferente
API_PORT=3001 npm run dev

# Ou matar processo na porta 3000
lsof -ti:3000 | xargs kill -9
```

### Problema: "CORS error"

**Solução:** Verificar variável `CORS_ORIGIN` no backend .env

```env
CORS_ORIGIN=http://localhost:5173,http://localhost:3000
```

### Problema: "DynamoDB table not found"

**Solução:** Verificar se as tabelas foram criadas

```bash
aws dynamodb list-tables --region us-east-1
```

## 📞 Suporte

Para dúvidas ou problemas:
1. Verificar [GitHub Issues](https://github.com/zorozit/gres/issues)
2. Enviar email para eric@zoroz.com.br
3. Consultar documentação em `/docs`

---

**Versão:** 1.0.0  
**Última atualização:** 28/03/2024
