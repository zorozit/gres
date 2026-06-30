# Portal do Colaborador — Backend Implementado ✅

**Data:** 2026-06-30 14:43 (GMT-3)  
**Arquivo:** `/home/work/gres/backend-lambda/index.js`  
**Deploy:** Lambda `gres-backend` atualizado com sucesso

---

## Endpoints Implementados

### Portal do Colaborador (autenticação por token portal)

| Método | Rota | Descrição | Status |
|--------|------|-----------|--------|
| POST | `/portal/login` | Login por CPF + senha (ou 4 últimos dígitos do celular no 1º acesso) | ✅ Testado |
| POST | `/portal/trocar-senha` | Troca de senha obrigatória (bcrypt hash) | ✅ Implementado |
| GET | `/portal/meus-dados` | Dados do colaborador logado + nome da unidade | ✅ Testado |
| GET | `/portal/recebimentos?meses=N` | Payslips do colaborador (default 3, max 12 meses) | ✅ Testado |
| GET | `/portal/comunicados` | Comunicados ativos filtrados por tipo/unidade | ✅ Testado |
| GET | `/portal/vagas` | Vagas abertas com nome da unidade | ✅ Testado |

### Comunicados (admin — requer token de administrador)

| Método | Rota | Descrição | Status |
|--------|------|-----------|--------|
| POST | `/comunicados` | Criar comunicado | ✅ Implementado |
| GET | `/comunicados?unitId=xxx` | Listar comunicados (filtro opcional por unidade) | ✅ Implementado |
| PUT | `/comunicados/:id` | Atualizar comunicado | ✅ Implementado |
| DELETE | `/comunicados/:id` | Excluir comunicado | ✅ Implementado |

### Helper

- `validarTokenPortal(event)` — decodifica token base64 e verifica `tipo === 'portal'`

---

## Tabela DynamoDB Criada

- **Nome:** `gres-prod-comunicados`
- **Chave:** `id` (String, HASH)
- **Billing:** PAY_PER_REQUEST
- **Região:** us-east-2

---

## Resultado do Teste de Login

```bash
curl -s -X POST https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod/portal/login \
  -H "Content-Type: application/json" \
  -d '{"cpf":"38013779890","senha":"1460"}'
```

**Resposta (200 OK):**
```json
{
  "success": true,
  "token": "eyJjb2xhYm9yYWRvcklk...",
  "primeiroAcesso": true,
  "colaborador": {
    "id": "col-6bd5c058",
    "nome": "ALAN PATRIK DE ALMEIDA FERRAZ",
    "cpf": "380.137.798-90",
    "tipoContrato": "Freelancer",
    "cargo": "Auxiliar de Cozinha",
    "unitId": "28609674000107",
    "celular": "(15) 98807-1460",
    "chavePix": "38013779890",
    "dataAdmissao": "2026-04-01T10:51:17.447328"
  }
}
```

### Testes dos demais endpoints (com token do login acima):

- **GET /portal/meus-dados** → ✅ Retornou dados completos + `nomeUnidade: "Deck73"` + `valorDia/valorNoite`
- **GET /portal/recebimentos?meses=3** → ✅ Retornou 1 payslip (período 23-28/jun)
- **GET /portal/comunicados** → ✅ Retornou array vazio (nenhum comunicado criado ainda)
- **GET /portal/vagas** → ✅ Retornou 3 vagas abertas com nomes das unidades

---

## Observações Técnicas

1. **Normalização de CPF:** O login normaliza o CPF removendo formatação (pontos/traços) para comparação, já que o banco armazena CPFs com formatação
2. **Primeiro acesso:** Detectado automaticamente quando `portalSenha` não existe. Validação feita com últimos 4 dígitos do celular. Retorna `primeiroAcesso: true`
3. **Segurança de senha:** Troca de senha armazena hash bcrypt com salt 10
4. **Admin vs Portal:** Endpoints de comunicados admin verificam que o token NÃO é do tipo `portal`
5. **bcrypt** já estava importado no topo do arquivo (`require('bcryptjs')`)
