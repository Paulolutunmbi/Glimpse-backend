const Feedback = require('../models/Feedback');
const { sendRawEmail, sendTemplateEmail } = require('../utils/email/emailService');
const submitFeedback = async (req, res) => {
  const ctx = { flow: 'submitFeedback', id: Date.now().toString(36) };
  try {
    const { email, message } = req.body || {};
    if (!message || !String(message).trim()) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    const doc = await Feedback.create({ email: email || null, message: String(message).trim(), userId: req.userId || null, meta: { ip: req.ip } });

    // Send to support
    try {
      const supportTo = process.env.SUPPORT_EMAIL || 'oluwatunmbipaul@gmail.com';
      await sendTemplateEmail({
        to: supportTo,
        template: 'feedbackReceivedEmail',
        data: {
          email: email || 'anonymous',
          message: String(message).trim(),
          timestamp: doc.createdAt,
        },
        version: 'v1',
      });
    } catch (errEmail) {
      console.warn('[submitFeedback] Failed sending feedback to support', errEmail && errEmail.message ? errEmail.message : errEmail);
    }

    return res.status(201).json({ success: true, data: doc });
  } catch (err) {
    console.error('[submitFeedback] Feedback submission failed', err && err.message ? err.message : err);
    return res.status(500).json({ success: false, message: 'Failed to submit feedback' });
  }
};

module.exports = { submitFeedback };
