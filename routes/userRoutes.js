const express = require('express');
const auth = require('../middleware/auth');
const {
  getUserProfile,
  updateProfile,
  uploadAvatar,
  updatePreferences,
  sendPasswordResetEmail,
} = require('../controllers/userController');

const router = express.Router();

router.get('/me', auth, getUserProfile);
router.patch('/update', auth, updateProfile);
router.post('/upload-avatar', auth, uploadAvatar);
router.post('/preferences', auth, updatePreferences);
router.post('/reset-password', auth, sendPasswordResetEmail);

module.exports = router;
