const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { JWT_SECRET } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password required' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND password = ?', [email, password]);
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const user = rows[0];
    const { password: _, ...userWithoutPw } = user;

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      message: 'Login successful',
      user: {
        ...userWithoutPw,
        isApproved: Boolean(user.isApproved),
      },
      token,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Database login query failed', error: error.message });
  }
});

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const { name, email, password, role = 'customer', storeName, gstin, panNumber, accountNumber, ifscCode, businessAddress, pickupPincode } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'Name, email and password are required' });
  }

  try {
    const [existing] = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'User with this email already exists' });
    }

    const isSeller = role === 'seller';
    const userId = `u_${Date.now()}`;
    const status = isSeller ? 'Pending' : 'Active';
    const isApproved = !isSeller;

    await pool.query(
      'INSERT INTO users (id, name, email, password, role, status, isApproved) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [userId, name, email, password, role, status, isApproved]
    );

    if (isSeller) {
      const profileId = `SP-${Date.now()}`;
      await pool.query(
        'INSERT INTO seller_profiles (id, userId, storeName, gstin, panNumber, accountNumber, ifscCode, businessAddress, pickupPincode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [profileId, userId, storeName || name, gstin || '', panNumber || '', accountNumber || '', ifscCode || '', businessAddress || '', pickupPincode || '']
      );
    }

    const newUser = { id: userId, name, email, role, status, isApproved };
    const token = jwt.sign(
      { id: userId, email, role, name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      success: true,
      message: isSeller ? 'Seller account registered! Pending Super Admin approval.' : 'Customer account registered successfully.',
      user: newUser,
      token,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Signup failed', error: error.message });
  }
});

// GET /api/auth/users
router.get('/users', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, email, role, status, isApproved, createdAt FROM users');
    return res.json({ success: true, users: rows });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
