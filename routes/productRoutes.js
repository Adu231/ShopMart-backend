const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/products
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

    const parsed = rows.map(p => ({
      ...p,
      images: typeof p.images === 'string' ? JSON.parse(p.images || '[]') : p.images,
      price: Number(p.price),
      originalPrice: Number(p.originalPrice),
      rating: Number(p.rating),
      isFeatured: Boolean(p.isFeatured),
    }));

    return res.json({ success: true, count: parsed.length, products: parsed });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Product not found' });

    const p = rows[0];
    const product = {
      ...p,
      images: typeof p.images === 'string' ? JSON.parse(p.images || '[]') : p.images,
      price: Number(p.price),
      originalPrice: Number(p.originalPrice),
      rating: Number(p.rating),
    };
    return res.json({ success: true, product });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/products (Add product)
router.post('/', async (req, res) => {
  try {
    const prodId = `p_${Date.now()}`;
    const name = req.body.name || 'New Woodcraft Listing';
    const brand = req.body.brand || 'Woodcraft Seller';
    const category = req.body.category || 'Living Room';
    const price = Number(req.body.price) || 19999;
    const originalPrice = Number(req.body.originalPrice) || 24999;
    const discount = 20;
    const stock = Number(req.body.stock) || 10;
    const seller = req.body.seller || 'Verified Seller';
    const images = JSON.stringify(req.body.images || ['https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=80']);
    const description = req.body.description || 'Premium solid wood furniture item.';

    await pool.query(
      `INSERT INTO products (id, name, brand, category, price, originalPrice, discount, rating, reviewCount, images, description, stock, seller)
       VALUES (?, ?, ?, ?, ?, ?, ?, 5.0, 0, ?, ?, ?, ?)`,
      [prodId, name, brand, category, price, originalPrice, discount, images, description, stock, seller]
    );

    const newProduct = { id: prodId, name, brand, category, price, originalPrice, discount, stock, seller };
    return res.status(201).json({ success: true, message: 'Product published to Railway MySQL successfully', product: newProduct });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/products/:id (Unlist product)
router.delete('/:id', async (req, res) => {
  const { reason } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Product not found' });

    const unlistedReason = reason || 'Unlisted by Super Admin catalog enforcement';
    await pool.query('UPDATE products SET isUnlisted = TRUE, unlistedReason = ? WHERE id = ?', [unlistedReason, req.params.id]);

    return res.json({ success: true, message: `Product "${rows[0].name}" unlisted.` });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/products/unlisted/all
router.get('/unlisted/all', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM products WHERE isUnlisted = TRUE');
    const parsed = rows.map(p => ({
      ...p,
      images: typeof p.images === 'string' ? JSON.parse(p.images || '[]') : p.images,
      price: Number(p.price),
    }));
    return res.json({ success: true, unlisted: parsed });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
