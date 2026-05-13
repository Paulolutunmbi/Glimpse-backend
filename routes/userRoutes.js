const express = require('express');
const auth = require('../middleware/auth');
const { uploadProfilePicture, uploadCoverImage } = require('../middleware/upload');
const {
  getUserProfile,
  getUserProfileById,
  getUserProfileByUsername,
  updateProfile,
  uploadAvatar,
  uploadCoverImage: uploadCoverImageController,
  updatePreferences,
  sendPasswordResetEmail,
  followUser,
  unfollowUser,
  savePost,
  unsavePost,
  getProfileStats,
  getSavedMoments,
} = require('../controllers/userController');
const {
  getSettings,
  updateSettings,
  updatePrivacy,
  updateNotifications,
  updateAppearance,
  logoutOtherSessions,
  blockUser,
  unblockUser,
  muteUser,
  unmuteUser,
} = require('../controllers/settingsController');

const router = express.Router();

router.get('/me', auth, getUserProfile);
router.get('/u/:username', getUserProfileByUsername);
router.get('/profile/:id', auth, getUserProfileById);
router.get('/profile/:id/stats', auth, getProfileStats);
router.patch('/update', auth, updateProfile);
router.put('/profile', auth, updateProfile);
router.post('/follow/:id', auth, followUser);
router.post('/unfollow/:id', auth, unfollowUser);
router.post('/saved/:id', auth, savePost);
router.delete('/saved/:id', auth, unsavePost);
router.get('/saved', auth, getSavedMoments);
router.post('/upload-avatar', auth, uploadProfilePicture, uploadAvatar);
router.post('/upload-profile-picture', auth, uploadProfilePicture, uploadAvatar);
router.post('/upload-cover-image', auth, uploadCoverImage, uploadCoverImageController);
router.post('/preferences', auth, updatePreferences);
router.post('/reset-password', auth, sendPasswordResetEmail);
router.get('/settings', auth, getSettings);
router.patch('/settings', auth, updateSettings);
router.patch('/settings/privacy', auth, updatePrivacy);
router.patch('/settings/notifications', auth, updateNotifications);
router.patch('/settings/appearance', auth, updateAppearance);
router.post('/settings/logout-others', auth, logoutOtherSessions);
router.post('/settings/block', auth, blockUser);
router.post('/settings/unblock', auth, unblockUser);
router.post('/settings/mute', auth, muteUser);
router.post('/settings/unmute', auth, unmuteUser);

module.exports = router;
