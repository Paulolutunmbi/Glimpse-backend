const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema(
  {
    email: { type: String, trim: true, lowercase: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    message: { type: String, required: true, trim: true },
    meta: { type: Object },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Feedback', feedbackSchema);
