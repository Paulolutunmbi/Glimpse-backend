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

module.exports = {
  configureCloudinary,
  getCloudinary,
};
