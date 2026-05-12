const express = require('express');
const auth = require('../middleware/auth');
const {
  getNotifications,
  markRead,
  markAllRead,
} = require('../controllers/notificationController');

const router = express.Router();

router.get('/', auth, getNotifications);
router.patch('/:id/read', auth, markRead);
router.patch('/read-all', auth, markAllRead);

module.exports = router;
