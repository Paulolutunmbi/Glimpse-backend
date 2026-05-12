const express = require('express');
const auth = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const rateLimiter = require('../middleware/rateLimiter');
const {
  verifyAdmin,
  listUsers,
  getUserDetails,
  banUser,
  unbanUser,
  deleteUser,
} = require('../controllers/adminController');

const router = express.Router();
const adminLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 120 });

router.get('/verify', auth, requireAdmin, verifyAdmin);
router.get('/users', auth, requireAdmin, adminLimiter, listUsers);
router.get('/users/:id', auth, requireAdmin, adminLimiter, getUserDetails);
router.post('/users/:id/ban', auth, requireAdmin, adminLimiter, banUser);
router.post('/users/:id/unban', auth, requireAdmin, adminLimiter, unbanUser);
router.delete('/users/:id', auth, requireAdmin, adminLimiter, deleteUser);

module.exports = router;
