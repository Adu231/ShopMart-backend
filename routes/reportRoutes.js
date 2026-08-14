const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// GET /api/reports (Admin Overview Reports)
router.get('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM reports ORDER BY createdAt DESC');
    return res.json({ success: true, count: rows.length, reports: rows });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/reports/:id/solve
router.put('/:id/solve', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await pool.query('UPDATE reports SET status = "Resolved" WHERE id = ?', [req.params.id]);
    return res.json({ success: true, message: `Report #${req.params.id} marked as solved.` });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/reports/:id/reopen
router.put('/:id/reopen', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await pool.query('UPDATE reports SET status = "In Progress" WHERE id = ?', [req.params.id]);
    return res.json({ success: true, message: `Report #${req.params.id} reopened.` });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/reports/:id/warning
router.post('/:id/warning', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM reports WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Report ticket not found' });

    const r = rows[0];
    await pool.query('UPDATE reports SET warningSent = TRUE, status = "In Progress" WHERE id = ?', [req.params.id]);

    const warningId = `WRN-${Date.now()}`;
    const message = `OFFICIAL SUPER ADMIN WARNING: Customer defect complaint received for product "${r.productName}". Complaint details: "${r.reason}". Please inspect quality standards.`;

    await pool.query(
      `INSERT INTO seller_warnings (id, reportId, sellerName, productName, customerName, reason, priority, message, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, "Unread")`,
      [warningId, r.id, r.sellerName, r.productName, r.customerName, r.reason, r.priority, message]
    );

    return res.json({ success: true, message: `Warning notice dispatched to ${r.sellerName}!` });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/reports/warnings/seller (Seller-Scoped Warning Notices)
router.get('/warnings/seller', authenticateToken, requireRole('seller', 'admin'), async (req, res) => {
  try {
    let sql = 'SELECT * FROM seller_warnings';
    const params = [];

    if (req.user.role === 'seller') {
      sql += ' WHERE sellerName = ?';
      params.push(req.user.name);
    }

    sql += ' ORDER BY createdAt DESC';
    const [rows] = await pool.query(sql, params);
    return res.json({ success: true, warnings: rows });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
