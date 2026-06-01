const express = require('express');
const { submitFeedback } = require('../controllers/feedbackController');
const auth = require('../middleware/auth');

const router = express.Router();

// Allow both authenticated and unauthenticated submissions. If JWT present, auth middleware will populate req.userId.
router.post('/', submitFeedback);

module.exports = router;
