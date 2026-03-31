const handler = require('./index.js').handler;

const event = {
  rawPath: '/users',
  requestContext: {
    http: {
      method: 'GET'
    }
  },
  queryStringParameters: {}
};

handler(event, {}, (err, result) => {
  console.log('Error:', err);
  console.log('Result:', JSON.stringify(result, null, 2));
});
