require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const multer = require('multer');

console.log('[CLOUDINARY CONFIG]', {
  hasCloudName: Boolean(process.env.CLOUDINARY_CLOUD_NAME),
  hasApiKey: Boolean(process.env.CLOUDINARY_API_KEY),
  hasApiSecret: Boolean(process.env.CLOUDINARY_API_SECRET),
  cloudNameLength: process.env.CLOUDINARY_CLOUD_NAME?.length,
  apiKeyLength: process.env.CLOUDINARY_API_KEY?.length
});

// Configure Cloudinary with server-side environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

console.log('[CLOUDINARY SDK]', {
  configured: Boolean(cloudinary.config().cloud_name),
  cloudName: cloudinary.config().cloud_name,
  hasApiKey: Boolean(cloudinary.config().api_key),
  hasApiSecret: Boolean(cloudinary.config().api_secret)
});

// Memory storage so files are streamed directly to Cloudinary without permanent local storage
const storage = multer.memoryStorage();

// File upload validator for image types
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB max file size limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file format. Only image files (JPG, PNG, WEBP, GIF, AVIF) are allowed.'));
    }
  },
});

/**
 * Upload buffer to Cloudinary folder shopmart/products
 * @param {Buffer} fileBuffer 
 * @param {string} folder 
 * @returns {Promise<{ secure_url: string, public_id: string }>}
 */
const uploadToCloudinary = (fileBuffer, folder = 'shopmart/products') => {
  return new Promise((resolve, reject) => {
    console.log('[CLOUDINARY UPLOAD EXECUTE]', {
      hasCloudName: Boolean(process.env.CLOUDINARY_CLOUD_NAME),
      hasApiKey: Boolean(process.env.CLOUDINARY_API_KEY),
      hasApiSecret: Boolean(process.env.CLOUDINARY_API_SECRET),
      cloudNameLength: process.env.CLOUDINARY_CLOUD_NAME?.length,
      apiKeyLength: process.env.CLOUDINARY_API_KEY?.length,
      sdkCloudName: cloudinary.config().cloud_name,
      sdkHasApiKey: Boolean(cloudinary.config().api_key),
      sdkHasApiSecret: Boolean(cloudinary.config().api_secret)
    });

    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return reject(new Error('Cloudinary environment variables (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) are missing on Render.'));
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
      },
      (error, result) => {
        if (error) {
          console.error('Cloudinary Stream Upload Error Object:', JSON.stringify(error, null, 2));
          return reject(new Error(error.message || JSON.stringify(error)));
        }
        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
        });
      }
    );
    uploadStream.end(fileBuffer);
  });
};

/**
 * Safely delete an image from Cloudinary by public_id
 * @param {string} publicId 
 */
const deleteFromCloudinary = async (publicId) => {
  if (!publicId) return null;
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error(`Failed to delete Cloudinary asset (${publicId}):`, error.message);
    return null;
  }
};

module.exports = {
  cloudinary,
  upload,
  uploadToCloudinary,
  deleteFromCloudinary,
};
