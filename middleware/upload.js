const multer = require('multer');

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const memoryStorage = multer.memoryStorage();

const createUploader = () =>
  multer({
    storage: memoryStorage,
    limits: { fileSize: MAX_FILE_SIZE_BYTES },
    fileFilter: (reqFile, file, cb) => {
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        return cb(new Error('Only JPG, PNG, or WEBP images are allowed'));
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

const uploadProfilePicture = runUpload(createUploader(), [
  { name: 'profilePicture', maxCount: 1 },
  { name: 'avatar', maxCount: 1 },
  { name: 'image', maxCount: 1 },
  { name: 'coverImage', maxCount: 1 },
]);

const uploadCoverImage = runUpload(createUploader(), [{ name: 'coverImage', maxCount: 1 }]);

const uploadPostMedia = runUpload(createUploader(), [
  { name: 'image', maxCount: 1 },
  { name: 'media', maxCount: 5 },
]);

module.exports = {
  uploadProfilePicture,
  uploadCoverImage,
  uploadPostMedia,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
};
