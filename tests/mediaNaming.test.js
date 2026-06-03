const assert = require('assert');
const {
  normalizeMediaFilename,
  normalizePublicIdSegment,
  buildUploadPublicId,
} = require('../utils/mediaNaming');

assert.strictEqual(normalizeMediaFilename('My SUMMER PHOTO.JPG'), 'my-summer-photo.jpg');
assert.strictEqual(normalizeMediaFilename('  Résumé cover 2026.PNG  '), 'resume-cover-2026.png');
assert.strictEqual(normalizeMediaFilename('group   image @ launch.webp'), 'group-image-launch.webp');
assert.strictEqual(normalizeMediaFilename('REEL clip #1.MP4'), 'reel-clip-1.mp4');
assert.strictEqual(normalizePublicIdSegment('My SUMMER PHOTO.JPG'), 'my-summer-photo');

const postPublicId = buildUploadPublicId({
  prefix: 'post',
  postId: 'ABC123',
  userId: 'USER456',
  index: 0,
  originalname: 'My SUMMER PHOTO.JPG',
  timestamp: 1700000000000,
});

assert.strictEqual(postPublicId, 'post-abc123-user456-1700000000000-0-my-summer-photo');

const avatarPublicId = buildUploadPublicId({
  prefix: 'user',
  userId: 'USER456',
  originalname: 'Profile Picture.PNG',
  timestamp: 1700000000000,
});

assert.strictEqual(avatarPublicId, 'user-user456-1700000000000-profile-picture');

console.log('media naming tests passed');
