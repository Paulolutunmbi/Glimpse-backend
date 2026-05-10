const crypto = require('crypto');
const { getCloudinary, uploadBuffer } = require('../config/cloudinary');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');
const { getIO } = require('../socket');
const Post = require('../models/Post');

const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

const normalizePreferences = (prefs) =>
  Array.isArray(prefs)
    ? prefs.map((value) => String(value || '').trim()).filter(Boolean)
    : [];

const buildProfile = (user) => ({
  avatar: user.profile?.avatar || user.profilePicture || user.avatar || '',
  coverImage: user.profile?.coverImage || user.coverImage || '',
  bio: user.profile?.bio ?? user.bio ?? '',
  extraInfo: user.profile?.extraInfo ?? user.extraInfo ?? '',
  preferences:
    user.profile?.preferences?.length ? user.profile.preferences : user.preferences || [],
  joinedAt: user.profile?.joinedAt || user.createdAt,
});

const buildRelations = (user) => ({
  followers:
    user.relations?.followers?.length ? user.relations.followers : user.followers || [],
  following:
    user.relations?.following?.length ? user.relations.following : user.following || [],
});

const buildStats = (user, relations) => ({
  postsCount: user.stats?.postsCount ?? user.posts?.length ?? 0,
  followersCount: user.stats?.followersCount ?? relations.followers.length,
  followingCount: user.stats?.followingCount ?? relations.following.length,
  savedPostsCount: user.stats?.savedPostsCount ?? user.savedPosts?.length ?? 0,
});

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

const calculateProfileCompletion = (user) => {
  const profile = buildProfile(user);
  const checks = [
    profile.avatar,
    profile.coverImage,
    profile.bio,
    profile.extraInfo,
    Array.isArray(profile.preferences) && profile.preferences.length > 0,
  ];
  const score = checks.reduce((total, value) => total + (value ? 1 : 0), 0);
  return Math.round((score / checks.length) * 100);
};

const sanitizeUser = (user) => {
  const relations = buildRelations(user);
  const stats = buildStats(user, relations);
  return {
    id: user._id,
    name: user.name,
    fullName: user.fullName || user.name,
    username: user.username || user.name,
    email: user.email,
    isFirstLogin: user.isFirstLogin,
    profileCompleted: user.profileCompleted,
    isVerified: user.isVerified,
    createdAt: user.createdAt,
    profile: buildProfile(user),
    stats,
    relations,
  };
};

const buildProfilePayload = (user) => {
  const relations = buildRelations(user);
  const stats = buildStats(user, relations);
  return {
    user: sanitizeUser(user),
    profile: buildProfile(user),
    stats,
    relations,
    posts: user.posts || [],
    savedPosts: user.savedPosts || [],
  };
};
const emitProfileUpdated = (user) => {
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

const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .populate('posts')
      .populate('savedPosts');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.status(200).json({ success: true, data: buildProfilePayload(user) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load profile' });
  }
};

const getUserProfileById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id)
      .populate('posts')
      .populate('savedPosts');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.status(200).json({ success: true, data: buildProfilePayload(user) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load profile' });
  }
};

const updateProfile = async (req, res) => {
  try {
    const {
      username,
      fullName,
      bio,
      extraInfo,
      preferences,
      profileCompleted,
      isFirstLogin,
    } = req.body || {};

    const updates = {};
    const profileUpdates = {};

    if (typeof username === 'string') {
      const trimmed = username.trim();
      if (!trimmed) {
        return res.status(400).json({ success: false, message: 'username cannot be empty' });
      }
      updates.username = trimmed;
      if (!fullName) {
        updates.name = trimmed;
      }
    }

    if (typeof fullName === 'string') {
      const trimmedFullName = fullName.trim();
      if (!trimmedFullName) {
        return res.status(400).json({ success: false, message: 'fullName cannot be empty' });
      }
      updates.fullName = trimmedFullName;
      updates.name = trimmedFullName;
    }

    if (typeof bio === 'string') {
      const trimmedBio = bio.trim();
      updates.bio = trimmedBio;
      profileUpdates['profile.bio'] = trimmedBio;
    }

    if (typeof extraInfo === 'string') {
      const trimmedExtraInfo = extraInfo.trim();
      updates.extraInfo = trimmedExtraInfo;
      profileUpdates['profile.extraInfo'] = trimmedExtraInfo;
    }

    let normalizedPreferences = null;
    if (Array.isArray(preferences)) {
      normalizedPreferences = normalizePreferences(preferences);
    } else if (typeof preferences === 'string' && preferences.trim()) {
      try {
        const parsed = JSON.parse(preferences);
        if (Array.isArray(parsed)) {
          normalizedPreferences = normalizePreferences(parsed);
        }
      } catch (err) {
        normalizedPreferences = normalizePreferences(preferences.split(','));
      }
    }

    if (normalizedPreferences) {
      updates.preferences = normalizedPreferences;
      profileUpdates['profile.preferences'] = normalizedPreferences;
    }

    if (typeof profileCompleted === 'boolean') {
      updates.profileCompleted = profileCompleted;
    }

    if (typeof isFirstLogin === 'boolean') {
      updates.isFirstLogin = isFirstLogin;
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const completionSeed = {
      profile: {
        avatar: profileUpdates['profile.avatar'] || user.profile?.avatar || user.avatar || '',
        coverImage: profileUpdates['profile.coverImage'] || user.profile?.coverImage || user.coverImage || '',
        bio: profileUpdates['profile.bio'] || updates.bio || user.bio || '',
        extraInfo: profileUpdates['profile.extraInfo'] || updates.extraInfo || user.extraInfo || '',
        preferences: normalizedPreferences || user.preferences || [],
      },
      createdAt: user.createdAt,
    };

    updates.profileCompletion = calculateProfileCompletion({
      ...user.toObject(),
      ...completionSeed,
    });

    const updatedBase = await User.findByIdAndUpdate(req.userId, updates, {
      new: true,
      runValidators: true,
    })
      .populate('posts')
      .populate('savedPosts');

    if (Object.keys(profileUpdates).length > 0) {
      await User.findByIdAndUpdate(req.userId, { $set: profileUpdates }, { new: true });
      const updatedUser = await User.findById(req.userId)
        .populate('posts')
        .populate('savedPosts');
      if (!updatedUser) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      emitProfileUpdated(updatedUser);
      return res.status(200).json({ success: true, data: buildProfilePayload(updatedUser) });
    }

    emitProfileUpdated(updatedBase);
    return res.status(200).json({ success: true, data: buildProfilePayload(updatedBase) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
};

const MAX_BASE64_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const parseBase64Image = (dataUri) => {
  const match = /^data:(.+);base64,(.*)$/.exec(String(dataUri || '').trim());
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
};

const validateBase64Image = (dataUri) => {
  const parsed = parseBase64Image(dataUri);
  if (!parsed) return { valid: false, message: 'Invalid image data' };
  if (!ALLOWED_IMAGE_TYPES.includes(parsed.mimeType)) {
    return { valid: false, message: 'Unsupported image type' };
  }
  const byteLength = Buffer.byteLength(parsed.data, 'base64');
  if (byteLength > MAX_BASE64_SIZE_BYTES) {
    return { valid: false, message: 'Image must be 5MB or less' };
  }
  return { valid: true };
};

const ensureCloudinaryConfigured = (res) => {
  try {
    getCloudinary();
    return true;
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Cloudinary is not configured on the server',
    });
    return false;
  }
};

const pickFirstFile = (req, fields) => {
  for (const field of fields) {
    if (req.files?.[field]?.length) {
      return req.files[field][0];
    }
  }
  return req.file || null;
};

const uploadImageBufferToCloudinary = async ({ buffer, folder, publicId, transformation }) => {
  const result = await uploadBuffer({
    buffer,
    folder,
    publicId,
    resourceType: 'image',
    transformation,
  });
  return { url: result.secure_url, publicId: result.public_id };
};

const uploadDataUriToCloudinary = async ({ dataUri, folder, publicId, transformation }) => {
  const cloudinary = getCloudinary();
  const result = await cloudinary.uploader.upload(dataUri, {
    folder,
    public_id: publicId,
    resource_type: 'image',
    transformation,
  });
  return { url: result.secure_url, publicId: result.public_id };
};

const uploadAvatar = async (req, res) => {
  try {
    const file = pickFirstFile(req, ['profilePicture', 'avatar', 'image']);
    const { avatar, avatarUrl, imageData } = req.body || {};
    const payload = avatar || avatarUrl || imageData;

    let finalUrl = '';
    let publicId = '';

    if (file || (payload && typeof payload === 'string')) {
      if (!ensureCloudinaryConfigured(res)) {
        return null;
      }
    }

    if (file) {
      const uploadResult = await uploadImageBufferToCloudinary({
        buffer: file.buffer,
        folder: 'glimpse/profile-images',
        publicId: `user-${req.userId}-${Date.now()}`,
        transformation: [{ width: 512, height: 512, crop: 'fill', gravity: 'face' }],
      });
      finalUrl = uploadResult.url;
      publicId = uploadResult.publicId;
    } else if (payload && typeof payload === 'string') {
      const validation = validateBase64Image(payload);
      if (!validation.valid) {
        return res.status(400).json({ success: false, message: validation.message });
      }

      const uploadResult = await uploadDataUriToCloudinary({
        dataUri: payload.trim(),
        folder: 'glimpse/profile-images',
        publicId: `user-${req.userId}-${Date.now()}`,
        transformation: [{ width: 512, height: 512, crop: 'fill', gravity: 'face' }],
      });
      finalUrl = uploadResult.url;
      publicId = uploadResult.publicId;
    } else {
      return res.status(400).json({ success: false, message: 'avatar image is required' });
    }

    const existingUser = await User.findById(req.userId);
    if (!existingUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (existingUser.profilePicturePublicId) {
      try {
        const cloudinary = getCloudinary();
        await cloudinary.uploader.destroy(existingUser.profilePicturePublicId);
      } catch (err) {
        console.error('Failed to delete old Cloudinary asset:', err.message);
      }
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      {
        avatar: finalUrl,
        profilePicture: finalUrl,
        profilePicturePublicId: publicId || existingUser.profilePicturePublicId || '',
        'profile.avatar': finalUrl,
        profileCompletion: calculateProfileCompletion({
          ...existingUser.toObject(),
          profile: {
            ...existingUser.profile,
            avatar: finalUrl,
          },
        }),
      },
      { new: true, runValidators: true }
    )
      .populate('posts')
      .populate('savedPosts');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    emitProfileUpdated(user);
    return res.status(200).json({ success: true, data: buildProfilePayload(user) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to upload avatar' });
  }
};

const uploadCoverImage = async (req, res) => {
  try {
    const file = pickFirstFile(req, ['coverImage', 'image']);
    const { coverImage, coverImageUrl, imageData } = req.body || {};
    const payload = coverImage || coverImageUrl || imageData;

    let finalUrl = '';
    let publicId = '';

    if (file || (payload && typeof payload === 'string')) {
      if (!ensureCloudinaryConfigured(res)) {
        return null;
      }
    }

    if (file) {
      const uploadResult = await uploadImageBufferToCloudinary({
        buffer: file.buffer,
        folder: 'glimpse/cover-images',
        publicId: `cover-${req.userId}-${Date.now()}`,
        transformation: [{ width: 1600, height: 900, crop: 'fill' }],
      });
      finalUrl = uploadResult.url;
      publicId = uploadResult.publicId;
    } else if (payload && typeof payload === 'string') {
      const validation = validateBase64Image(payload);
      if (!validation.valid) {
        return res.status(400).json({ success: false, message: validation.message });
      }

      const uploadResult = await uploadDataUriToCloudinary({
        dataUri: payload.trim(),
        folder: 'glimpse/cover-images',
        publicId: `cover-${req.userId}-${Date.now()}`,
        transformation: [{ width: 1600, height: 900, crop: 'fill' }],
      });
      finalUrl = uploadResult.url;
      publicId = uploadResult.publicId;
    } else {
      return res.status(400).json({ success: false, message: 'cover image is required' });
    }

    const existingUser = await User.findById(req.userId);
    if (!existingUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (existingUser.coverImagePublicId) {
      try {
        const cloudinary = getCloudinary();
        await cloudinary.uploader.destroy(existingUser.coverImagePublicId);
      } catch (err) {
        console.error('Failed to delete old Cloudinary asset:', err.message);
      }
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      {
        coverImage: finalUrl,
        coverImagePublicId: publicId || existingUser.coverImagePublicId || '',
        'profile.coverImage': finalUrl,
        profileCompletion: calculateProfileCompletion({
          ...existingUser.toObject(),
          profile: {
            ...existingUser.profile,
            coverImage: finalUrl,
          },
        }),
      },
      { new: true, runValidators: true }
    )
      .populate('posts')
      .populate('savedPosts');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    emitProfileUpdated(user);
    return res.status(200).json({ success: true, data: buildProfilePayload(user) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to upload cover image' });
  }
};

const updatePreferences = async (req, res) => {
  try {
    const preferences = normalizePreferences(req.body?.preferences);

    const existingUser = await User.findById(req.userId);
    if (!existingUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      {
        preferences,
        'profile.preferences': preferences,
        profileCompletion: calculateProfileCompletion({
          ...existingUser.toObject(),
          profile: {
            ...existingUser.profile,
            preferences,
          },
        }),
      },
      { new: true, runValidators: true }
    )
      .populate('posts')
      .populate('savedPosts');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    emitProfileUpdated(user);
    return res.status(200).json({ success: true, data: buildProfilePayload(user) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to update preferences' });
  }
};

const followUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (String(req.userId) === String(id)) {
      return res.status(400).json({ success: false, message: 'Cannot follow yourself' });
    }

    const currentUser = await User.findById(req.userId).select('following');
    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (currentUser.following?.some((userId) => String(userId) === String(id))) {
      return res.status(200).json({ success: true });
    }

    const target = await User.findByIdAndUpdate(
      id,
      {
        $addToSet: { followers: req.userId, 'relations.followers': req.userId },
        $inc: { 'stats.followersCount': 1 },
      },
      { new: true }
    );

    if (!target) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await User.findByIdAndUpdate(req.userId, {
      $addToSet: { following: id, 'relations.following': id },
      $inc: { 'stats.followingCount': 1 },
    });

    try {
      const io = getIO();
      io.emit('followUpdated', { userId: String(id) });
      io.emit('followUpdated', { userId: String(req.userId) });
    } catch (err) {
      console.error('Socket emit failed:', err.message);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to follow user' });
  }
};

const unfollowUser = async (req, res) => {
  try {
    const { id } = req.params;

    const currentUser = await User.findById(req.userId).select('following');
    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isFollowing = currentUser.following?.some((userId) => String(userId) === String(id));

    await User.findByIdAndUpdate(id, {
      $pull: { followers: req.userId, 'relations.followers': req.userId },
      $inc: { 'stats.followersCount': isFollowing ? -1 : 0 },
    });

    await User.findByIdAndUpdate(req.userId, {
      $pull: { following: id, 'relations.following': id },
      $inc: { 'stats.followingCount': isFollowing ? -1 : 0 },
    });

    try {
      const io = getIO();
      io.emit('followUpdated', { userId: String(id) });
      io.emit('followUpdated', { userId: String(req.userId) });
    } catch (err) {
      console.error('Socket emit failed:', err.message);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to unfollow user' });
  }
};

const savePost = async (req, res) => {
  try {
    const { id } = req.params;
    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const existingUser = await User.findById(req.userId).select('savedPosts');
    if (!existingUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (existingUser.savedPosts?.some((postId) => String(postId) === String(id))) {
      return res.status(200).json({ success: true });
    }

    await User.findByIdAndUpdate(req.userId, {
      $addToSet: { savedPosts: id },
      $inc: { 'stats.savedPostsCount': 1 },
    });

    post.saveCount = (post.saveCount || 0) + 1;
    post.trendingScore = computeTrendingScore(post);
    post.scoreUpdatedAt = new Date();
    await post.save();

    try {
      const io = getIO();
      io.emit('postSaved', { postId: String(id), saveCount: post.saveCount });
    } catch (err) {
      console.error('Socket emit failed:', err.message);
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to save post' });
  }
};

const unsavePost = async (req, res) => {
  try {
    const { id } = req.params;
    const existingUser = await User.findById(req.userId).select('savedPosts');
    if (!existingUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const hasSaved = existingUser.savedPosts?.some((postId) => String(postId) === String(id));
    await User.findByIdAndUpdate(req.userId, {
      $pull: { savedPosts: id },
      $inc: { 'stats.savedPostsCount': hasSaved ? -1 : 0 },
    });

    if (hasSaved) {
      const post = await Post.findById(id);
      if (post) {
        post.saveCount = Math.max(0, (post.saveCount || 0) - 1);
        post.trendingScore = computeTrendingScore(post);
        post.scoreUpdatedAt = new Date();
        await post.save();
        try {
          const io = getIO();
          io.emit('postSaved', { postId: String(id), saveCount: post.saveCount });
        } catch (err) {
          console.error('Socket emit failed:', err.message);
        }
      }
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to unsave post' });
  }
};

const getProfileStats = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select('stats followers following posts savedPosts');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const stats = buildStats(user, buildRelations(user));
    return res.status(200).json({ success: true, data: { stats } });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load stats' });
  }
};

const parseCursor = (cursor) => {
  if (!cursor) return null;
  const parts = String(cursor).split('|');
  if (parts.length < 2) return null;
  return {
    createdAt: new Date(parts[0]),
    id: parts[1],
  };
};

const buildSavedCursorQuery = (cursorData) => {
  if (!cursorData?.createdAt) return {};
  return {
    $or: [
      { createdAt: { $lt: cursorData.createdAt } },
      { createdAt: cursorData.createdAt, _id: { $lt: cursorData.id } },
    ],
  };
};

const getSavedMoments = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 25);
    const cursorData = parseCursor(req.query.cursor);

    const user = await User.findById(req.userId).select('savedPosts');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const savedIds = user.savedPosts || [];
    if (savedIds.length === 0) {
      return res.status(200).json({ data: [], nextCursor: null, hasMore: false });
    }

    const cursorQuery = buildSavedCursorQuery(cursorData);
    const posts = await Post.find({ _id: { $in: savedIds }, ...cursorQuery })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1);

    const hasMore = posts.length > limit;
    const sliced = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore
      ? `${sliced[sliced.length - 1].createdAt.toISOString()}|${sliced[sliced.length - 1]._id}`
      : null;

    return res.status(200).json({ data: sliced, nextCursor, hasMore });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load saved moments' });
  }
};

const hashValue = (value) => crypto.createHash('sha256').update(value).digest('hex');

const sendPasswordResetEmail = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('+resetPasswordToken');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = hashValue(rawToken);
    user.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await user.save({ validateBeforeSave: false });

    const resetBaseUrl =
      process.env.CLIENT_RESET_PASSWORD_URL || 'http://localhost:3000/reset-password';
    const resetUrl = `${resetBaseUrl}?token=${rawToken}`;

    try {
      await sendEmail({
        to: user.email,
        subject: 'Reset your Glimpse password',
        text: `Use this link to reset your password. It expires in 15 minutes: ${resetUrl}`,
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f1f1f">
            <h2>Reset your password</h2>
            <p>This link expires in 15 minutes.</p>
            <p><a href="${resetUrl}" style="color:#ff5a5f">Reset password</a></p>
          </div>
        `,
      });
    } catch (err) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save({ validateBeforeSave: false });

      return res.status(502).json({
        success: false,
        message: 'Reset email could not be sent. Please try again later.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Reset link sent to your email.',
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to send reset email' });
  }
};

module.exports = {
  getUserProfile,
  getUserProfileById,
  updateProfile,
  uploadAvatar,
  uploadCoverImage,
  updatePreferences,
  sendPasswordResetEmail,
  followUser,
  unfollowUser,
  savePost,
  unsavePost,
  getProfileStats,
  getSavedMoments,
};
