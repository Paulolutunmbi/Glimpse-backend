const {
  sendRawEmail,
  validateEmailTransportEnv,
  verifyEmailTransport,
} = require('./email/emailService');

module.exports = sendRawEmail;
module.exports.validateEmailTransportEnv = validateEmailTransportEnv;
module.exports.verifyEmailTransport = verifyEmailTransport;
