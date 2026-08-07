const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/orders
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM orders ORDER BY createdAt DESC');
    return res.json({ success: true, count: rows.length, orders: rows });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/orders
router.post('/', async (req, res) => {
  try {
    const orderId = `ORD-WOOD-${Math.floor(1000 + Math.random() * 9000)}`;
    const customerName = req.body.customerName || 'Verified Customer';
    const customerEmail = req.body.customerEmail || 'customer@demo.com';
    const productName = req.body.productName || 'Woodcraft Furniture Item';
    const productId = req.body.productId || 'p1';
    const amount = Number(req.body.totalAmount) || 19999;
    const status = 'placed';
    const address = req.body.address || 'Standard Doorstep Delivery';
    const paymentMethod = req.body.paymentMethod || 'Online Payment';

    await pool.query(
      `INSERT INTO orders (id, customerName, customerEmail, productName, productId, amount, status, address, paymentMethod)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderId, customerName, customerEmail, productName, productId, amount, status, address, paymentMethod]
    );

    const newOrder = { id: orderId, customerName, customerEmail, productName, productId, amount, status, address, paymentMethod };
    return res.status(201).json({ success: true, message: 'Order placed and persisted to Railway MySQL!', order: newOrder });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/orders/:id/status
router.put('/:id/status', async (req, res) => {
  const { status } = req.body;
  try {
    await pool.query('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);
    return res.json({ success: true, message: `Order #${req.params.id} status updated to ${status}` });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
