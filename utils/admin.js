const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || 'oluwatunmbipaul@gmail.com')
  .trim()
  .toLowerCase();

const MAX_ADMIN_ATTEMPTS = Number(process.env.ADMIN_MAX_ATTEMPTS || 5);
const ADMIN_ATTEMPT_COOLDOWN_MS = Number(process.env.ADMIN_ATTEMPT_COOLDOWN_MS || 15 * 60 * 1000);

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const isAdminEmail = (email) => normalizeEmail(email) === ADMIN_EMAIL;

const getRequestIp = (req) =>
  String(req.headers?.['x-forwarded-for'] || req.ip || req.socket?.remoteAddress || '')
    .split(',')[0]
    .trim();

module.exports = {
  ADMIN_EMAIL,
  MAX_ADMIN_ATTEMPTS,
  ADMIN_ATTEMPT_COOLDOWN_MS,
  isAdminEmail,
  normalizeEmail,
  getRequestIp,
};
