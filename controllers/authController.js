const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');

const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const hashValue = (value) => crypto.createHash('sha256').update(value).digest('hex');

const generateVerificationCode = () =>
  crypto.randomInt(100000, 1000000).toString();

const sanitizeUser = (user) => ({
  id: user._id,
  name: user.name,
  username: user.name,
  email: user.email,
  isVerified: user.isVerified,
  createdAt: user.createdAt,
});

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET must be configured');
  }
  return secret;
};

const createToken = (user) =>
  jwt.sign({ userId: user._id }, getJwtSecret(), { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

const sendVerificationEmail = async ({ to, code }) => {
  await sendEmail({
    to,
    subject: 'Verify your Glimpse email',
    text: `Your Glimpse verification code is ${code}. It expires in 10 minutes.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f1f1f">
        <h2>Verify your Glimpse email</h2>
        <p>Your verification code is:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p>
        <p>This code expires in 10 minutes.</p>
      </div>
    `,
  });
};

const sendPasswordResetEmail = async ({ to, resetUrl }) => {
  await sendEmail({
    to,
    subject: 'Reset your Glimpse password',
    text: `Use this link to reset your password. It expires in 15 minutes: ${resetUrl}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f1f1f">
        <h2>Reset your password</h2>
        <p>This link expires in 15 minutes.</p>
        <p><a href="${resetUrl}" style="color:#ff5a5f">Reset password</a></p>
      </div>
    `,
  });
};

const attachVerificationCode = (user) => {
  const code = generateVerificationCode();
  user.verificationCode = hashValue(code);
  user.verificationCodeExpires = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);
  return code;
};

const register = async (req, res) => {
  try {
    const { name, username, email, password } = req.body || {};
    const displayName = String(name || username || '').trim();
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
      email: normalizedEmail,
      password,
      isVerified: false,
    });
    const verificationCode = attachVerificationCode(user);

    await user.save({ validateBeforeSave: false });

    try {
      await sendVerificationEmail({ to: user.email, code: verificationCode });
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
    await sendVerificationEmail({ to: user.email, code: verificationCode });

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

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (!user.isVerified) {
      return res.status(403).json({ success: false, message: 'Please verify your email first' });
    }

    const token = createToken(user);
    const safeUser = sanitizeUser(user);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      data: { token, user: safeUser },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to login' });
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
      await sendPasswordResetEmail({ to: user.email, resetUrl });
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
};
