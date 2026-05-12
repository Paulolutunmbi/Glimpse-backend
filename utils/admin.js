const DEFAULT_ADMIN_EMAIL = 'oluwatunmbipaul@gmail.com';

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const getAdminEmails = () => {
  const raw = process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;
  return raw
    .split(',')
    .map((value) => normalizeEmail(value))
    .filter(Boolean);
};

const isAdminEmail = (email) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return getAdminEmails().includes(normalized);
};

const isAdminUser = (user) => isAdminEmail(user?.email);

module.exports = {
  normalizeEmail,
  getAdminEmails,
  isAdminEmail,
  isAdminUser,
};
