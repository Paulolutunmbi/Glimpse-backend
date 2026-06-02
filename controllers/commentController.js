const Comment = require('../models/Comment');
const User = require('../models/User');
const Post = require('../models/Post');
const { getIO } = require('../socket');
const { createNotification } = require('../services/notificationService');
const { buildVisibilityQuery } = require('../utils/visibility');

const EDIT_WINDOW_MINUTES = Math.max(
  1,
  Number(process.env.COMMENT_EDIT_WINDOW_MINUTES || 15)
);
const DELETE_WINDOW_MINUTES = Math.max(
  1,
  Number(process.env.COMMENT_DELETE_WINDOW_MINUTES || EDIT_WINDOW_MINUTES)
);

const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60 * 1000);

const canMutateComment = (comment, action) => {
  const now = Date.now();
  const limit = action === 'delete' ? comment?.deleteWindowUntil : comment?.editWindowUntil;
  return limit ? new Date(limit).getTime() >= now : false;
};

const serializeComment = (comment, viewerId) => {
  const payload = comment?.toObject ? comment.toObject() : comment;
  const isOwner = String(payload?.userId || '') === String(viewerId || '');
  return {
    ...payload,
    verified: payload?.verified ?? true,
    isEdited: Boolean(payload?.isEdited),
    canEdit: isOwner ? canMutateComment(payload, 'edit') : false,
    canDelete: isOwner ? canMutateComment(payload, 'delete') : false,
  };
};

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

    const user = await User.findById(req.userId).select('username avatar profilePicture verified');
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const visibilityQuery = await buildVisibilityQuery(req.userId);
    const visiblePost = await Post.findOne({ _id: postId, ...visibilityQuery }).select('_id author');
    if (!visiblePost) {
      return res.status(403).json({ error: 'Not allowed to comment on this post' });
    }

    const parentCommentId = req.body?.parentCommentId || null;
    if (parentCommentId) {
      const parent = await Comment.findOne({ _id: parentCommentId, postId }).select('_id postId');
      if (!parent) {
        return res.status(400).json({ error: 'Invalid parentCommentId for this post' });
      }
    }

    const comment = new Comment({
      postId,
      parentCommentId,
      userId: String(req.userId),
      username: user.username,
      avatar: user.profilePicture || user.avatar || '',
      verified: user.verified ?? user.isVerified ?? true,
      text: trimmedText,
      editWindowUntil: addMinutes(new Date(), EDIT_WINDOW_MINUTES),
      deleteWindowUntil: addMinutes(new Date(), DELETE_WINDOW_MINUTES),
    });

    await comment.save();
    const updatedPost = await Post.findByIdAndUpdate(
      postId,
      { $inc: { comments: 1 } },
      { new: true }
    ).select('comments');
    const commentsCount = updatedPost?.comments;

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
      io.to(String(postId)).emit('comment:created', {
        comment: serializeComment(comment, req.userId),
        postId: String(postId),
        commentsCount,
      });
    } catch (err) {
      console.error('Socket emit failed:', err.message);
    }
    return res.status(201).json({
      comment: serializeComment(comment, req.userId),
      commentsCount,
    });
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
    return res.status(200).json(comments.map((comment) => serializeComment(comment, req.userId)));
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

    if (!canMutateComment(comment, 'edit')) {
      return res.status(403).json({
        error: `Comment can only be edited within ${EDIT_WINDOW_MINUTES} minute(s) of posting`,
      });
    }

    comment.text = trimmedText;
    comment.isEdited = true;
    comment.editedAt = new Date();
    await comment.save();

    try {
      const io = getIO();
      io.to(String(comment.postId)).emit('comment:updated', {
        comment: serializeComment(comment, req.userId),
      });
    } catch (err) {
      console.error('Socket emit failed:', err.message);
    }

    return res.status(200).json({ success: true, data: serializeComment(comment, req.userId) });
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

    if (!canMutateComment(comment, 'delete')) {
      return res.status(403).json({
        error: `Comment can only be deleted within ${DELETE_WINDOW_MINUTES} minute(s) of posting`,
      });
    }

    await comment.deleteOne();
    const updatedPost = await Post.findByIdAndUpdate(
      comment.postId,
      { $inc: { comments: -1 } },
      { new: true }
    ).select('comments');
    const commentsCount = updatedPost?.comments;
    try {
      const io = getIO();
      io.to(String(comment.postId)).emit('comment:deleted', {
        commentId: String(comment._id),
        postId: String(comment.postId),
        commentsCount,
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
