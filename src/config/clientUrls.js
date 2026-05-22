const PRODUCTION_CLIENT_APP_URL = 'https://glimpse-theta-swart.vercel.app';
const DEVELOPMENT_CLIENT_APP_URL = 'http://localhost:5173';

const trimTrailingSlash = (value) => String(value || '').trim().replace(/\/+$/, '');

const isProduction = () => process.env.NODE_ENV === 'production';

const ensureUrlProtocol = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const getDefaultClientAppUrl = () =>
  isProduction() ? PRODUCTION_CLIENT_APP_URL : DEVELOPMENT_CLIENT_APP_URL;

const getClientAppUrl = () =>
  trimTrailingSlash(
    ensureUrlProtocol(
      process.env.CLIENT_APP_URL ||
        process.env.CLIENT_ORIGIN ||
        process.env.VERCEL_PROJECT_PRODUCTION_URL ||
        process.env.VERCEL_URL ||
        getDefaultClientAppUrl()
    )
  );

const getClientResetPasswordUrl = () =>
  trimTrailingSlash(process.env.CLIENT_RESET_PASSWORD_URL || `${getClientAppUrl()}/reset-password`);

const buildResetPasswordUrl = (token) => {
  const resetUrl = new URL(getClientResetPasswordUrl());
  resetUrl.searchParams.set('token', token);
  return resetUrl.toString();
};

module.exports = {
  DEVELOPMENT_CLIENT_APP_URL,
  PRODUCTION_CLIENT_APP_URL,
  buildResetPasswordUrl,
  getClientAppUrl,
  getClientResetPasswordUrl,
  isProduction,
};
