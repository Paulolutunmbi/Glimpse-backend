const { sendRawEmail, verifyEmailTransport } = require('./email/emailService');

module.exports = sendRawEmail;
module.exports.verifyEmailTransport = verifyEmailTransport;
