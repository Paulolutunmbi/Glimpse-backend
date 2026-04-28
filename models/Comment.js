const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    postId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Post' },
    userId: { type: String, default: 'guest' },
    username: { type: String, default: 'Guest' },
    text: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Comment', commentSchema);
