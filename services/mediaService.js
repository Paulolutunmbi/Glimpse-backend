const { getCloudinary, uploadBuffer } = require('../config/cloudinary');
const {
  MAX_POST_IMAGE_BYTES,
  MAX_POST_MEDIA_BYTES,
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_VIDEO_MIME_TYPES,
} = require('../middleware/upload');
const fs = require('fs');

const IMAGE_FOLDER = 'glimpse/moments/images';
const VIDEO_FOLDER = 'glimpse/moments/videos';

const validateMediaFile = (file) => {
  if (!file) return { valid: false, message: 'File is required' };

  const isImage = ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype);
  const isVideo = ALLOWED_VIDEO_MIME_TYPES.includes(file.mimetype);

  if (!isImage && !isVideo) {
    return { valid: false, message: 'Unsupported file type' };
  }

  if (isImage && file.size > MAX_POST_IMAGE_BYTES) {
    return { valid: false, message: 'Image must be 10MB or less' };
  }

  if (file.size > MAX_POST_MEDIA_BYTES) {
    return { valid: false, message: 'Media file must be 50MB or less' };
  }

  return { valid: true, isImage, isVideo };
};

const buildImageTransformations = () => [
  { width: 1600, height: 1600, crop: 'limit' },
  { quality: 'auto', fetch_format: 'auto' },
];

const buildVideoTransformations = () => [
  { quality: 'auto', fetch_format: 'auto' },
  { bit_rate: 'adaptive' },
];

const uploadMediaFile = async ({ file, folder, publicId }) => {
  const validation = validateMediaFile(file);
  if (!validation.valid) {
    const error = new Error(validation.message);
    error.status = 400;
    throw error;
  }

  const resourceType = validation.isVideo ? 'video' : 'image';
  const transformation = validation.isVideo
    ? buildVideoTransformations()
    : buildImageTransformations();

  let result;
  try {
    if (file.path) {
      // Disk-backed file: use Cloudinary uploader directly by path
      const cloudinary = getCloudinary();
      result = await cloudinary.uploader.upload(file.path, {
        folder,
        public_id: publicId,
        resource_type: resourceType,
        transformation,
        format: undefined,
      });
    } else if (file.buffer) {
      result = await uploadBuffer({
        buffer: file.buffer,
        folder,
        publicId,
        resourceType,
        transformation,
      });
    } else {
      throw new Error('No file content to upload');
    }
  } finally {
    // Ensure disk-temp cleanup if present
    try {
      if (file && file.path) {
        fs.unlink(file.path, () => {});
      }
    } catch (err) {
      // ignore cleanup errors
    }
  }

  const media = {
    url: result.secure_url,
    publicId: result.public_id,
    type: validation.isVideo ? 'video' : 'image',
    format: result.format,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    duration: result.duration,
  };

  if (validation.isVideo) {
    const cloudinary = getCloudinary();
    const thumbnailUrl = cloudinary.url(result.public_id, {
      resource_type: 'video',
      format: 'jpg',
      transformation: [{ width: 800, height: 800, crop: 'limit' }, { quality: 'auto' }, { start_offset: 0 }],
    });
    media.thumbnailUrl = thumbnailUrl;
  }

  return media;
};

const uploadPostMedia = async (files = [], { postId, userId } = {}) => {
  if (!Array.isArray(files) || files.length === 0) return [];

  const uploads = files.map((file, index) =>
    uploadMediaFile({
      file,
      folder: ALLOWED_VIDEO_MIME_TYPES.includes(file.mimetype) ? VIDEO_FOLDER : IMAGE_FOLDER,
      publicId: `post-${postId || 'draft'}-${userId || 'unknown'}-${Date.now()}-${index}`,
    })
  );

  return Promise.all(uploads);
};

const deleteMediaAssets = async (publicIds = []) => {
  if (!Array.isArray(publicIds) || publicIds.length === 0) return;

  const cloudinary = getCloudinary();
  const imageIds = [];
  const videoIds = [];

  for (const id of publicIds) {
    if (typeof id !== 'string') continue;
    if (id.includes('/videos/')) {
      videoIds.push(id);
    } else {
      imageIds.push(id);
    }
  }

  if (imageIds.length) {
    await cloudinary.api.delete_resources(imageIds, { resource_type: 'image' });
  }
  if (videoIds.length) {
    await cloudinary.api.delete_resources(videoIds, { resource_type: 'video' });
  }
};

module.exports = {
  validateMediaFile,
  uploadPostMedia,
  deleteMediaAssets,
};
