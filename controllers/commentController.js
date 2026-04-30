const Comment = require('../models/Comment');
const User = require('../models/User');

const createComment = async (req, res) => {
  try {
    const { postId, text } = req.body || {};

    if (!postId || !text) {
      return res.status(400).json({ error: 'postId and text are required' });
    }

    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await User.findById(req.userId).select('username');
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const comment = new Comment({
      postId,
      userId: req.userId,
      username: user.username,
      text,
    });

    await comment.save();
    return res.status(201).json(comment);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create comment', details: err.message });
  }
};

const getCommentsByPost = async (req, res) => {
  try {
    const { postId } = req.params;
    const comments = await Comment.find({ postId }).sort({ createdAt: 1 });
    return res.status(200).json(comments);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch comments', details: err.message });
  }
};

const updateComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body || {};

    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (req.userId !== comment.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    comment.text = text;
    await comment.save();

    return res.status(200).json({ success: true, data: comment });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update comment', details: err.message });
  }
};

const deleteComment = async (req, res) => {
  try {
    const { id } = req.params;

    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (req.userId !== comment.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await comment.deleteOne();
    return res.status(200).json({ success: true, data: comment });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete comment', details: err.message });
  }
};

module.exports = { createComment, getCommentsByPost, updateComment, deleteComment };
