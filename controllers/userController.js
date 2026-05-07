const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');

const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

const normalizePreferences = (prefs) =>
  Array.isArray(prefs)
    ? prefs.map((value) => String(value || '').trim()).filter(Boolean)
    : [];

const sanitizeUser = (user) => ({
  id: user._id,
  name: user.name,
  username: user.username || user.name,
  email: user.email,
  avatar: user.avatar,
  bio: user.bio,
  extraInfo: user.extraInfo,
  preferences: user.preferences,
  followers: user.followers,
  following: user.following,
  posts: user.posts,
  savedPosts: user.savedPosts,
  isFirstLogin: user.isFirstLogin,
  profileCompleted: user.profileCompleted,
  isVerified: user.isVerified,
  createdAt: user.createdAt,
});

const buildProfilePayload = (user) => ({
  user: sanitizeUser(user),
  stats: {
    posts: user.posts?.length || 0,
    followers: user.followers?.length || 0,
    following: user.following?.length || 0,
  },
});

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

const updateProfile = async (req, res) => {
  try {
    const { username, bio, extraInfo, preferences, profileCompleted, isFirstLogin } = req.body || {};

    const updates = {};

    if (typeof username === 'string') {
      const trimmed = username.trim();
      if (!trimmed) {
        return res.status(400).json({ success: false, message: 'username cannot be empty' });
      }
      updates.username = trimmed;
      updates.name = trimmed;
    }

    if (typeof bio === 'string') {
      updates.bio = bio.trim();
    }

    if (typeof extraInfo === 'string') {
      updates.extraInfo = extraInfo.trim();
    }

    if (Array.isArray(preferences)) {
      updates.preferences = normalizePreferences(preferences);
    }

    if (typeof profileCompleted === 'boolean') {
      updates.profileCompleted = profileCompleted;
    }

    if (typeof isFirstLogin === 'boolean') {
      updates.isFirstLogin = isFirstLogin;
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

    return res.status(200).json({ success: true, data: buildProfilePayload(user) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
};

const ensureCloudinaryConfigured = () => {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    return false;
  }

  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
  });

  return true;
};

const uploadAvatar = async (req, res) => {
  try {
    const { avatar, avatarUrl, imageData } = req.body || {};
    const payload = avatar || avatarUrl || imageData;

    if (!payload || typeof payload !== 'string') {
      return res.status(400).json({ success: false, message: 'avatar image is required' });
    }

    let finalUrl = payload.trim();

    if (finalUrl.startsWith('data:')) {
      if (!ensureCloudinaryConfigured()) {
        return res.status(500).json({
          success: false,
          message: 'Cloudinary is not configured on the server',
        });
      }

      const uploadResult = await cloudinary.uploader.upload(finalUrl, {
        folder: 'glimpse/avatars',
        resource_type: 'image',
      });
      finalUrl = uploadResult.secure_url;
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { avatar: finalUrl },
      { new: true, runValidators: true }
    )
      .populate('posts')
      .populate('savedPosts');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

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
      { preferences },
      { new: true, runValidators: true }
    )
      .populate('posts')
      .populate('savedPosts');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.status(200).json({ success: true, data: buildProfilePayload(user) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to update preferences' });
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
  updateProfile,
  uploadAvatar,
  updatePreferences,
  sendPasswordResetEmail,
};
