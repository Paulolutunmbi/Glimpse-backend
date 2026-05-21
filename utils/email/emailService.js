const fs = require('fs');
const brand = require('./brand');
const { buildTrackingHeaders, createTrackingContext, withTracking } = require('./analytics/tracking');
const { dispatchEmailJob, setEmailQueueAdapter } = require('./queue/emailQueue');
const { assertEmailRateLimit } = require('./rateLimit/emailRateLimiter');
const renderTemplate = require('./render/renderTemplate');
const { getTransporter, verifyTransporter } = require('./transporter');

const resolveSendTimeoutMs = () => {
  const raw = Number(process.env.SMTP_SEND_TIMEOUT_MS || 8000);
  if (!Number.isFinite(raw) || raw <= 0) return 8000;
  return raw;
};

const maskEmail = (email) => {
  const [name, domain] = String(email || '').split('@');
  if (!domain) return 'unknown';
  const safeName = name.length <= 2 ? `${name[0] || '*'}*` : `${name.slice(0, 2)}***`;
  return `${safeName}@${domain}`;
};

const sendMailWithTimeout = async (transport, options) => {
  const timeoutMs = resolveSendTimeoutMs();
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const err = new Error(`SMTP sendMail timed out after ${timeoutMs}ms`);
      err.code = 'SMTP_SEND_TIMEOUT';
      reject(err);
    }, timeoutMs);
  });

  try {
    return await Promise.race([transport.sendMail(options), timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

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

  const transport = getTransporter();
  const safeTo = maskEmail(to);

  const timeoutMs = resolveSendTimeoutMs();
  console.info('[email] Send start', { to: safeTo, subject, timeoutMs });

  try {
    const result = await sendMailWithTimeout(transport, {
      from,
      to,
      subject,
      text,
      html,
      attachments: [...getDefaultAttachments(), ...attachments],
      headers,
      ...options,
    });

    console.info('[email] Send success', { to: safeTo, subject, messageId: result?.messageId });
    return result;
  } catch (err) {
    console.error('[email] Send failed', {
      to: safeTo,
      subject,
      message: err.message || err,
      stack: err.stack,
    });
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
