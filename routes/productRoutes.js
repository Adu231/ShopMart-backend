const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { upload, uploadToCloudinary, deleteFromCloudinary } = require('../cloudinary');

// Multer middleware error handling wrapper
const uploadMiddleware = (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      console.warn('⚠️ Multer File Upload Error:', err.message);
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
};

// GET /api/products (List active products)
router.get('/', async (req, res) => {
  const { category, brand, q, minPrice, maxPrice } = req.query;

  try {
    let sql = 'SELECT * FROM products WHERE isUnlisted = FALSE';
    const params = [];

    if (category) {
      sql += ' AND LOWER(category) = LOWER(?)';
      params.push(category);
    }
    if (brand) {
      sql += ' AND LOWER(brand) = LOWER(?)';
      params.push(brand);
    }
    if (q) {
      sql += ' AND (LOWER(name) LIKE ? OR LOWER(category) LIKE ? OR LOWER(brand) LIKE ?)';
      const search = `%${q.toLowerCase()}%`;
      params.push(search, search, search);
    }
    if (minPrice) {
      sql += ' AND price >= ?';
      params.push(Number(minPrice));
    }
    if (maxPrice) {
      sql += ' AND price <= ?';
      params.push(Number(maxPrice));
    }

    sql += ' ORDER BY createdAt DESC';
    const [rows] = await pool.query(sql, params);

    const parsed = rows.map(p => {
      const parsedImages = typeof p.images === 'string' ? JSON.parse(p.images || '[]') : (p.images || []);
      const primaryImage = p.image_url || (Array.isArray(parsedImages) && parsedImages.length > 0 ? parsedImages[0] : null);
      const imagesList = Array.isArray(parsedImages) && parsedImages.length > 0 ? parsedImages : (primaryImage ? [primaryImage] : []);
      return {
        ...p,
        images: imagesList,
        image_url: primaryImage,
        price: Number(p.price),
        originalPrice: Number(p.originalPrice),
        rating: Number(p.rating),
        isFeatured: Boolean(p.isFeatured),
      };
    });

    return res.json({ success: true, count: parsed.length, products: parsed });
  } catch (error) {
    console.error('❌ Error in GET /api/products:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/products/unlisted/all (List unlisted products)
router.get('/unlisted/all', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM products WHERE isUnlisted = TRUE');
    const parsed = rows.map(p => {
      const parsedImages = typeof p.images === 'string' ? JSON.parse(p.images || '[]') : (p.images || []);
      const primaryImage = p.image_url || (Array.isArray(parsedImages) && parsedImages.length > 0 ? parsedImages[0] : null);
      return {
        ...p,
        images: Array.isArray(parsedImages) && parsedImages.length > 0 ? parsedImages : (primaryImage ? [primaryImage] : []),
        image_url: primaryImage,
        price: Number(p.price),
      };
    });
    return res.json({ success: true, unlisted: parsed });
  } catch (error) {
    console.error('❌ Error in GET /api/products/unlisted/all:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/products/:id (Get single product detail)
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Product not found' });

    const p = rows[0];
    const parsedImages = typeof p.images === 'string' ? JSON.parse(p.images || '[]') : (p.images || []);
    const primaryImage = p.image_url || (Array.isArray(parsedImages) && parsedImages.length > 0 ? parsedImages[0] : null);

    const product = {
      ...p,
      images: Array.isArray(parsedImages) && parsedImages.length > 0 ? parsedImages : (primaryImage ? [primaryImage] : []),
      image_url: primaryImage,
      price: Number(p.price),
      originalPrice: Number(p.originalPrice),
      rating: Number(p.rating),
    };
    return res.json({ success: true, product });
  } catch (error) {
    console.error(`❌ Error in GET /api/products/${req.params.id}:`, error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/products (Create product with Cloudinary image upload)
router.post('/', uploadMiddleware, async (req, res) => {
  try {
    // Debug logging for troubleshooting file and body inputs safely
    console.log('📦 POST /api/products received:', {
      hasFile: !!req.file,
      fileName: req.file?.originalname,
      fileSize: req.file?.size,
      mimeType: req.file?.mimetype,
      bodyKeys: Object.keys(req.body || {}),
    });

    const prodId = req.body.id || `p_${Date.now()}`;
    const name = req.body.name || 'New Woodcraft Listing';
    const brand = req.body.brand || 'Woodcraft Seller';
    const category = req.body.category || 'Living Room';
    const price = Number(req.body.price) || 19999;
    const originalPrice = Number(req.body.originalPrice) || (price ? Math.round(price * 1.25) : 24999);
    const discount = Number(req.body.discount) || 20;
    const stock = Number(req.body.stock) || 10;
    const seller = req.body.seller || 'Verified Seller';
    const description = req.body.description || 'Premium solid wood furniture item.';

    let imageUrl = '';
    let imagePublicId = '';

    // If file attached in request multipart/form-data
    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file.buffer, 'shopmart/products');
        imageUrl = uploadResult.secure_url;
        imagePublicId = uploadResult.public_id;
      } catch (cloudinaryErr) {
        console.error('⚠️ Cloudinary Upload Failed:', cloudinaryErr.message);
        if (req.body.image_url) {
          imageUrl = req.body.image_url;
        } else {
          return res.status(400).json({
            success: false,
            message: `Cloudinary Image Upload Failed: ${cloudinaryErr.message}. Ensure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are set on Render environment variables.`,
          });
        }
      }
    } else if (req.body.image_url) {
      imageUrl = req.body.image_url;
    } else if (req.body.images) {
      try {
        const parsed = typeof req.body.images === 'string' ? JSON.parse(req.body.images) : req.body.images;
        imageUrl = Array.isArray(parsed) ? parsed[0] : String(parsed);
      } catch {
        imageUrl = String(req.body.images);
      }
    }

    if (!imageUrl) {
      imageUrl = 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=80';
    }

    const imagesJson = JSON.stringify([imageUrl]);

    await pool.query(
      `INSERT INTO products (id, name, brand, category, price, originalPrice, discount, rating, reviewCount, images, image_url, image_public_id, description, stock, seller)
       VALUES (?, ?, ?, ?, ?, ?, ?, 5.0, 0, ?, ?, ?, ?, ?, ?)`,
      [prodId, name, brand, category, price, originalPrice, discount, imagesJson, imageUrl, imagePublicId, description, stock, seller]
    );

    const newProduct = {
      id: prodId,
      name,
      brand,
      category,
      price,
      originalPrice,
      discount,
      rating: 5.0,
      reviewCount: 0,
      stock,
      seller,
      images: [imageUrl],
      image_url: imageUrl,
      image_public_id: imagePublicId,
      description,
    };

    return res.status(201).json({
      success: true,
      message: 'Product published to Railway MySQL & Cloudinary successfully',
      product: newProduct,
    });
  } catch (error) {
    console.error('❌ Error creating product:', error.message);
    return res.status(500).json({ success: false, error: `Database/Server error: ${error.message}` });
  }
});

// PUT /api/products/:id (Update product details & optional image replacement)
router.put('/:id', uploadMiddleware, async (req, res) => {
  try {
    console.log(`📦 PUT /api/products/${req.params.id} received:`, {
      hasFile: !!req.file,
      fileName: req.file?.originalname,
      bodyKeys: Object.keys(req.body || {}),
    });

    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const existing = rows[0];
    let newImageUrl = existing.image_url || '';
    let newImagePublicId = existing.image_public_id || '';
    let oldPublicIdToDelete = null;

    // Check if new image file provided
    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file.buffer, 'shopmart/products');
        oldPublicIdToDelete = existing.image_public_id;
        newImageUrl = uploadResult.secure_url;
        newImagePublicId = uploadResult.public_id;
      } catch (cloudinaryErr) {
        console.error('⚠️ Cloudinary Upload Error in PUT:', cloudinaryErr.message);
        return res.status(400).json({
          success: false,
          message: `Image update failed: ${cloudinaryErr.message}`,
        });
      }
    } else if (req.body.image_url && req.body.image_url !== existing.image_url) {
      newImageUrl = req.body.image_url;
    }

    const name = req.body.name !== undefined ? req.body.name : existing.name;
    const brand = req.body.brand !== undefined ? req.body.brand : existing.brand;
    const category = req.body.category !== undefined ? req.body.category : existing.category;
    const price = req.body.price !== undefined ? Number(req.body.price) : Number(existing.price);
    const originalPrice = req.body.originalPrice !== undefined ? Number(req.body.originalPrice) : Number(existing.originalPrice);
    const stock = req.body.stock !== undefined ? Number(req.body.stock) : Number(existing.stock);
    const description = req.body.description !== undefined ? req.body.description : existing.description;

    const imagesArray = newImageUrl ? [newImageUrl] : (typeof existing.images === 'string' ? JSON.parse(existing.images || '[]') : existing.images);
    const imagesJson = JSON.stringify(imagesArray);

    await pool.query(
      `UPDATE products SET name = ?, brand = ?, category = ?, price = ?, originalPrice = ?, stock = ?, description = ?, images = ?, image_url = ?, image_public_id = ?
       WHERE id = ?`,
      [name, brand, category, price, originalPrice, stock, description, imagesJson, newImageUrl, newImagePublicId, req.params.id]
    );

    // Delete old Cloudinary asset only after DB update succeeds
    if (oldPublicIdToDelete) {
      await deleteFromCloudinary(oldPublicIdToDelete);
    }

    const updatedProduct = {
      ...existing,
      name,
      brand,
      category,
      price,
      originalPrice,
      stock,
      description,
      images: imagesArray,
      image_url: newImageUrl,
      image_public_id: newImagePublicId,
    };

    return res.json({
      success: true,
      message: 'Product updated successfully',
      product: updatedProduct,
    });
  } catch (error) {
    console.error('❌ Error updating product:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/products/:id (Delete / Unlist product and remove Cloudinary asset)
router.delete('/:id', async (req, res) => {
  const { reason } = req.body || {};
  try {
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Product not found' });

    const product = rows[0];

    // Safely delete Cloudinary image if public_id exists
    if (product.image_public_id) {
      await deleteFromCloudinary(product.image_public_id);
    }

    const unlistedReason = reason || 'Unlisted by catalog admin';
    await pool.query('UPDATE products SET isUnlisted = TRUE, unlistedReason = ? WHERE id = ?', [unlistedReason, req.params.id]);

    return res.json({ success: true, message: `Product "${product.name}" deleted/unlisted successfully.` });
  } catch (error) {
    console.error('❌ Error deleting product:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
