const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password required' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const user = rows[0];

    // Verify password with bcrypt hash or legacy plain text match
    let isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch && user.password === password) {
      // Legacy plain-text password match — migrate DB to bcrypt hash immediately
      isMatch = true;
      const hashed = await bcrypt.hash(password, 10);
      await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, user.id]);
    }

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

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

    // Securely hash password before storing in MySQL
    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      'INSERT INTO users (id, name, email, password, role, status, isApproved) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [userId, name, email, hashedPassword, role, status, isApproved]
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

// PUT /api/auth/update-password (Authenticated User Password Update)
router.put('/update-password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'Current password and new password are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User account not found' });
    }

    const user = rows[0];

    // Verify current password
    let isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch && user.password === currentPassword) {
      isMatch = true;
    }

    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    // Hash the new password and update database
    const newHashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [newHashedPassword, req.user.id]);

    return res.json({
      success: true,
      message: 'Password updated successfully!',
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Password update failed', error: error.message });
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

