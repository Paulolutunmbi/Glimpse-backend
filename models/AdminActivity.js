const mongoose = require('mongoose');

const adminActivitySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ['ban', 'unban', 'delete', 'auto-ban', 'update'],
      required: true,
    },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    targetUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

adminActivitySchema.index({ createdAt: -1 });

module.exports = mongoose.model('AdminActivity', adminActivitySchema);
