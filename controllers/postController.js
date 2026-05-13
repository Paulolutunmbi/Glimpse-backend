const mongoose = require('mongoose');
const Post = require('../models/Post');
const User = require('../models/User');
const { getIO } = require('../socket');
const { uploadPostMedia, deleteMediaAssets } = require('../services/mediaService');
const { buildVisibilityQuery, getViewerRelations } = require('../utils/visibility');
const { createNotification } = require('../services/notificationService');

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

const normalizeList = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item || '').trim()).filter(Boolean);
      }
    } catch (err) {
      return value
        .split(',')
        .map((item) => String(item || '').trim())
        .filter(Boolean);
    }
  }
  return [];
};

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

const emitAdminAnalyticsUpdated = () => {
  try {
    const io = getIO();
    io.to('admin').emit('admin:analyticsUpdated', { at: new Date().toISOString() });
  } catch (err) {
    console.error('Socket emit failed:', err.message);
  }
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

    const baseQuery = {};
    let sort = { createdAt: -1, _id: -1 };

    if (type === 'reels') {
      baseQuery.type = 'video';
    }

    if (type === 'following') {
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const { following, mutual } = await getViewerRelations(userId);
      const followingIds = [...new Set([...following, String(userId)])];
      baseQuery.author = { $in: followingIds };
      baseQuery.$and = [
        {
          $or: [
            { visibility: 'public' },
            { visibility: 'followers' },
            { visibility: 'friends', author: { $in: mutual } },
            { visibility: 'private', author: String(userId) },
          ],
        },
      ];
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

    const visibilityQuery = await buildVisibilityQuery(userId);
    const cursorQuery = buildCursorQuery(
      cursorData,
      type === 'trending' || type === 'explore' ? 'trending' : 'latest'
    );
    const posts = await Post.find({ ...baseQuery, ...visibilityQuery, ...cursorQuery })
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

    const allowedVisibility = ['public', 'followers', 'friends', 'private'];
    if (visibility && !allowedVisibility.includes(visibility)) {
      return res.status(400).json({ error: 'Invalid visibility option' });
    }

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
      location: req.body?.location || '',
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

    if (post.type === 'video' && post.visibility !== 'private') {
      const followers = author.relations?.followers?.length
        ? author.relations.followers
        : author.followers || [];
      await Promise.all(
        followers.map((followerId) =>
          createNotification({
            userId: followerId,
            actorId: author._id,
            type: 'reel',
            postId: post._id,
            preview: 'posted a new reel',
          })
        )
      );
    }

    try {
      const io = getIO();
      io.emit('post:created', { post });
    } catch (err) {
      console.error('Socket emit failed:', err.message);
    }

    emitAdminAnalyticsUpdated();

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

// PATCH /api/posts/:id — update an existing post
const updatePost = async (req, res) => {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let uploadedMedia = [];

  try {
    const { id } = req.params;
    const { caption, location, visibility, hashtags, removeMedia } = req.body || {};

    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (String(post.author) !== String(userId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const allowedVisibility = ['public', 'followers', 'friends', 'private'];
    if (typeof visibility !== 'undefined' && !allowedVisibility.includes(visibility)) {
      return res.status(400).json({ error: 'Invalid visibility option' });
    }

    const mediaFiles = [
      ...(req.files?.image || []),
      ...(req.files?.media || []),
      ...(req.files?.video || []),
    ];

    if (mediaFiles.length) {
      uploadedMedia = await uploadPostMedia(mediaFiles, {
        postId: post._id,
        userId,
      });
    }

    const shouldRemoveMedia = String(removeMedia || '').toLowerCase() === 'true';
    const replacingMedia = shouldRemoveMedia || uploadedMedia.length > 0;
    const oldMediaPublicIds = replacingMedia
      ? post.media?.map((item) => item.publicId).filter(Boolean) || []
      : [];

    if (typeof caption === 'string') {
      post.caption = caption.trim();
      post.mentions = [...new Set(extractMentions(post.caption))];
    }
    if (typeof location === 'string') {
      post.location = location.trim();
    }
    if (typeof visibility === 'string') {
      post.visibility = visibility;
    }
    if (typeof hashtags !== 'undefined') {
      post.hashtags = [...new Set(normalizeList(hashtags).map((tag) => tag.toLowerCase()))];
    } else if (typeof caption === 'string') {
      post.hashtags = [...new Set(extractHashtags(post.caption))];
    }

    if (replacingMedia) {
      if (uploadedMedia.length) {
        post.media = uploadedMedia;
        post.image = uploadedMedia[0]?.thumbnailUrl || uploadedMedia[0]?.url || '';
      } else {
        post.media = [];
        post.image = '';
      }
    }

    await post.save();

    if (oldMediaPublicIds.length) {
      try {
        await deleteMediaAssets(oldMediaPublicIds);
      } catch (err) {
        console.error('Failed to cleanup Cloudinary assets:', err.message);
      }
    }

    try {
      const io = getIO();
      io.emit('post:updated', { post });
    } catch (err) {
      console.error('Socket emit failed:', err.message);
    }

    emitAdminAnalyticsUpdated();

    return res.status(200).json({ success: true, data: post });
  } catch (err) {
    if (uploadedMedia.length) {
      const publicIds = uploadedMedia.map((item) => item.publicId).filter(Boolean);
      try {
        await deleteMediaAssets(publicIds);
      } catch (cleanupErr) {
        console.error('Failed to cleanup Cloudinary assets:', cleanupErr.message);
      }
    }
    return res.status(500).json({ error: 'Failed to update post', details: err.message });
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

    const visibilityQuery = await buildVisibilityQuery(userId);
    const post = await Post.findOne({ _id: id, ...visibilityQuery });
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const userIdString = String(userId);
    const alreadyLiked = post.likes.includes(userIdString);
    if (alreadyLiked) {
      post.likes = post.likes.filter((uid) => uid !== userIdString);
    } else {
      post.likes.push(userIdString);
    }
    await updateTrendingScore(post);

    if (!alreadyLiked) {
      await createNotification({
        userId: post.author,
        actorId: userId,
        type: 'like',
        postId: post._id,
        preview: 'liked your post',
      });
    }

    try {
      const io = getIO();
      io.to(String(id)).emit('post:liked', {
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
    const visibilityQuery = await buildVisibilityQuery(req.userId);
    const post = await Post.findOneAndUpdate(
      { _id: id, ...visibilityQuery },
      { $inc: { viewCount: 1 } },
      { returnDocument: 'after' }
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
    const visibilityQuery = await buildVisibilityQuery(req.userId);
    const post = await Post.findOneAndUpdate(
      { _id: id, ...visibilityQuery },
      { $inc: { shareCount: 1, shares: 1 } },
      { returnDocument: 'after' }
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
      io.emit('post:deleted', { postId: String(id), userId: String(userId) });
    } catch (err) {
      console.error('Socket emit failed:', err.message);
    }

    emitAdminAnalyticsUpdated();

    return res.status(200).json({ success: true, postId: id });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete post', details: err.message });
  }
};

// PATCH /api/posts/:id/visibility — update post visibility
const updateVisibility = async (req, res) => {
  try {
    const { id } = req.params;
    const { visibility } = req.body || {};

    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const allowed = ['public', 'followers', 'friends', 'private'];
    if (!allowed.includes(visibility)) {
      return res.status(400).json({ error: 'Invalid visibility' });
    }

    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (String(post.author) !== String(req.userId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    post.visibility = visibility;
    await post.save();

    try {
      const io = getIO();
      io.emit('post:visibility', { postId: String(id), visibility });
    } catch (err) {
      console.error('Socket emit failed:', err.message);
    }

    return res.status(200).json({ success: true, visibility });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update visibility', details: err.message });
  }
};

// POST /api/posts/:id/repost — create a repost
const createRepost = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if original post exists and user can see it
    const visibilityQuery = await buildVisibilityQuery(userId);
    const originalPost = await Post.findOne({ _id: id, ...visibilityQuery });
    if (!originalPost) return res.status(404).json({ error: 'Post not found' });

    // Check if user already reposted this
    const existingRepost = await Post.findOne({
      repostOf: id,
      author: userId,
    });
    if (existingRepost) {
      return res.status(400).json({ error: 'You already reposted this post' });
    }

    const author = await User.findById(userId);
    if (!author) return res.status(401).json({ error: 'User not found' });

    // Create repost post
    const repost = new Post({
      author: userId,
      user: {
        username: author.username || author.name,
        name: author.fullName || author.name || '',
        avatar: author.profile?.avatar || author.profilePicture || author.avatar || '',
        location: author.extraInfo || '',
      },
      repostOf: id,
      visibility: 'public',
      type: originalPost.type,
      caption: req.body?.caption || '',
      media: originalPost.media,
      image: originalPost.image,
      title: originalPost.title,
      category: originalPost.category,
      tags: originalPost.tags,
      hashtags: originalPost.hashtags,
      mentions: originalPost.mentions,
    });

    await repost.save();
    
    // Update original post repost count
    await Post.findByIdAndUpdate(id, {
      $inc: { repostCount: 1 },
      $addToSet: { repostedBy: userId },
    });

    // Update user posts
    await User.findByIdAndUpdate(userId, {
      $addToSet: { posts: repost._id },
      $inc: { 'stats.postsCount': 1 },
    });

    // Create notification for original post author
    if (String(originalPost.author) !== String(userId)) {
      await createNotification({
        userId: originalPost.author,
        actorId: userId,
        type: 'repost',
        postId: originalPost._id,
        preview: 'reposted your post',
      });
    }

    // Emit socket event
    try {
      const io = getIO();
      io.emit('post:reposted', {
        originalPostId: String(id),
        repostId: String(repost._id),
        repostCount: originalPost.repostCount + 1,
        userId: String(userId),
      });
    } catch (err) {
      console.error('Socket emit failed:', err.message);
    }

    return res.status(201).json(repost);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create repost', details: err.message });
  }
};

// DELETE /api/posts/:id/repost — remove a repost
const removeRepost = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Find the repost
    const repost = await Post.findOne({
      repostOf: id,
      author: userId,
    });

    if (!repost) {
      return res.status(404).json({ error: 'Repost not found' });
    }

    // Delete the repost
    await Post.findByIdAndDelete(repost._id);
    
    // Update original post
    await Post.findByIdAndUpdate(id, {
      $inc: { repostCount: -1 },
      $pull: { repostedBy: userId },
    });

    // Update user posts
    await User.findByIdAndUpdate(userId, {
      $pull: { posts: repost._id },
      $inc: { 'stats.postsCount': -1 },
    });

    // Emit socket event
    try {
      const io = getIO();
      io.emit('post:unreposted', {
        originalPostId: String(id),
        repostId: String(repost._id),
        userId: String(userId),
      });
    } catch (err) {
      console.error('Socket emit failed:', err.message);
    }

    return res.status(200).json({ success: true, repostId: repost._id });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to remove repost', details: err.message });
  }
};

// GET /api/posts/:id/reposts — get reposts of a post
const getReposts = async (req, res) => {
  try {
    const { id } = req.params;
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const cursor = req.query.cursor;

    const visibilityQuery = await buildVisibilityQuery(req.userId);
    
    // Check if original post exists
    const originalPost = await Post.findOne({ _id: id, ...visibilityQuery });
    if (!originalPost) return res.status(404).json({ error: 'Post not found' });

    const cursorData = parseCursor(cursor);
    const cursorQuery = buildCursorQuery(cursorData);

    const reposts = await Post.find({
      repostOf: id,
      ...visibilityQuery,
      ...cursorQuery,
    })
      .sort({ createdAt: -1 })
      .limit(limit + 1);

    const hasMore = reposts.length > limit;
    const sliced = hasMore ? reposts.slice(0, limit) : reposts;
    const nextCursor = hasMore ? buildCursor(sliced[sliced.length - 1]) : null;

    return res.status(200).json({
      data: sliced,
      nextCursor,
      hasMore,
      repostCount: originalPost.repostCount || 0,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch reposts', details: err.message });
  }
};

module.exports = {
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
};
