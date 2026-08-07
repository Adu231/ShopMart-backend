const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { initDb } = require('./db');
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const adminRoutes = require('./routes/adminRoutes');
const reportRoutes = require('./routes/reportRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());

let dbConnected = false;

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    database: dbConnected ? 'Railway MySQL Connected' : 'Disconnected / Connecting',
    host: process.env.DB_HOST || 'thomas.proxy.rlwy.net',
    port: process.env.DB_PORT || 15123,
    service: 'ShopMart REST API Backend',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportRoutes);

// Fallback Route
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'API Endpoint not found' });
});

// Start Server & Connect Database
app.listen(PORT, async () => {
  console.log(`🚀 ShopMart REST API Backend Server running on http://localhost:${PORT}`);
  dbConnected = await initDb();
});
