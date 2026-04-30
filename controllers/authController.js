const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('../models/User');

const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;

let cachedMailer = null;

const getMailer = () => {
  if (cachedMailer) return cachedMailer;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';

  if (!host || !user || !pass || !from) {
    throw new Error('SMTP settings not configured');
  }

  cachedMailer = {
    transporter: nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    }),
    from,
  };

  return cachedMailer;
};

const generateVerificationCode = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const sendVerificationEmail = async ({ to, code }) => {
  const { transporter, from } = getMailer();

  await transporter.sendMail({
    from,
    to,
    subject: 'Welcome to Glimpse',
    text: `Your verification code is ${code}. It expires in 10 minutes.`,
  });
};

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT secret not configured');
  }
  return secret;
};

const createToken = (user) =>
  jwt.sign({ userId: user._id }, getJwtSecret(), { expiresIn: '7d' });

const register = async (req, res) => {
  try {
    const { username, email, password } = req.body || {};

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'username, email, and password are required' });
    }

    const normalizedEmail = email.toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const verificationCode = generateVerificationCode();
    const verificationCodeExpires = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);

    const user = new User({
      username,
      email: normalizedEmail,
      password,
      isVerified: false,
      verificationCode,
      verificationCodeExpires,
    });
    await user.save();

    try {
      await sendVerificationEmail({ to: user.email, code: verificationCode });
    } catch (err) {
      await User.findByIdAndDelete(user._id);
      return res.status(500).json({
        error: 'Failed to send verification email',
        details: err.message,
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Verification code sent to email',
      data: { user: { id: user._id, username: user.username, email: user.email } },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to register', details: err.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.isVerified) {
      return res.status(403).json({ error: 'Please verify your email first' });
    }

    const token = createToken(user);
    return res.status(200).json({
      success: true,
      data: {
        token,
        user: { id: user._id, username: user.username, email: user.email },
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to login', details: err.message });
  }
};

const verifyEmail = async (req, res) => {
  try {
    const { email, code } = req.body || {};

    if (!email || !code) {
      return res.status(400).json({ error: 'email and code are required' });
    }

    const normalizedEmail = email.toLowerCase();
    const normalizedCode = String(code).trim();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.isVerified) {
      return res.status(200).json({ success: true, message: 'Email already verified' });
    }

    const isExpired =
      !user.verificationCodeExpires || user.verificationCodeExpires.getTime() < Date.now();

    if (user.verificationCode !== normalizedCode || isExpired) {
      return res.status(400).json({ error: 'Invalid or expired verification code' });
    }

    user.isVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpires = undefined;
    await user.save();

    return res.status(200).json({ success: true, message: 'Email verified successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to verify email', details: err.message });
  }
};

module.exports = { register, login, verifyEmail };
