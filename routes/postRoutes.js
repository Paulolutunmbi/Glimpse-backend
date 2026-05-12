const express = require('express');
const router = express.Router();
const {
	getPosts,
	getFeed,
	createPost,
	toggleLike,
	trackView,
	sharePost,
	deletePost,
	updateVisibility,
} = require('../controllers/postController');
const auth = require('../middleware/auth');
const { uploadPostMedia } = require('../middleware/upload');

router.get('/', getPosts);
router.get('/feed', auth, getFeed);
router.post('/', auth, uploadPostMedia, createPost);
router.put('/:id/like', auth, toggleLike);
router.post('/:id/view', auth, trackView);
router.post('/:id/share', auth, sharePost);
router.patch('/:id/visibility', auth, updateVisibility);
router.delete('/:id', auth, deletePost);

module.exports = router;
