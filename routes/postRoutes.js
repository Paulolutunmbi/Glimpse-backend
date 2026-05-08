const express = require('express');
const router = express.Router();
const {
  getPosts,
  getTopics,
  createPost,
  toggleLike,
  toggleSave,
  deletePost,
} = require('../controllers/postController');
const auth = require('../middleware/auth');

router.get('/', getPosts);
router.get('/topics', getTopics);
router.post('/', auth, createPost);
router.put('/:id/like', auth, toggleLike);
router.put('/:id/save', auth, toggleSave);
router.delete('/:id', auth, deletePost);

module.exports = router;
