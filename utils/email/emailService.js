const { buildTrackingHeaders, createTrackingContext, withTracking } = require('./analytics/tracking');
const { dispatchEmailJob, setEmailQueueAdapter } = require('./queue/emailQueue');
const { assertEmailRateLimit } = require('./rateLimit/emailRateLimiter');
const renderTemplate = require('./render/renderTemplate');
const { getEmailFromAddress, getResendClient, validateResendEnv } = require('../../config/resend');

const resolveSendTimeoutMs = () => {
  const raw = Number(process.env.EMAIL_SEND_TIMEOUT_MS || 10000);
  if (!Number.isFinite(raw) || raw <= 0) return 10000;
  return raw;
};

const maskEmail = (email) => {
  const [name, domain] = String(email || '').split('@');
  if (!domain) return 'unknown';
  const safeName = name.length <= 2 ? `${name[0] || '*'}*` : `${name.slice(0, 2)}***`;
  return `${safeName}@${domain}`;
};

const sendResendWithTimeout = async (payload) => {
  const timeoutMs = resolveSendTimeoutMs();
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const err = new Error(`Resend email send timed out after ${timeoutMs}ms`);
      err.code = 'EMAIL_SEND_TIMEOUT';
      reject(err);
    }, timeoutMs);
  });

  try {
    return await Promise.race([getResendClient().emails.send(payload), timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const deliverEmail = async ({ to, subject, text, html, headers = {}, ...options }) => {
  if (!to || !subject || (!text && !html)) {
    throw new Error('to, subject, and text or html are required');
  }

  const from = getEmailFromAddress();

  if (!from) {
    throw new Error('RESEND_FROM_EMAIL must be configured');
  }

  const safeTo = maskEmail(to);
  const timeoutMs = resolveSendTimeoutMs();

  console.info('[email:resend] Send start', { to: safeTo, subject, timeoutMs });

  try {
    const result = await sendResendWithTimeout({
      from,
      to,
      subject,
      text,
      html,
      headers,
      ...options,
    });

    const messageId = result?.data?.id || result?.id;
    console.info('[email:resend] Send success', { to: safeTo, subject, messageId });
    return result;
  } catch (err) {
    console.error('[email:resend] Send failed', {
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

module.exports = {
  sendRawEmail,
  sendTemplateEmail,
  setEmailQueueAdapter,
  validateEmailTransportEnv: validateResendEnv,
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
