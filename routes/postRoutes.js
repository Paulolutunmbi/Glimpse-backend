const express = require('express');
const router = express.Router();
const {
	getPosts,
	getFeed,
	createPost,
	updatePost,
	toggleLike,
	trackView,
	sharePost,
	createRepost,
	removeRepost,
	getReposts,
	deletePost,
	updateVisibility,
} = require('../controllers/postController');
const auth = require('../middleware/auth');
const { uploadPostMedia } = require('../middleware/upload');

router.get('/', getPosts);
router.get('/feed', auth, getFeed);
router.post('/', auth, uploadPostMedia, createPost);
router.patch('/:id', auth, uploadPostMedia, updatePost);
router.put('/:id/like', auth, toggleLike);
router.post('/:id/view', auth, trackView);
router.post('/:id/share', auth, sharePost);
router.post('/:id/repost', auth, createRepost);
router.delete('/:id/repost', auth, removeRepost);
router.get('/:id/reposts', auth, getReposts);
router.patch('/:id/visibility', auth, updateVisibility);
router.delete('/:id', auth, deletePost);

module.exports = router;
