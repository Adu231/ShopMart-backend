const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/auth');

// GET /api/orders (User/Seller Scoped Order History)
router.get('/', authenticateToken, async (req, res) => {
  try {
    let sql = 'SELECT * FROM orders';
    const params = [];

    if (req.user.role === 'customer') {
      sql += ' WHERE userId = ? OR LOWER(customerEmail) = LOWER(?)';
      params.push(req.user.id, req.user.email);
    } else if (req.user.role === 'seller') {
      sql += ' WHERE sellerId = ? OR productId IN (SELECT id FROM products WHERE sellerId = ? OR seller = ?)';
      params.push(req.user.id, req.user.id, req.user.name);
    }

    sql += ' ORDER BY createdAt DESC';
    const [rows] = await pool.query(sql, params);
    return res.json({ success: true, count: rows.length, orders: rows });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/orders/:id (Single Order Ownership Guard)
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = rows[0];

    // Ownership check
    if (req.user.role === 'customer') {
      if (order.userId !== req.user.id && order.customerEmail?.toLowerCase() !== req.user.email?.toLowerCase()) {
        return res.status(403).json({ success: false, message: 'Forbidden: You do not have permission to view this order.' });
      }
    } else if (req.user.role === 'seller') {
      if (order.sellerId !== req.user.id) {
        // Check if product belongs to seller
        const [prod] = await pool.query('SELECT sellerId, seller FROM products WHERE id = ?', [order.productId]);
        if (prod.length === 0 || (prod[0].sellerId !== req.user.id && prod[0].seller !== req.user.name)) {
          return res.status(403).json({ success: false, message: 'Forbidden: You do not have permission to view this order.' });
        }
      }
    }

    return res.json({ success: true, order });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/orders (Authenticated Customer Order Placement)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const orderId = `ORD-WOOD-${Math.floor(1000 + Math.random() * 9000)}`;
    const userId = req.user.id;
    const customerName = req.user.name || req.body.customerName || 'Verified Customer';
    const customerEmail = req.user.email;
    const productName = req.body.productName || 'Woodcraft Furniture Item';
    const productId = req.body.productId || 'p1';
    const amount = Number(req.body.totalAmount) || 19999;
    const status = 'placed';
    const address = typeof req.body.address === 'object'
      ? `${req.body.address.street || ''}, ${req.body.address.city || ''}, ${req.body.address.state || ''} - ${req.body.address.pincode || ''}`
      : (req.body.address || 'Standard Doorstep Delivery');
    const paymentMethod = req.body.paymentMethod || 'Online Payment';

    // Lookup sellerId from products table and verify existence in users table for FK integrity
    let sellerId = null;
    try {
      const [prods] = await pool.query('SELECT sellerId, seller FROM products WHERE id = ?', [productId]);
      if (prods.length > 0 && prods[0].sellerId) {
        const [uRows] = await pool.query('SELECT id FROM users WHERE id = ?', [prods[0].sellerId]);
        if (uRows.length > 0) {
          sellerId = prods[0].sellerId;
        }
      }
    } catch (e) {}

    if (!sellerId || sellerId === '' || sellerId === 'null') {
      sellerId = null;
    }

    await pool.query(
      `INSERT INTO orders (id, userId, sellerId, customerName, customerEmail, productName, productId, amount, status, address, paymentMethod)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderId, userId, sellerId, customerName, customerEmail, productName, productId, amount, status, address, paymentMethod]
    );

    const newOrder = { id: orderId, userId, sellerId, customerName, customerEmail, productName, productId, amount, status, address, paymentMethod };
    return res.status(201).json({ success: true, message: 'Order placed and persisted successfully!', order: newOrder });
  } catch (error) {
    console.error('Error placing order:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/orders/:id/status (Order Fulfillment & Return Status Update)
router.put('/:id/status', authenticateToken, async (req, res) => {
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ success: false, message: 'Status is required' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = rows[0];

    // Authorization check
    if (req.user.role === 'customer') {
      const isOwner = order.userId === req.user.id || (order.customerEmail && order.customerEmail.toLowerCase() === req.user.email.toLowerCase());
      if (!isOwner) {
        return res.status(403).json({ success: false, message: 'Forbidden: You do not own this order.' });
      }
      const allowedCustomerStatuses = ['return_requested', 'replacement_requested', 'cancelled'];
      if (!allowedCustomerStatuses.includes(status)) {
        return res.status(403).json({ success: false, message: 'Forbidden: Customers can only initiate returns, replacements, or cancellations.' });
      }
    } else if (req.user.role === 'seller') {
      let isSellerOrder = order.sellerId === req.user.id;
      if (!isSellerOrder) {
        const [prod] = await pool.query('SELECT sellerId, seller FROM products WHERE id = ?', [order.productId]);
        if (prod.length > 0 && (prod[0].sellerId === req.user.id || prod[0].seller === req.user.name)) {
          isSellerOrder = true;
        }
      }
      if (!isSellerOrder) {
        return res.status(403).json({ success: false, message: 'Forbidden: You do not own this seller order.' });
      }
    }

    await pool.query('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);
    return res.json({ success: true, message: `Order #${req.params.id} status updated to ${status}` });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
