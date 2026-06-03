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

const parseCursor = (cursor, mode = 'latest') => {
  if (!cursor) return null;
  const parts = String(cursor).split('|');
  if (mode === 'trending') {
    if (parts.length < 3) return null;
    const createdAt = new Date(parts[1]);
    if (Number.isNaN(createdAt.getTime()) || !mongoose.Types.ObjectId.isValid(parts[2])) {
      return null;
    }
    return {
      score: Number(parts[0]) || 0,
      createdAt,
      id: parts[2],
    };
  }

  if (parts.length < 2) return null;
  const createdAt = new Date(parts[0]);
  if (Number.isNaN(createdAt.getTime()) || !mongoose.Types.ObjectId.isValid(parts[1])) {
    return null;
  }
  return {
    createdAt,
    id: parts[1],
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
  if (!cursorData?.createdAt || !cursorData?.id) return {};

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

const mergeFeedQuery = (...parts) => {
  const query = {};
  const andConditions = [];

  parts.forEach((part) => {
    if (!part || Object.keys(part).length === 0) return;
    const { $or, $and, ...rest } = part;
    Object.assign(query, rest);
    if ($or) andConditions.push({ $or });
    if (Array.isArray($and)) andConditions.push(...$and);
  });

  if (andConditions.length) {
    query.$and = andConditions;
  }

  return query;
};

const buildAuthorSnapshot = (author) => ({
  username: author?.username || author?.name || '',
  name: author?.fullName || author?.name || '',
  avatar: author?.profile?.avatar || author?.profilePicture || author?.avatar || '',
  location: author?.extraInfo || '',
  verified: Boolean(author?.verified),
});

const applyPostBodyUpdates = (post, body = {}) => {
  const {
    caption,
    title,
    location,
    category,
    tags,
    hashtags,
    mentions,
    visibility,
    image,
    media,
    duration,
    quote,
  } = body;

  if (typeof caption === 'string') post.caption = caption;
  if (typeof title === 'string') post.title = title;
  if (typeof location === 'string') post.location = location;
  if (typeof category === 'string') post.category = category;
  if (typeof duration === 'string') post.duration = duration;
  if (typeof quote === 'string') post.quote = quote;

  if (visibility) {
    post.visibility = visibility;
  }

  const normalizedTags = normalizeList(tags).map((tag) => tag.toLowerCase());
  if (normalizedTags.length) {
    post.tags = normalizedTags;
  }

  const combinedHashtags = [
    ...new Set([
      ...normalizeList(hashtags).map((tag) => tag.toLowerCase()),
      ...extractHashtags(caption),
    ]),
  ];
  if (combinedHashtags.length) {
    post.hashtags = combinedHashtags;
  }

  const combinedMentions = [
    ...new Set([
      ...normalizeList(mentions).map((tag) => tag.toLowerCase()),
      ...extractMentions(caption),
    ]),
  ];
  if (combinedMentions.length) {
    post.mentions = combinedMentions;
  }

  if (Array.isArray(media) && media.length) {
    post.media = media;
    post.image = media[0]?.url || post.image || '';
  } else if (typeof image === 'string') {
    post.image = image;
    if (!post.media?.length) {
      post.media = [{ url: image, alt: title || caption || 'Moment image' }];
    }
  }
};

const attachUploadedMedia = async (req, postId, userId) => {
  const mediaFiles = [
    ...(req.files?.image || []),
    ...(req.files?.media || []),
    ...(req.files?.video || []),
  ];

  if (!mediaFiles.length) {
    return [];
  }

  return uploadPostMedia(mediaFiles, { postId, userId });
};

// GET /api/posts/:id — fetch a single post
const getPostById = async (req, res) => {
  try {
    const visibilityQuery = await buildVisibilityQuery(req.userId);
    const post = await Post.findOne({ _id: req.params.id, ...visibilityQuery });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    return res.status(200).json(post);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch post', details: err.message });
  }
};

// PATCH /api/posts/:id — update a post
const updatePost = async (req, res) => {
  const author = req.user;
  if (!author) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (String(post.author) !== String(author._id)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const allowedVisibility = ['public', 'followers', 'friends', 'private'];
    if (req.body?.visibility && !allowedVisibility.includes(req.body.visibility)) {
      return res.status(400).json({ error: 'Invalid visibility option' });
    }

    const uploadedMedia = await attachUploadedMedia(req, post._id, author._id);
    if (uploadedMedia.length) {
      post.media = uploadedMedia;
      post.image = uploadedMedia[0]?.url || post.image || '';
    }

    applyPostBodyUpdates(post, req.body || {});

    await post.save();
    return res.status(200).json(post);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update post', details: err.message });
  }
};

// POST /api/posts/:id/repost — create a repost for the current user
const createRepost = async (req, res) => {
  const author = req.user;
  if (!author) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const visibilityQuery = await buildVisibilityQuery(req.userId);
    const originalPost = await Post.findOne({ _id: req.params.id, ...visibilityQuery });

    if (!originalPost) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const existingRepost = await Post.findOne({
      repostOf: originalPost._id,
      author: author._id,
    });

    if (existingRepost) {
      return res.status(200).json({ success: true, reposted: true, post: existingRepost });
    }

    const repost = new Post({
      author: author._id,
      user: buildAuthorSnapshot(author),
      visibility: 'public',
      title: originalPost.title || '',
      caption: String(req.body?.caption || '').trim() || originalPost.caption || '',
      location: originalPost.location || '',
      category: originalPost.category || '',
      tags: originalPost.tags || [],
      hashtags: originalPost.hashtags || [],
      mentions: originalPost.mentions || [],
      duration: originalPost.duration || '',
      media: originalPost.media || [],
      image: originalPost.image || '',
      repostOf: originalPost._id,
    });

    await repost.save();

    await Promise.all([
      Post.updateOne(
        { _id: originalPost._id },
        { $inc: { repostCount: 1 }, $addToSet: { repostedBy: author._id } }
      ),
      User.findByIdAndUpdate(author._id, {
        $addToSet: { posts: repost._id },
        $inc: { 'stats.postsCount': 1 },
      }),
    ]);

    try {
      const io = getIO();
      io.emit('post:reposted', {
        postId: String(originalPost._id),
        repostId: String(repost._id),
        repostCount: (originalPost.repostCount || 0) + 1,
        userId: String(author._id),
      });
    } catch (err) {
      console.error('Socket emit failed:', err.message);
    }

    return res.status(201).json({ success: true, repost });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create repost', details: err.message });
  }
};

// DELETE /api/posts/:id/repost — remove the current user's repost
const removeRepost = async (req, res) => {
  const author = req.user;
  if (!author) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const repost = await Post.findOne({
      repostOf: req.params.id,
      author: author._id,
    });

    if (!repost) {
      return res.status(404).json({ error: 'Repost not found' });
    }

    await repost.deleteOne();

    const originalPost = await Post.findById(req.params.id);
    if (originalPost) {
      originalPost.repostCount = Math.max(0, (originalPost.repostCount || 0) - 1);
      originalPost.repostedBy = (originalPost.repostedBy || []).filter(
        (userId) => String(userId) !== String(author._id)
      );
      await originalPost.save();
    }

    await User.findByIdAndUpdate(author._id, {
      $pull: { posts: repost._id },
      $inc: { 'stats.postsCount': -1 },
    });

    try {
      const io = getIO();
      io.emit('post:unreposted', {
        postId: String(req.params.id),
        repostId: String(repost._id),
        repostCount: originalPost ? originalPost.repostCount : 0,
        userId: String(author._id),
      });
    } catch (err) {
      console.error('Socket emit failed:', err.message);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to remove repost', details: err.message });
  }
};

// GET /api/posts/:id/reposts — list reposts for a post
const getReposts = async (req, res) => {
  try {
    const reposts = await Post.find({ repostOf: req.params.id })
      .sort({ createdAt: -1 })
      .populate('author', 'name username avatar profilePicture fullName');

    return res.status(200).json({ data: reposts, count: reposts.length });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load reposts', details: err.message });
  }
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
    const requestedType = String(req.query.type || 'latest');
    const allowedTypes = new Set(['latest', 'following', 'personalized', 'trending', 'explore', 'reels']);
    const type = allowedTypes.has(requestedType) ? requestedType : 'latest';
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const sortMode = type === 'trending' || type === 'explore' ? 'trending' : 'latest';
    const cursorData = parseCursor(req.query.cursor, sortMode);
    const userId = req.userId;

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

    }

    if (type === 'personalized') {
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const user = await User.findById(userId).select('profile.preferences preferences');
      const preferences = user?.profile?.preferences?.length
        ? user.profile.preferences
        : user?.preferences || [];
      if (preferences.length) {
        baseQuery.$or = [
          { tags: { $in: preferences } },
          { hashtags: { $in: preferences } },
          { category: { $in: preferences } },
        ];
      }
    }

    if (type === 'trending' || type === 'explore') {
      sort = { trendingScore: -1, createdAt: -1, _id: -1 };
    }

    const visibilityQuery = await buildVisibilityQuery(userId);
    const cursorQuery = buildCursorQuery(cursorData, sortMode);
    const query = mergeFeedQuery(baseQuery, visibilityQuery, cursorQuery);
    const posts = await Post.find(query)
      .sort(sort)
      .limit(limit + 1);

    const hasMore = posts.length > limit;
    const sliced = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore
      ? buildCursor(sliced[sliced.length - 1], sortMode)
      : null;

    const payload = { data: sliced, nextCursor, hasMore };

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
      clientRequestId,
    } = req.body || {};
    const normalizedClientRequestId = String(clientRequestId || '').trim();

    if (normalizedClientRequestId) {
      const existingPost = await Post.findOne({
        author: author._id,
        clientRequestId: normalizedClientRequestId,
      });
      if (existingPost) {
        return res.status(200).json(existingPost);
      }
    }

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
        verified: Boolean(author.verified),
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
      clientRequestId: normalizedClientRequestId,
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

    return res.status(201).json(post);
  } catch (err) {
    if (err?.code === 11000 && req.body?.clientRequestId) {
      const existingPost = await Post.findOne({
        author: author._id,
        clientRequestId: String(req.body.clientRequestId).trim(),
      });
      if (existingPost) {
        return res.status(200).json(existingPost);
      }
    }
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
    return res.status(200).json({
      success: true,
      shareCount: post.shareCount,
      shareUrl: post.shareUrl,
      sharePath: post.sharePath,
    });
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

module.exports = {
  getPostById,
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
