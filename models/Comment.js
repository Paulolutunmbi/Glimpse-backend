const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    postId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Post' },
    userId: { type: String, default: 'guest' },
    username: { type: String, default: 'Guest' },
    avatar: { type: String, default: '' },
    text: { type: String, required: true, trim: true },
    isEdited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
    editWindowUntil: {
      type: Date,
      default: () => new Date(Date.now() + 15 * 60 * 1000),
    },
    deleteWindowUntil: {
      type: Date,
      default: () => new Date(Date.now() + 15 * 60 * 1000),
    },
  },
  { timestamps: true }
);

commentSchema.index({ postId: 1, createdAt: -1 });
commentSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Comment', commentSchema);
