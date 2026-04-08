# 🚀 Deploy do Backend GIRES

Este diretório contém scripts de deploy para a infraestrutura AWS do GIRES.

## 📋 Pré-requisitos

- **AWS CLI** instalado e configurado
  ```bash
  aws configure
  ```
  Você precisará fornecer:
  - AWS Access Key ID
  - AWS Secret Access Key
  - Região padrão: `us-east-2`

- **Permissões IAM necessárias**:
  - `lambda:UpdateFunctionCode`
  - `lambda:GetFunction`
  - `lambda:ListFunctions`
  - `apigateway:GetIntegration`
  - `apigateway:GetResources`

- **Utilitários**:
  - `zip` (Ubuntu: `apt install zip` | macOS: `brew install zip`)
  - `curl`

## 🔄 Deploy do Backend Lambda

### Uso básico

```bash
# Na raiz do repositório:
bash infra/deploy-lambda.sh
```

### O que o script faz

1. **Valida credenciais AWS** e conecta na região `us-east-2`
2. **Descobre automaticamente** o nome da função Lambda através do API Gateway ID
3. **Instala dependências** de produção no `backend-lambda/`
4. **Empacota** o código em um arquivo ZIP
5. **Faz upload** para AWS Lambda
6. **Testa** o endpoint para verificar se o deploy foi bem-sucedido

### Saída esperada

```
══════════════════════════════════════════
  GRES — Deploy Lambda  (região: us-east-2)  
══════════════════════════════════════════
✓ AWS CLI OK — conta: 123456789012 — região: us-east-2
✓ Função encontrada: gres-lambda-function
✓ ZIP criado: /tmp/gres-lambda.zip (2.5M)

▶ Fazendo deploy para Lambda: gres-lambda-function ...
✓ Deploy concluído!

▶ Testando endpoint /colaboradores ...
✓ API respondendo (HTTP 200) — deploy bem-sucedido!

══════════════════════════════════════════
  Deploy finalizado!
  Função : gres-lambda-function
  Região : us-east-2
  API    : https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod
══════════════════════════════════════════
```

## 🔍 Verificação pós-deploy

Após o deploy, verifique se as alterações estão ativas:

```bash
# Teste o endpoint de escalas (deve retornar 200 ou 401):
curl -I https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod/escalas

# Verifique os logs no CloudWatch:
aws logs tail /aws/lambda/gres-lambda-function --follow --region us-east-2
```

## 🐛 Troubleshooting

### Erro: "AWS CLI não encontrado"
```bash
# Ubuntu/Debian:
sudo apt-get install awscli

# macOS:
brew install awscli

# Ou instale via pip:
pip install awscli
```

### Erro: "Credenciais AWS inválidas"
```bash
aws configure
# Forneça suas credenciais AWS
```

### Erro: "Não foi possível descobrir o nome da função Lambda"

Liste manualmente e defina a variável de ambiente:

```bash
aws lambda list-functions --region us-east-2 --query 'Functions[*].FunctionName' --output table

# Use o nome encontrado:
FUNCTION_NAME_OVERRIDE=nome-da-funcao bash infra/deploy-lambda.sh
```

### Erro 500 após deploy

Verifique os logs do Lambda:

```bash
aws logs tail /aws/lambda/gres-lambda-function --follow --region us-east-2
```

## 📦 Estrutura do ZIP

O script empacota os seguintes arquivos:

```
gres-lambda.zip
├── index.js              ← Código principal do Lambda
├── package.json          ← Dependências
├── package-lock.json
└── node_modules/         ← Dependências de produção
    └── ...
```

## ⚡ Deploy rápido (uma linha)

```bash
cd /path/to/gres && bash infra/deploy-lambda.sh
```

## 🔐 Segurança

- **Nunca** commite credenciais AWS no código
- Use **IAM roles** e **políticas de menor privilégio**
- Considere usar **AWS Secrets Manager** para senhas do banco
- Habilite **CloudTrail** para auditoria de deploys

## 📚 Recursos

- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [AWS CLI Configuration](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html)
- [IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)

---

**💡 Dica**: Configure um **GitHub Actions workflow** para automatizar deploys em pull requests aprovados!
