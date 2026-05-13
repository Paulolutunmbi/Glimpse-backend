const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    fullName: { type: String, trim: true },
    username: { type: String, trim: true, unique: true, sparse: true, lowercase: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 8, select: false },
    avatar: { type: String, default: '' },
    profilePicture: { type: String, default: '' },
    profilePicturePublicId: { type: String, default: '' },
    coverImage: { type: String, default: '' },
    coverImagePublicId: { type: String, default: '' },
    bio: { type: String, default: '' },
    extraInfo: { type: String, default: '' },
    preferences: { type: [String], default: [] },
    profile: {
      avatar: { type: String, default: '' },
      coverImage: { type: String, default: '' },
      bio: { type: String, default: '' },
      extraInfo: { type: String, default: '' },
      preferences: { type: [String], default: [] },
      joinedAt: { type: Date, default: Date.now },
    },
    profileCompletion: { type: Number, default: 0, min: 0, max: 100 },
    badges: [{ type: String, trim: true }],
    stats: {
      postsCount: { type: Number, default: 0 },
      followersCount: { type: Number, default: 0 },
      followingCount: { type: Number, default: 0 },
      savedPostsCount: { type: Number, default: 0 },
    },
    relations: {
      followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    },
    settings: {
      privacy: {
        profileVisibility: {
          type: String,
          enum: ['public', 'private'],
          default: 'public',
        },
        showEmail: { type: Boolean, default: false },
        allowMessages: {
          type: String,
          enum: ['everyone', 'followers', 'none'],
          default: 'followers',
        },
        allowTagging: {
          type: String,
          enum: ['everyone', 'followers', 'none'],
          default: 'followers',
        },
        activityVisibility: {
          type: String,
          enum: ['everyone', 'followers', 'private'],
          default: 'followers',
        },
      },
      notifications: {
        emailNotifications: { type: Boolean, default: true },
        pushNotifications: { type: Boolean, default: false },
        commentNotifications: { type: Boolean, default: true },
        likeNotifications: { type: Boolean, default: true },
        followNotifications: { type: Boolean, default: true },
        marketingEmails: { type: Boolean, default: false },
      },
      appearance: {
        theme: {
          type: String,
          enum: ['system', 'light', 'dark'],
          default: 'system',
        },
        reducedMotion: { type: Boolean, default: false },
        compactMode: { type: Boolean, default: false },
      },
      security: {
        activeSessions: [
          {
            sessionId: { type: String, trim: true },
            userAgent: { type: String, trim: true },
            ip: { type: String, trim: true },
            lastActiveAt: { type: Date },
            createdAt: { type: Date, default: Date.now },
          },
        ],
        loginHistory: [
          {
            userAgent: { type: String, trim: true },
            ip: { type: String, trim: true },
            createdAt: { type: Date, default: Date.now },
          },
        ],
        twoFactorEnabled: { type: Boolean, default: false },
      },
      control: {
        blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
        mutedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      },
    },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    posts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
    savedPosts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
    isFirstLogin: { type: Boolean, default: true },
    profileCompleted: { type: Boolean, default: false },
    onboardingCompleted: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    verificationCode: { type: String, select: false },
    verificationCodeExpires: { type: Date },
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date },
    isBanned: { type: Boolean, default: false },
    bannedAt: { type: Date },
    banReason: { type: String, default: '' },
    banSource: { type: String, default: '' },
    adminAccess: {
      attempts: { type: Number, default: 0 },
      lastAttemptAt: { type: Date },
      cooldownUntil: { type: Date },
      lastAttemptRoute: { type: String, default: '' },
      lastAttemptIp: { type: String, default: '' },
    },
    violations: [
      {
        reason: { type: String, trim: true, default: '' },
        reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        status: { type: String, enum: ['open', 'reviewed', 'resolved'], default: 'open' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

userSchema.virtual('displayName').get(function () {
  return this.username || this.name;
});

userSchema.pre('save', async function () {
  if (!this.username && this.name) {
    this.username = this.name;
  }
  if (!this.fullName && this.name) {
    this.fullName = this.name;
  }
  if (!this.name && this.fullName) {
    this.name = this.fullName;
  }
  if (!this.profile.joinedAt) {
    this.profile.joinedAt = this.createdAt || new Date();
  }
  if (!this.profile.avatar && (this.profilePicture || this.avatar)) {
    this.profile.avatar = this.profilePicture || this.avatar;
  }
  if (!this.profile.bio && this.bio) {
    this.profile.bio = this.bio;
  }
  if (!this.profile.extraInfo && this.extraInfo) {
    this.profile.extraInfo = this.extraInfo;
  }
  if (this.profile.preferences.length === 0 && this.preferences.length > 0) {
    this.profile.preferences = this.preferences;
  }
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
