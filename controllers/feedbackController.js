const Feedback = require('../models/Feedback');
const submitFeedback = async (req, res) => {
  const ctx = { flow: 'submitFeedback', id: Date.now().toString(36) };
  try {
    const { email, message } = req.body || {};
    if (!message || !String(message).trim()) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    const doc = await Feedback.create({ email: email || null, message: String(message).trim(), userId: req.userId || null, meta: { ip: req.ip } });

    return res.status(201).json({ success: true, data: doc });
  } catch (err) {
    console.error('[submitFeedback] Feedback submission failed', err && err.message ? err.message : err);
    return res.status(500).json({ success: false, message: 'Failed to submit feedback' });
  }
};

module.exports = { submitFeedback };
