const mongoose = require('mongoose');

const groupMessageSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'GroupChat', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true },
    media: [{ type: String }],
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    deletedAt: { type: Date },
  },
  { timestamps: true }
);

groupMessageSchema.index({ group: 1, createdAt: -1 });
groupMessageSchema.index({ sender: 1 });

module.exports = mongoose.model('GroupMessage', groupMessageSchema);
