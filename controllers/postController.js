const Post = require('../models/Post');

// GET /api/posts — latest first
const getPosts = async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 });
    res.status(200).json(posts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch posts', details: err.message });
  }
};

// POST /api/posts — create a new post
const createPost = async (req, res) => {
  try {
    const { user, image, caption, comments } = req.body;
    if (!user?.username || !user?.avatar || !image) {
      return res.status(400).json({ error: 'user.username, user.avatar, and image are required' });
    }
    const post = new Post({ user, image, caption, comments: comments || 0 });
    await post.save();
    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create post', details: err.message });
  }
};

// PUT /api/posts/:id/like — toggle like for authenticated user
const toggleLike = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const alreadyLiked = post.likes.includes(userId);
    if (alreadyLiked) {
      post.likes = post.likes.filter((uid) => uid !== userId);
    } else {
      post.likes.push(userId);
    }
    await post.save();
    res.status(200).json({ likes: post.likes, isLiked: !alreadyLiked });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle like', details: err.message });
  }
};

module.exports = { getPosts, createPost, toggleLike };
