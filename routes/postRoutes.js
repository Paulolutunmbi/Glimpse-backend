const express = require('express');
const router = express.Router();
const { getPosts, createPost, toggleLike } = require('../controllers/postController');
const auth = require('../middleware/auth');

router.get('/', getPosts);
router.post('/', createPost);
router.put('/:id/like', auth, toggleLike);

module.exports = router;
