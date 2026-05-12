const express = require('express');
const auth = require('../middleware/auth');
const {
  getConversations,
  createConversation,
  getMessages,
  sendMessage,
  markConversationRead,
} = require('../controllers/messageController');

const router = express.Router();

router.get('/conversations', auth, getConversations);
router.post('/conversations', auth, createConversation);
router.get('/:id', auth, getMessages);
router.post('/:id', auth, sendMessage);
router.patch('/:id/read', auth, markConversationRead);

module.exports = router;
