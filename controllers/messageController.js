const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { getIO } = require('../socket');
const { createNotification } = require('../services/notificationService');

const parseCursor = (cursor) => {
  if (!cursor) return null;
  const parts = String(cursor).split('|');
  if (parts.length < 2) return null;
  return { createdAt: new Date(parts[0]), id: parts[1] };
};

const buildCursorQuery = (cursorData) => {
  if (!cursorData?.createdAt) return {};
  return {
    $or: [
      { createdAt: { $lt: cursorData.createdAt } },
      { createdAt: cursorData.createdAt, _id: { $lt: cursorData.id } },
    ],
  };
};

const getConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({ participants: req.userId })
      .sort({ lastMessageAt: -1 })
      .populate('participants', 'username name fullName avatar profile profilePicture verified');

    const viewerId = new mongoose.Types.ObjectId(req.userId);
    const conversationIds = conversations.map((conv) => conv._id);
    const unreadCounts = await Message.aggregate([
      { $match: { conversation: { $in: conversationIds } } },
      { $match: { readBy: { $ne: viewerId } } },
      { $group: { _id: '$conversation', count: { $sum: 1 } } },
    ]);

    const unreadMap = new Map(unreadCounts.map((item) => [String(item._id), item.count]));
    const payload = conversations.map((conv) => ({
      ...conv.toObject(),
      unreadCount: unreadMap.get(String(conv._id)) || 0,
    }));

    return res.status(200).json({ data: payload });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load conversations' });
  }
};

const createConversation = async (req, res) => {
  try {
    const targetId = req.body?.userId;
    if (!targetId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const participants = [String(req.userId), String(targetId)].sort();
    const existing = await Conversation.findOne({ participants: { $all: participants, $size: 2 } })
      .populate('participants', 'username name fullName avatar profile profilePicture verified');

    if (existing) {
      return res.status(200).json({ data: existing });
    }

    const conversation = await Conversation.create({ participants });
    const populated = await Conversation.findById(conversation._id)
      .populate('participants', 'username name fullName avatar profile profilePicture verified');

    return res.status(201).json({ data: populated });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create conversation' });
  }
};

const getMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const cursorData = parseCursor(req.query.cursor);

    const conversation = await Conversation.findById(id).select('participants');
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (!conversation.participants.some((p) => String(p) === String(req.userId))) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const cursorQuery = buildCursorQuery(cursorData);
    const messages = await Message.find({ conversation: id, ...cursorQuery })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .populate('sender', 'username name fullName avatar profile profilePicture verified');

    const hasMore = messages.length > limit;
    const sliced = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore
      ? `${sliced[sliced.length - 1].createdAt.toISOString()}|${sliced[sliced.length - 1]._id}`
      : null;

    return res.status(200).json({ data: sliced, nextCursor, hasMore });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load messages' });
  }
};

const sendMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const text = String(req.body?.text || '').trim();
    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    const conversation = await Conversation.findById(id).select('participants');
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (!conversation.participants.some((p) => String(p) === String(req.userId))) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const message = await Message.create({
      conversation: id,
      sender: req.userId,
      text,
      readBy: [req.userId],
    });

    conversation.lastMessageText = text.slice(0, 160);
    conversation.lastMessageAt = new Date();
    conversation.lastMessageSender = req.userId;
    await conversation.save();

    const populated = await Message.findById(message._id)
      .populate('sender', 'username name fullName avatar profile profilePicture verified');

    try {
      const io = getIO();
      io.to(`conversation:${id}`).emit('message:created', { message: populated, conversationId: id });
      conversation.participants.forEach((participantId) => {
        io.to(String(participantId)).emit('conversation:updated', { conversationId: id });
      });
    } catch (err) {
      console.error('Socket emit failed:', err.message);
    }

    await Promise.all(
      conversation.participants
        .filter((participantId) => String(participantId) !== String(req.userId))
        .map((participantId) =>
          createNotification({
            userId: participantId,
            actorId: req.userId,
            type: 'message',
            messageId: message._id,
            preview: text.slice(0, 120),
          })
        )
    );

    return res.status(201).json({ data: populated });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to send message' });
  }
};

const markConversationRead = async (req, res) => {
  try {
    const { id } = req.params;
    const conversation = await Conversation.findById(id).select('participants');
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (!conversation.participants.some((p) => String(p) === String(req.userId))) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await Message.updateMany(
      { conversation: id, readBy: { $ne: req.userId } },
      { $addToSet: { readBy: req.userId } }
    );
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to mark messages read' });
  }
};

module.exports = {
  getConversations,
  createConversation,
  getMessages,
  sendMessage,
  markConversationRead,
};
