const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    fullName: { type: String, trim: true },
    username: { type: String, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 8, select: false },
    avatar: { type: String, default: '' },
    profilePicture: { type: String, default: '' },
    profilePicturePublicId: { type: String, default: '' },
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
    stats: {
      postsCount: { type: Number, default: 0 },
      followersCount: { type: Number, default: 0 },
      followingCount: { type: Number, default: 0 },
    },
    relations: {
      followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    posts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
    savedPosts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
    isFirstLogin: { type: Boolean, default: true },
    profileCompleted: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    verificationCode: { type: String, select: false },
    verificationCodeExpires: { type: Date },
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date },
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
  this.stats.postsCount = Array.isArray(this.posts) ? this.posts.length : this.stats.postsCount || 0;
  this.stats.followersCount = Array.isArray(this.relations?.followers)
    ? this.relations.followers.length
    : this.stats.followersCount || 0;
  this.stats.followingCount = Array.isArray(this.relations?.following)
    ? this.relations.following.length
    : this.stats.followingCount || 0;
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
