const Comment = require('../models/Comment');

const createComment = async (req, res) => {
  try {
    const { postId, userId, username, text } = req.body || {};

    if (!postId || !text) {
      return res.status(400).json({ error: 'postId and text are required' });
    }

    const comment = new Comment({
      postId,
      userId: userId || 'guest',
      username: username || 'Guest',
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

module.exports = { createComment, getCommentsByPost };
