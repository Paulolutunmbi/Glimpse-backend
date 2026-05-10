const buckets = new Map();

const getLimitConfig = () => ({
  windowMs: Number(process.env.EMAIL_RATE_LIMIT_WINDOW_MS || 60 * 60 * 1000),
  maxPerRecipient: Number(process.env.EMAIL_RATE_LIMIT_MAX_PER_RECIPIENT || 8),
  maxGlobal: Number(process.env.EMAIL_RATE_LIMIT_MAX_GLOBAL || 200),
});

const prune = (now, windowMs) => {
  for (const [key, bucket] of buckets.entries()) {
    bucket.timestamps = bucket.timestamps.filter((timestamp) => now - timestamp < windowMs);
    if (bucket.timestamps.length === 0) buckets.delete(key);
  }
};

const assertEmailRateLimit = ({ to, template }) => {
  if (process.env.EMAIL_RATE_LIMIT_ENABLED === 'false') return;

  const { windowMs, maxPerRecipient, maxGlobal } = getLimitConfig();
  const now = Date.now();
  prune(now, windowMs);

  const recipientKey = `recipient:${String(to || '').toLowerCase()}:${template || 'raw'}`;
  const globalKey = 'global';
  const recipientBucket = buckets.get(recipientKey) || { timestamps: [] };
  const globalBucket = buckets.get(globalKey) || { timestamps: [] };

  if (recipientBucket.timestamps.length >= maxPerRecipient) {
    throw new Error(`Email rate limit exceeded for ${to}`);
  }

  if (globalBucket.timestamps.length >= maxGlobal) {
    throw new Error('Global email rate limit exceeded');
  }

  recipientBucket.timestamps.push(now);
  globalBucket.timestamps.push(now);
  buckets.set(recipientKey, recipientBucket);
  buckets.set(globalKey, globalBucket);
};

const resetEmailRateLimits = () => buckets.clear();

module.exports = {
  assertEmailRateLimit,
  resetEmailRateLimits,
};
