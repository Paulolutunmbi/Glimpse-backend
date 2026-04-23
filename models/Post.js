const mongoose = require('mongoose');

const postSchema = new mongoose.Schema(
  {
    user: {
      username: { type: String, required: true },
      avatar: { type: String, required: true },
      location: { type: String, default: '' },
    },
    image: { type: String, required: true },
    caption: { type: String, default: '' },
    likes: { type: [String], default: [] }, // array of userIds (or IP strings for demo)
    comments: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Post', postSchema);
