const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// GET /api/admin/commission-rules
router.get('/commission-rules', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM commission_rules ORDER BY id DESC LIMIT 1');
    if (rows.length > 0) {
      return res.json({ success: true, commissionRules: rows[0] });
    }
    return res.json({
      success: true,
      commissionRules: { standardRate: 10, returnReversalRate: 100, minPayoutThreshold: 1000, categoryTaxRate: 18 }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/admin/commission-rules
router.post('/commission-rules', authenticateToken, requireRole('admin'), async (req, res) => {
  const { standardRate, returnReversalRate, minPayoutThreshold, categoryTaxRate } = req.body;
  try {
    const [rows] = await pool.query('SELECT id FROM commission_rules LIMIT 1');
    if (rows.length > 0) {
      await pool.query(
        `UPDATE commission_rules SET standardRate = ?, returnReversalRate = ?, minPayoutThreshold = ?, categoryTaxRate = ? WHERE id = ?`,
        [Number(standardRate), Number(returnReversalRate), Number(minPayoutThreshold), Number(categoryTaxRate), rows[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO commission_rules (standardRate, returnReversalRate, minPayoutThreshold, categoryTaxRate) VALUES (?, ?, ?, ?)`,
        [Number(standardRate), Number(returnReversalRate), Number(minPayoutThreshold), Number(categoryTaxRate)]
      );
    }
    return res.json({ success: true, message: 'Commission rules updated live in Railway MySQL!' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/sellers
router.get('/sellers', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT u.id, u.name, u.email, u.status, u.isApproved, u.createdAt,
             sp.storeName, sp.gstin, sp.panNumber, sp.accountNumber, sp.ifscCode, sp.pickupPincode
      FROM users u
      LEFT JOIN seller_profiles sp ON u.id = sp.userId
      WHERE u.role = 'seller'
      ORDER BY u.createdAt DESC
    `);
    const formatted = rows.map(s => ({
      ...s,
      isApproved: Boolean(s.isApproved),
      date: new Date(s.createdAt).toISOString().split('T')[0],
      products: 0,
    }));
    return res.json({ success: true, count: formatted.length, sellers: formatted });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/admin/sellers/:id/approve
router.put('/sellers/:id/approve', authenticateToken, requireRole('admin'), async (req, res) => {
  const { status = 'Active' } = req.body;
  const isApproved = status === 'Active';

  try {
    await pool.query('UPDATE users SET status = ?, isApproved = ? WHERE id = ? OR LOWER(email) = LOWER(?)', [status, isApproved, req.params.id, req.params.id]);
    return res.json({ success: true, message: `Seller status updated to ${status} in Railway MySQL!` });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CATEGORY MANAGEMENT ROUTES
// ============================================================

// GET /api/admin/categories (Public — used by seller dropdown too)
router.get('/categories', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM categories ORDER BY sortOrder ASC, name ASC');
    return res.json({ success: true, categories: rows });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/admin/categories (Admin only — create new category)
router.post('/categories', authenticateToken, requireRole('admin'), async (req, res) => {
  const { name, image_url } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Category name is required' });
  }
  try {
    const id = `cat_${Date.now()}`;
    const [existing] = await pool.query('SELECT id FROM categories WHERE LOWER(name) = LOWER(?)', [name.trim()]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'A category with this name already exists' });
    }
    const [countRows] = await pool.query('SELECT MAX(sortOrder) as maxOrder FROM categories');
    const nextOrder = (countRows[0].maxOrder || 0) + 1;
    await pool.query(
      'INSERT INTO categories (id, name, image_url, sortOrder) VALUES (?, ?, ?, ?)',
      [id, name.trim(), image_url || '', nextOrder]
    );
    return res.status(201).json({
      success: true,
      message: 'Category created successfully',
      category: { id, name: name.trim(), image_url: image_url || '', sortOrder: nextOrder },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/admin/categories/:id (Admin only — update category)
router.put('/categories/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  const { name, image_url } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    const updatedName = name ? name.trim() : rows[0].name;
    const updatedImage = image_url !== undefined ? image_url : rows[0].image_url;
    await pool.query(
      'UPDATE categories SET name = ?, image_url = ? WHERE id = ?',
      [updatedName, updatedImage, req.params.id]
    );
    return res.json({
      success: true,
      message: 'Category updated successfully',
      category: { ...rows[0], name: updatedName, image_url: updatedImage },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/admin/categories/:id (Admin only — delete category)
router.delete('/categories/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    await pool.query('DELETE FROM categories WHERE id = ?', [req.params.id]);
    return res.json({ success: true, message: `Category "${rows[0].name}" deleted successfully` });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
