const express = require('express');
const router = express.Router();
const {
	createComment,
	getCommentsByPost,
	updateComment,
	deleteComment,
} = require('../controllers/commentController');
const auth = require('../middleware/auth');

router.post('/', auth, createComment);
router.put('/:id', auth, updateComment);
router.delete('/:id', auth, deleteComment);
router.get('/:postId', getCommentsByPost);

module.exports = router;
