# GRES - Gestão de Restaurantes

Sistema completo de gestão operacional para redes de restaurantes com foco em controle de caixa, escalas, saídas e motoboys.

## 🎯 Características

- **Dashboard Operacional:** Visão consolidada do dia por unidade
- **Controle de Caixa:** Abertura, recebimentos, sangria e fechamento
- **Gestão de Escala:** Visualização e marcação de presença
- **Registro de Saídas:** Controle de saídas operacionais e financeiras
- **Gestão de Motoboys:** Controle de pagamentos e desempenho
- **Gestão de Colaboradores:** Cadastro e histórico financeiro
- **Autenticação Segura:** Cognito com perfis de acesso

## 🏗️ Arquitetura

```
Frontend (React + Vite)
        ↓
API Gateway + Lambda (Node.js)
        ↓
DynamoDB (NoSQL)
        ↓
Cognito (Autenticação)
```

## 📋 Estrutura do Projeto

```
gres/
├── frontend/                 # Aplicação React
│   ├── src/
│   │   ├── components/      # Componentes React
│   │   ├── pages/           # Páginas da aplicação
│   │   ├── services/        # Serviços (API, Auth)
│   │   ├── hooks/           # Custom hooks
│   │   ├── types/           # TypeScript types
│   │   ├── utils/           # Utilitários
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── public/              # Arquivos estáticos
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
│
├── backend/                  # API Node.js + Lambda
│   ├── src/
│   │   ├── handlers/        # Funções Lambda
│   │   ├── services/        # Lógica de negócio
│   │   ├── models/          # Modelos de dados
│   │   ├── utils/           # Utilitários
│   │   ├── middleware/      # Middlewares
│   │   └── index.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── serverless.yml       # Configuração Serverless Framework
│
├── infra/                    # Infraestrutura AWS
│   ├── cloudshell-setup.sh  # Script de setup
│   ├── dynamodb-schema.json # Schema DynamoDB
│   └── cognito-config.json  # Configuração Cognito
│
├── docs/                     # Documentação
│   ├── ARQUITETURA.md
│   ├── SETUP.md
│   ├── API.md
│   └── DEPLOY.md
│
├── .github/
│   └── workflows/           # GitHub Actions
│       ├── frontend-deploy.yml
│       └── backend-deploy.yml
│
├── .gitignore
├── .env.example
└── README.md
```

## 🚀 Quick Start

### Pré-requisitos

- Node.js 18+
- npm ou yarn
- Conta AWS
- Git

### 1. Clonar Repositório

```bash
git clone https://github.com/zorozit/gres.git
cd gres
```

### 2. Setup da Infraestrutura AWS

```bash
# Acessar AWS CloudShell
# https://console.aws.amazon.com/ → >_ (CloudShell)

# Executar script de setup
bash infra/cloudshell-setup.sh
```

### 3. Instalar Dependências Frontend

```bash
cd frontend
npm install
```

### 4. Instalar Dependências Backend

```bash
cd ../backend
npm install
```

### 5. Configurar Variáveis de Ambiente

```bash
# Frontend
cp frontend/.env.example frontend/.env.local

# Backend
cp backend/.env.example backend/.env
```

### 6. Executar Localmente

```bash
# Terminal 1: Frontend
cd frontend
npm run dev

# Terminal 2: Backend
cd backend
npm run dev
```

Acesse `http://localhost:5173` no navegador.

## 📊 Tecnologias

### Frontend
- **React 18** - UI library
- **Vite** - Build tool (rápido e moderno)
- **TypeScript** - Type safety
- **TailwindCSS** - Styling
- **Amplify Auth** - Autenticação Cognito
- **Axios** - HTTP client

### Backend
- **Node.js** - Runtime
- **Express** - Web framework
- **TypeScript** - Type safety
- **AWS SDK** - Integração AWS
- **DynamoDB** - Banco de dados
- **Cognito** - Autenticação

### Infraestrutura
- **AWS Cognito** - Autenticação
- **AWS DynamoDB** - Banco de dados NoSQL
- **AWS Lambda** - Funções serverless
- **AWS API Gateway** - API REST
- **AWS S3** - Armazenamento
- **AWS CloudWatch** - Logs e monitoramento

## 💰 Custos

| Serviço | Custo Mensal |
| :--- | :--- |
| DynamoDB | $0,29 |
| Lambda | $0,19 |
| S3 | $0,02 |
| Cognito | $0,00 |
| API Gateway | $0,35 |
| CloudWatch | $1,00 |
| **TOTAL** | **$1,85** |

**Com buffer:** $10-15/mês

## 📚 Documentação

- [Arquitetura](./docs/ARQUITETURA.md) - Detalhes técnicos
- [Setup](./docs/SETUP.md) - Guia de instalação
- [API](./docs/API.md) - Documentação da API
- [Deploy](./docs/DEPLOY.md) - Guia de deployment

## 🔐 Segurança

- ✅ Autenticação Cognito
- ✅ Criptografia em trânsito (HTTPS)
- ✅ Criptografia em repouso (DynamoDB)
- ✅ Logs de auditoria (CloudWatch)
- ✅ Backup automático (DynamoDB)

## 📱 Funcionalidades

### Dashboard
- Visão consolidada do dia
- Indicadores de faturamento
- Resumo da equipe
- Diferença de caixa

### Caixa
- Abertura de caixa
- Lançamento de recebimentos
- Sangria/reforço
- Fechamento de caixa

### Escala
- Visualização de escala
- Marcação de presença
- Histórico de presença

### Saídas
- Registro de saídas
- Categorização
- Comprovantes
- Histórico

### Motoboys
- Gestão de motoboys
- Cálculo de pagamentos
- Histórico

### Colaboradores
- Cadastro de colaboradores
- Dados financeiros
- Histórico de movimentações

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📝 Licença

Este projeto está sob licença MIT. Veja o arquivo LICENSE para mais detalhes.

## 👥 Autores

- **Eric Zoroz** - Desenvolvimento inicial

## 📞 Suporte

Para suporte, envie um email para eric@zoroz.com.br ou abra uma issue no GitHub.

---

**Versão:** 1.0.0  
**Última atualização:** 28/03/2024
