# GRES — Gestão de Restaurantes

Sistema completo de gestão operacional para redes de restaurantes com foco em controle de caixa, folha de pagamento freelancer/CLT, escalas, saídas e motoboys.

**Deploy:** AWS Amplify (frontend) + AWS Lambda (backend) + DynamoDB  
**Última atualização:** 06/06/2026

---

## 🏗️ Arquitetura

```
Frontend (React 18 + Vite + TypeScript)
        ↓
AWS Amplify (hosting + CI/CD via dist/ commitado)
        ↓
API Gateway + Lambda (Node.js/TypeScript)
        ↓
DynamoDB (NoSQL) | Cognito (Autenticação)
```

> **Estratégia de deploy Amplify:** o `amplify.yml` usa `skipBuild: true` — o `frontend/dist/` pré-buildado **deve ser commitado** junto com as mudanças de código para o deploy refletir no Amplify.

---

## 📋 Módulos do Sistema

| Módulo | Arquivo | Descrição |
|--------|---------|-----------|
| **Dashboard** | `Dashboard.tsx` | Visão consolidada do dia por unidade |
| **Caixa** | `Caixa.tsx` / `MovimentosCaixa.tsx` | Abertura, recebimentos, sangria, fechamento |
| **Fechamento Dinheiro** | `FechamentoCaixaDinheiro.tsx` | Fechamento específico do caixa dinheiro |
| **Escalas** | `Escalas.tsx` | Visualização e marcação de presença |
| **Saídas** | `Saidas.tsx` | Registro e controle de saídas operacionais |
| **Motoboys** | `Motoboys.tsx` | Controle de pagamentos e desempenho |
| **Colaboradores** | `Colaboradores.tsx` | Cadastro e histórico financeiro |
| **Folha de Pagamento** | `FolhaPagamento.tsx` | Folha CLT + pagamento freelancer por semana |
| **Extrato** | `Extrato.tsx` | Extrato financeiro por colaborador com auditoria PIX |
| **Adiantamentos** | `AdiantamentosSaldos.tsx` | Controle de adiantamentos e saldos |
| **Importações Contábeis** | `ImportacoesContabeis.tsx` | Importação de folha com INSS/VT |
| **Conciliação Bancária** | `ConciliacaoBancaria.tsx` | Conciliação Stone |
| **Despesas** | `Despesas.tsx` | Controle de despesas + NF upload |
| **Fornecedores** | `Fornecedores.tsx` | Cadastro de fornecedores |
| **Vagas / Recrutamento** | `Vagas.tsx` / `FormularioVaga.tsx` | Gestão de vagas e formulário público |
| **Feriados** | `Feriados.tsx` | Cadastro de feriados por unidade |
| **Auditoria** | `Auditoria.tsx` | Logs de auditoria de operações |
| **Usuários** | `Usuarios.tsx` / `UsuariosEdicao.tsx` | Gestão de usuários e perfis |
| **Permissões** | `PermissoesConfig.tsx` | Configuração de permissões por perfil |
| **Unidades** | `Unidades.tsx` | Cadastro de unidades da rede |

---

## 💰 Módulo Folha de Pagamento — Funcionalidades Chave

### Freelancer (por semana)
- Pagamento por **dobras/turnos** (Dia ☀️ / Noite 🌙) agrupados por `pagamentoId`
- **Adiantamento 40%** exibido como item informativo (`tipo:'info'`)
- **Adiantamento Transporte** e **Adiantamento Especial** no Dia 5
- **Vale Transporte** semanal como item separado
- **INSS** calculado pela tabela progressiva 2026 sobre `salContrInss`
- Payload POST inclui campos estruturados de auditoria:
  ```json
  {
    "valorBruto": 835.00,
    "valorDescSaidas": 66.00,
    "valorAbatEsp": 150.00,
    "valorLiquido": 619.00
  }
  ```

---

## 📊 Módulo Extrato — Auditoria PIX (Opção A + B)

O Extrato exibe o **PIX líquido efetivo** (não o bruto dos turnos) com breakdown de descontos.

### Lógica `extrairAuditoria(raw, totalBruto)`

| Prioridade | Fonte | Quando |
|-----------|-------|--------|
| **Opção B** | `raw.valorLiquido` (campo estruturado) | Novos registros (pós-implementação) |
| **Opção A** | Regex no campo `obs` | Registros legados |

**Regex parseados no `obs` (Opção A):**
- `Desc. saídas: R$66,00`
- `Abat. adto.esp.: R$150,00`
- `Líquido: R$619,00`

### Visualização na tabela

**Linha-mãe (lote de turnos):**
- Coluna Total: `📱 R$619,00` (PIX líquido)
- Subscript: `bruto R$835,00 −R$66,00 −R$150,00`

**Linha de subtotal expandido (fundo `#1b5e20`):**
- Destaque branco: `📱 R$619,00`
- Linha secundária: breakdown em vermelho/roxo

**Expansão linha a linha (▶ / ▼):**
- Uma linha por turno (dobra) com data, turno (☀️/🌙), valor unitário
- Uma linha por transporte com valor
- Estado: `expandidos` (ModalColaborador) / `expandidosDetalhado` (tabela Detalhada)

---

## 🏃 Quick Start

### Pré-requisitos
- Node.js 18+
- AWS CLI configurada
- Acesso ao repositório GitHub (`zorozit/gres`)

### Instalar e buildar frontend
```bash
cd frontend
npm install
npm run build        # gera frontend/dist/
```

### Executar localmente
```bash
cd frontend
npm run dev          # Vite dev server em http://localhost:5173
```

### Deploy para Amplify
```bash
# OBRIGATÓRIO: commitar o dist/ junto com as mudanças de código
npm run build
git add frontend/dist/ frontend/src/
git commit -m "feat: descrição da mudança"
git push origin main
# → Amplify detecta o push e serve o dist/ commitado
```

---

## 📦 Estrutura do Projeto

```
gres/
├── frontend/
│   ├── src/
│   │   ├── pages/           # 26 páginas do sistema
│   │   ├── components/      # Componentes React reutilizáveis
│   │   ├── services/        # API, Auth
│   │   ├── hooks/           # Custom hooks
│   │   ├── types/           # TypeScript types
│   │   └── utils/           # payrollImport, helpers
│   ├── dist/                # ⚠️ DEVE ser commitado (Amplify usa dist/ pré-buildado)
│   ├── amplify.yml          # CI/CD Amplify (skipBuild estratégia)
│   └── package.json
│
├── backend/
│   ├── src/handlers/        # Funções Lambda por domínio
│   └── serverless.yml
│
├── infra/
│   ├── cloudshell-setup.sh
│   └── dynamodb-schema.json
│
└── docs/
    ├── SETUP.md
    └── colaboradores_porta_registro.md
```

---

## 🗄️ Modelo de Dados — DynamoDB

### Tabela principal: `gres-lancamentos`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `pk` | String | Partition key (colaboradorId#unitId) |
| `sk` | String | Sort key (tipoCodigo#data) |
| `tipoCodigo` | String | `freelancer-dia`, `freelancer-noite`, `transporte-freelancer`, `saida`, etc. |
| `pagamentoId` | String | Amarra turnos do mesmo lote de pagamento |
| `valorBruto` | Number | Bruto do lote (Opção B — novos registros) |
| `valorDescSaidas` | Number | Descontos de saídas (Opção B) |
| `valorAbatEsp` | Number | Abatimento adiantamento especial (Opção B) |
| `valorLiquido` | Number | PIX líquido efetivo (Opção B) |
| `obs` | String | Texto livre — inclui dados legados (Opção A) |
| `formaPagamento` | String | `PIX`, `Dinheiro`, `Misto` |
| `semana` | String | Data de fechamento da semana (freelancer) |

---

## 🔐 Tecnologias

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18, Vite, TypeScript, Amplify Auth |
| Backend | Node.js, Lambda, API Gateway |
| Banco | DynamoDB (NoSQL) |
| Auth | AWS Cognito |
| Deploy | AWS Amplify (frontend), Serverless Framework (backend) |
| CI/CD | GitHub → Amplify (dist/ commitado) |

---

## 📝 Histórico de Mudanças Recentes

| Commit | Descrição |
|--------|-----------|
| `0f4db6f` | **Extrato: PIX líquido audit na tabela Detalhada** — Opção A (regex obs) + B (campo estruturado) |
| `11c12e6` | Build dist atualizado — Extrato linha a linha por turno freelancer |
| `d6fa1ce` | Extrato: detalhamento linha a linha dos turnos freelancer na tabela detalhada |
| `f366943` | FolhaPagamento: racional adto informativo, adtoTransp+AdtoEspecial no Dia5, persistência folhasDB |
| `a4079ee` | Fix: tabela progressiva INSS 2026 + VT no modal Dia 5 |
| `128ab61` | Folha: corrige base INSS (Sal.Contr.INSS), adiciona VT e Feriado |
| `3f11b1d` | Módulo Despesas completo (form + upload NF + status pgto + link conciliação) |
| `89c50ef` | Módulo conciliação bancária Stone + preset permissões gerente |

---

## 👤 Autor

**Eric Zoroz** — eric@zoroz.com.br  
Repositório: [github.com/zorozit/gres](https://github.com/zorozit/gres)
