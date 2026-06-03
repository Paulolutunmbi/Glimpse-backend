require('dotenv').config();

const mongoose = require('mongoose');
const { getCloudinary } = require('../config/cloudinary');
const { connectToDatabase } = require('../src/config/db');
const Post = require('../models/Post');
const User = require('../models/User');
const GroupChat = require('../models/GroupChat');
const { normalizePublicIdSegment, withCollisionSuffix } = require('../utils/mediaNaming');

const dryRun = !process.argv.includes('--apply');
const renameCache = new Map();

const parseCloudinaryUrl = (url) => {
  if (!url || !String(url).includes('/upload/')) return null;

  const parsed = new URL(url);
  const parts = parsed.pathname.split('/upload/');
  if (parts.length < 2) return null;

  const afterUpload = parts[1].replace(/^v\d+\//, '');
  const lastDot = afterUpload.lastIndexOf('.');
  const publicId = lastDot > -1 ? afterUpload.slice(0, lastDot) : afterUpload;
  const extension = lastDot > -1 ? afterUpload.slice(lastDot + 1).toLowerCase() : '';

  return {
    publicId: decodeURIComponent(publicId),
    extension,
  };
};

const buildUrlFromResult = (result, fallbackUrl) => result?.secure_url || result?.url || fallbackUrl;

const buildThumbnailUrl = (publicId) => {
  const cloudinary = getCloudinary();
  return cloudinary.url(publicId, {
    resource_type: 'video',
    format: 'jpg',
    transformation: [{ width: 800, height: 800, crop: 'limit' }, { quality: 'auto' }, { start_offset: 0 }],
  });
};

const normalizePublicIdPath = (publicId) => {
  const segments = String(publicId || '').split('/');
  const filename = segments.pop();
  const normalized = normalizePublicIdSegment(filename, 'media');
  return [...segments, normalized].join('/');
};

const getRenamedAsset = async ({ publicId, url, resourceType }) => {
  const sourcePublicId = publicId || parseCloudinaryUrl(url)?.publicId || '';
  if (!sourcePublicId) return null;

  if (renameCache.has(sourcePublicId)) {
    return renameCache.get(sourcePublicId);
  }

  let targetPublicId = normalizePublicIdPath(sourcePublicId);
  if (targetPublicId === sourcePublicId) {
    const unchanged = { publicId: sourcePublicId, url, changed: false };
    renameCache.set(sourcePublicId, unchanged);
    return unchanged;
  }

  if (dryRun) {
    const planned = { publicId: targetPublicId, url, changed: true, dryRun: true };
    renameCache.set(sourcePublicId, planned);
    return planned;
  }

  const cloudinary = getCloudinary();
  let result;
  try {
    result = await cloudinary.uploader.rename(sourcePublicId, targetPublicId, {
      resource_type: resourceType,
      overwrite: false,
      invalidate: true,
    });
  } catch (err) {
    if (!String(err?.message || '').toLowerCase().includes('already exists')) {
      throw err;
    }

    targetPublicId = withCollisionSuffix(targetPublicId, sourcePublicId);
    result = await cloudinary.uploader.rename(sourcePublicId, targetPublicId, {
      resource_type: resourceType,
      overwrite: false,
      invalidate: true,
    });
  }

  const renamed = {
    publicId: result.public_id || targetPublicId,
    url: buildUrlFromResult(result, url),
    changed: true,
  };
  renameCache.set(sourcePublicId, renamed);
  return renamed;
};

const migratePosts = async () => {
  let changed = 0;
  const posts = await Post.find({
    $or: [{ 'media.publicId': { $nin: ['', null] } }, { 'media.url': /\/upload\// }, { image: /\/upload\// }],
  });

  for (const post of posts) {
    let postChanged = false;

    for (const media of post.media || []) {
      const resourceType = media.type === 'video' ? 'video' : 'image';
      const renamed = await getRenamedAsset({
        publicId: media.publicId,
        url: media.url,
        resourceType,
      });

      if (renamed?.changed) {
        media.publicId = renamed.publicId;
        if (renamed.url) media.url = renamed.url;
        if (resourceType === 'video') media.thumbnailUrl = buildThumbnailUrl(renamed.publicId);
        postChanged = true;
      }
    }

    if (post.media?.length) {
      const firstUrl = post.media[0]?.url || '';
      if (firstUrl && post.image !== firstUrl) {
        post.image = firstUrl;
        postChanged = true;
      }
    }

    if (postChanged) {
      changed += 1;
      if (!dryRun) await post.save();
      console.log(`${dryRun ? '[dry-run]' : '[updated]'} post ${post._id}`);
    }
  }

  return changed;
};

const migrateUsers = async () => {
  let changed = 0;
  const users = await User.find({
    $or: [
      { profilePicturePublicId: { $nin: ['', null] } },
      { coverImagePublicId: { $nin: ['', null] } },
      { profilePicture: /\/upload\// },
      { avatar: /\/upload\// },
      { coverImage: /\/upload\// },
      { 'profile.avatar': /\/upload\// },
      { 'profile.coverImage': /\/upload\// },
    ],
  });

  for (const user of users) {
    let userChanged = false;

    const avatar = await getRenamedAsset({
      publicId: user.profilePicturePublicId,
      url: user.profilePicture || user.avatar || user.profile?.avatar,
      resourceType: 'image',
    });
    if (avatar?.changed) {
      user.profilePicturePublicId = avatar.publicId;
      user.profilePicture = avatar.url || user.profilePicture;
      user.avatar = avatar.url || user.avatar;
      user.profile.avatar = avatar.url || user.profile.avatar;
      userChanged = true;
    }

    const cover = await getRenamedAsset({
      publicId: user.coverImagePublicId,
      url: user.coverImage || user.profile?.coverImage,
      resourceType: 'image',
    });
    if (cover?.changed) {
      user.coverImagePublicId = cover.publicId;
      user.coverImage = cover.url || user.coverImage;
      user.profile.coverImage = cover.url || user.profile.coverImage;
      userChanged = true;
    }

    if (userChanged) {
      changed += 1;
      if (!dryRun) await user.save();
      console.log(`${dryRun ? '[dry-run]' : '[updated]'} user ${user._id}`);
    }
  }

  return changed;
};

const migrateGroups = async () => {
  let changed = 0;
  const groups = await GroupChat.find({ image: /\/upload\// });

  for (const group of groups) {
    const renamed = await getRenamedAsset({
      url: group.image,
      resourceType: 'image',
    });

    if (renamed?.changed && renamed.url) {
      group.image = renamed.url;
      changed += 1;
      if (!dryRun) await group.save();
      console.log(`${dryRun ? '[dry-run]' : '[updated]'} group ${group._id}`);
    }
  }

  return changed;
};

const main = async () => {
  console.log(`Media filename migration starting in ${dryRun ? 'dry-run' : 'apply'} mode`);
  await connectToDatabase();
  getCloudinary();

  const [posts, users, groups] = await Promise.all([migratePosts(), migrateUsers(), migrateGroups()]);

  console.log(`Done. Changed records: posts=${posts}, users=${users}, groups=${groups}`);
  if (dryRun) {
    console.log('Run with --apply to rename Cloudinary assets and persist database updates.');
  }
};

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
