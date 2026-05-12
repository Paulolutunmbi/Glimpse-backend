const express = require('express');
const auth = require('../middleware/auth');
const requireAdmin = require('../middleware/admin');
const rateLimiter = require('../middleware/rateLimiter');
const {
  listUsers,
  getUserDetails,
  banUser,
  unbanUser,
  deleteUser,
  listReports,
  listActivity,
  verifyAdmin,
} = require('../controllers/adminController');

const router = express.Router();

router.get('/verify', auth, rateLimiter({ windowMs: 5 * 60 * 1000, max: 30 }), requireAdmin(), verifyAdmin);
router.get('/users', auth, requireAdmin(), listUsers);
router.get('/users/:id', auth, requireAdmin(), getUserDetails);
router.patch('/users/:id/ban', auth, requireAdmin(), banUser);
router.patch('/users/:id/unban', auth, requireAdmin(), unbanUser);
router.delete('/users/:id', auth, requireAdmin(), deleteUser);
router.get('/reports', auth, requireAdmin(), listReports);
router.get('/activity', auth, requireAdmin(), listActivity);

module.exports = router;
