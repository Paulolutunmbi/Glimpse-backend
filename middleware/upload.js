const fs = require('fs');
const os = require('os');
const path = require('path');
const multer = require('multer');
const { normalizeMediaFilename } = require('../utils/mediaNaming');

const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_POST_MEDIA_BYTES = 50 * 1024 * 1024;
const MAX_POST_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

const TEMP_UPLOAD_DIR = String(process.env.TEMP_UPLOAD_DIR || path.join(os.tmpdir(), 'glimpse-uploads'));

if (!fs.existsSync(TEMP_UPLOAD_DIR)) {
  try {
    fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });
  } catch (err) {
    // best effort; multer will error later if path unusable
    console.error('Failed to create TEMP_UPLOAD_DIR:', err && err.message ? err.message : err);
  }
}

const memoryStorage = multer.memoryStorage();

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TEMP_UPLOAD_DIR),
  filename: (req, file, cb) => {
    const normalizedName = normalizeMediaFilename(file.originalname);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${normalizedName}`;
    cb(null, name);
  },
});

const createMemoryUploader = ({ maxFileSizeBytes, allowedMimeTypes }) =>
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

const createDiskUploader = ({ maxFileSizeBytes, allowedMimeTypes }) =>
  multer({
    storage: diskStorage,
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
      return { status: 413, message: 'Uploaded file exceeds allowed size' };
    }
    return { status: 400, message: err.message };
  }
  return { status: 400, message: err.message || 'Invalid upload' };
};

const removeTempFiles = (req) => {
  try {
    if (!req.files) return;
    for (const key of Object.keys(req.files)) {
      const arr = req.files[key] || [];
      for (const f of arr) {
        if (f && f.path) {
          fs.unlink(f.path, () => {});
        }
      }
    }
  } catch (err) {
    // best-effort cleanup
  }
};

const runUpload = (uploader, fields) => (req, res, next) => {
  uploader.fields(fields)(req, res, (err) => {
    const mapped = mapMulterError(err);
    if (mapped) {
      // attempt immediate cleanup of any written files before responding
      removeTempFiles(req);
      return res.status(mapped.status).json({ success: false, message: mapped.message });
    }

    // register cleanup after response completes in case files remain
    res.on('finish', () => removeTempFiles(req));
    res.on('close', () => removeTempFiles(req));

    return next();
  });
};

const uploadProfilePicture = runUpload(
  createMemoryUploader({
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
  createMemoryUploader({
    maxFileSizeBytes: MAX_PROFILE_IMAGE_BYTES,
    allowedMimeTypes: ALLOWED_IMAGE_MIME_TYPES,
  }),
  [{ name: 'coverImage', maxCount: 1 }]
);

// For post media we use disk storage to avoid buffering large videos in memory.
const uploadPostMedia = runUpload(
  createDiskUploader({
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
  normalizeMediaFilename,
};
