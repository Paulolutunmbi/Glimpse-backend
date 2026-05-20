const vercelOrigin = 'https://glimpse-theta-swart.vercel.app';

const addOriginFromUrl = (allowedOrigins, value) => {
  if (!value) return;
  try {
    const origin = new URL(value).origin;
    if (!allowedOrigins.includes(origin)) {
      allowedOrigins.push(origin);
    }
  } catch (err) {
    // Ignore invalid URL values
  }
};

const buildAllowedOrigins = () => {
  const allowedOrigins = (process.env.CLIENT_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  addOriginFromUrl(allowedOrigins, process.env.CLIENT_APP_URL);
  addOriginFromUrl(allowedOrigins, process.env.CLIENT_RESET_PASSWORD_URL);

  if (!allowedOrigins.includes(vercelOrigin)) {
    allowedOrigins.push(vercelOrigin);
  }

  return allowedOrigins;
};

const isLocalhostOrigin = (origin) => /^http:\/\/localhost:\d+$/.test(origin);

const resolveAllowedOrigin = (origin, allowedOrigins) => {
  if (!origin) return null;
  if (allowedOrigins.includes(origin) || isLocalhostOrigin(origin)) return origin;
  return null;
};

const buildCorsOptions = (allowedOrigins) => ({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || isLocalhostOrigin(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

const buildSocketCorsOptions = (allowedOrigins) => ({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin) || isLocalhostOrigin(origin)) return cb(null, true);
    return cb(new Error('Blocked by CORS: ' + origin));
  },
  methods: ['GET', 'POST'],
});

module.exports = {
  buildAllowedOrigins,
  resolveAllowedOrigin,
  buildCorsOptions,
  buildSocketCorsOptions,
};
