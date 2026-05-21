const { Resend } = require('resend');

let resendClient;

const getResendApiKey = () => String(process.env.RESEND_API_KEY || '').trim();

const getEmailFromAddress = () =>
  String(process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || '').trim();

const validateResendEnv = () => {
  const missing = [];

  if (!getResendApiKey()) missing.push('RESEND_API_KEY');
  if (!getEmailFromAddress()) missing.push('RESEND_FROM_EMAIL');

  return {
    ok: missing.length === 0,
    message: missing.length ? `Missing ${missing.join(', ')}` : 'Resend is configured',
  };
};

const getResendClient = () => {
  const apiKey = getResendApiKey();

  if (!apiKey) {
    throw new Error('RESEND_API_KEY must be configured');
  }

  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }

  return resendClient;
};

module.exports = {
  getEmailFromAddress,
  getResendClient,
  validateResendEnv,
};
