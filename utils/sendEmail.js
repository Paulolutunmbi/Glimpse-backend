const nodemailer = require('nodemailer');

let transporter;

const getTransporter = () => {
  if (transporter) return transporter;

  const service = process.env.SMTP_SERVICE || 'gmail';
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error('SMTP_USER and SMTP_PASS must be configured');
  }

  transporter = nodemailer.createTransport(
    host
      ? {
          host,
          port: port || 587,
          secure,
          auth: { user, pass },
        }
      : {
          service,
          auth: { user, pass },
        }
  );

  return transporter;
};

const sendEmail = async ({ to, subject, text, html }) => {
  if (!to || !subject || (!text && !html)) {
    throw new Error('to, subject, and text or html are required');
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  return getTransporter().sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
};

module.exports = sendEmail;
