#!/bin/bash

###############################################################################
# Script Unificado de Setup - AWS CloudShell para GRES
# Gestão de Restaurantes
# 
# Este script configura TUDO em um único comando:
# - Cognito (autenticação)
# - DynamoDB (banco de dados)
# - IAM Role para Lambda
# - S3 (armazenamento)
# - CloudWatch (logs)
#
# Tempo estimado: 5-10 minutos
# Custo estimado: $10-15/mês
###############################################################################

set -e

# ============================================================================
# CORES E FORMATAÇÃO
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ============================================================================
# CONFIGURAÇÕES
# ============================================================================

PROJECT_NAME="gres"
ENVIRONMENT="prod"
REGION="us-east-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Nomes dos recursos
USER_POOL_NAME="${PROJECT_NAME}-${ENVIRONMENT}"
DYNAMODB_PREFIX="${PROJECT_NAME}-${ENVIRONMENT}"
LAMBDA_ROLE_NAME="${PROJECT_NAME}-lambda-role"
S3_BUCKET_NAME="${PROJECT_NAME}-${ENVIRONMENT}-uploads"

# ============================================================================
# FUNÇÕES AUXILIARES
# ============================================================================

print_header() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC} $1"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_step() {
    echo -e "${CYAN}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# ============================================================================
# VERIFICAÇÕES INICIAIS
# ============================================================================

print_header "VERIFICAÇÕES INICIAIS"

print_step "Verificando AWS CLI..."
if ! command -v aws &> /dev/null; then
    print_error "AWS CLI não está instalado"
    exit 1
fi
print_success "AWS CLI encontrado"

print_step "Verificando credenciais AWS..."
if ! aws sts get-caller-identity --region $REGION > /dev/null 2>&1; then
    print_error "Credenciais AWS não configuradas"
    exit 1
fi
print_success "Credenciais AWS válidas"

print_info "Região: $REGION"
print_info "Account ID: $ACCOUNT_ID"
print_info "Projeto: $PROJECT_NAME"

# ============================================================================
# 1. CONFIGURAR COGNITO
# ============================================================================

print_header "FASE 1: CONFIGURAR COGNITO"

print_step "Criando User Pool..."

USER_POOL_JSON=$(cat <<'EOF'
{
  "PoolName": "POOL_NAME_PLACEHOLDER",
  "Policies": {
    "PasswordPolicy": {
      "MinimumLength": 12,
      "RequireUppercase": true,
      "RequireLowercase": true,
      "RequireNumbers": true,
      "RequireSymbols": true
    }
  },
  "Schema": [
    {
      "Name": "email",
      "AttributeDataType": "String",
      "Mutable": true,
      "Required": true
    },
    {
      "Name": "name",
      "AttributeDataType": "String",
      "Mutable": true,
      "Required": true
    },
    {
      "Name": "unidade_id",
      "AttributeDataType": "String",
      "Mutable": true
    },
    {
      "Name": "perfil",
      "AttributeDataType": "String",
      "Mutable": true
    }
  ],
  "MfaConfiguration": "OPTIONAL",
  "EmailConfiguration": {
    "EmailSendingAccount": "COGNITO_DEFAULT"
  }
}
EOF
)

USER_POOL_JSON="${USER_POOL_JSON//POOL_NAME_PLACEHOLDER/$USER_POOL_NAME}"

USER_POOL_ID=$(aws cognito-idp create-user-pool \
  --region $REGION \
  --cli-input-json "$USER_POOL_JSON" \
  --query 'UserPool.Id' \
  --output text 2>/dev/null || \
  aws cognito-idp list-user-pools \
    --region $REGION \
    --max-results 10 \
    --query "UserPools[?Name=='${USER_POOL_NAME}'].Id" \
    --output text)

if [ -z "$USER_POOL_ID" ]; then
    print_error "Erro ao criar User Pool"
    exit 1
fi
print_success "User Pool criado: $USER_POOL_ID"

print_step "Criando grupos de acesso..."

GRUPOS=("admin" "socio-operador" "operacao" "caixa")
for GRUPO in "${GRUPOS[@]}"; do
    aws cognito-idp create-group \
      --user-pool-id $USER_POOL_ID \
      --group-name "$GRUPO" \
      --description "Grupo $GRUPO" \
      --region $REGION 2>/dev/null || true
done
print_success "Grupos criados"

print_step "Criando App Client..."

APP_CLIENT_ID=$(aws cognito-idp create-user-pool-client \
  --user-pool-id $USER_POOL_ID \
  --region $REGION \
  --client-name "${PROJECT_NAME}-app-client" \
  --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH \
  --query 'UserPoolClient.ClientId' \
  --output text 2>/dev/null || echo "")

if [ -z "$APP_CLIENT_ID" ]; then
    print_error "Erro ao criar App Client"
    exit 1
fi
print_success "App Client criado: $APP_CLIENT_ID"

print_step "Criando usuário de teste..."

TEST_EMAIL="admin@gres.com"
TEST_PASSWORD="GresAdmin123!@#"

aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username $TEST_EMAIL \
  --user-attributes Name=email,Value=$TEST_EMAIL Name=name,Value="Administrador GRES" \
  --message-action SUPPRESS \
  --region $REGION 2>/dev/null || true

aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username $TEST_EMAIL \
  --password "$TEST_PASSWORD" \
  --permanent \
  --region $REGION 2>/dev/null || true

aws cognito-idp admin-add-user-to-group \
  --user-pool-id $USER_POOL_ID \
  --username $TEST_EMAIL \
  --group-name "admin" \
  --region $REGION 2>/dev/null || true

print_success "Usuário de teste criado"

# ============================================================================
# 2. CONFIGURAR DYNAMODB
# ============================================================================

print_header "FASE 2: CONFIGURAR DYNAMODB"

create_dynamodb_table() {
    local TABLE_NAME=$1
    local PARTITION_KEY=$2
    local SORT_KEY=$3
    
    print_step "Criando tabela: $TABLE_NAME"
    
    if [ -z "$SORT_KEY" ]; then
        aws dynamodb create-table \
          --table-name $TABLE_NAME \
          --attribute-definitions AttributeName=$PARTITION_KEY,AttributeType=S \
          --key-schema AttributeName=$PARTITION_KEY,KeyType=HASH \
          --billing-mode PAY_PER_REQUEST \
          --region $REGION 2>/dev/null || true
    else
        aws dynamodb create-table \
          --table-name $TABLE_NAME \
          --attribute-definitions \
            AttributeName=$PARTITION_KEY,AttributeType=S \
            AttributeName=$SORT_KEY,AttributeType=S \
          --key-schema \
            AttributeName=$PARTITION_KEY,KeyType=HASH \
            AttributeName=$SORT_KEY,KeyType=RANGE \
          --billing-mode PAY_PER_REQUEST \
          --region $REGION 2>/dev/null || true
    fi
    
    print_success "$TABLE_NAME criada"
}

# Criar tabelas
create_dynamodb_table "${DYNAMODB_PREFIX}-unidades" "id" ""
create_dynamodb_table "${DYNAMODB_PREFIX}-usuarios" "id" ""
create_dynamodb_table "${DYNAMODB_PREFIX}-colaboradores" "id" ""
create_dynamodb_table "${DYNAMODB_PREFIX}-escalas" "colaborador_id" "data"
create_dynamodb_table "${DYNAMODB_PREFIX}-caixa" "unidade_id" "data"
create_dynamodb_table "${DYNAMODB_PREFIX}-saidas" "id" ""
create_dynamodb_table "${DYNAMODB_PREFIX}-motoboys" "id" ""

print_success "Todas as tabelas DynamoDB criadas"

# ============================================================================
# 3. CONFIGURAR IAM ROLE PARA LAMBDA
# ============================================================================

print_header "FASE 3: CONFIGURAR IAM ROLE PARA LAMBDA"

print_step "Criando IAM Role..."

TRUST_POLICY='{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}'

LAMBDA_ROLE_ARN=$(aws iam create-role \
  --role-name $LAMBDA_ROLE_NAME \
  --assume-role-policy-document "$TRUST_POLICY" \
  --region $REGION \
  --query 'Role.Arn' \
  --output text 2>/dev/null || \
  aws iam get-role \
    --role-name $LAMBDA_ROLE_NAME \
    --query 'Role.Arn' \
    --output text)

print_success "IAM Role criado: $LAMBDA_ROLE_ARN"

print_step "Anexando políticas..."

DYNAMODB_POLICY='{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": "arn:aws:dynamodb:'$REGION':'$ACCOUNT_ID':table/'$DYNAMODB_PREFIX'-*"
    }
  ]
}'

aws iam put-role-policy \
  --role-name $LAMBDA_ROLE_NAME \
  --policy-name dynamodb-policy \
  --policy-document "$DYNAMODB_POLICY" \
  --region $REGION 2>/dev/null || true

aws iam attach-role-policy \
  --role-name $LAMBDA_ROLE_NAME \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole \
  --region $REGION 2>/dev/null || true

print_success "Políticas anexadas"

# ============================================================================
# 4. CONFIGURAR S3
# ============================================================================

print_header "FASE 4: CONFIGURAR S3"

print_step "Criando bucket S3..."

aws s3api create-bucket \
  --bucket $S3_BUCKET_NAME \
  --region $REGION \
  --create-bucket-configuration LocationConstraint=$REGION 2>/dev/null || true

print_success "Bucket S3 criado: $S3_BUCKET_NAME"

print_step "Configurando bucket..."

aws s3api put-public-access-block \
  --bucket $S3_BUCKET_NAME \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
  --region $REGION 2>/dev/null || true

aws s3api put-bucket-versioning \
  --bucket $S3_BUCKET_NAME \
  --versioning-configuration Status=Enabled \
  --region $REGION 2>/dev/null || true

aws s3api put-bucket-encryption \
  --bucket $S3_BUCKET_NAME \
  --server-side-encryption-configuration '{
    "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]
  }' \
  --region $REGION 2>/dev/null || true

print_success "Bucket S3 configurado"

# ============================================================================
# 5. SALVAR CONFIGURAÇÕES
# ============================================================================

print_header "FASE 5: SALVANDO CONFIGURAÇÕES"

CONFIG_FILE="gres-setup-config.json"

cat > $CONFIG_FILE <<EOF
{
  "project": "$PROJECT_NAME",
  "environment": "$ENVIRONMENT",
  "region": "$REGION",
  "accountId": "$ACCOUNT_ID",
  "cognito": {
    "userPoolId": "$USER_POOL_ID",
    "appClientId": "$APP_CLIENT_ID",
    "domain": "$PROJECT_NAME-$ENVIRONMENT"
  },
  "dynamodb": {
    "prefix": "$DYNAMODB_PREFIX",
    "tables": [
      "${DYNAMODB_PREFIX}-unidades",
      "${DYNAMODB_PREFIX}-usuarios",
      "${DYNAMODB_PREFIX}-colaboradores",
      "${DYNAMODB_PREFIX}-escalas",
      "${DYNAMODB_PREFIX}-caixa",
      "${DYNAMODB_PREFIX}-saidas",
      "${DYNAMODB_PREFIX}-motoboys"
    ]
  },
  "lambda": {
    "roleArn": "$LAMBDA_ROLE_ARN",
    "roleName": "$LAMBDA_ROLE_NAME"
  },
  "s3": {
    "bucket": "$S3_BUCKET_NAME",
    "region": "$REGION"
  },
  "testUser": {
    "email": "$TEST_EMAIL",
    "password": "$TEST_PASSWORD",
    "group": "admin"
  },
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

print_success "Configurações salvas em: $CONFIG_FILE"

# ============================================================================
# RESUMO FINAL
# ============================================================================

print_header "✅ SETUP CONCLUÍDO COM SUCESSO!"

echo -e "${YELLOW}Informações Importantes:${NC}"
echo ""
echo -e "${CYAN}Cognito:${NC}"
echo "  User Pool ID: $USER_POOL_ID"
echo "  App Client ID: $APP_CLIENT_ID"
echo "  Usuário Teste: $TEST_EMAIL"
echo "  Senha Teste: $TEST_PASSWORD"
echo ""
echo -e "${CYAN}DynamoDB:${NC}"
echo "  Tabelas criadas: 7"
echo "  Modo: Pay-per-request (sem custo fixo)"
echo ""
echo -e "${CYAN}Lambda:${NC}"
echo "  IAM Role: $LAMBDA_ROLE_ARN"
echo ""
echo -e "${CYAN}S3:${NC}"
echo "  Bucket: $S3_BUCKET_NAME"
echo ""
echo -e "${YELLOW}Variáveis de Ambiente:${NC}"
echo ""
echo "export AWS_REGION=$REGION"
echo "export COGNITO_USER_POOL_ID=$USER_POOL_ID"
echo "export COGNITO_CLIENT_ID=$APP_CLIENT_ID"
echo "export DYNAMODB_PREFIX=$DYNAMODB_PREFIX"
echo "export LAMBDA_ROLE_ARN=$LAMBDA_ROLE_ARN"
echo "export S3_BUCKET=$S3_BUCKET_NAME"
echo ""
echo -e "${YELLOW}Próximos Passos:${NC}"
echo "1. Revisar arquivo: $CONFIG_FILE"
echo "2. Copiar variáveis de ambiente para .env"
echo "3. Fazer deploy do frontend no GitHub Pages"
echo "4. Fazer deploy do backend no Lambda"
echo "5. Testar a aplicação"
echo ""
echo -e "${YELLOW}Custo Estimado: \$10-15/mês${NC}"
echo ""
echo -e "${BLUE}Documentação: Veja README.md${NC}"
echo ""
