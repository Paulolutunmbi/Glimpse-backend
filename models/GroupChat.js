const mongoose = require('mongoose');

const groupChatSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    image: { type: String },
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'GroupMessage' },
    lastMessageAt: { type: Date },
  },
  { timestamps: true }
);

groupChatSchema.index({ members: 1 });
groupChatSchema.index({ admin: 1 });
groupChatSchema.index({ lastMessageAt: -1 });

module.exports = mongoose.model('GroupChat', groupChatSchema);
