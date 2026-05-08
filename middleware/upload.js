const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { getCloudinary } = require('../config/cloudinary');

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const buildUpload = (req) => {
  const cloudinary = getCloudinary();

  const storage = new CloudinaryStorage({
    cloudinary,
    params: (reqFile, file) => {
      const isCover = file.fieldname === 'coverImage';
      return {
        folder: isCover ? 'glimpse/cover-images' : 'glimpse/profile-pictures',
        resource_type: 'image',
        public_id: `user-${req.userId}-${Date.now()}`,
        transformation: isCover
          ? [{ width: 1600, height: 900, crop: 'fill' }]
          : [{ width: 512, height: 512, crop: 'fill', gravity: 'face' }],
      };
    },
  });

  return multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE_BYTES },
    fileFilter: (reqFile, file, cb) => {
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        return cb(new Error('Only JPG, PNG, WEBP, or GIF images are allowed'));
      }
      return cb(null, true);
    },
  });
};

const uploadProfilePicture = (req, res, next) => {
  let uploader;
  try {
    uploader = buildUpload(req);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Cloudinary is not configured on the server',
    });
  }

  return uploader.fields([
    { name: 'profilePicture', maxCount: 1 },
    { name: 'avatar', maxCount: 1 },
    { name: 'image', maxCount: 1 },
    { name: 'coverImage', maxCount: 1 },
  ])(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    return next();
  });
};

module.exports = {
  uploadProfilePicture,
  MAX_FILE_SIZE_BYTES,
};
