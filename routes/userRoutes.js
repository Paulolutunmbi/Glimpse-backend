const express = require('express');
const auth = require('../middleware/auth');
const { uploadProfilePicture } = require('../middleware/upload');
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
router.put('/profile', auth, updateProfile);
router.post('/upload-avatar', auth, uploadProfilePicture, uploadAvatar);
router.post('/upload-profile-picture', auth, uploadProfilePicture, uploadAvatar);
router.post('/preferences', auth, updatePreferences);
router.post('/reset-password', auth, sendPasswordResetEmail);

module.exports = router;
