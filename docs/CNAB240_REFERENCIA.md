# CNAB 240 — Referência para Futuras Implementações

## Contexto
Eric enviou 11 arquivos CNAB 240 Bradesco (remessa) gerados pelo ERP de folha.
São arquivos de pagamento de diferentes tipos de movimentos.
**NÃO implementar agora** — apenas para conhecimento e preparação da arquitetura.

## Formato
- **Padrão**: CNAB 240 posicional (FEBRABAN)
- **Banco**: 237 (Bradesco)
- **Empresa**: Solucoes Servicos Terceirizado (CNPJ 09445502000109)
- **Conta**: Ag 0097, CC 3095258
- **Encoding**: Latin-1

## Estrutura
- Registro tipo 0: Header de arquivo
- Registro tipo 1: Header de lote (tipo serviço + forma de lançamento)
- Registro tipo 3: Detalhe (Segmento A = dados pgto, Segmento B = CPF)
- Registro tipo 5: Trailer de lote (totais)
- Registro tipo 9: Trailer de arquivo

## Campos relevantes do Segmento A (tipo 3)
| Posição | Campo |
|---------|-------|
| 1-3 | Código banco (237) |
| 8 | Tipo registro (3) |
| 14 | Segmento (A) |
| 44-73 | Nome favorecido |
| 94-101 | Data pagamento (DDMMAAAA) |
| 120-134 | Valor (15 dígitos, 2 decimais implícitos) |

## Arquivos Analisados (Jul/2026)
| Arquivo | Regs | Total R$ | Tipo provável |
|---------|------|----------|---------------|
| FP29077 | 812 | 160.032,40 | Crédito Diversos (adiantamentos) |
| FP300719 | 372 | 95.883,16 | Salários |
| FP300715 | 52 | 6.238,78 | Salários (parcial) |
| FP300723 | 22 | 5.154,98 | Salários |
| FP300721 | 27 | 3.935,00 | Salários |
| FP30077 | 18 | 3.374,60 | Salários |
| FP30072 | 1 | 2.387,47 | Salário individual |
| FP300716 | 1 | 979,80 | Salário individual |
| FP30079 | 4 | 761,68 | Salários |
| FP310710 | 1 | 501,40 | Diversos |
| FP30071 | 1 | 437,98 | Salário individual |

## Futuras Evoluções
1. **Geração de CNAB 240** a partir dos payslips do GRES → remessa pro banco
2. **Importação de retorno** CNAB → marcar payslips como confirmados pelo banco
3. **Tipos de movimento**: salário, VT, VA, VR, 13º, férias, adiantamento, rescisão
4. **Conciliação automática**: retorno bancário × payslips gerados

## Codificação do nome do arquivo
`FP` + `TipoServiço(2d)` + `TipoMovimento(restante)` + `.TXT`
- 29 = Crédito Diversos
- 30 = Pagamento Salários  
- 31 = Diversos
