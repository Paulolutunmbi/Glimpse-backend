const crypto = require('crypto');
const { getCloudinary } = require('../config/cloudinary');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');
const { getIO } = require('../socket');

const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

const normalizePreferences = (prefs) =>
  Array.isArray(prefs)
    ? prefs.map((value) => String(value || '').trim()).filter(Boolean)
    : [];

const parseBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
};

const buildProfile = (user) => ({
  avatar: user.profile?.avatar || user.profilePicture || user.avatar || '',
  coverImage: user.profile?.coverImage || '',
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
});

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

const getCurrentUser = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    return res.status(200).json({ success: true, data: { user: sanitizeUser(req.user) } });
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
      avatar,
      coverImage,
    } = req.body || {};

    const updates = {};

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
      updates['profile.bio'] = trimmedBio;
    }

    if (typeof extraInfo === 'string') {
      const trimmedExtraInfo = extraInfo.trim();
      updates.extraInfo = trimmedExtraInfo;
      updates['profile.extraInfo'] = trimmedExtraInfo;
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
      updates['profile.preferences'] = normalizedPreferences;
    }

    const parsedProfileCompleted = parseBoolean(profileCompleted);
    if (parsedProfileCompleted !== undefined) {
      updates.profileCompleted = parsedProfileCompleted;
    }

    const parsedIsFirstLogin = parseBoolean(isFirstLogin);
    if (parsedIsFirstLogin !== undefined) {
      updates.isFirstLogin = parsedIsFirstLogin;
    }

    const avatarFile =
      req.file ||
      req.files?.profilePicture?.[0] ||
      req.files?.avatar?.[0] ||
      req.files?.image?.[0] ||
      null;
    const coverFile = req.files?.coverImage?.[0] || null;

    if (avatarFile) {
      const avatarUrl = avatarFile.path || avatarFile.secure_url || '';
      updates.avatar = avatarUrl;
      updates.profilePicture = avatarUrl;
      updates['profile.avatar'] = avatarUrl;
    }

    if (coverFile) {
      const coverUrl = coverFile.path || coverFile.secure_url || '';
      updates['profile.coverImage'] = coverUrl;
    }

    if (typeof avatar === 'string' && avatar.trim()) {
      updates.avatar = avatar.trim();
      updates.profilePicture = avatar.trim();
      updates['profile.avatar'] = avatar.trim();
    }

    if (typeof coverImage === 'string' && coverImage.trim()) {
      updates['profile.coverImage'] = coverImage.trim();
    }

    const user = await User.findByIdAndUpdate(req.userId, updates, {
      new: true,
      runValidators: true,
    })
      .populate('posts')
      .populate('savedPosts');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    emitProfileUpdated(user);
    return res.status(200).json({ success: true, data: buildProfilePayload(user) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
};

const getSuggestedCreators = async (req, res) => {
  try {
    const currentUserId = String(req.userId || '');
    const currentUser = req.user || null;
    const following = new Set(
      (currentUser?.relations?.following || currentUser?.following || []).map((id) => String(id))
    );

    const users = await User.find({
      _id: { $ne: currentUserId },
      profileCompleted: true,
    })
      .sort({ 'stats.followersCount': -1, createdAt: -1 })
      .limit(12);

    const suggestions = users
      .filter((user) => !following.has(String(user._id)))
      .slice(0, 6)
      .map((user) => ({
        id: user._id,
        username: user.username || user.name,
        name: user.fullName || user.name || user.username,
        specialty: user.profile?.bio || user.bio || user.profile?.extraInfo || 'Creator',
        avatar: user.profile?.avatar || user.profilePicture || user.avatar || '',
        followersCount: user.stats?.followersCount || 0,
        isFollowing: false,
      }));

    return res.status(200).json(suggestions);
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load suggestions' });
  }
};

const getPublicCreators = async (req, res) => {
  try {
    const users = await User.find({ profileCompleted: true })
      .sort({ 'stats.followersCount': -1, createdAt: -1 })
      .limit(6);

    return res.status(200).json(
      users.map((user) => ({
        id: user._id,
        username: user.username || user.name,
        name: user.fullName || user.name || user.username,
        specialty: user.profile?.bio || user.bio || user.profile?.extraInfo || 'Creator',
        avatar: user.profile?.avatar || user.profilePicture || user.avatar || '',
        followersCount: user.stats?.followersCount || 0,
      }))
    );
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load creators' });
  }
};

const setupProfile = async (req, res) => {
  req.body = {
    ...(req.body || {}),
    isFirstLogin: false,
    profileCompleted: true,
  };

  return updateProfile(req, res);
};

const MAX_BASE64_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

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

const uploadAvatar = async (req, res) => {
  try {
    const file =
      req.file ||
      req.files?.profilePicture?.[0] ||
      req.files?.avatar?.[0] ||
      req.files?.image?.[0] ||
      null;
    const { avatar, avatarUrl, imageData } = req.body || {};
    const payload = avatar || avatarUrl || imageData;

    let finalUrl = '';
    let publicId = '';

    if (file) {
      finalUrl = file.path || file.secure_url || '';
      publicId = file.filename || file.public_id || '';
    } else if (payload && typeof payload === 'string') {
      const validation = validateBase64Image(payload);
      if (!validation.valid) {
        return res.status(400).json({ success: false, message: validation.message });
      }

      let cloudinary;
      try {
        cloudinary = getCloudinary();
      } catch (err) {
        return res.status(500).json({
          success: false,
          message: 'Cloudinary is not configured on the server',
        });
      }

      const uploadResult = await cloudinary.uploader.upload(payload.trim(), {
        folder: 'glimpse/avatars',
        resource_type: 'image',
        transformation: [{ width: 512, height: 512, crop: 'fill', gravity: 'face' }],
      });
      finalUrl = uploadResult.secure_url;
      publicId = uploadResult.public_id;
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

const updatePreferences = async (req, res) => {
  try {
    const preferences = normalizePreferences(req.body?.preferences);

    const user = await User.findByIdAndUpdate(
      req.userId,
      { preferences, 'profile.preferences': preferences },
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

const syncRelationStats = async (userId) => {
  const user = await User.findById(userId);
  if (!user) return null;

  const followers = user.relations?.followers?.length
    ? user.relations.followers
    : user.followers || [];
  const following = user.relations?.following?.length
    ? user.relations.following
    : user.following || [];

  user.relations.followers = followers;
  user.relations.following = following;
  user.followers = followers;
  user.following = following;
  user.stats.followersCount = followers.length;
  user.stats.followingCount = following.length;
  await user.save({ validateBeforeSave: false });

  return User.findById(userId).populate('posts').populate('savedPosts');
};

const toggleFollow = async (req, res) => {
  try {
    const currentUserId = req.userId;
    const targetUserId = req.params.id;

    if (!targetUserId || String(currentUserId) === String(targetUserId)) {
      return res.status(400).json({ success: false, message: 'Invalid user to follow' });
    }

    const currentUser = await User.findById(currentUserId);
    const isFollowing = currentUser?.relations?.following?.some(
      (id) => String(id) === String(targetUserId)
    );

    if (isFollowing) {
      await User.findByIdAndUpdate(currentUserId, {
        $pull: { 'relations.following': targetUserId, following: targetUserId },
      });
      await User.findByIdAndUpdate(targetUserId, {
        $pull: { 'relations.followers': currentUserId, followers: currentUserId },
      });
    } else {
      await User.findByIdAndUpdate(currentUserId, {
        $addToSet: { 'relations.following': targetUserId, following: targetUserId },
      });
      await User.findByIdAndUpdate(targetUserId, {
        $addToSet: { 'relations.followers': currentUserId, followers: currentUserId },
      });
    }

    const updatedCurrentUser = await syncRelationStats(currentUserId);
    const updatedTargetUser = await syncRelationStats(targetUserId);

    if (!updatedCurrentUser || !updatedTargetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    try {
      const io = getIO();
      io.emit('followUpdated', {
        userId: String(currentUserId),
        targetUserId: String(targetUserId),
        isFollowing: !isFollowing,
      });
    } catch (err) {
      console.error('Socket emit failed:', err.message);
    }
    emitProfileUpdated(updatedCurrentUser);
    emitProfileUpdated(updatedTargetUser);

    return res.status(200).json({
      success: true,
      data: {
        user: buildProfilePayload(updatedCurrentUser),
        target: buildProfilePayload(updatedTargetUser),
        isFollowing: !isFollowing,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to update follow state' });
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
  getCurrentUser,
  getUserProfileById,
  getSuggestedCreators,
  getPublicCreators,
  updateProfile,
  setupProfile,
  uploadAvatar,
  updatePreferences,
  toggleFollow,
  sendPasswordResetEmail,
};
