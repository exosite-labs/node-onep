exports.rootCIK='<YOUR CIK HERE>';

// whether to test against a local mock server rather than 1P
exports.useMockServer = true;
exports.mockCIK = '1111111111111111111111111111111111111111';
exports.mockOptions = {
  https: false,
  host: '127.0.0.1',
  port: '3001',
  agent: 'node-onep-test'
};
