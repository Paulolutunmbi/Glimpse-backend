const express = require('express');
const auth = require('../middleware/auth');
const {
  getConversations,
  createConversation,
  getMessages,
  sendMessage,
  markConversationRead,
} = require('../controllers/messageController');
const groupChatController = require('../controllers/groupChatController');

const router = express.Router();

// Group chat routes
router.post('/groups', auth, groupChatController.createGroupChat);
router.get('/groups', auth, groupChatController.getGroupChats);
router.get('/groups/:groupId', auth, groupChatController.getGroupChat);
router.patch('/groups/:groupId', auth, groupChatController.updateGroupChat);

// Group messages
router.get('/groups/:groupId/messages', auth, groupChatController.getGroupMessages);
router.post('/groups/:groupId/messages', auth, groupChatController.sendGroupMessage);
router.delete('/groups/:groupId/messages/:messageId', auth, groupChatController.deleteGroupMessage);

// Group members
router.post('/groups/:groupId/members', auth, groupChatController.addGroupMember);
router.delete('/groups/:groupId/members/:userId', auth, groupChatController.removeGroupMember);
router.delete('/groups/:groupId/leave', auth, groupChatController.leaveGroupChat);

// Group admin operations
router.patch('/groups/:groupId/members/:userId/promote', auth, groupChatController.promoteToAdmin);
router.patch('/groups/:groupId/members/:userId/demote', auth, groupChatController.demoteFromAdmin);

// One-to-one conversation routes
router.get('/conversations', auth, getConversations);
router.post('/conversations', auth, createConversation);
router.get('/:id', auth, getMessages);
router.post('/:id', auth, sendMessage);
router.patch('/:id/read', auth, markConversationRead);

module.exports = router;
