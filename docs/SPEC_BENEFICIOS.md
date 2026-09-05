# SPEC: Módulo de Benefícios — Separação de Transporte

**Data:** 2026-09-05
**Status:** Em análise — pendente aprovação do Eric

---

## 1. Diagnóstico da Situação Atual

### 1.1 Como o transporte funciona hoje

O campo `valorTransporte` no cadastro do colaborador armazena o **valor diário combinado** de transporte:

| Colaborador | Tipo | valorTransporte | Uso Real |
|---|---|---|---|
| Bruna Francisco | CLT | R$ 17,31 | Benefício mensal (~R$ 450/mês) |
| Marcela Vieira | CLT | R$ 17,31 | Benefício mensal (~R$ 450/mês) |
| Thiago Augusto | CLT | R$ 25,00 | Benefício mensal (~R$ 450/mês) |
| Sergio da Silva | CLT | R$ 25,00 | Benefício mensal (~R$ 450/mês) |
| Thais Nicoline | CLT | R$ 23,00 | Benefício mensal (~R$ 600/mês) |
| Helen Gabriele | Freelancer | R$ 30,00 | Por dia trabalhado |
| Clayton (moto) | Freelancer | R$ 5,00 | Esporádico |

### 1.2 Fluxo atual de pagamento de transporte

```
1. Eric registra "Adiantamento Transporte" no módulo Adiantamentos
   → Cria saída tipo "Adiantamento Transporte" na tabela gres-prod-saidas
   → Aparece como contrato no módulo Adiantamentos

2. Colaborador trabalha N dias no mês

3. No pagamento semanal (Freelancer ou Dobras CLT):
   → Sistema calcula: N dias × valorTransporte
   → Se tem adiantamento em aberto: gera "Desconto Transporte" por dia
   → Se não tem: soma transporte ao pagamento

4. No holerite CLT (contabilidade):
   → Desc. VT 6% sobre salário base (Cód. 109) — desconto legal
```

### 1.3 Problemas identificados

| # | Problema | Impacto |
|---|---|---|
| P1 | "Adiantamento Transporte" misturado com "Adiantamento Especial" no módulo Adiantamentos | Confusão visual — empréstimo pessoal (cartão de crédito) aparece junto com benefício recorrente |
| P2 | O valor mensal (R$ 450, R$ 600) é registrado manualmente todo mês como "Adiantamento Transporte" | Trabalho repetitivo, risco de esquecer |
| P3 | O `valorTransporte` no cadastro (R$ 17,31/dia, R$ 25/dia) NÃO é usado pra calcular o benefício mensal — serve só pro consumo diário | Desconexão: o benefício mensal (R$ 450) não tem relação direta com dias × valor |
| P4 | Motoboy recebe adiantamento esporádico de transporte — é um empréstimo, não benefício | Tratado igual ao benefício CLT |
| P5 | Desc. VT 6% do holerite é uma coisa, benefício transporte do restaurante é outra | Misturados conceitualmente |
| P6 | Quando o pagamento de dobras gera "Desconto Transporte", nem sempre vincula ao `adiantamentoId` | Saldo do contrato fica em aberto indevidamente (corrigido hoje) |

---

## 2. Regras de Negócio Mapeadas

### 2.1 Transporte CLT (Bruna, Marcela, Thiago, Sergio, Thais)

- **Benefício mensal fixo**: R$ 450 ou R$ 600, pago no início do mês
- **Consumo**: cada dia trabalhado consome `valorTransporte` diário
- **Saldo**: se trabalhou menos dias, sobra; se trabalhou mais, falta
- **Desconto legal**: 6% do salário base no holerite (separado, contabilidade)
- **Periodicidade**: todo mês, recorrente

### 2.2 Transporte Freelancer (não-motoboy)

- **Não é benefício**: transporte é somado ao pagamento semanal
- **Cálculo**: dias trabalhados × valorTransporte diário
- **Se teve adiantamento**: desconta do adiantamento
- **Se não teve**: recebe junto com as diárias

### 2.3 Transporte Motoboy

- **Adiantamento esporádico**: quando solicita, recebe
- **Compensação**: descontado do variável (entregas)
- **Não é benefício recorrente**

### 2.4 Adiantamento Especial

- **Empréstimo pontual**: cartão de crédito, emergência, etc.
- **Parcelamento**: pode ser parcelado ou quitado de uma vez
- **Desconto**: manual ou via checkbox no pagamento semanal
- **Não tem nada a ver com transporte**

---

## 3. Proposta de Implementação

### 3.1 Novos campos no cadastro do colaborador

```
beneficioTransporte: {
  tipo: 'mensal_fixo' | 'por_dia' | 'nenhum',   // default: 'nenhum'
  valorMensal: number,                             // ex: 450, 600 (pra tipo mensal_fixo)
  valorDiario: number,                             // ex: 17.31, 25 (pra tipo por_dia)
  diaCredito: number,                              // dia do mês que credita (default: 1)
}
```

> **IMPORTANTE**: O campo `valorTransporte` existente NÃO será removido nem alterado.
> Ele continua funcionando como está pro cálculo de consumo diário.
> Os novos campos são **adicionais**.

### 3.2 Nova tabela: `gres-prod-beneficios`

```
{
  id: "benef-{colaboradorId}-{YYYY-MM}",     // chave primária
  colaboradorId: string,
  unitId: string,
  mes: "YYYY-MM",
  tipo: "transporte",
  valorCreditado: number,                     // R$ 450 (benefício do mês)
  valorConsumido: number,                     // calculado: dias trabalhados × valorDiario
  diasConsumidos: number,                     // quantos dias consumiu
  saldo: number,                              // creditado - consumido
  dataCreditado: "YYYY-MM-DD",               // quando foi creditado
  status: "ativo" | "zerado" | "excedido",
  createdAt: string,
  updatedAt: string,
}
```

> **NÃO sobrescreve** nenhum registro em `gres-prod-saidas` ou `gres-prod-folha-pagamento`.
> É uma tabela nova, independente.

### 3.3 Migração dos dados existentes

**PRINCÍPIO: ZERO alteração em registros existentes.**

Os "Adiantamento Transporte" e "Desconto Transporte" que já existem na tabela `saidas`
permanecem intocados. O módulo de Adiantamentos continua mostrando o histórico legado.

A migração é **apenas de configuração**:
1. Preencher `beneficioTransporte` no cadastro dos CLTs que recebem benefício
2. A partir do mês seguinte, o novo fluxo entra em vigor
3. O histórico antigo fica no módulo Adiantamentos como referência

### 3.4 Novo módulo "Benefícios" (frontend)

**Rota**: `/modulos/beneficios`

**Funcionalidades:**
1. **Visão mensal**: tabela com todos os colaboradores, crédito, consumo, saldo
2. **Crédito automático**: botão "Creditar mês" gera os registros na tabela beneficios
3. **Consumo automático**: baseado nos dias de presença na escala
4. **Relatório**: exportar PDF/Excel com movimentação mensal

**Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│ 🎁 Benefícios — Agosto 2026                    [Creditar] │
├───────────┬──────────┬──────────┬───────┬──────┬───────────┤
│ Colaborador│ Tipo     │ Crédito  │ Consumo│ Dias │ Saldo    │
├───────────┼──────────┼──────────┼───────┼──────┼───────────┤
│ Bruna F.  │ Mensal   │ R$ 450   │ R$ 311│ 18   │ R$ 139   │
│ Marcela V.│ Mensal   │ R$ 450   │ R$ 346│ 20   │ R$ 104   │
│ Thiago A. │ Mensal   │ R$ 450   │ R$ 400│ 16   │ R$ 50    │
│ Sergio F. │ Mensal   │ R$ 450   │ R$ 300│ 12   │ R$ 150   │
│ Thais N.  │ Mensal   │ R$ 600   │ R$ 506│ 22   │ R$ 94    │
└───────────┴──────────┴──────────┴───────┴──────┴───────────┘
```

### 3.5 Impacto nos módulos existentes

| Módulo | Mudança | Risco |
|---|---|---|
| **Cadastro Colaborador** | Adicionar campos `beneficioTransporte` | ZERO risco — campos novos, opcionais |
| **Adiantamentos** | Filtrar: não mostrar contratos que migraram pra Benefícios | Baixo risco — só visual |
| **Folha CLT (Dia 5)** | Se tem benefício configurado, mostrar saldo do benefício em vez de "Adto Transporte" | Médio — precisa verificar se não duplica |
| **Dobras CLT/Freelancer** | Se tem benefício configurado, consumo vai pro módulo Benefícios em vez de gerar "Desconto Transporte" | Médio — precisa rota clara |
| **Dashboard** | Incluir custo de benefícios no cálculo | Baixo |
| **Saídas** | Sem mudança | ZERO |
| **Backend Lambda** | Novo endpoint CRUD benefícios + cálculo automático de consumo | Novo código, não toca no existente |

### 3.6 Fluxo novo (pós-implementação)

```
CONFIGURAÇÃO (uma vez):
  Cadastro do colaborador → beneficioTransporte.tipo = 'mensal_fixo'
                          → beneficioTransporte.valorMensal = 450
                          → beneficioTransporte.valorDiario = 17.31

MENSAL:
  1. Dia 1 (ou dia configurado):
     → Sistema credita R$ 450 no módulo Benefícios
     → Cria registro benef-col-xxx-2026-09

  2. Cada dia trabalhado:
     → Consumo é calculado automaticamente (presença na escala)
     → Atualiza valorConsumido e diasConsumidos

  3. No pagamento semanal (Dobras CLT):
     → Transporte NÃO gera mais "Desconto Transporte" na tabela saidas
     → Consumo é registrado na tabela beneficios
     → Saldo é mostrado no checkout

  4. No Dia 5 (Fechamento CLT):
     → Saldo do benefício aparece como informativo
     → Se sobrou: nada (crédito pro próximo mês ou ajuste manual)
     → Se faltou: diferença pode ser descontada ou não (decisão do Eric)

SEPARADO:
  5. Holerite contabilidade:
     → VT 6% continua como está — separado, desconto legal
```

---

## 4. Backend — Endpoints Novos

### 4.1 CRUD Benefícios

```
GET    /beneficios?unitId=X&mes=YYYY-MM          → lista benefícios do mês
GET    /beneficios?unitId=X&colaboradorId=Y       → histórico do colaborador
POST   /beneficios/creditar                        → creditar benefício do mês
PUT    /beneficios/{id}                            → ajustar manualmente
DELETE /beneficios/{id}                            → remover (admin)
```

### 4.2 Lógica de crédito

```javascript
// POST /beneficios/creditar
// Body: { unitId, mes, colaboradorIds? }

1. Buscar colaboradores com beneficioTransporte.tipo !== 'nenhum'
2. Para cada um:
   a. Verificar se já existe registro benef-{colId}-{mes}
   b. Se existe: skip (não duplicar)
   c. Se não: criar com valorCreditado = beneficioTransporte.valorMensal
3. Retornar lista de créditos gerados
```

### 4.3 Lógica de consumo

```javascript
// Chamado automaticamente no pagamento semanal (batch)
// Ou via POST /beneficios/recalcular

1. Buscar escalas do mês para o colaborador
2. Contar dias com presença
3. Calcular: consumido = diasPresentes × beneficioTransporte.valorDiario
4. Atualizar registro: valorConsumido, diasConsumidos, saldo
```

---

## 5. Pontos de Atenção

### 5.1 Transição (mês de cutover)

- Setembro 2026: contratos de "Adiantamento Transporte" existentes continuam no módulo Adiantamentos
- Outubro 2026 (ou quando Eric decidir): novo módulo entra em vigor
- Histórico antigo permanece consultável

### 5.2 Freelancers com transporte

- **Não usam benefício mensal** — transporte continua sendo pago por dia
- O fluxo atual (soma ao pagamento semanal) NÃO muda
- Exceção: se Eric quiser dar benefício mensal a algum freelancer, é só configurar

### 5.3 Motoboys

- **Não usam benefício** — adiantamento esporádico continua no módulo Adiantamentos
- Zero mudança

### 5.4 Garantia de não-sobrescrita

- Tabela `gres-prod-saidas`: **ZERO writes**
- Tabela `gres-prod-folha-pagamento`: **ZERO writes**
- Tabela `gres-prod-colaboradores`: **apenas ADD** de campos novos (beneficioTransporte)
- Tabela `gres-prod-beneficios`: **NOVA**, não existe hoje
- Módulo Adiantamentos: **apenas filtra** visualmente, não altera dados

---

## 6. Checklist de Implementação

- [ ] Criar tabela `gres-prod-beneficios` no DynamoDB
- [ ] Adicionar campos `beneficioTransporte` no backend (CRUD colaboradores)
- [ ] Criar endpoints CRUD benefícios no Lambda
- [ ] Criar página Benefícios no frontend
- [ ] Adicionar campos no formulário de cadastro do colaborador
- [ ] Ajustar pagamento de Dobras CLT: se tem benefício, consumir do módulo
- [ ] Ajustar pagamento Freelancer: manter como está (sem benefício)
- [ ] Ajustar Dia 5 (Fechamento): mostrar saldo do benefício
- [ ] Filtrar contratos de transporte migrados no módulo Adiantamentos
- [ ] Testes: simular mês completo com dados reais
- [ ] Migração: configurar beneficioTransporte nos CLTs existentes
