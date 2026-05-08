const express = require('express');
const auth = require('../middleware/auth');
const { uploadProfilePicture } = require('../middleware/upload');
const {
  getCurrentUser,
  getUserProfileById,
  getSuggestedCreators,
  getPublicCreators,
  updateProfile,
  setupProfile,
  uploadAvatar,
  updatePreferences,
  toggleFollow,
  sendPasswordResetEmail,
} = require('../controllers/userController');

const router = express.Router();

router.get('/me', auth, getCurrentUser);
router.get('/creators/public', getPublicCreators);
router.get('/suggested-creators', auth, getSuggestedCreators);
router.get('/profile/:id', auth, getUserProfileById);
router.patch('/update-profile', auth, uploadProfilePicture, updateProfile);
router.patch('/setup-profile', auth, uploadProfilePicture, setupProfile);
router.patch('/update', auth, updateProfile);
router.put('/profile', auth, updateProfile);
router.post('/upload-avatar', auth, uploadProfilePicture, uploadAvatar);
router.post('/upload-profile-picture', auth, uploadProfilePicture, uploadAvatar);
router.post('/preferences', auth, updatePreferences);
router.patch('/follow/:id', auth, toggleFollow);
router.post('/reset-password', auth, sendPasswordResetEmail);

module.exports = router;
