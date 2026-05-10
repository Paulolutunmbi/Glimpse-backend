const mongoose = require('mongoose');
const Post = require('../models/Post');
const User = require('../models/User');
const { getIO } = require('../socket');
const { uploadPostMedia, deleteMediaAssets } = require('../services/mediaService');

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

const normalizeList = (value) =>
  Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];

const extractHashtags = (text) => {
  if (!text) return [];
  const matches = String(text).match(/#([a-zA-Z0-9_]+)/g) || [];
  return matches.map((tag) => tag.replace('#', '').toLowerCase());
};

const extractMentions = (text) => {
  if (!text) return [];
  const matches = String(text).match(/@([a-zA-Z0-9_]+)/g) || [];
  return matches.map((tag) => tag.replace('@', '').toLowerCase());
};

const computeTrendingScore = (post) => {
  const likes = post.likes?.length || 0;
  const comments = post.comments || 0;
  const shares = post.shareCount || post.shares || 0;
  const saves = post.saveCount || 0;
  const views = post.viewCount || 0;
  const base = likes * 2 + comments * 3 + shares * 4 + saves * 3 + views * 0.1;
  const hours = Math.max(1, (Date.now() - new Date(post.createdAt).getTime()) / 36e5);
  return Number((base / Math.pow(hours + 2, 1.3)).toFixed(4));
};

const updateTrendingScore = async (post) => {
  const nextScore = computeTrendingScore(post);
  post.trendingScore = nextScore;
  post.scoreUpdatedAt = new Date();
  await post.save();
  try {
    const io = getIO();
    io.emit('trendingUpdated', { postId: String(post._id), score: nextScore });
  } catch (err) {
    console.error('Socket emit failed:', err.message);
  }
  return nextScore;
};

const parseCursor = (cursor) => {
  if (!cursor) return null;
  const parts = String(cursor).split('|');
  if (parts.length < 2) return null;
  return {
    score: Number(parts[0]),
    createdAt: new Date(parts[1]),
    id: parts[2],
  };
};

const buildCursor = (post, mode = 'latest') => {
  if (!post) return null;
  if (mode === 'trending') {
    return `${post.trendingScore || 0}|${post.createdAt.toISOString()}|${post._id}`;
  }
  return `${post.createdAt.toISOString()}|${post._id}`;
};

const buildCursorQuery = (cursorData, mode = 'latest') => {
  if (!cursorData?.createdAt) return {};

  if (mode === 'trending') {
    return {
      $or: [
        { trendingScore: { $lt: cursorData.score } },
        {
          trendingScore: cursorData.score,
          createdAt: { $lt: cursorData.createdAt },
        },
        {
          trendingScore: cursorData.score,
          createdAt: cursorData.createdAt,
          _id: { $lt: cursorData.id },
        },
      ],
    };
  }

  return {
    $or: [
      { createdAt: { $lt: cursorData.createdAt } },
      { createdAt: cursorData.createdAt, _id: { $lt: cursorData.id } },
    ],
  };
};

const feedCache = new Map();
const getCacheKey = (type, cursor, limit, userId) =>
  `${type}:${cursor || 'start'}:${limit}:${userId || 'anon'}`;

const setFeedCache = (key, value, ttlMs = 30 * 1000) => {
  feedCache.set(key, { value, expiresAt: Date.now() + ttlMs });
};

const getFeedCache = (key) => {
  const entry = feedCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    feedCache.delete(key);
    return null;
  }
  return entry.value;
};

// GET /api/posts — legacy latest feed
const getPosts = async (req, res) => {
  try {
    const posts = await Post.find({ visibility: 'public' }).sort({ createdAt: -1 });
    res.status(200).json(posts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch posts', details: err.message });
  }
};

// GET /api/posts/feed
const getFeed = async (req, res) => {
  try {
    const type = String(req.query.type || 'latest');
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const cursorData = parseCursor(req.query.cursor);
    const userId = req.userId;

    const cacheKey = getCacheKey(type, req.query.cursor, limit, userId);
    if (['trending', 'explore'].includes(type)) {
      const cached = getFeedCache(cacheKey);
      if (cached) return res.status(200).json(cached);
    }

    const baseQuery = { visibility: 'public' };
    let sort = { createdAt: -1, _id: -1 };

    if (type === 'following') {
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const user = await User.findById(userId).select('relations.following following');
      const following = user?.relations?.following?.length
        ? user.relations.following
        : user?.following || [];
      baseQuery.author = { $in: following };
    }

    if (type === 'personalized') {
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const user = await User.findById(userId).select('profile.preferences preferences');
      const preferences = user?.profile?.preferences?.length
        ? user.profile.preferences
        : user?.preferences || [];
      if (preferences.length) {
        baseQuery.tags = { $in: preferences };
      }
    }

    if (type === 'trending' || type === 'explore') {
      sort = { trendingScore: -1, createdAt: -1, _id: -1 };
    }

    const cursorQuery = buildCursorQuery(cursorData, type === 'trending' || type === 'explore' ? 'trending' : 'latest');
    const posts = await Post.find({ ...baseQuery, ...cursorQuery })
      .sort(sort)
      .limit(limit + 1);

    const hasMore = posts.length > limit;
    const sliced = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore
      ? buildCursor(sliced[sliced.length - 1], type === 'trending' || type === 'explore' ? 'trending' : 'latest')
      : null;

    const payload = { data: sliced, nextCursor, hasMore };
    if (['trending', 'explore'].includes(type)) {
      setFeedCache(cacheKey, payload);
    }

    return res.status(200).json(payload);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load feed', details: err.message });
  }
};

// POST /api/posts — create a new post
const createPost = async (req, res) => {
  const author = req.user;
  if (!author) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const newPostId = new mongoose.Types.ObjectId();
  let uploadedMedia = [];

  try {
    const {
      image,
      caption,
      title,
      category,
      tags,
      hashtags,
      mentions,
      visibility,
      repostOf,
    } = req.body || {};

    const mediaFiles = [
      ...(req.files?.image || []),
      ...(req.files?.media || []),
      ...(req.files?.video || []),
    ];

    if (mediaFiles.length) {
      uploadedMedia = await uploadPostMedia(mediaFiles, {
        postId: newPostId,
        userId: author._id,
      });
    }

    const normalizedTags = normalizeList(tags).map((tag) => tag.toLowerCase());
    const combinedHashtags = [
      ...new Set([
        ...normalizeList(hashtags).map((tag) => tag.toLowerCase()),
        ...extractHashtags(caption),
      ]),
    ];
    const combinedMentions = [
      ...new Set([
        ...normalizeList(mentions).map((tag) => tag.toLowerCase()),
        ...extractMentions(caption),
      ]),
    ];

    if (!uploadedMedia.length && !image && !caption && !title) {
      return res.status(400).json({ error: 'Post content is required' });
    }

    const fallbackMedia = image
      ? [{ url: image, alt: title || caption || 'Moment media' }]
      : [];

    const post = new Post({
      _id: newPostId,
      author: author._id,
      user: {
        username: author.username || author.name,
        name: author.fullName || author.name || '',
        avatar: author.profile?.avatar || author.profilePicture || author.avatar || '',
        location: author.extraInfo || '',
      },
      visibility: visibility || 'public',
      title: title || '',
      caption: caption || '',
      category: category || '',
      tags: normalizedTags,
      hashtags: combinedHashtags,
      mentions: combinedMentions,
      media: uploadedMedia.length ? uploadedMedia : fallbackMedia,
      image: uploadedMedia.length ? uploadedMedia[0]?.url : image || '',
      repostOf: repostOf || undefined,
    });

    await post.save();
    await User.findByIdAndUpdate(author._id, {
      $addToSet: { posts: post._id },
      $inc: { 'stats.postsCount': 1 },
    });

    try {
      const io = getIO();
      io.emit('post:created', { post });
      io.emit('postCreated', { post });
    } catch (err) {
      console.error('Socket emit failed:', err.message);
    }

    return res.status(201).json(post);
  } catch (err) {
    if (uploadedMedia.length) {
      const publicIds = uploadedMedia.map((item) => item.publicId).filter(Boolean);
      try {
        await deleteMediaAssets(publicIds);
      } catch (cleanupErr) {
        console.error('Failed to cleanup Cloudinary assets:', cleanupErr.message);
      }
    }
    return res.status(500).json({ error: 'Failed to create post', details: err.message });
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

    const userIdString = String(userId);
    const alreadyLiked = post.likes.includes(userIdString);
    if (alreadyLiked) {
      post.likes = post.likes.filter((uid) => uid !== userIdString);
    } else {
      post.likes.push(userIdString);
    }
    await updateTrendingScore(post);

    try {
      const io = getIO();
      io.to(String(id)).emit('post:liked', {
        postId: String(id),
        likes: post.likes,
        likesCount: post.likes.length,
      });
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

// POST /api/posts/:id/view — increment view count
const trackView = async (req, res) => {
  try {
    const { id } = req.params;
    const post = await Post.findByIdAndUpdate(
      id,
      { $inc: { viewCount: 1 } },
      { new: true }
    );

    if (!post) return res.status(404).json({ error: 'Post not found' });

    await updateTrendingScore(post);
    return res.status(200).json({ success: true, viewCount: post.viewCount });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to track view', details: err.message });
  }
};

// POST /api/posts/:id/share — increment share count
const sharePost = async (req, res) => {
  try {
    const { id } = req.params;
    const post = await Post.findByIdAndUpdate(
      id,
      { $inc: { shareCount: 1, shares: 1 } },
      { new: true }
    );

    if (!post) return res.status(404).json({ error: 'Post not found' });

    await updateTrendingScore(post);
    return res.status(200).json({ success: true, shareCount: post.shareCount });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to share post', details: err.message });
  }
};

// DELETE /api/posts/:id — delete a post
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

    const publicIds = post.media?.map((item) => item.publicId).filter(Boolean) || [];
    await post.deleteOne();
    await User.findByIdAndUpdate(userId, {
      $pull: { posts: id },
      $inc: { 'stats.postsCount': -1 },
    });

    if (publicIds.length) {
      try {
        await deleteMediaAssets(publicIds);
      } catch (err) {
        console.error('Failed to cleanup Cloudinary assets:', err.message);
      }
    }

    try {
      const io = getIO();
      io.emit('postDeleted', { postId: String(id), userId: String(userId) });
    } catch (err) {
      console.error('Socket emit failed:', err.message);
    }

    return res.status(200).json({ success: true, postId: id });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete post', details: err.message });
  }
};

module.exports = {
  getPosts,
  getFeed,
  createPost,
  toggleLike,
  trackView,
  sharePost,
  deletePost,
};
