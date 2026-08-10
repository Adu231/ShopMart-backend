const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { upload, uploadToCloudinary, deleteFromCloudinary } = require('../cloudinary');

// Multer middleware error handling wrapper supporting multiple file uploads
const uploadMiddleware = (req, res, next) => {
  console.log("[PRODUCT] uploadMiddleware started");
  upload.any()(req, res, (err) => {
    if (err) {
      console.error("[PRODUCT] uploadMiddleware error:", err.message);
      return res.status(400).json({ success: false, message: err.message });
    }
    console.log("[PRODUCT] uploadMiddleware completed successfully");
    next();
  });
};

// Helper function to extract array of file objects from req
const extractFilesFromReq = (req) => {
  if (Array.isArray(req.files)) return req.files;
  if (req.files && typeof req.files === 'object') {
    const filesList = [];
    Object.values(req.files).forEach(val => {
      if (Array.isArray(val)) filesList.push(...val);
      else if (val) filesList.push(val);
    });
    return filesList;
  }
  if (req.file) return [req.file];
  return [];
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
      const primaryImage = p.image_url || (Array.isArray(parsedImages) && parsedImages.length > 0 ? parsedImages[0] : '');
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
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/products/unlisted/all (List unlisted products)
router.get('/unlisted/all', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM products WHERE isUnlisted = TRUE');
    const parsed = rows.map(p => {
      const parsedImages = typeof p.images === 'string' ? JSON.parse(p.images || '[]') : (p.images || []);
      const primaryImage = p.image_url || (Array.isArray(parsedImages) && parsedImages.length > 0 ? parsedImages[0] : '');
      return {
        ...p,
        images: Array.isArray(parsedImages) && parsedImages.length > 0 ? parsedImages : (primaryImage ? [primaryImage] : []),
        image_url: primaryImage,
        price: Number(p.price),
      };
    });
    return res.json({ success: true, unlisted: parsed });
  } catch (error) {
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
    const primaryImage = p.image_url || (Array.isArray(parsedImages) && parsedImages.length > 0 ? parsedImages[0] : '');

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
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/products (Create product with Cloudinary multiple image upload)
router.post('/', uploadMiddleware, async (req, res) => {
  console.log("[PRODUCT] Request received");
  console.log("[PRODUCT] req.body keys:", Object.keys(req.body || {}));
  console.log("[PRODUCT] files count:", Array.isArray(req.files) ? req.files.length : (req.files ? Object.keys(req.files).length : (req.file ? 1 : 0)));

  try {
    const files = extractFilesFromReq(req);
    const uploadedUrls = [];
    const uploadedPublicIds = [];

    // Cloudinary upload step
    if (files.length > 0) {
      console.log("[PRODUCT] Cloudinary upload started for", files.length, "file(s)");
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const uploadResult = await uploadToCloudinary(file.buffer, 'shopmart/products');
          uploadedUrls.push(uploadResult.secure_url);
          uploadedPublicIds.push(uploadResult.public_id);
          console.log(`[PRODUCT] Cloudinary upload success [${i+1}/${files.length}]:`, uploadResult.public_id);
        } catch (cloudinaryErr) {
          console.error(`[PRODUCT] Cloudinary upload failure [${i+1}/${files.length}], falling back to base64 Data URL:`, cloudinaryErr.message);
          const mimeType = file.mimetype || 'image/jpeg';
          const base64Data = file.buffer.toString('base64');
          uploadedUrls.push(`data:${mimeType};base64,${base64Data}`);
        }
      }
    }

    // Body image fallbacks if no file uploaded
    if (uploadedUrls.length === 0) {
      if (req.body.images) {
        try {
          const parsed = typeof req.body.images === 'string' ? JSON.parse(req.body.images) : req.body.images;
          if (Array.isArray(parsed)) {
            parsed.forEach(url => { if (typeof url === 'string' && url.trim()) uploadedUrls.push(url.trim()); });
          } else if (typeof parsed === 'string' && parsed.trim()) {
            uploadedUrls.push(parsed.trim());
          }
        } catch (e) {
          console.warn("[PRODUCT] Could not parse req.body.images:", e.message);
        }
      }
      if (uploadedUrls.length === 0 && req.body.image_url && typeof req.body.image_url === 'string' && req.body.image_url.trim()) {
        uploadedUrls.push(req.body.image_url.trim());
      }
    }

    const prodId = req.body.id || `p_${Date.now()}`;
    const name = req.body.name || 'New Product Listing';
    const brand = req.body.brand || 'Verified Seller';
    const category = req.body.category || 'General';
    const price = Number(req.body.price) || 0;
    const originalPrice = Number(req.body.originalPrice) || (price ? Math.round(price * 1.2) : 0);
    const discount = Number(req.body.discount) || 0;
    const stock = Number(req.body.stock) || 10;
    const seller = req.body.seller || 'Verified Seller';
    const description = req.body.description || '';

    const imageUrl = uploadedUrls.length > 0 ? uploadedUrls[0] : '';
    const imagePublicId = uploadedPublicIds.join(',');
    const imagesJson = JSON.stringify(uploadedUrls);

    console.log("[PRODUCT] Database INSERT started for prodId:", prodId);
    try {
      await pool.query(
        `INSERT INTO products (id, name, brand, category, price, originalPrice, discount, rating, reviewCount, images, image_url, image_public_id, description, stock, seller)
         VALUES (?, ?, ?, ?, ?, ?, ?, 5.0, 0, ?, ?, ?, ?, ?, ?)`,
        [prodId, name, brand, category, price, originalPrice, discount, imagesJson, imageUrl, imagePublicId, description, stock, seller]
      );
      console.log("[PRODUCT] Database INSERT success");
    } catch (dbErr) {
      console.error("[PRODUCT] Database INSERT exact MySQL error:", dbErr.message);
      return res.status(500).json({
        success: false,
        message: `Database error during product creation: ${dbErr.message}`,
      });
    }

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
      images: uploadedUrls,
      image_url: imageUrl,
      image_public_id: imagePublicId,
      description,
    };

    return res.status(201).json({
      success: true,
      message: 'Product published successfully',
      product: newProduct,
    });
  } catch (error) {
    console.error("[PRODUCT] Unexpected Server Error:", error.stack || error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal Server Error',
    });
  }
});

// PUT /api/products/:id (Update product details & multiple image replacement)
router.put('/:id', uploadMiddleware, async (req, res) => {
  try {
    const files = extractFilesFromReq(req);
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const existing = rows[0];
    const uploadedUrls = [];
    const uploadedPublicIds = [];

    if (files.length > 0) {
      for (const file of files) {
        try {
          const uploadResult = await uploadToCloudinary(file.buffer, 'shopmart/products');
          uploadedUrls.push(uploadResult.secure_url);
          uploadedPublicIds.push(uploadResult.public_id);
        } catch (cloudinaryErr) {
          console.error('❌ Cloudinary Upload Error in PUT (Falling back to base64 Data URL):', cloudinaryErr.message);
          const mimeType = file.mimetype || 'image/jpeg';
          const base64Data = file.buffer.toString('base64');
          uploadedUrls.push(`data:${mimeType};base64,${base64Data}`);
        }
      }
    }

    let newImageUrl = existing.image_url || '';
    let newImagePublicId = existing.image_public_id || '';
    let imagesArray = typeof existing.images === 'string' ? JSON.parse(existing.images || '[]') : (existing.images || []);

    if (uploadedUrls.length > 0) {
      imagesArray = uploadedUrls;
      newImageUrl = uploadedUrls[0];
      newImagePublicId = uploadedPublicIds.join(',');

      // Delete old Cloudinary assets if replaced
      if (existing.image_public_id) {
        const oldIds = existing.image_public_id.split(',').filter(Boolean);
        for (const pubId of oldIds) {
          await deleteFromCloudinary(pubId);
        }
      }
    } else if (req.body.image_url && req.body.image_url !== existing.image_url) {
      newImageUrl = req.body.image_url;
      imagesArray = [newImageUrl];
    }

    const name = req.body.name !== undefined ? req.body.name : existing.name;
    const brand = req.body.brand !== undefined ? req.body.brand : existing.brand;
    const category = req.body.category !== undefined ? req.body.category : existing.category;
    const price = req.body.price !== undefined ? Number(req.body.price) : Number(existing.price);
    const originalPrice = req.body.originalPrice !== undefined ? Number(req.body.originalPrice) : Number(existing.originalPrice);
    const stock = req.body.stock !== undefined ? Number(req.body.stock) : Number(existing.stock);
    const description = req.body.description !== undefined ? req.body.description : existing.description;
    const imagesJson = JSON.stringify(imagesArray);

    await pool.query(
      `UPDATE products SET name = ?, brand = ?, category = ?, price = ?, originalPrice = ?, stock = ?, description = ?, images = ?, image_url = ?, image_public_id = ?
       WHERE id = ?`,
      [name, brand, category, price, originalPrice, stock, description, imagesJson, newImageUrl, newImagePublicId, req.params.id]
    );

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
    console.error('Error updating product:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/products/:id (Delete / Unlist product and remove Cloudinary assets)
router.delete('/:id', async (req, res) => {
  const { reason } = req.body || {};
  try {
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Product not found' });

    const product = rows[0];

    // Safely delete Cloudinary image(s) if public_id exists
    if (product.image_public_id) {
      const pubIds = product.image_public_id.split(',').filter(Boolean);
      for (const pubId of pubIds) {
        await deleteFromCloudinary(pubId);
      }
    }

    const unlistedReason = reason || 'Unlisted by catalog admin';
    await pool.query('UPDATE products SET isUnlisted = TRUE, unlistedReason = ? WHERE id = ?', [unlistedReason, req.params.id]);

    return res.json({ success: true, message: `Product "${product.name}" deleted/unlisted successfully.` });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
