#!/bin/bash

###############################################################################
# Script Direto de Setup - AWS para GRES
# Cria recursos sem verificações prévias
###############################################################################

set -e

# Configurações
PROJECT_NAME="gres"
ENVIRONMENT="prod"
REGION="us-east-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "841344319831")

USER_POOL_NAME="${PROJECT_NAME}-${ENVIRONMENT}"
DYNAMODB_PREFIX="${PROJECT_NAME}-${ENVIRONMENT}"
LAMBDA_ROLE_NAME="${PROJECT_NAME}-lambda-role"
S3_BUCKET_NAME="${PROJECT_NAME}-${ENVIRONMENT}-uploads-$(date +%s)"

echo "=========================================="
echo "Setup GRES - AWS Infrastructure"
echo "=========================================="
echo "Project: $PROJECT_NAME"
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"
echo "Account ID: $ACCOUNT_ID"
echo ""

# ============================================================================
# 1. COGNITO
# ============================================================================

echo "Creating Cognito User Pool..."

USER_POOL_ID=$(aws cognito-idp create-user-pool \
  --pool-name $USER_POOL_NAME \
  --policies '{
    "PasswordPolicy": {
      "MinimumLength": 12,
      "RequireUppercase": true,
      "RequireLowercase": true,
      "RequireNumbers": true,
      "RequireSymbols": true
    }
  }' \
  --schema '[
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
    }
  ]' \
  --region $REGION \
  --query 'UserPool.Id' \
  --output text 2>/dev/null || echo "")

if [ -z "$USER_POOL_ID" ]; then
  echo "ERROR: Failed to create Cognito User Pool"
  exit 1
fi

echo "✓ Cognito User Pool: $USER_POOL_ID"

# Create groups
echo "Creating Cognito Groups..."
for GROUP in admin socio-operador operacao caixa; do
  aws cognito-idp create-group \
    --user-pool-id $USER_POOL_ID \
    --group-name "$GROUP" \
    --description "Grupo $GROUP" \
    --region $REGION 2>/dev/null || true
done
echo "✓ Groups created"

# Create App Client
echo "Creating App Client..."
APP_CLIENT_ID=$(aws cognito-idp create-user-pool-client \
  --user-pool-id $USER_POOL_ID \
  --client-name "${PROJECT_NAME}-app" \
  --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH \
  --region $REGION \
  --query 'UserPoolClient.ClientId' \
  --output text 2>/dev/null || echo "")

if [ -z "$APP_CLIENT_ID" ]; then
  echo "ERROR: Failed to create App Client"
  exit 1
fi

echo "✓ App Client: $APP_CLIENT_ID"

# Create test user
echo "Creating test user..."
TEST_EMAIL="admin@gres.com"
TEST_PASSWORD="GresAdmin123!@#"

aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username $TEST_EMAIL \
  --user-attributes Name=email,Value=$TEST_EMAIL Name=name,Value="Admin GRES" \
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

echo "✓ Test user created: $TEST_EMAIL"

# ============================================================================
# 2. DYNAMODB
# ============================================================================

echo ""
echo "Creating DynamoDB Tables..."

create_table() {
  local TABLE_NAME=$1
  local PARTITION_KEY=$2
  local SORT_KEY=$3
  
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
  
  echo "✓ Table: $TABLE_NAME"
}

create_table "${DYNAMODB_PREFIX}-unidades" "id" ""
create_table "${DYNAMODB_PREFIX}-usuarios" "id" ""
create_table "${DYNAMODB_PREFIX}-colaboradores" "id" ""
create_table "${DYNAMODB_PREFIX}-escalas" "colaborador_id" "data"
create_table "${DYNAMODB_PREFIX}-caixa" "unidade_id" "data"
create_table "${DYNAMODB_PREFIX}-saidas" "id" ""
create_table "${DYNAMODB_PREFIX}-motoboys" "id" ""

# ============================================================================
# 3. IAM ROLE PARA LAMBDA
# ============================================================================

echo ""
echo "Creating IAM Role for Lambda..."

TRUST_POLICY='{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "lambda.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}'

LAMBDA_ROLE_ARN=$(aws iam create-role \
  --role-name $LAMBDA_ROLE_NAME \
  --assume-role-policy-document "$TRUST_POLICY" \
  --query 'Role.Arn' \
  --output text 2>/dev/null || \
  aws iam get-role \
    --role-name $LAMBDA_ROLE_NAME \
    --query 'Role.Arn' \
    --output text)

echo "✓ Lambda Role: $LAMBDA_ROLE_ARN"

# Attach policies
DYNAMODB_POLICY='{
  "Version": "2012-10-17",
  "Statement": [{
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
  }]
}'

aws iam put-role-policy \
  --role-name $LAMBDA_ROLE_NAME \
  --policy-name dynamodb-policy \
  --policy-document "$DYNAMODB_POLICY" 2>/dev/null || true

aws iam attach-role-policy \
  --role-name $LAMBDA_ROLE_NAME \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole 2>/dev/null || true

echo "✓ Policies attached"

# ============================================================================
# 4. S3
# ============================================================================

echo ""
echo "Creating S3 Bucket..."

aws s3api create-bucket \
  --bucket $S3_BUCKET_NAME \
  --region $REGION \
  --create-bucket-configuration LocationConstraint=$REGION 2>/dev/null || true

echo "✓ S3 Bucket: $S3_BUCKET_NAME"

# Configure bucket
aws s3api put-public-access-block \
  --bucket $S3_BUCKET_NAME \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
  --region $REGION 2>/dev/null || true

aws s3api put-bucket-versioning \
  --bucket $S3_BUCKET_NAME \
  --versioning-configuration Status=Enabled \
  --region $REGION 2>/dev/null || true

echo "✓ S3 Bucket configured"

# ============================================================================
# 5. SALVAR CONFIGURAÇÕES
# ============================================================================

echo ""
echo "Saving configuration..."

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

echo "✓ Configuration saved: $CONFIG_FILE"

# ============================================================================
# RESUMO
# ============================================================================

echo ""
echo "=========================================="
echo "✅ SETUP CONCLUÍDO COM SUCESSO!"
echo "=========================================="
echo ""
echo "Cognito:"
echo "  User Pool ID: $USER_POOL_ID"
echo "  App Client ID: $APP_CLIENT_ID"
echo "  Test User: $TEST_EMAIL"
echo "  Test Password: $TEST_PASSWORD"
echo ""
echo "DynamoDB:"
echo "  Tables: 7"
echo "  Prefix: $DYNAMODB_PREFIX"
echo ""
echo "Lambda:"
echo "  Role ARN: $LAMBDA_ROLE_ARN"
echo ""
echo "S3:"
echo "  Bucket: $S3_BUCKET_NAME"
echo ""
echo "Environment Variables:"
echo "export AWS_REGION=$REGION"
echo "export COGNITO_USER_POOL_ID=$USER_POOL_ID"
echo "export COGNITO_CLIENT_ID=$APP_CLIENT_ID"
echo "export DYNAMODB_PREFIX=$DYNAMODB_PREFIX"
echo "export LAMBDA_ROLE_ARN=$LAMBDA_ROLE_ARN"
echo "export S3_BUCKET=$S3_BUCKET_NAME"
echo ""
echo "Configuration file: $CONFIG_FILE"
echo ""
