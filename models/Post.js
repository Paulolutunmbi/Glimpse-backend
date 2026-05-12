const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: '' },
    type: { type: String, enum: ['image', 'video'], default: 'image' },
    format: { type: String, default: '' },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    bytes: { type: Number, default: 0 },
    duration: { type: Number, default: 0 },
    thumbnailUrl: { type: String, default: '' },
    alt: { type: String, default: '' },
  },
  { _id: false }
);

const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    user: {
      username: { type: String, required: true },
      name: { type: String, default: '' },
      avatar: { type: String, default: '' },
      location: { type: String, default: '' },
    },
    type: {
      type: String,
      enum: ['image', 'video', 'text', 'quote', 'gallery'],
      default: 'image',
    },
    visibility: {
      type: String,
      enum: ['public', 'followers', 'friends', 'private'],
      default: 'public',
    },
    image: { type: String, default: '' },
    media: { type: [mediaSchema], default: [] },
    title: { type: String, default: '' },
    caption: { type: String, default: '' },
    location: { type: String, default: '' },
    quote: { type: String, default: '' },
    category: { type: String, default: '' },
    tags: { type: [String], default: [] },
    hashtags: { type: [String], default: [] },
    mentions: { type: [String], default: [] },
    duration: { type: String, default: '' },
    likes: { type: [String], default: [] },
    comments: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    shareCount: { type: Number, default: 0 },
    saveCount: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },
    trendingScore: { type: Number, default: 0 },
    scoreUpdatedAt: { type: Date },
    repostOf: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
    savedBy: { type: [String], default: [] },
  },
  { timestamps: true }
);

postSchema.index({
  caption: 'text',
  title: 'text',
  quote: 'text',
  category: 'text',
  tags: 'text',
  hashtags: 'text',
  mentions: 'text',
  location: 'text',
  'user.username': 'text',
  'user.name': 'text',
});

postSchema.index({ createdAt: -1 });
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ visibility: 1, createdAt: -1 });
postSchema.index({ trendingScore: -1, scoreUpdatedAt: -1 });

postSchema.pre('validate', function () {
  if (!this.image && this.media?.length) {
    this.image = this.media[0].url;
  }
  if (!this.media?.length && this.image) {
    this.media = [{ url: this.image, alt: this.title || this.caption || 'Moment image' }];
  }
  if (this.media?.length > 1) {
    this.type = 'gallery';
  } else if (this.media?.length === 1) {
    this.type = this.media[0].type === 'video' ? 'video' : 'image';
  }
});

module.exports = mongoose.model('Post', postSchema);
