# Dashboard - Conceito Correto

## Objetivo
Mostrar **% de custo sobre faturamento** (não resultado absoluto)

## Métricas Principais

### 1. Visão Mensal Consolidada
- **Faturamento Total** (soma caixa do mês)
- **Custo CLT Total** (% sobre faturamento)
- **Custo Freelancer Total** (% sobre faturamento)
- **Custo Total** (% sobre faturamento)

### 2. Visão Semanal
- Mesmas métricas por semana
- Gráfico de barras mostrando %

### 3. Visão por Função
- % de custo CLT por função (Cozinheiro, Garçom, etc.)
- % de custo Freelancer por função
- Ranking de funções por impacto no custo

## Exemplo de Cálculo

```
Faturamento Semanal: R$ 80.489,26
Custo CLT: R$ 23.936,32
Custo Freelancer: R$ 2.445,00

% CLT = (23.936,32 / 80.489,26) * 100 = 29,7%
% Freelancer = (2.445,00 / 80.489,26) * 100 = 3,0%
% Custo Total = 32,7%
```

## Estrutura de Dados

### Por Função (exemplo):
```
Cozinheiro CLT: R$ 12.000 (15% do faturamento)
Cozinheiro Free: R$ 1.200 (1,5% do faturamento)
Garçom CLT: R$ 8.000 (10% do faturamento)
Garçom Free: R$ 800 (1% do faturamento)
...
```
