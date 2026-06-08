# GRES — Gestão de Restaurantes

Sistema completo de gestão operacional para redes de restaurantes com foco em controle de caixa, folha de pagamento freelancer/CLT, escalas, saídas e motoboys.

**Deploy:** AWS Amplify (frontend) + AWS Lambda (backend) + DynamoDB  
**Última atualização:** 08/06/2026

---

## 🏗️ Arquitetura

```
Frontend (React 18 + Vite + TypeScript)
        ↓
AWS Amplify (hosting + CI/CD via dist/ commitado)
        ↓
API Gateway + Lambda (Node.js)
        ↓
DynamoDB (NoSQL)
```

> **Estratégia de deploy Amplify:** o `amplify.yml` usa `skipBuild: true` — o `frontend/dist/` pré-buildado **deve ser commitado** junto com as mudanças de código para o deploy refletir no Amplify.

---

## 📋 Módulos do Sistema

| Módulo | Arquivo | Descrição |
|--------|---------|-----------| 
| **Dashboard** | `Dashboard.tsx` | Visão consolidada do dia por unidade |
| **Caixa** | `Caixa.tsx` / `MovimentosCaixa.tsx` | Abertura, recebimentos, sangria, fechamento |
| **Escalas** | `Escalas.tsx` | Visualização e marcação de presença |
| **Saídas** | `Saidas.tsx` | Registro e controle de saídas operacionais |
| **Motoboys** | `Motoboys.tsx` | Controle de pagamentos e desempenho |
| **Colaboradores** | `Colaboradores.tsx` | Cadastro e histórico financeiro |
| **Folha de Pagamento** | `FolhaPagamento.tsx` | Folha CLT + pagamento freelancer por semana |
| **Extrato** | `Extrato.tsx` | Extrato financeiro por colaborador com auditoria PIX |
| **Adiantamentos** | `AdiantamentosSaldos.tsx` | Controle de adiantamentos e saldos |
| **Despesas** | `Despesas.tsx` | Controle de despesas + NF upload |
| **Auditoria** | `Auditoria.tsx` | Logs de auditoria de operações |
| **Usuários** | `Usuarios.tsx` | Gestão de usuários e perfis |
| **Unidades** | `Unidades.tsx` | Cadastro de unidades da rede |

---

## 🗄️ Banco de Dados — Estado Atual e Análise de Auditoria

### Tabelas DynamoDB em produção

| Tabela | PK | Descrição | Log? |
|--------|----|-----------|----|
| `gres-prod-colaboradores` | `id` (col-xxxx) | Cadastro de colaboradores | ✅ sim |
| `gres-prod-colaboradores-log` | `id` | Auditoria de alterações de colaboradores | — |
| `gres-prod-folha-pagamento` | `id` | Pagamentos freelancer (granular por dia/turno) e CLT | ✅ sim |
| `gres-prod-folha-pagamento-log` | `id` | Auditoria de pagamentos (via logAlteracaoGenerica) | — |
| `gres-prod-saidas` | `id` (saida-timestamp) | Saídas financeiras (consumo, desconto, adiantamento) | ✅ sim |
| `gres-prod-saidas-log` | `id` | Auditoria de criação/edição/exclusão de saídas | — |
| `gres-prod-escalas` | `id` | Escalas diárias de presença | ✅ sim |
| `gres-prod-escalas-log` | `id` | Auditoria de confirmações/alterações de escala | — |
| `gres-prod-controle-motoboy` | `motoboyId` + `data` | Lançamentos diários de motoboys | ✅ sim |
| `gres-prod-controle-motoboy-log` | `id` | Auditoria de saves de controle motoboy | — |
| `gres-prod-usuarios` | `id` (usr-xxxx) | Usuários do sistema | ❌ sem log |
| `gres-prod-unidades` | `id` (CNPJ 14 chars) | Unidades da rede | ❌ sem log |
| `gres-prod-caixa` | `id` | Movimentos de caixa (abertura/fechamento/sangria) | ❌ sem log |
| `gres-prod-despesas` | `id` (despesa-timestamp) | Despesas operacionais com NF | ❌ sem log |
| `gres-prod-fornecedores` | `id` | Cadastro de fornecedores | ❌ sem log |
| `gres-prod-vagas` | `id` | Vagas de recrutamento (soft delete) | ❌ sem log |
| `gres-prod-funcoes-escala` | `id` (func-xxxx) | Regras de função/área para escala | ❌ sem log |
| `gres-prod-motoboys` | `id` (mot-xxxx) | **LEGADO — NÃO USAR.** Motoboys migrados para `gres-prod-colaboradores` com `isMotoboy=true`. GET /motoboys ignora esta tabela. | ❌ sem log |
| `gres-prod-freelancers` | `id` | Legado — freelancers migrados | ❌ sem log |
| `gres-prod-candidatos` | `id` | Candidatos de vagas | ❌ sem log |

---

### 📐 Estrutura dos Registros Críticos

#### `gres-prod-folha-pagamento` — novo modelo granular (freelancer)

```json
{
  "id": "folha-{colaboradorId}-{data}-{turno}",
  "tipo": "freelancer-dia",
  "tipoCodigo": "freelancer-dia | freelancer-noite | transporte-freelancer",
  "colaboradorId": "col-xxxx",
  "data": "2026-05-22",
  "turno": "Dia | Noite",
  "mes": "2026-05",
  "semana": "2026-05-24",
  "valor": 120.00,
  "pago": true,
  "dataPagamento": "2026-05-25",
  "formaPagamento": "PIX",
  "pagamentoId": "pgto-{colaboradorId}-{timestamp}",
  "confiabilidade": "real | recalculado | legado",

  "valorBruto": 835.00,        // campos estruturados Opção B — NOVO
  "valorDescSaidas": 35.00,    // descontos de consumo do período
  "valorAbatEsp": 150.00,      // abatimento adiantamento especial
  "valorLiquido": 650.00,      // PIX/Dinheiro efetivamente pago

  "responsavelId": "usr-xxxx",
  "responsavelNome": "Admin",
  "responsavelEmail": "admin@gres.com",
  "obs": "Freelancer sem. 05/19 - 05/24 - ...",
  "updatedAt": "2026-05-25T14:30:00Z"
}
```

#### `gres-prod-saidas` — com rastreabilidade de lote

```json
{
  "id": "saida-{timestamp}",
  "colaboradorId": "col-xxxx",
  "tipo": "Desconto Transporte | Consumo Interno | Adiantamento Transporte | ...",
  "origem": "Desconto Transporte",
  "referencia": "Desconto Transporte",
  "descricao": "Transporte do dia 2026-05-22 (consumo do adto.)",
  "valor": 15.00,
  "data": "2026-05-22",
  "dataPagamento": "2026-05-22",
  "pagamentoIdLigado": "pgto-{colaboradorId}-{timestamp}",  // amarra ao lote
  "responsavelId": "usr-xxxx",
  "responsavelNome": "Admin",
  "formaPagamento": "PIX",
  "pago": true,
  "obs": "Auto-gerado ao confirmar pagamento sem. 05/19 - 05/24",
  "unitId": "12345678000195",
  "createdAt": "2026-05-25T14:30:00Z"
}
```

#### `gres-prod-folha-pagamento-log` — padrão de auditoria

```json
{
  "id": "log-folha-pagamento-{entidadeId}-{timestamp}-{rand}",
  "entidadeId": "pgto-{colaboradorId}-{timestamp}",
  "tabela": "folha-pagamento",
  "timestamp": "2026-05-25T14:30:00.000Z",
  "evento": "pago | desfeito | alterado | criado",
  "valoresAntes": null,
  "valoresDepois": { "colaboradorId": "...", "dias": [...], "ids": [...] },
  "usuarioId": "usr-xxxx",
  "usuarioNome": "Admin",
  "usuarioEmail": "admin@gres.com",
  "unitId": "12345678000195",
  "userAgent": "Mozilla/5.0 ...",
  "observacao": ""
}
```

---

### ✅ O que funciona bem hoje

| Aspecto | Detalhe |
|---------|---------|
| **Rastreabilidade de lote** | `pagamentoId` amarra todos os turnos do mesmo ato de pagar. `pagamentoIdLigado` amarra as saídas auto-geradas ao lote |
| **Auditoria de colaboradores** | Log completo: criado, alterado, reativado, desativado, transferido, remuneracao_alterada, cargo_alterado, contrato_alterado. Inclui diff campo a campo |
| **Auditoria de escalas** | criado, confirmado, desconfirmado, alterado, deletado |
| **Auditoria de saídas** | criado, alterado, deletado — com `valoresAntes` e `valoresDepois` |
| **Auditoria de pagamentos** | 1 entrada por lote (não por turno individual) — `pago` / `desfeito` |
| **Campos estruturados financeiros** | `valorBruto`, `valorDescSaidas`, `valorAbatEsp`, `valorLiquido` salvos em cada turno do lote (Opção B) — dado confiável, sem depender de regex no obs |
| **Responsável rastreado** | `responsavelId + Nome + Email` em todos os eventos críticos (pós-fix da sessão atual) |
| **Integridade referencial** | `validarColaborador`, `validarUnidade`, `validarUsuario` chamados nos POSTs críticos |
| **logPagamentos** | Array cumulativo em folha CLT — histórico de parcelas pagas |
| **Soft delete** | Escalas e vagas usam soft delete (não apagam fisicamente) |

---

### ⚠️ Lacunas identificadas — o que precisa melhorar

#### P1 — Crítico (impacto direto em auditoria e integridade)

**1. `gres-prod-saidas` não salva `pagamentoIdLigado` no backend**
- O campo `pagamentoIdLigado` é enviado pelo frontend no body do POST
- O backend (`POST /saidas`) **não lê nem persiste** esse campo no item salvo
- Resultado: filtro por `pagamentoIdLigado` no frontend sempre cai no fallback por datas
- **Fix necessário:** adicionar `pagamentoIdLigado: body.pagamentoIdLigado || null` no item salvo

**2. `valorBruto/valorDescSaidas/valorAbatEsp/valorLiquido` não salvos no backend**
- O frontend envia esses campos no body do POST `/folha-pagamento` (modelo granular)
- O backend **ignora** esses campos no loop `for (const d of dias)` — só salva `data`, `turno`, `valor`
- Resultado: `temCampoEstruturado = false` sempre → frontend recai no parsing de obs (Opção A legado)
- **Fix necessário:** propagar esses campos do body para cada item `d` do lote

**3. `gres-prod-colaboradores` — DELETE físico sem log**
- `DELETE /colaboradores/:id` apaga o registro diretamente sem logar
- Não tem `excluido: true` (soft delete) — o colaborador some do banco sem rastro
- **Fix necessário:** soft delete (`excluido: true + excluidoEm + excluidoPor`) + log antes de deletar

**4. Token JWT é Base64 simples (não é JWT real)**
- O "token" gerado no login é `Buffer.from(JSON.stringify({email, id, perfil, iat})).toString('base64')`
- Sem assinatura criptográfica — qualquer pessoa pode forjar um token trocando os dados
- A senha é comparada em texto puro (`user.senha !== password`) sem hash
- **Fix necessário:** usar `jsonwebtoken` com secret + hash de senha com `bcrypt`

#### P2 — Importante (auditoria incompleta)

**5. `gres-prod-usuarios` sem log de auditoria**
- Criação, alteração e exclusão de usuários não geram log
- Quem criou ou editou um usuário? Não há rastro
- **Fix necessário:** `logAlteracaoGenerica` nos endpoints POST/PUT/DELETE de usuários

**6. `gres-prod-caixa` sem log de auditoria**
- Aberturas, sangrias e fechamentos de caixa não têm log
- Crítico para integridade financeira — qualquer operador pode alterar valores sem rastro
- **Fix necessário:** log em todas as operações de caixa

**7. `gres-prod-despesas` sem log de auditoria**
- Despesas criadas/alteradas/excluídas sem rastreio de quem fez o quê
- **Fix necessário:** `logAlteracaoGenerica` nos endpoints de despesas

**8. `gres-prod-folha-pagamento-log` — `valoresAntes: null` no modelo granular**
- No POST granular (array de dias), o log registra `valoresAntes: null`
- Se o mesmo turno é repago (ex: correção de valor), não há como ver o que era antes
- **Fix necessário:** antes do loop, buscar os items existentes (`batchGet`) e salvar como `valoresAntes`

**9. Auditoria de controle-motoboy omite `valoresAntes`**
- `POST /controle-motoboy` loga `valoresAntes: null` — "custoso reler 30+ itens"
- Para fins de ordem judicial, o antes é tão importante quanto o depois
- **Fix necessário:** aceitar o custo — fazer `batchGet` dos 30 itens antes de sobrescrever

#### P3 — Melhorias estruturais (escala e operação)

**10. `GET /auditoria` usa `scan` completo — sem paginação real**
- O endpoint varre a tabela toda em memória e filtra em JavaScript
- Com volume crescente de logs, isso vai estourar o timeout do Lambda (29s max)
- **Fix necessário:** GSI por `timestamp` (ou `unitId + timestamp`) para queries paginadas

**11. `GET /saidas` e `GET /folha-pagamento` usam `scan` completo**
- Com o crescimento de dados, esses scans ficarão lentos e caros
- **Fix necessário:** GSI `unitId-dataPagamento-index` para filtrar por unidade + período sem scan

**12. `gres-prod-saidas` — ID baseado em timestamp (`saida-{Date.now()}`)**
- Colisão possível em operações simultâneas no mesmo milissegundo
- **Fix necessário:** `saida-{colaboradorId}-{timestamp}-{random4}` para unicidade garantida

**13. Falta campo `excluido` em saídas**
- DELETE de saída é físico — remove o registro permanentemente
- Saídas auto-geradas (Desconto Transporte) não podem ser recuperadas se deletadas por engano
- **Fix necessário:** soft delete com `excluido: true + excluidoEm + excluidoPor`

---

### 🗺️ Roadmap de melhorias priorizadas

```
SPRINT IMEDIATO (Semana 1)
├── [P1.1] Backend: salvar pagamentoIdLigado em POST /saidas
├── [P1.2] Backend: propagar valorBruto/Desc/Abat/Liquido nos itens granulares
└── [P1.3] Soft delete em colaboradores + log antes de deletar

SPRINT CURTO (Semana 2-3)
├── [P2.5] Log de auditoria para usuários (POST/PUT/DELETE)
├── [P2.6] Log de auditoria para caixa
└── [P2.7] Log de auditoria para despesas

SPRINT MÉDIO (Mês 1)
├── [P1.4] Substituir JWT Base64 por jsonwebtoken assinado
├── [P1.4] Hash de senha com bcrypt
├── [P2.8] valoresAntes real no log granular (batchGet antes do loop)
└── [P3.13] Soft delete em saídas

SPRINT ESTRUTURAL (Mês 2)
├── [P3.10] GSI timestamp para /auditoria (eliminar scan)
├── [P3.11] GSI unitId+data para /saidas e /folha-pagamento
└── [P3.12] IDs de saída com componente aleatório
```

---

## 🏍️ Módulo Motoboys — Arquitetura e Campos Críticos

### Fonte única de dados: `gres-prod-colaboradores`

Motoboys são colaboradores com `isMotoboy = true`. **A tabela `gres-prod-motoboys` é LEGADA e NÃO deve ser usada.**

```
GET /motoboys → scan em gres-prod-colaboradores WHERE isMotoboy=true AND ativo=true
                ↓
                Mapeamento com fallback em cascata:
                valorChegadaDia   = c.valorChegadaDia   || acordo.chegadaDia   || c.valorDia   || 0
                valorChegadaNoite = c.valorChegadaNoite || acordo.chegadaNoite || c.valorNoite  || 0
                valorEntrega      = c.valorEntrega      || acordo.valorEntrega  || c.valorTransporte || 0
```

### Campos do colaborador-motoboy

| Campo raiz DynamoDB | Campo `acordo{}` | Descrição |
|---|---|---|
| `valorChegadaDia` | `acordo.chegadaDia` | Valor pago por chegada no turno dia (R$) |
| `valorChegadaNoite` | `acordo.chegadaNoite` | Valor pago por chegada no turno noite (R$) |
| `valorEntrega` | `acordo.valorEntrega` | Valor por entrega/viagem (R$) |
| `tipoAcordo` | — | `'motoboy'` para o tipo chegada+entregas |
| `isMotoboy` | — | `true` para marcar como motoboy |

### Por que havia dois cadastros (histórico)

Antes da unificação, existia um módulo separado de cadastro de motoboys (tabela `gres-prod-motoboys`).
Após a unificação em `gres-prod-colaboradores`, um bug em `buildAcordoCompatFields` fazia os campos
`valorChegadaDia`, `valorChegadaNoite` e `valorEntrega` ficarem **zerados no nível raiz** do registro,
embora os valores corretos estivessem dentro do objeto `acordo{}`.

**Fix aplicado (commit `7b57e18`):**
1. `buildAcordoCompatFields` agora propaga `valorChegadaDia/Noite/valorEntrega` corretamente para o nível raiz
2. `GET /motoboys` usa fallback `acordo{}` para registros legados sem re-salvar
3. `POST/PUT /colaboradores` sincroniza campos raiz a partir de `acordo{}` ao salvar
4. `Motoboys.tsx` usa fallback `acordo{}` em todos os cálculos locais

### Fórmula de cálculo — Freelancer motoboy

```
vlVariavel por dia = chegadaDia + chegadaNoite + (entDia + entNoite) × valorEntrega + caixinha
```

### Fórmula de cálculo — CLT motoboy

```
vlVariavel por dia = (entDia + entNoite) × valorEntrega + caixinha
```

---

## 💰 Módulo Folha de Pagamento — Funcionalidades Chave

### Freelancer (por semana)
- Pagamento por **dobras/turnos** (Dia ☀️ / Noite 🌙) agrupados por `pagamentoId`
- **Transporte dia a dia** — 1 registro por dia físico trabalhado (`Desconto Transporte` + `Adiantamento Transporte`)
- **Adiantamento Especial** — abatimento via `Desconto Adiantamento Especial` vinculado ao lote
- Payload POST inclui campos estruturados de auditoria (Opção B):
  ```json
  {
    "valorBruto": 835.00,
    "valorDescSaidas": 35.00,
    "valorAbatEsp": 150.00,
    "valorLiquido": 650.00
  }
  ```
- `pagamentoId` amarra todos os turnos + saídas do mesmo ato de pagar
- `pagamentoIdLigado` nas saídas auto-geradas aponta para o `pagamentoId` do lote

---

## 📊 Módulo Extrato — Auditoria PIX

O Extrato exibe o **PIX líquido efetivo** (não o bruto dos turnos) com breakdown de descontos e log de pagamento.

### Lógica de resolução de valor (`extrairAuditoria`)

| Prioridade | Fonte | Quando usar |
|-----------|-------|------------|
| **Opção B** | `raw.valorLiquido` (campo estruturado) | Novos registros pós-implementação |
| **Opção A** | Regex no campo `obs` | Registros legados |

### Visualização expandida (▶ / ▼)

```
▼ Mirela Oliveira Santos  Freelancer  💰 Folha  25/05  24/05  7 turnos + 🚗 Transp. + 3 desc. ⏩ adto.esp.  📱 PIX  R$760  R$75  📱 R$650  ✅ Pago
  ↳ [1] Turnos individuais (verde claro #f1f8e9)
      ↳ sex., 22/05 | ☀️ Dia — dobra individual     +R$120
      ↳ dom., 24/05 | ☀️ Dia — dobra individual     +R$120
      ...
  ↳ [2] Transporte dia a dia (verde médio #e8f5e9)
      ↳ 🚗 Transporte — sex., 22/05               +R$15
      ↳ 🚗 Transporte — dom., 24/05               +R$15
      ... (só dias que a pessoa trabalhou)
  ↳ [3] Descontos de consumo (vermelho #fff8f8)
      ↳ 📉 desc. 4X OVOS                           −R$16
      ↳ 📉 desc. 1x Coca Lata                      −R$8
  ↳ [3b] Desconto Adiantamento Especial (roxo #f3e5f5)
      ↳ ⏩ adto.esp. Abatimento adto. especial – pgto sem...  −R$150
  ↳ [3c] Log de Pagamento PIX (azul royal #e3f2fd)
      ↳ 📱 pgto. 25/05/2026 | 📱 PIX — registro de pagamento  📱 R$650
  ↳ [4] Subtotal fundo verde escuro (#1b5e20)
      ☀️ Dia 22/05  +R$120  |  ☀️ Noite 22/05  +R$120  |  ...
      🚗 Transp. 22/05  +R$15  |  🚗 Transp. 24/05  +R$15  |  ...
      = Bruto  R$835
      📉 4X OVOS  −R$16  |  📉 Coca Lata  −R$8  |  📉 Gatorade  −R$11
      ⏩ Abat. adto.esp.  −R$150
      ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ (azul)
      📱 Pago em 25/05/2026  R$650
      📱 PIX Líquido  R$650
```

### Filtro de integridade do laço

Saídas com `pagamentoIdLigado` que referenciam um `pagamentoId` granular ativo **são suprimidas da lista geral** — elas já aparecem como sub-linhas dentro do grupo expandido. Isso elimina a duplicação de "Desconto Transporte" e "Desconto Adiantamento Especial" na lista de lançamentos.

---

## 🔐 Auditoria — Cobertura atual

### Funções de log disponíveis no backend

| Função | Tabela destino | Uso |
|--------|---------------|-----|
| `logColaboradorAlteracao()` | `gres-prod-colaboradores-log` | Criação e edição de colaboradores |
| `logEscalaAlteracao()` | `gres-prod-escalas-log` | Confirmação/alteração de escalas |
| `logAlteracaoGenerica(tabela)` | `gres-prod-{tabela}-log` | Saídas, folha, controle-motoboy |
| `extrairAuditoria(body, event)` | — | Helper: extrai `responsavelId/Nome/Email + userAgent` do request |

### Campos padrão em todos os logs

```json
{
  "id": "log-{tabela}-{entidadeId}-{timestamp}-{rand4}",
  "entidadeId": "...",
  "tabela": "...",
  "timestamp": "ISO 8601",
  "evento": "criado | alterado | pago | desfeito | deletado | ...",
  "valoresAntes": { ... } | null,
  "valoresDepois": { ... } | null,
  "usuarioId": "usr-xxxx",
  "usuarioNome": "Nome",
  "usuarioEmail": "email@gres.com",
  "unitId": "CNPJ 14 chars",
  "userAgent": "Mozilla...",
  "observacao": ""
}
```

### Eventos cobertos por entidade

| Entidade | Eventos auditados |
|----------|------------------|
| Colaboradores | criado, alterado, reativado, desativado, transferido, remuneracao_alterada, cargo_alterado, contrato_alterado |
| Escalas | criado, confirmado, desconfirmado, alterado, deletado |
| Folha de Pagamento | pago, desfeito, alterado, criado |
| Saídas | criado, alterado, deletado |
| Controle Motoboy | alterado (1 log por POST de mês inteiro) |
| Usuários | ❌ sem log |
| Caixa | ❌ sem log |
| Despesas | ❌ sem log |

---

## 🏃 Quick Start

### Instalar e buildar frontend
```bash
cd frontend
npm install
npm run build        # gera frontend/dist/
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
│   │   ├── pages/           # 26+ páginas do sistema
│   │   ├── components/      # Componentes React reutilizáveis
│   │   ├── services/        # API, Auth
│   │   └── utils/           # payrollImport, helpers
│   ├── dist/                # ⚠️ DEVE ser commitado (Amplify usa dist/ pré-buildado)
│   └── package.json
│
├── backend-lambda/
│   └── index.js             # Handler único — todos os endpoints em 1 arquivo (2742 linhas)
│
└── README.md
```

---

## 📝 Histórico de Mudanças Recentes

| Commit | Descrição |
|--------|-----------|
| (07/06) | **Fix permissões menu**: `freelancer-pagamento` e `motoboy-auditoria` adicionados ao `TODOS_MODULOS` em `PermissoesConfig.tsx` — módulos agora aparecem no menu para admin/gerente após re-salvar permissões |
| `5f712ef` | **fix(modal-detalhe)**: reescrita completa do modal `📋 Ver` em FreelancerPagamento — turnos com valores, transporte por dia, separação de Desconto Adto. Especial, resumo final |
| `870cf30` | **feat(freelancer-pagamento)**: colunas Líquido+Status no padrão Extrato — valor líquido em cor da forma + equação subscript bruto/desc/adto/líquido |
| `6f98916` | **fix(carregarDados)**: vars locais antes de setState + fix imports TypeScript no FreelancerPagamento |
| `c2aaba5` | **feat(folha-pagamento)**: aba Freelancers com colunas Líquido+Status no padrão Extrato (compBrutoFP/compDescFP/compAbatFP/compLiqFP) |
| `ff3bef1` | **Extrato: integridade do laço de pagamento** — suprimir lista geral, transporte dia a dia, sub-linha adto. especial |
| `fbb9b95` | **Extrato: log PIX real + EXCLUIR_DO_PIX + pagamentoIdLigado preciso** |
| `4b7a900` | **Extrato linha a linha integrado + Auditoria com usuário real** — ...auditoriaCampos() no payload folha |
| `31a1361` | **Auditoria: detecta pagamento via pagoVariavel + totalSaidasPeriodo prevalece** |
| `a272360` | **Fix regex R[$] + saidasPeriodo com filtro por colaborador** |
| `70a905d` | README reescrito com arquitetura e modelo de dados |

---

## 👤 Autor

**Eric Zoroz** — eric@zoroz.com.br  
Repositório: [github.com/zorozit/gres](https://github.com/zorozit/gres)
