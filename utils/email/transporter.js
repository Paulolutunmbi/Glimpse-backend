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

const buildTransportOptions = () => {
  const host = String(process.env.SMTP_HOST || '').trim();
  const port = parsePort(process.env.SMTP_PORT, 587);
  const secure = parseBoolean(process.env.SMTP_SECURE, port === 465);
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').replace(/\s+/g, '');

  if (!host) {
    throw new Error('SMTP_HOST must be configured');
  }

  if (!user || !pass) {
    throw new Error('SMTP_USER and SMTP_PASS must be configured');
  }

  if (port === 465 && !secure) {
    throw new Error('SMTP_SECURE must be true when SMTP_PORT is 465');
  }

  if (port !== 465 && secure) {
    throw new Error('SMTP_SECURE must be false for STARTTLS ports such as 587');
  }

  return {
    host,
    port,
    secure,
    requireTLS: !secure,
    auth: { user, pass },
    tls: { servername: host },
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 20000),
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
  verifyTransporter,
};
