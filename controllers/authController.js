const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const MAX_ACTIVE_SESSIONS = 20;

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const { isAdminEmail } = require('../utils/admin');

const sanitizeUser = (user) => {
  const relations = {
    followers:
      user.relations?.followers?.length ? user.relations.followers : user.followers || [],
    following:
      user.relations?.following?.length ? user.relations.following : user.following || [],
  };
  const stats = {
    postsCount: user.stats?.postsCount ?? user.posts?.length ?? 0,
    followersCount: user.stats?.followersCount ?? relations.followers.length,
    followingCount: user.stats?.followingCount ?? relations.following.length,
    savedPostsCount: user.stats?.savedPostsCount ?? user.savedPosts?.length ?? 0,
  };
  return {
    id: user._id,
    name: user.name,
    fullName: user.fullName || user.name,
    username: user.username || user.name,
    email: user.email,
    isFirstLogin: user.isFirstLogin,
    profileCompleted: user.profileCompleted,
    onboardingCompleted: user.onboardingCompleted,
    verified: Boolean(user.verified),
    isBanned: Boolean(user.isBanned),
    isAdmin: isAdminEmail(user.email),
    createdAt: user.createdAt,
    profile: {
      avatar: user.profile?.avatar || user.profilePicture || user.avatar || '',
      coverImage: user.profile?.coverImage || user.coverImage || '',
      bio: user.profile?.bio ?? user.bio ?? '',
      extraInfo: user.profile?.extraInfo ?? user.extraInfo ?? '',
      preferences:
        user.profile?.preferences?.length ? user.profile.preferences : user.preferences || [],
      joinedAt: user.profile?.joinedAt || user.createdAt,
    },
    stats,
    relations,
  };
};

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET must be configured');
  }
  return secret;
};

const createSessionId = () => crypto.randomBytes(32).toString('hex');

const getRequestIp = (req) =>
  String(req.headers?.['x-forwarded-for'] || req.ip || req.socket?.remoteAddress || '')
    .split(',')[0]
    .trim();

const createLogContext = (req, flow) => ({
  flow,
  id: crypto.randomBytes(6).toString('hex'),
  ip: getRequestIp(req),
});

const logInfo = (ctx, message, meta) => {
  if (meta) {
    console.info(`[${ctx.flow}:${ctx.id}] ${message}`, meta);
    return;
  }
  console.info(`[${ctx.flow}:${ctx.id}] ${message}`);
};

const logWarn = (ctx, message, meta) => {
  if (meta) {
    console.warn(`[${ctx.flow}:${ctx.id}] ${message}`, meta);
    return;
  }
  console.warn(`[${ctx.flow}:${ctx.id}] ${message}`);
};

const logError = (ctx, message, err) => {
  if (err) {
    console.error(`[${ctx.flow}:${ctx.id}] ${message}`, {
      message: err.message || err,
      stack: err.stack,
    });
    return;
  }
  console.error(`[${ctx.flow}:${ctx.id}] ${message}`);
};

const createToken = (user, sessionId) =>
  jwt.sign({ userId: user._id, sessionId }, getJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });


const trackLoginSession = async (user, req, sessionId) => {
  if (!user.settings) user.settings = {};
  if (!user.settings.security) user.settings.security = {};

  const session = {
    sessionId,
    userAgent: String(req.headers?.['user-agent'] || '').slice(0, 300),
    ip: getRequestIp(req),
    createdAt: new Date(),
    lastActiveAt: new Date(),
  };

  const existingSessions = user.settings?.security?.activeSessions || [];
  user.settings.security.activeSessions = [
    session,
    ...existingSessions.filter((item) => item?.sessionId !== sessionId),
  ].slice(0, MAX_ACTIVE_SESSIONS);
  user.settings.security.loginHistory = [
    {
      userAgent: session.userAgent,
      ip: session.ip,
      createdAt: session.createdAt,
    },
    ...(user.settings?.security?.loginHistory || []),
  ].slice(0, 20);

  await user.save({ validateBeforeSave: false });
};

const register = async (req, res) => {
  try {
    const { name, fullName, username, email, password } = req.body || {};
    const displayName = String(fullName || name || username || '').trim();
    const normalizedEmail = normalizeEmail(email);

    if (!displayName || !normalizedEmail || !password) {
      return res.status(400).json({
        success: false,
        message: 'name, email, and password are required',
      });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address' });
    }

    if (String(password).length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters',
      });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const user = new User({
      name: displayName,
      fullName: displayName,
      username: displayName,
      email: normalizedEmail,
      password,
      verified: false,
    });
    await user.save({ validateBeforeSave: false });

    const sessionId = createSessionId();
    await trackLoginSession(user, req, sessionId);
    const token = createToken(user, sessionId);
    const redirectTo = '/profile-setup';

    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      token,
      redirectTo,
      data: { token, user: sanitizeUser(user), redirectTo },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    return res.status(500).json({ success: false, message: 'Failed to register' });
  }
};

const login = async (req, res) => {
  try {
    const { email, username, identifier, password } = req.body || {};
    const loginId = String(identifier || email || username || '').trim();
    const normalizedLoginId = loginId.toLowerCase();

    if (!normalizedLoginId || !password) {
      return res.status(400).json({
        success: false,
        message: 'username/email and password are required',
      });
    }

    const user = await User.findOne({
      $or: [{ email: normalizedLoginId }, { username: normalizedLoginId }],
    }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.isBanned) {
      return res.status(403).json({ success: false, message: 'Account banned', code: 'BANNED' });
    }

    const sessionId = createSessionId();
    await trackLoginSession(user, req, sessionId);

    const token = createToken(user, sessionId);
    const safeUser = sanitizeUser(user);
    const hasCompletedOnboarding =
      typeof user.onboardingCompleted === 'boolean'
        ? user.onboardingCompleted
        : Boolean(user.profileCompleted || user.isFirstLogin === false);
    const redirectTo = hasCompletedOnboarding ? '/' : '/profile-setup';

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      redirectTo,
      data: { token, user: safeUser, redirectTo },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to login' });
  }
};

const getMe = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    return res.status(200).json({
      success: true,
      data: { user: sanitizeUser(req.user) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch user' });
  }
};

const forgotPassword = async (req, res) => {
  const ctx = createLogContext(req, 'forgotPassword');
  try {
    const { username, email, newPassword } = req.body || {};
    const normalizedEmail = normalizeEmail(email);
    const normalizedUsername = String(username || '').trim().toLowerCase();
    const nextPassword = String(newPassword || '');

    logInfo(ctx, 'Route hit', {
      ip: ctx.ip,
      hasUsername: Boolean(normalizedUsername),
      hasEmail: Boolean(normalizedEmail),
      passwordLength: nextPassword.length,
    });

    if (!normalizedUsername || !normalizedEmail || !nextPassword) {
      return res.status(400).json({
        success: false,
        message: 'username, account email, and new password are required',
      });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address' });
    }

    if (nextPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters',
      });
    }

    const user = await User.findOne({ username: normalizedUsername }).select('+password');

    if (!user || normalizeEmail(user.email) !== normalizedEmail) {
      return res.status(400).json({
        success: false,
        message: 'Account details could not be validated',
      });
    }

    user.password = nextPassword;
    if (!user.settings) user.settings = {};
    if (!user.settings.security) user.settings.security = {};
    user.settings.security.activeSessions = [];
    await user.save({ validateBeforeSave: false });

    return res.status(200).json({
      success: true,
      message: 'Password updated. You can now log in.',
    });
  } catch (err) {
    logError(ctx, 'Forgot password error', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to reset password',
    });
  }
};

module.exports = {
  register,
  login,
  forgotPassword,
  getMe,
};
