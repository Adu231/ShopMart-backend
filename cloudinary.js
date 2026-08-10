const cloudinary = require('cloudinary').v2;
const multer = require('multer');

// Configure Cloudinary with server-side environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Memory storage so files are streamed directly to Cloudinary without permanent local storage
const storage = multer.memoryStorage();

// File upload validator
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB max file size limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image file format. Only JPG, JPEG, PNG, and WEBP image files are allowed.'));
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
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
      },
      (error, result) => {
        if (error) return reject(error);
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
