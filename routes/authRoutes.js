const express = require('express');
const router = express.Router();
const {
  register,
  login,
  getMe,
  verifyEmail,
  resendVerificationCode,
  forgotPassword,
  resetPassword,
} = require('../controllers/authController');
const rateLimiter = require('../middleware/rateLimiter');
const auth = require('../middleware/auth');

const authLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 30 });
const sensitiveLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 8 });

router.post('/register', authLimiter, register);
router.post('/signup', authLimiter, register);
router.post('/login', authLimiter, login);
router.get('/me', auth, getMe);
router.post('/verify', sensitiveLimiter, verifyEmail);
router.post('/verify-email', sensitiveLimiter, verifyEmail);
router.post('/resend-verification', sensitiveLimiter, resendVerificationCode);
router.post('/forgot-password', sensitiveLimiter, forgotPassword);
router.post('/reset-password', sensitiveLimiter, resetPassword);

module.exports = router;
