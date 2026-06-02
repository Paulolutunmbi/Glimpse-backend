const express = require('express');
const router = express.Router();
const {
  register,
  login,
  getMe,
  forgotPassword,
} = require('../controllers/authController');
const rateLimiter = require('../middleware/rateLimiter');
const auth = require('../middleware/auth');

const authLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 30 });
const sensitiveLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 8 });

router.post('/register', authLimiter, register);
router.post('/signup', authLimiter, register);
router.post('/login', authLimiter, login);
router.get('/me', auth, getMe);
router.post('/forgot-password', sensitiveLimiter, forgotPassword);

module.exports = router;
