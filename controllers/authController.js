const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { isAdminUser } = require('../utils/admin');
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendWelcomeEmail,
} = require('../utils/email/emailService');

const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const MAX_ACTIVE_SESSIONS = 20;

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const hashValue = (value) => crypto.createHash('sha256').update(value).digest('hex');

const generateVerificationCode = () =>
  crypto.randomInt(100000, 1000000).toString();

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
    isVerified: user.isVerified,
    isAdmin: isAdminUser(user),
    isBanned: Boolean(user.isBanned),
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

const attachVerificationCode = (user) => {
  const code = generateVerificationCode();
  user.verificationCode = hashValue(code);
  user.verificationCodeExpires = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);
  return code;
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

    const existingUser = await User.findOne({ email: normalizedEmail }).select('+verificationCode');
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const user = new User({
      name: displayName,
      fullName: displayName,
      username: displayName,
      email: normalizedEmail,
      password,
      isVerified: false,
    });
    const verificationCode = attachVerificationCode(user);

    await user.save({ validateBeforeSave: false });

    try {
      await sendVerificationEmail(user.email, { code: verificationCode, name: user.name });
    } catch (err) {
      await User.findByIdAndDelete(user._id);
      return res.status(502).json({
        success: false,
        message: 'Account was not created because the verification email could not be sent',
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Account created. Verification code sent to email.',
      data: { user: sanitizeUser(user) },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    return res.status(500).json({ success: false, message: 'Failed to register' });
  }
};

const verifyEmail = async (req, res) => {
  try {
    const { email, code } = req.body || {};
    const normalizedEmail = normalizeEmail(email);
    const normalizedCode = String(code || '').trim();

    if (!normalizedEmail || !normalizedCode) {
      return res.status(400).json({ success: false, message: 'email and code are required' });
    }

    if (!/^\d{6}$/.test(normalizedCode)) {
      return res.status(400).json({ success: false, message: 'Verification code must be 6 digits' });
    }

    const user = await User.findOne({ email: normalizedEmail }).select('+verificationCode');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.isVerified) {
      return res.status(200).json({
        success: true,
        message: 'Email already verified',
        data: { user: sanitizeUser(user) },
      });
    }

    const isExpired =
      !user.verificationCodeExpires || user.verificationCodeExpires.getTime() < Date.now();
    const isMatch = user.verificationCode === hashValue(normalizedCode);

    if (!isMatch || isExpired) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
    }

    user.isVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpires = undefined;
    await user.save();

    sendWelcomeEmail(user.email, { name: user.name }).catch((err) => {
      console.error('Failed to send welcome email:', err.message);
    });

    return res.status(200).json({
      success: true,
      message: 'Email verified successfully',
      data: { user: sanitizeUser(user) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to verify email' });
  }
};

const resendVerificationCode = async (req, res) => {
  try {
    const normalizedEmail = normalizeEmail(req.body?.email);

    if (!normalizedEmail) {
      return res.status(400).json({ success: false, message: 'email is required' });
    }

    const user = await User.findOne({ email: normalizedEmail }).select('+verificationCode');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.isVerified) {
      return res.status(200).json({
        success: true,
        message: 'Email already verified',
        data: { user: sanitizeUser(user) },
      });
    }

    const verificationCode = attachVerificationCode(user);
    await user.save();
    await sendVerificationEmail(user.email, { code: verificationCode, name: user.name });

    return res.status(200).json({
      success: true,
      message: 'A new verification code has been sent',
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to resend verification code' });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !password) {
      return res.status(400).json({ success: false, message: 'email and password are required' });
    }

    const user = await User.findOne({ email: normalizedEmail }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.isBanned) {
      return res.status(403).json({ success: false, message: 'Account banned' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (!user.isVerified) {
      return res.status(403).json({ success: false, message: 'Please verify your email first' });
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
  try {
    const normalizedEmail = normalizeEmail(req.body?.email);

    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address' });
    }

    const user = await User.findOne({ email: normalizedEmail }).select('+resetPasswordToken');
    const genericResponse = {
      success: true,
      message: 'If an account exists, a reset link has been sent.',
    };

    if (!user) {
      return res.status(200).json(genericResponse);
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = hashValue(rawToken);
    user.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await user.save({ validateBeforeSave: false });

    const resetBaseUrl =
      process.env.CLIENT_RESET_PASSWORD_URL || 'http://localhost:3000/reset-password';
    const resetUrl = `${resetBaseUrl}?token=${rawToken}`;

    try {
      await sendPasswordResetEmail(user.email, { resetUrl, name: user.name });
    } catch (err) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save({ validateBeforeSave: false });

      return res.status(502).json({
        success: false,
        message: 'Reset email could not be sent. Please try again later.',
      });
    }

    return res.status(200).json(genericResponse);
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ success: false, message: 'Failed to start password reset' });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, password, newPassword } = req.body || {};
    const rawToken = String(token || '').trim();
    const nextPassword = String(newPassword || password || '');

    if (!rawToken || !nextPassword) {
      return res.status(400).json({ success: false, message: 'token and new password are required' });
    }

    if (nextPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters',
      });
    }

    const hashedToken = hashValue(rawToken);
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
    }).select('+password +resetPasswordToken');

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    }

    user.password = nextPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save({ validateBeforeSave: false });

    sendPasswordChangedEmail(user.email, { name: user.name }).catch((err) => {
      console.error('Failed to send password changed email:', err.message);
    });

    return res.status(200).json({
      success: true,
      message: 'Password reset successful. You can now log in.',
    });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ success: false, message: 'Failed to reset password' });
  }
};

module.exports = {
  register,
  login,
  verifyEmail,
  resendVerificationCode,
  forgotPassword,
  resetPassword,
  getMe,
};
