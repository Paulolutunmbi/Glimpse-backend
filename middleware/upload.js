const multer = require('multer');

const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_POST_MEDIA_BYTES = 50 * 1024 * 1024;
const MAX_POST_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

const memoryStorage = multer.memoryStorage();

const createUploader = ({ maxFileSizeBytes, allowedMimeTypes }) =>
  multer({
    storage: memoryStorage,
    limits: { fileSize: maxFileSizeBytes },
    fileFilter: (reqFile, file, cb) => {
      if (!allowedMimeTypes.includes(file.mimetype)) {
        return cb(new Error('Unsupported file type'));
      }
      return cb(null, true);
    },
  });

const mapMulterError = (err) => {
  if (!err) return null;
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return { status: 413, message: 'Image must be 5MB or less' };
    }
    return { status: 400, message: err.message };
  }
  return { status: 400, message: err.message || 'Invalid upload' };
};

const runUpload = (uploader, fields) => (req, res, next) =>
  uploader.fields(fields)(req, res, (err) => {
    const mapped = mapMulterError(err);
    if (mapped) {
      return res.status(mapped.status).json({ success: false, message: mapped.message });
    }
    return next();
  });

const uploadProfilePicture = runUpload(
  createUploader({
    maxFileSizeBytes: MAX_PROFILE_IMAGE_BYTES,
    allowedMimeTypes: ALLOWED_IMAGE_MIME_TYPES,
  }),
  [
  { name: 'profilePicture', maxCount: 1 },
  { name: 'avatar', maxCount: 1 },
  { name: 'image', maxCount: 1 },
  { name: 'coverImage', maxCount: 1 },
  ]
);

const uploadCoverImage = runUpload(
  createUploader({
    maxFileSizeBytes: MAX_PROFILE_IMAGE_BYTES,
    allowedMimeTypes: ALLOWED_IMAGE_MIME_TYPES,
  }),
  [{ name: 'coverImage', maxCount: 1 }]
);

const uploadPostMedia = runUpload(
  createUploader({
    maxFileSizeBytes: MAX_POST_MEDIA_BYTES,
    allowedMimeTypes: [...ALLOWED_IMAGE_MIME_TYPES, ...ALLOWED_VIDEO_MIME_TYPES],
  }),
  [
    { name: 'image', maxCount: 1 },
    { name: 'media', maxCount: 10 },
    { name: 'video', maxCount: 1 },
  ]
);

module.exports = {
  uploadProfilePicture,
  uploadCoverImage,
  uploadPostMedia,
  MAX_PROFILE_IMAGE_BYTES,
  MAX_POST_MEDIA_BYTES,
  MAX_POST_IMAGE_BYTES,
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_VIDEO_MIME_TYPES,
};
