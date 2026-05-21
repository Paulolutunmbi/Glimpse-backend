const fs = require('fs');
const brand = require('./brand');
const { buildTrackingHeaders, createTrackingContext, withTracking } = require('./analytics/tracking');
const { dispatchEmailJob, setEmailQueueAdapter } = require('./queue/emailQueue');
const { assertEmailRateLimit } = require('./rateLimit/emailRateLimiter');
const renderTemplate = require('./render/renderTemplate');
const { getTransporter, verifyTransporter } = require('./transporter');

const getDefaultAttachments = () => {
  if (!fs.existsSync(brand.logoAbsolutePath)) return [];

  return [
    {
      filename: brand.logoFilename,
      path: brand.logoAbsolutePath,
      cid: brand.logoCid,
    },
  ];
};

const deliverEmail = async ({ to, subject, text, html, attachments = [], headers = {}, ...options }) => {
  if (!to || !subject || (!text && !html)) {
    throw new Error('to, subject, and text or html are required');
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

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

const verifyEmailTransport = async () => verifyTransporter();

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
