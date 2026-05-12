const Comment = require('../models/Comment');
const User = require('../models/User');
const Post = require('../models/Post');
const { getIO } = require('../socket');
const { createNotification } = require('../services/notificationService');
const { buildVisibilityQuery } = require('../utils/visibility');

const createComment = async (req, res) => {
  try {
    const { postId, text } = req.body || {};
    const trimmedText = String(text || '').trim();

    if (!postId || !trimmedText) {
      return res.status(400).json({ error: 'postId and text are required' });
    }

    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await User.findById(req.userId).select('username avatar profilePicture');
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const visibilityQuery = await buildVisibilityQuery(req.userId);
    const visiblePost = await Post.findOne({ _id: postId, ...visibilityQuery }).select('_id author');
    if (!visiblePost) {
      return res.status(403).json({ error: 'Not allowed to comment on this post' });
    }

    const comment = new Comment({
      postId,
      userId: String(req.userId),
      username: user.username,
      avatar: user.profilePicture || user.avatar || '',
      text: trimmedText,
    });

    await comment.save();
    await Post.findByIdAndUpdate(postId, { $inc: { comments: 1 } }).catch(() => null);

    if (visiblePost?.author) {
      await createNotification({
        userId: visiblePost.author,
        actorId: req.userId,
        type: 'comment',
        postId,
        commentId: comment._id,
        preview: trimmedText.slice(0, 120),
      });
    }
    try {
      const io = getIO();
      io.to(String(postId)).emit('comment:created', { comment });
    } catch (err) {
      console.error('Socket emit failed:', err.message);
    }
    return res.status(201).json(comment);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create comment', details: err.message });
  }
};

const getCommentsByPost = async (req, res) => {
  try {
    const { postId } = req.params;
    const visibilityQuery = await buildVisibilityQuery(req.userId);
    const visiblePost = await Post.findOne({ _id: postId, ...visibilityQuery }).select('_id');
    if (!visiblePost) {
      return res.status(403).json({ error: 'Not allowed to view comments on this post' });
    }

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
    const trimmedText = String(text || '').trim();

    if (!trimmedText) {
      return res.status(400).json({ error: 'text is required' });
    }

    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (String(req.userId) !== String(comment.userId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    comment.text = trimmedText;
    await comment.save();

    try {
      const io = getIO();
      io.to(String(comment.postId)).emit('comment:updated', { comment });
    } catch (err) {
      console.error('Socket emit failed:', err.message);
    }

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

    if (String(req.userId) !== String(comment.userId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await comment.deleteOne();
    await Post.findByIdAndUpdate(comment.postId, { $inc: { comments: -1 } }).catch(() => null);
    try {
      const io = getIO();
      io.to(String(comment.postId)).emit('comment:deleted', {
        commentId: String(comment._id),
        postId: String(comment.postId),
      });
    } catch (err) {
      console.error('Socket emit failed:', err.message);
    }
    return res.status(200).json({ success: true, data: comment });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete comment', details: err.message });
  }
};

module.exports = { createComment, getCommentsByPost, updateComment, deleteComment };
