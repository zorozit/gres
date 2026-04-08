# 📊 Scripts de Importação - GIRES

Scripts utilitários para importação de dados históricos no sistema GIRES.

---

## 📦 Script: Importar Movimentos de Caixa

### Descrição

Importa movimentos de caixa históricos de um arquivo CSV para o DynamoDB (tabela `gres-prod-caixa`).

### Pré-requisitos

1. **Node.js** instalado (v18+)
2. **AWS CLI** configurado com credenciais válidas
3. Permissões DynamoDB: `PutItem` na tabela `gres-prod-caixa`

### Instalação

```bash
cd scripts
npm install
```

### Uso

#### 1. Preparar o CSV

Crie um arquivo CSV com as colunas:

```csv
data,diaSemana,periodo,abertura,maq1,maq2,maq3,maq4,maq5,maq6,maq7,ifood,dinheiro,pix,fiado,total,sangria,sistema,diferenca,conferencia
07/04/2026,3,Dia,36.55,59.00,213.00,816.80,,,,,113.00,27.00,,,1228.80,100.00,1228.80,0.00,Bruna
```

**Formato de dados:**
- `data`: DD/MM/YYYY
- `diaSemana`: 1-7 (1=Segunda, 7=Domingo)
- `periodo`: `Dia` ou `Noite`
- Valores monetários: usar ponto como separador decimal (ex: `1234.56`)
- Valores vazios: deixar vazio ou colocar vírgula sem valor

#### 2. Testar (Dry-Run)

```bash
node importar-caixa-porta.js \
  --unitId=12345678901234 \
  --csv=movimentos-caixa-porta.csv \
  --dry-run
```

#### 3. Importar de Verdade

```bash
node importar-caixa-porta.js \
  --unitId=12345678901234 \
  --csv=movimentos-caixa-porta.csv
```

### Parâmetros

| Parâmetro | Obrigatório | Descrição | Exemplo |
|-----------|-------------|-----------|---------|
| `--unitId` | ✅ | CNPJ da unidade (14 dígitos) | `--unitId=12345678901234` |
| `--csv` | ❌ | Arquivo CSV (padrão: `movimentos-caixa-porta.csv`) | `--csv=dados.csv` |
| `--dry-run` | ❌ | Modo teste (não grava no DynamoDB) | `--dry-run` |

### Estrutura dos Dados

Cada movimento de caixa contém:

**Identificação:**
- `id`: ID único gerado (formato: `caixa-{timestamp}-{random}`)
- `unitId`: CNPJ da unidade
- `data`: Data do movimento (ISO format)
- `diaSemana`: Dia da semana (1-7)
- `periodo`: `Dia` ou `Noite`

**Valores de Recebimento:**
- `abertura`: Valor de abertura do caixa
- `maq1` a `maq7`: Valores recebidos em cada máquina de cartão
- `ifood`: Recebimentos via iFood
- `dinheiro`: Pagamentos em dinheiro
- `pix`: Pagamentos via PIX
- `fiado`: Valores fiados (a receber)

**Totais e Conferência:**
- `total`: Total de recebimentos
- `sangria`: Valor retirado do caixa
- `sistema`: Valor esperado pelo sistema
- `diferenca`: Diferença entre total e sistema
- `responsavel`: Nome do responsável pela conferência
- `status`: `fechado` (fixo na importação)

### Exemplo de Saída

```
╔══════════════════════════════════════════════════════════════╗
║  IMPORTAÇÃO DE MOVIMENTOS DE CAIXA - RESTAURANTE PORTA      ║
╚══════════════════════════════════════════════════════════════╝

📂 Lendo arquivo: movimentos-caixa-porta.csv
📊 Total de movimentos: 20
🏢 Unit ID: 12345678901234

✓ 07/04/2026 Dia - R$ 1228.80
✓ 05/04/2026 Noite - R$ 2211.44
✓ 05/04/2026 Dia - R$ 13880.91
...

╔══════════════════════════════════════════════════════════════╗
║  RESUMO DA IMPORTAÇÃO
║  ✅ Sucessos: 20
║  ❌ Erros: 0
║  📊 Total: 20
╚══════════════════════════════════════════════════════════════╝
```

### Troubleshooting

#### Erro: `Cannot find module 'aws-sdk'`
```bash
cd scripts
npm install
```

#### Erro: `Arquivo CSV não encontrado`
Verifique se o arquivo CSV está no diretório `scripts/` ou forneça o caminho completo:
```bash
node importar-caixa-porta.js --csv=/caminho/completo/dados.csv --unitId=...
```

#### Erro: `AccessDeniedException`
Configure suas credenciais AWS:
```bash
aws configure
```

### 🔐 Segurança

- ⚠️ **Nunca commitar** arquivos CSV com dados sensíveis no Git
- ✅ Adicione `*.csv` no `.gitignore`
- ✅ Use credenciais AWS com permissões mínimas necessárias

---

## 📝 Notas

- O script aguarda 100ms entre cada importação para evitar throttling do DynamoDB
- Registros com mesmo `unitId`, `data` e `periodo` serão sobrescritos
- Todos os valores monetários são convertidos para float com 2 casas decimais
- Timestamps (`createdAt`, `updatedAt`) são gerados automaticamente

---

## 🆘 Suporte

Para problemas ou dúvidas, verifique:
1. Logs do CloudWatch (tabela DynamoDB)
2. Permissões IAM do usuário AWS
3. Formato do arquivo CSV

