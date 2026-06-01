const express = require('express');

const postRoutes = require('../../routes/postRoutes');
const commentRoutes = require('../../routes/commentRoutes');
const authRoutes = require('../../routes/authRoutes');
const userRoutes = require('../../routes/userRoutes');
const discoveryRoutes = require('../../routes/discoveryRoutes');
const searchRoutes = require('../../routes/searchRoutes');
const notificationRoutes = require('../../routes/notificationRoutes');
const messageRoutes = require('../../routes/messageRoutes');
const adminRoutes = require('../../routes/adminRoutes');
const feedbackRoutes = require('../../routes/feedbackRoutes');

const router = express.Router();

router.use('/posts', postRoutes);
router.use('/comments', commentRoutes);
router.use('/auth', authRoutes);
router.use('/user', userRoutes);
router.use('/discovery', discoveryRoutes);
router.use('/search', searchRoutes);
router.use('/notifications', notificationRoutes);
router.use('/messages', messageRoutes);
router.use('/admin', adminRoutes);
router.use('/feedback', feedbackRoutes);

router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = router;
