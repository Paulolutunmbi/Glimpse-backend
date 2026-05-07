const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 8, select: false },
    avatar: { type: String, default: '' },
    bio: { type: String, default: '' },
    extraInfo: { type: String, default: '' },
    preferences: { type: [String], default: [] },
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
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
