const User = require('../models/User');
const { getIO } = require('../socket');
const {
  ADMIN_ATTEMPT_COOLDOWN_MS,
  MAX_ADMIN_ATTEMPTS,
  isAdminEmail,
  getRequestIp,
} = require('../utils/admin');
const { createAdminNotification } = require('../services/notificationService');

const resetAttemptsIfNeeded = (adminAccess, now) => {
  if (!adminAccess) return { attempts: 0 };
  if (!adminAccess.lastAttemptAt) return { ...adminAccess, attempts: 0 };
  const elapsed = now - new Date(adminAccess.lastAttemptAt).getTime();
  if (elapsed >= ADMIN_ATTEMPT_COOLDOWN_MS) {
    return { ...adminAccess, attempts: 0 };
  }
  return adminAccess;
};

const registerAdminAttempt = async (user, req) => {
  const now = Date.now();
  const adminAccess = resetAttemptsIfNeeded(user.adminAccess || {}, now);
  const nextAttempts = (adminAccess.attempts || 0) + 1;
  const attemptsRemaining = Math.max(0, MAX_ADMIN_ATTEMPTS - nextAttempts);

  user.adminAccess = {
    ...adminAccess,
    attempts: nextAttempts,
    lastAttemptAt: new Date(now),
    cooldownUntil: new Date(now + ADMIN_ATTEMPT_COOLDOWN_MS),
    lastAttemptRoute: String(req.originalUrl || ''),
    lastAttemptIp: getRequestIp(req),
  };

  let banned = false;
  if (nextAttempts >= MAX_ADMIN_ATTEMPTS) {
    banned = true;
    user.isBanned = true;
    user.bannedAt = new Date(now);
    user.banReason = 'Unauthorized admin access attempts';
    user.banSource = 'auto';
    if (user.settings?.security?.activeSessions) {
      user.settings.security.activeSessions = [];
    }
  }

  await user.save({ validateBeforeSave: false });

  try {
    const io = getIO();
    io.to(String(user._id)).emit('security:adminAttempt', {
      attemptsRemaining,
      attempts: nextAttempts,
      banned,
    });
  } catch (err) {
    console.error('Socket emit failed:', err.message);
  }

  if (banned) {
    await createAdminNotification({
      type: 'admin',
      preview: `Auto-banned ${user.email} after ${nextAttempts} unauthorized admin access attempts.`,
      meta: {
        userId: user._id,
        email: user.email,
        username: user.username || user.name || '',
        attempts: nextAttempts,
        reason: user.banReason,
        ip: user.adminAccess?.lastAttemptIp || '',
        route: user.adminAccess?.lastAttemptRoute || '',
        occurredAt: new Date(now).toISOString(),
      },
    });
  }

  return { attemptsRemaining, attempts: nextAttempts, banned };
};

const requireAdmin = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  if (req.user.isBanned) {
    return res.status(403).json({ success: false, message: 'Account banned', code: 'BANNED' });
  }

  if (isAdminEmail(req.user.email)) {
    req.isAdmin = true;
    return next();
  }

  const result = await registerAdminAttempt(req.user, req);
  if (result.banned) {
    return res.status(401).json({
      success: false,
      message: 'Account banned',
      code: 'BANNED',
      attemptsRemaining: 0,
    });
  }

  return res.status(403).json({
    success: false,
    message: 'Unauthorized admin access detected.',
    code: 'ADMIN_UNAUTHORIZED',
    attemptsRemaining: result.attemptsRemaining,
  });
};

const fetchAdminUser = async () => {
  return User.findOne({ email: process.env.ADMIN_EMAIL || 'oluwatunmbipaul@gmail.com' });
};

module.exports = {
  requireAdmin,
  registerAdminAttempt,
  fetchAdminUser,
};
