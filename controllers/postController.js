const Post = require('../models/Post');
const User = require('../models/User');
const { getIO } = require('../socket');

const buildProfilePayload = (user) => ({
  user: {
    id: user._id,
    name: user.name,
    fullName: user.fullName || user.name,
    username: user.username || user.name,
    email: user.email,
    isFirstLogin: user.isFirstLogin,
    profileCompleted: user.profileCompleted,
    isVerified: user.isVerified,
    createdAt: user.createdAt,
    profile: {
      avatar: user.profile?.avatar || user.profilePicture || user.avatar || '',
      coverImage: user.profile?.coverImage || '',
      bio: user.profile?.bio ?? user.bio ?? '',
      extraInfo: user.profile?.extraInfo ?? user.extraInfo ?? '',
      preferences:
        user.profile?.preferences?.length ? user.profile.preferences : user.preferences || [],
      joinedAt: user.profile?.joinedAt || user.createdAt,
    },
    stats: user.stats,
    relations: user.relations,
  },
  profile: {
    avatar: user.profile?.avatar || user.profilePicture || user.avatar || '',
    coverImage: user.profile?.coverImage || '',
    bio: user.profile?.bio ?? user.bio ?? '',
    extraInfo: user.profile?.extraInfo ?? user.extraInfo ?? '',
    preferences:
      user.profile?.preferences?.length ? user.profile.preferences : user.preferences || [],
    joinedAt: user.profile?.joinedAt || user.createdAt,
  },
  stats: user.stats,
  relations: user.relations,
  posts: user.posts || [],
  savedPosts: user.savedPosts || [],
});

const emitProfileSnapshot = (user) => {
  try {
    const io = getIO();
    io.emit('profileUpdated', {
      userId: String(user._id),
      profile: buildProfilePayload(user),
    });
  } catch (err) {
    console.error('Socket emit failed:', err.message);
  }
};

const parseList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const normalizeMomentPayload = (body) => {
  const media = Array.isArray(body.media)
    ? body.media
        .map((item) => {
          if (typeof item === 'string') return { url: item, alt: body.title || body.caption || '' };
          return {
            url: String(item?.url || '').trim(),
            alt: String(item?.alt || '').trim(),
          };
        })
        .filter((item) => item.url)
    : [];

  const image = String(body.image || body.imageUrl || media[0]?.url || '').trim();

  return {
    type: body.type || 'image',
    image,
    media: media.length ? media : image ? [{ url: image, alt: body.title || body.caption || '' }] : [],
    title: String(body.title || '').trim(),
    caption: String(body.caption || '').trim(),
    quote: String(body.quote || '').trim(),
    category: String(body.category || '').trim(),
    tags: parseList(body.tags),
    duration: String(body.duration || '').trim(),
    comments: Number(body.comments || 0),
  };
};

const buildPostQuery = (query) => {
  const filters = {};
  const search = String(query.search || '').trim();
  const tag = String(query.tag || '').trim();

  if (search) {
    filters.$or = [
      { caption: { $regex: search, $options: 'i' } },
      { title: { $regex: search, $options: 'i' } },
      { quote: { $regex: search, $options: 'i' } },
      { category: { $regex: search, $options: 'i' } },
      { tags: { $regex: search, $options: 'i' } },
      { 'user.username': { $regex: search, $options: 'i' } },
      { 'user.name': { $regex: search, $options: 'i' } },
    ];
  }

  if (tag && tag.toLowerCase() !== 'all') {
    filters.tags = { $regex: `^${tag.replace(/^#/, '')}$`, $options: 'i' };
  }

  return filters;
};

const getPosts = async (req, res) => {
  try {
    const posts = await Post.find(buildPostQuery(req.query)).sort({ createdAt: -1 });
    res.status(200).json(posts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch posts', details: err.message });
  }
};

const getTopics = async (req, res) => {
  try {
    const tags = await Post.aggregate([
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 12 },
      { $project: { _id: 0, name: '$_id', count: 1 } },
    ]);

    res.status(200).json([{ name: 'All', count: await Post.countDocuments() }, ...tags]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch topics', details: err.message });
  }
};

const createPost = async (req, res) => {
  try {
    const author = req.user;

    if (!author) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const payload = normalizeMomentPayload(req.body || {});

    if (!payload.caption && !payload.quote && !payload.title) {
      return res.status(400).json({ error: 'caption, quote, or title is required' });
    }

    if (!['text', 'quote'].includes(payload.type) && !payload.image) {
      return res.status(400).json({ error: 'image is required for media moments' });
    }

    const post = new Post({
      author: author._id,
      user: {
        username: author.username || author.name,
        name: author.fullName || author.name || author.username,
        avatar: author.profile?.avatar || author.profilePicture || author.avatar || '',
        location: author.profile?.extraInfo || author.extraInfo || '',
      },
      ...payload,
    });

    await post.save();
    const updatedUser = await User.findByIdAndUpdate(
      author._id,
      {
        $addToSet: { posts: post._id },
        $inc: { 'stats.postsCount': 1 },
      },
      { new: true }
    )
      .populate('posts')
      .populate('savedPosts');

    try {
      const io = getIO();
      io.emit('postCreated', { post, userId: String(author._id) });
    } catch (err) {
      console.error('Socket emit failed:', err.message);
    }

    if (updatedUser) {
      emitProfileSnapshot(updatedUser);
    }
    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create post', details: err.message });
  }
};

const toggleLike = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const userIdString = String(userId);
    const alreadyLiked = post.likes.includes(userIdString);
    if (alreadyLiked) {
      post.likes = post.likes.filter((uid) => uid !== userIdString);
    } else {
      post.likes.push(userIdString);
    }
    await post.save();

    try {
      const io = getIO();
      io.to(String(id)).emit('postLiked', {
        postId: String(id),
        likes: post.likes,
        likesCount: post.likes.length,
      });
    } catch (err) {
      console.error('Socket emit failed:', err.message);
    }
    res.status(200).json({ likes: post.likes, isLiked: !alreadyLiked });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle like', details: err.message });
  }
};

const toggleSave = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const userIdString = String(userId);
    const alreadySaved = post.savedBy.includes(userIdString);
    if (alreadySaved) {
      post.savedBy = post.savedBy.filter((uid) => uid !== userIdString);
      await User.findByIdAndUpdate(userId, { $pull: { savedPosts: id } });
    } else {
      post.savedBy.push(userIdString);
      await User.findByIdAndUpdate(userId, { $addToSet: { savedPosts: id } });
    }

    await post.save();
    res.status(200).json({ savedBy: post.savedBy, isSaved: !alreadySaved });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle save', details: err.message });
  }
};

const deletePost = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    if (String(post.author) !== String(userId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await post.deleteOne();
    await User.updateMany({}, { $pull: { savedPosts: id } });
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $pull: { posts: id },
        $inc: { 'stats.postsCount': -1 },
      },
      { new: true }
    )
      .populate('posts')
      .populate('savedPosts');

    try {
      const io = getIO();
      io.emit('postDeleted', { postId: String(id), userId: String(userId) });
    } catch (err) {
      console.error('Socket emit failed:', err.message);
    }

    if (updatedUser) {
      emitProfileSnapshot(updatedUser);
    }

    return res.status(200).json({ success: true, postId: id });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete post', details: err.message });
  }
};

module.exports = { getPosts, getTopics, createPost, toggleLike, toggleSave, deletePost };
