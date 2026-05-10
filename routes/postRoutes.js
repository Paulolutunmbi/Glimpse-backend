const express = require('express');
const router = express.Router();
const { getPosts, createPost, toggleLike, deletePost } = require('../controllers/postController');
const auth = require('../middleware/auth');

router.get('/', getPosts);
router.post('/', auth, createPost);
router.put('/:id/like', auth, toggleLike);
router.delete('/:id', auth, deletePost);

module.exports = router;
