const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
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
    image: { type: String, default: '' },
    media: { type: [mediaSchema], default: [] },
    title: { type: String, default: '' },
    caption: { type: String, default: '' },
    quote: { type: String, default: '' },
    category: { type: String, default: '' },
    tags: { type: [String], default: [] },
    duration: { type: String, default: '' },
    likes: { type: [String], default: [] }, // array of userIds (or IP strings for demo)
    comments: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
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
  'user.username': 'text',
  'user.name': 'text',
});

postSchema.pre('validate', function () {
  if (!this.image && this.media?.length) {
    this.image = this.media[0].url;
  }
  if (!this.media?.length && this.image) {
    this.media = [{ url: this.image, alt: this.title || this.caption || 'Moment image' }];
  }
});

module.exports = mongoose.model('Post', postSchema);
