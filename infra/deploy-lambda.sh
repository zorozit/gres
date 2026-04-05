#!/bin/bash
# ══════════════════════════════════════════════════════════════
#  GRES — Deploy do backend-lambda para AWS Lambda
#  Execute este script no seu terminal local OU no AWS CloudShell
#
#  Uso:
#    bash infra/deploy-lambda.sh
#
#  Pré-requisitos:
#    - AWS CLI configurado (aws configure) com permissões Lambda
#    - zip instalado (apt install zip  /  brew install zip)
# ══════════════════════════════════════════════════════════════

set -e

# ── Configurações ─────────────────────────────────────────────
REGION="us-east-2"
API_ID="2blzw4pn7b"
LAMBDA_DIR="backend-lambda"
ZIP_FILE="/tmp/gres-lambda.zip"

# Cor para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}══════════════════════════════════════════${NC}"
echo -e "${YELLOW}  GRES — Deploy Lambda  (região: $REGION)  ${NC}"
echo -e "${YELLOW}══════════════════════════════════════════${NC}"

# ── 1. Verifica AWS CLI ───────────────────────────────────────
if ! command -v aws &> /dev/null; then
  echo -e "${RED}✗ AWS CLI não encontrado. Instale: https://aws.amazon.com/cli/${NC}"
  exit 1
fi

if ! aws sts get-caller-identity --region "$REGION" &> /dev/null; then
  echo -e "${RED}✗ Credenciais AWS inválidas ou não configuradas.${NC}"
  echo "  Execute: aws configure"
  exit 1
fi

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
echo -e "${GREEN}✓ AWS CLI OK — conta: $ACCOUNT — região: $REGION${NC}"

# ── 2. Descobre o nome da função Lambda pelo API Gateway ──────
echo ""
echo "▶ Descobrindo nome da função Lambda..."

FUNCTION_NAME=$(aws apigateway get-integration \
  --rest-api-id "$API_ID" \
  --resource-id "$(aws apigateway get-resources \
      --rest-api-id "$API_ID" \
      --region "$REGION" \
      --query 'items[?path==`/`].id' \
      --output text)" \
  --http-method GET \
  --region "$REGION" \
  --query 'uri' \
  --output text 2>/dev/null \
  | grep -oP 'function:[^/]+' | sed 's/function://' || true)

# Fallback: listar funções e pegar a que tem "gres" no nome
if [ -z "$FUNCTION_NAME" ]; then
  echo "  (busca pelo API Gateway falhou, procurando por nome...)"
  FUNCTION_NAME=$(aws lambda list-functions \
    --region "$REGION" \
    --query 'Functions[?contains(FunctionName,`gres`)].FunctionName' \
    --output text 2>/dev/null | awk '{print $1}')
fi

if [ -z "$FUNCTION_NAME" ]; then
  echo -e "${RED}✗ Não foi possível descobrir o nome da função Lambda.${NC}"
  echo ""
  echo "  Liste suas funções manualmente:"
  echo "    aws lambda list-functions --region $REGION --query 'Functions[*].FunctionName' --output table"
  echo ""
  echo "  Depois execute o deploy diretamente:"
  echo "    FUNCTION_NAME=<nome-da-funcao> bash infra/deploy-lambda.sh"
  # Tenta usar variável de ambiente se definida
  if [ -n "$FUNCTION_NAME_OVERRIDE" ]; then
    FUNCTION_NAME="$FUNCTION_NAME_OVERRIDE"
    echo -e "${YELLOW}  Usando FUNCTION_NAME_OVERRIDE: $FUNCTION_NAME${NC}"
  else
    exit 1
  fi
fi

echo -e "${GREEN}✓ Função encontrada: ${FUNCTION_NAME}${NC}"

# ── 3. Cria o ZIP ─────────────────────────────────────────────
echo ""
echo "▶ Empacotando $LAMBDA_DIR → $ZIP_FILE ..."

if [ ! -f "$LAMBDA_DIR/index.js" ]; then
  echo -e "${RED}✗ Arquivo $LAMBDA_DIR/index.js não encontrado.${NC}"
  echo "  Execute este script a partir da raiz do repositório (pasta gres/)."
  exit 1
fi

# Instala dependências de produção antes de empacotar
(cd "$LAMBDA_DIR" && npm install --omit=dev --silent 2>/dev/null || npm install --production --silent 2>/dev/null)

rm -f "$ZIP_FILE"
(cd "$LAMBDA_DIR" && zip -r "$ZIP_FILE" . -x "*.git*" -x "*test*" -x "*.md" > /dev/null)

SIZE=$(du -sh "$ZIP_FILE" | cut -f1)
echo -e "${GREEN}✓ ZIP criado: $ZIP_FILE ($SIZE)${NC}"

# ── 4. Faz upload do código ───────────────────────────────────
echo ""
echo "▶ Fazendo deploy para Lambda: $FUNCTION_NAME ..."

aws lambda update-function-code \
  --function-name "$FUNCTION_NAME" \
  --zip-file "fileb://$ZIP_FILE" \
  --region "$REGION" \
  --query '[FunctionName, CodeSize, LastModified]' \
  --output table

echo -e "${GREEN}✓ Deploy concluído!${NC}"

# ── 5. Aguarda propagação e testa ────────────────────────────
echo ""
echo "▶ Aguardando propagação (10s)..."
sleep 10

echo ""
echo "▶ Testando endpoint /colaboradores ..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://${API_ID}.execute-api.${REGION}.amazonaws.com/prod/colaboradores" \
  -H "Content-Type: application/json" 2>/dev/null || echo "ERR")

if [ "$STATUS" = "200" ] || [ "$STATUS" = "401" ] || [ "$STATUS" = "403" ]; then
  echo -e "${GREEN}✓ API respondendo (HTTP $STATUS) — deploy bem-sucedido!${NC}"
else
  echo -e "${YELLOW}⚠ API retornou HTTP $STATUS — verifique os logs no CloudWatch.${NC}"
fi

echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Deploy finalizado!                       ${NC}"
echo -e "${GREEN}  Função : $FUNCTION_NAME                  ${NC}"
echo -e "${GREEN}  Região : $REGION                         ${NC}"
echo -e "${GREEN}  API    : https://${API_ID}.execute-api.${REGION}.amazonaws.com/prod ${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
