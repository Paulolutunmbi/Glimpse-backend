const express = require('express');
const router = express.Router();
const { getPosts, createPost, toggleLike } = require('../controllers/postController');

router.get('/', getPosts);
router.post('/', createPost);
router.put('/:id/like', toggleLike);

module.exports = router;
