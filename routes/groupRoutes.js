const express = require('express');
const router = express.Router();
const groupChatController = require('../controllers/groupChatController');
const auth = require('../middleware/auth');
const { uploadProfilePicture } = require('../middleware/upload');

// All routes require authentication
router.use(auth);

// Group CRUD operations
router.post('/', uploadProfilePicture, groupChatController.createGroupChat);
router.get('/', groupChatController.getGroupChats);
router.get('/:groupId', groupChatController.getGroupChat);
router.patch('/:groupId', uploadProfilePicture, groupChatController.updateGroupChat);

// Messages
router.get('/:groupId/messages', groupChatController.getGroupMessages);
router.post('/:groupId/messages', groupChatController.sendGroupMessage);
router.delete('/:groupId/messages/:messageId', groupChatController.deleteGroupMessage);

// Members
router.post('/:groupId/members', groupChatController.addGroupMember);
router.delete('/:groupId/members/:userId', groupChatController.removeGroupMember);
router.delete('/:groupId/leave', groupChatController.leaveGroupChat);

// Admin operations
router.patch('/:groupId/members/:userId/promote', groupChatController.promoteToAdmin);
router.patch('/:groupId/members/:userId/demote', groupChatController.demoteFromAdmin);

module.exports = router;
