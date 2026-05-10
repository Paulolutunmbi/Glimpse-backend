const cloudinary = require('cloudinary').v2;

let isConfigured = false;

const configureCloudinary = () => {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;

  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error('Cloudinary environment variables are not configured');
  }

  if (!isConfigured) {
    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET,
    });
    isConfigured = true;
  }

  return cloudinary;
};

const getCloudinary = () => configureCloudinary();

const uploadBuffer = ({
  buffer,
  folder,
  publicId,
  resourceType = 'image',
  transformation,
  format,
} = {}) =>
  new Promise((resolve, reject) => {
    const cloudinaryInstance = configureCloudinary();
    const stream = cloudinaryInstance.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: resourceType,
        transformation,
        format,
      },
      (error, result) => {
        if (error) return reject(error);
        return resolve(result);
      }
    );
    stream.end(buffer);
  });

module.exports = {
  configureCloudinary,
  getCloudinary,
  uploadBuffer,
};
