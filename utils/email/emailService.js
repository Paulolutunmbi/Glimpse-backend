const fs = require('fs');
const nodemailer = require('nodemailer');
const brand = require('./brand');
const { buildTrackingHeaders, createTrackingContext, withTracking } = require('./analytics/tracking');
const { dispatchEmailJob, setEmailQueueAdapter } = require('./queue/emailQueue');
const { assertEmailRateLimit } = require('./rateLimit/emailRateLimiter');
const renderTemplate = require('./render/renderTemplate');

let transporter;

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['true', '1', 'yes'].includes(String(value).trim().toLowerCase());
};

const parsePort = (value, fallback) => {
  const port = Number(value || fallback);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('SMTP_PORT must be a valid TCP port');
  }
  return port;
};

const getTransportConfig = () => {
  const service = process.env.SMTP_SERVICE || 'gmail';
  const host = String(process.env.SMTP_HOST || '').trim();
  const port = host ? parsePort(process.env.SMTP_PORT, 587) : undefined;
  const secure = host ? parseBoolean(process.env.SMTP_SECURE, port === 465) : undefined;
  const user = String(process.env.SMTP_USER || process.env.EMAIL_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || process.env.EMAIL_PASS || '').replace(/\s+/g, '');

  if (!user || !pass) {
    throw new Error('SMTP_USER and SMTP_PASS must be configured');
  }

  if (host && port === 465 && !secure) {
    throw new Error('SMTP_SECURE must be true when SMTP_PORT is 465');
  }

  if (host && port !== 465 && secure) {
    throw new Error('SMTP_SECURE must be false for STARTTLS ports such as 587');
  }

  const commonOptions = {
    auth: { user, pass },
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 20000),
  };

  return host
    ? {
        host,
        port,
        secure,
        requireTLS: !secure,
        tls: { servername: host },
        ...commonOptions,
      }
    : {
        service,
        ...commonOptions,
      };
};

const getTransporter = () => {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport(getTransportConfig());
  return transporter;
};

const getDefaultAttachments = () => {
  if (!fs.existsSync(brand.logo.path)) return [];

  return [
    {
      filename: brand.logo.filename,
      path: brand.logo.path,
      cid: brand.logo.cid,
    },
  ];
};

const deliverEmail = async ({ to, subject, text, html, attachments = [], headers = {}, ...options }) => {
  if (!to || !subject || (!text && !html)) {
    throw new Error('to, subject, and text or html are required');
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || process.env.EMAIL_USER;

  if (!from) {
    throw new Error('SMTP_FROM or SMTP_USER must be configured');
  }

  try {
    return await getTransporter().sendMail({
      from,
      to,
      subject,
      text,
      html,
      attachments: [...getDefaultAttachments(), ...attachments],
      headers,
      ...options,
    });
  } catch (err) {
    const message = err && err.message ? err.message : 'Unknown email delivery error';
    throw new Error(`Failed to send "${subject}" email to ${to}: ${message}`);
  }
};

const sendRawEmail = async ({ metadata, template = 'raw', templateVersion = 'v1', ...message }) => {
  assertEmailRateLimit({ to: message.to, template });

  const trackingContext = createTrackingContext({
    to: message.to,
    template,
    templateVersion,
    metadata,
  });

  const payload = {
    ...message,
    html: withTracking({ html: message.html, trackingContext }),
    headers: {
      ...buildTrackingHeaders(trackingContext),
      ...(message.headers || {}),
    },
  };

  return dispatchEmailJob({
    type: 'raw',
    template,
    templateVersion,
    trackingContext,
    payload,
    send: () => deliverEmail(payload),
  });
};

const sendTemplateEmail = async ({ to, template, data = {}, version, metadata, ...options }) => {
  const rendered = renderTemplate({ template, data, version });

  return sendRawEmail({
    to,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    template: rendered.template,
    templateVersion: rendered.templateVersion,
    metadata,
    ...options,
  });
};

const verifyEmailTransport = async () => getTransporter().verify();

module.exports = {
  sendRawEmail,
  sendTemplateEmail,
  setEmailQueueAdapter,
  verifyEmailTransport,
  sendVerificationEmail: (to, data, options) =>
    sendTemplateEmail({ to, template: 'verificationEmail', data, ...(options || {}) }),
  sendOtpVerificationEmail: (to, data, options) =>
    sendTemplateEmail({ to, template: 'otpVerificationEmail', data, ...(options || {}) }),
  sendPasswordResetEmail: (to, data, options) =>
    sendTemplateEmail({ to, template: 'passwordResetEmail', data, ...(options || {}) }),
  sendPasswordChangedEmail: (to, data, options) =>
    sendTemplateEmail({ to, template: 'passwordChangedEmail', data, ...(options || {}) }),
  sendWelcomeEmail: (to, data, options) =>
    sendTemplateEmail({ to, template: 'welcomeEmail', data, ...(options || {}) }),
  sendAccountNotificationEmail: (to, data, options) =>
    sendTemplateEmail({ to, template: 'accountNotificationEmail', data, ...(options || {}) }),
  sendSupportResponseEmail: (to, data, options) =>
    sendTemplateEmail({ to, template: 'supportResponseEmail', data, ...(options || {}) }),
};
