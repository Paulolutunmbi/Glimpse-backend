const User = require('../models/User');
const AdminActivity = require('../models/AdminActivity');
const Report = require('../models/Report');
const { createNotification } = require('../services/notificationService');
const { getIO } = require('../socket');
const { isAdminUser, getAdminEmails } = require('../utils/admin');

const MAX_ATTEMPTS = Number(process.env.ADMIN_MAX_ATTEMPTS || 5);
const COOLDOWN_MINUTES = Number(process.env.ADMIN_ATTEMPT_COOLDOWN_MINUTES || 60);
const COOLDOWN_MS = COOLDOWN_MINUTES > 0 ? COOLDOWN_MINUTES * 60 * 1000 : 0;

const getRequestIp = (req) =>
  String(req.headers?.['x-forwarded-for'] || req.ip || req.socket?.remoteAddress || '')
    .split(',')[0]
    .trim();

const emitAdminAttempt = (userId, payload) => {
  try {
    const io = getIO();
    io.to(String(userId)).emit('admin:attempt', payload);
  } catch (err) {
    console.error('Socket emit failed:', err.message);
  }
};

const emitAdminBroadcast = (event, payload) => {
  try {
    const io = getIO();
    io.to('admins').emit(event, payload);
  } catch (err) {
    console.error('Socket emit failed:', err.message);
  }
};

const createAdminAlert = async ({ user, reason, route, attempts, ip }) => {
  const [adminEmail] = getAdminEmails();
  const adminUser = adminEmail ? await User.findOne({ email: adminEmail }) : null;
  if (!adminUser) return;

  await createNotification({
    userId: adminUser._id,
    type: 'admin',
    preview: `Auto-ban triggered for ${user?.email || 'a user'} (${attempts} attempts).`,
  });

  emitAdminBroadcast('admin:autoBan', {
    user: {
      id: user?._id,
      email: user?.email,
      username: user?.username,
      name: user?.name,
    },
    reason,
    attempts,
    route,
    ip,
    createdAt: new Date().toISOString(),
  });
};

const recordAdminActivity = async ({ action, actorId, targetId, details }) => {
  const activity = await AdminActivity.create({
    action,
    actor: actorId || undefined,
    targetUser: targetId || undefined,
    details: details || {},
  });

  emitAdminBroadcast('admin:activity', { activity });
  return activity;
};

const recordUnauthorizedAttempt = async (req, user) => {
  const now = Date.now();
  const security = user.settings?.security || {};
  const adminAccess = security.adminAccess || {};
  const lastAttemptAt = adminAccess.lastAttemptAt
    ? new Date(adminAccess.lastAttemptAt).getTime()
    : 0;

  let attempts = Number(adminAccess.attempts) || 0;
  if (COOLDOWN_MS > 0 && lastAttemptAt && now - lastAttemptAt > COOLDOWN_MS) {
    attempts = 0;
  }

  attempts += 1;
  const remaining = Math.max(0, MAX_ATTEMPTS - attempts);

  const nextAdminAccess = {
    attempts,
    remainingAttempts: remaining,
    lastAttemptAt: new Date(now),
    lastAttemptRoute: req.originalUrl,
    lastAttemptIp: getRequestIp(req),
    lastAttemptUserAgent: String(req.headers?.['user-agent'] || '').slice(0, 200),
    cooldownUntil: COOLDOWN_MS > 0 ? new Date(now + COOLDOWN_MS) : undefined,
  };

  user.settings = user.settings || {};
  user.settings.security = user.settings.security || {};
  user.settings.security.adminAccess = { ...adminAccess, ...nextAdminAccess };

  let autoBanned = false;
  if (attempts >= MAX_ATTEMPTS) {
    autoBanned = true;
    user.isBanned = true;
    user.bannedAt = new Date();
    user.bannedReason = 'Auto-ban: unauthorized admin access';
    user.banMeta = {
      reason: user.bannedReason,
      attempts,
      route: req.originalUrl,
      ip: getRequestIp(req),
    };
    if (user.settings.security.activeSessions) {
      user.settings.security.activeSessions = [];
    }
  }

  await user.save({ validateBeforeSave: false });

  emitAdminAttempt(user._id, {
    remainingAttempts: remaining,
    maxAttempts: MAX_ATTEMPTS,
    attempts,
  });

  if (autoBanned) {
    await Report.create({
      targetUser: user._id,
      reason: user.bannedReason,
      status: 'open',
      metadata: user.banMeta,
    });

    await recordAdminActivity({
      action: 'auto-ban',
      targetId: user._id,
      details: {
        reason: user.bannedReason,
        attempts,
        route: req.originalUrl,
        ip: getRequestIp(req),
      },
    });

    await createAdminAlert({
      user,
      reason: user.bannedReason,
      route: req.originalUrl,
      attempts,
      ip: getRequestIp(req),
    });

    emitAdminBroadcast('admin:userUpdated', {
      action: 'auto-ban',
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        name: user.name,
        isBanned: true,
        bannedAt: user.bannedAt,
        bannedReason: user.bannedReason,
      },
    });
  }

  return { remaining, attempts, autoBanned };
};

const requireAdmin = () => async (req, res, next) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  if (isAdminUser(user)) {
    return next();
  }

  const result = await recordUnauthorizedAttempt(req, user);

  if (result.autoBanned) {
    return res.status(403).json({
      success: false,
      message: 'Account banned',
      remainingAttempts: 0,
    });
  }

  return res.status(403).json({
    success: false,
    message: 'Unauthorized access detected.',
    remainingAttempts: result.remaining,
    maxAttempts: MAX_ATTEMPTS,
  });
};

module.exports = requireAdmin;
