const nodemailer = require('nodemailer');

let transporter;

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['true', '1', 'yes'].includes(String(value).trim().toLowerCase());
};

const parsePort = (value, fallback) => {
  const port = Number(value ?? fallback);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('SMTP_PORT must be a valid TCP port');
  }
  return port;
};

const validateTransportEnv = () => {
  const missing = [];
  const host = String(process.env.SMTP_HOST || '').trim();
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();
  const from = String(process.env.SMTP_FROM || process.env.SMTP_USER || '').trim();

  if (!host) missing.push('SMTP_HOST');
  if (!user) missing.push('SMTP_USER');
  if (!pass) missing.push('SMTP_PASS');
  if (!from) missing.push('SMTP_FROM or SMTP_USER');

  if (missing.length) {
    return {
      ok: false,
      message: `Missing email configuration: ${missing.join(', ')}`,
      missing,
    };
  }

  try {
    const port = parsePort(process.env.SMTP_PORT, 587);
    const secure = parseBoolean(process.env.SMTP_SECURE, port === 465);

    if (port === 465 && !secure) {
      return {
        ok: false,
        message: 'SMTP_SECURE must be true when SMTP_PORT is 465',
        missing: [],
      };
    }

    if (port !== 465 && secure) {
      return {
        ok: false,
        message: 'SMTP_SECURE must be false for STARTTLS ports such as 587',
        missing: [],
      };
    }
  } catch (err) {
    return {
      ok: false,
      message: err.message || 'Invalid SMTP configuration',
      missing: [],
    };
  }

  return { ok: true, message: 'SMTP configuration present', missing: [] };
};

const buildTransportOptions = () => {
  const validation = validateTransportEnv();
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const host = String(process.env.SMTP_HOST || '').trim();
  const port = parsePort(process.env.SMTP_PORT, 587);
  const secure = parseBoolean(process.env.SMTP_SECURE, port === 465);
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();

  return {
    host,
    port,
    secure,
    requireTLS: !secure,
    auth: { user, pass },
    tls: { servername: host },
    logger: parseBoolean(process.env.SMTP_LOGGER, false),
    debug: parseBoolean(process.env.SMTP_DEBUG, false),
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 8000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 8000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 9000),
  };
};

const getTransporter = () => {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport(buildTransportOptions());
  return transporter;
};

const verifyTransporter = async () => {
  const transport = getTransporter();
  try {
    await transport.verify();
    return transport;
  } catch (err) {
    const message = err && err.message ? err.message : err;
    throw new Error(`SMTP verification failed: ${message}`);
  }
};

module.exports = {
  buildTransportOptions,
  getTransporter,
  validateTransportEnv,
  verifyTransporter,
};
