const {
  sendRawEmail,
  validateEmailTransportEnv,
} = require('./email/emailService');

module.exports = sendRawEmail;
module.exports.validateEmailTransportEnv = validateEmailTransportEnv;
