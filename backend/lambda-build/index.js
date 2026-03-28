const AWS = require('aws-sdk');
const cognito = new AWS.CognitoIdentityServiceProvider();
const dynamodb = new AWS.DynamoDB.DocumentClient();

const userPoolId = process.env.COGNITO_USER_POOL_ID;
const clientId = process.env.COGNITO_CLIENT_ID;

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event));
  
  const path = event.path;
  const method = event.httpMethod;
  const body = event.body ? JSON.parse(event.body) : {};

  try {
    // Rota de Login
    if (path === '/api/auth/login' && method === 'POST') {
      const { email, password } = body;
      
      const params = {
        AuthFlow: 'ADMIN_NO_SRP_AUTH',
        UserPoolId: userPoolId,
        ClientId: clientId,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password
        }
      };

      const result = await cognito.adminInitiateAuth(params).promise();
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          token: result.AuthenticationResult.IdToken,
          user: { email }
        })
      };
    }

    // Rota de Unidades
    if (path === '/api/unidades' && method === 'GET') {
      const result = await dynamodb.scan({
        TableName: 'gres-prod-unidades'
      }).promise();

      return {
        statusCode: 200,
        body: JSON.stringify(result.Items)
      };
    }

    // Rota de Caixa
    if (path === '/api/caixa' && method === 'POST') {
      const { unidadeId, data, valor } = body;
      
      await dynamodb.put({
        TableName: 'gres-prod-caixa',
        Item: {
          id: `${unidadeId}-${Date.now()}`,
          unidadeId,
          data,
          valor,
          timestamp: new Date().toISOString()
        }
      }).promise();

      return {
        statusCode: 201,
        body: JSON.stringify({ success: true })
      };
    }

    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Not found' })
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
