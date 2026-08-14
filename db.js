const mysql = require('mysql2/promise');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || 'mysql://root:pXTNEMDUtiLOhGeQMtpyEUnbbBDjoZJM@thomas.proxy.rlwy.net:15123/railway';

// Create connection pool
const pool = mysql.createPool({
  uri: connectionString,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000,
});

async function initDb() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Successfully connected to Railway MySQL Database!');

    // 1. Users Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role ENUM('customer', 'seller', 'admin') DEFAULT 'customer',
        status ENUM('Pending', 'Active', 'Blocked', 'Suspended') DEFAULT 'Active',
        isApproved BOOLEAN DEFAULT TRUE,
        wallet_balance DECIMAL(10,2) DEFAULT 0.00,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure wallet_balance column exists if users table was created previously
    try {
      await connection.query('ALTER TABLE users ADD COLUMN wallet_balance DECIMAL(10,2) DEFAULT 0.00');
    } catch (e) {
      // Column already exists
    }

    // 2. Seller Profiles Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS seller_profiles (
        id VARCHAR(100) PRIMARY KEY,
        userId VARCHAR(100),
        storeName VARCHAR(255),
        gstin VARCHAR(50),
        panNumber VARCHAR(50),
        accountNumber VARCHAR(100),
        ifscCode VARCHAR(50),
        businessAddress TEXT,
        pickupPincode VARCHAR(20),
        registeredAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. Products Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS products (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        brand VARCHAR(100),
        category VARCHAR(100),
        price DECIMAL(10,2) NOT NULL,
        originalPrice DECIMAL(10,2),
        discount INT DEFAULT 0,
        rating DECIMAL(3,2) DEFAULT 4.5,
        reviewCount INT DEFAULT 0,
        images TEXT,
        image_url TEXT,
        image_public_id VARCHAR(255),
        description TEXT,
        specifications TEXT,
        stock INT DEFAULT 10,
        seller VARCHAR(255),
        isFeatured BOOLEAN DEFAULT FALSE,
        isUnlisted BOOLEAN DEFAULT FALSE,
        unlistedReason TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    try { await connection.query('ALTER TABLE products ADD COLUMN image_url TEXT'); } catch (e) {}
    try { await connection.query('ALTER TABLE products ADD COLUMN image_public_id VARCHAR(255)'); } catch (e) {}
    try { await connection.query('ALTER TABLE products ADD COLUMN sellerId VARCHAR(100)'); } catch (e) {}

    // 4. Orders Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(100) PRIMARY KEY,
        userId VARCHAR(100),
        sellerId VARCHAR(100),
        customerName VARCHAR(255),
        customerEmail VARCHAR(255),
        productName VARCHAR(255),
        productId VARCHAR(100),
        amount DECIMAL(10,2),
        status VARCHAR(50) DEFAULT 'placed',
        address TEXT,
        paymentMethod VARCHAR(100),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    try { await connection.query('ALTER TABLE orders ADD COLUMN userId VARCHAR(100)'); } catch (e) {}
    try { await connection.query('ALTER TABLE orders ADD COLUMN sellerId VARCHAR(100)'); } catch (e) {}

    // 5. Commission Rules Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS commission_rules (
        id INT PRIMARY KEY AUTO_INCREMENT,
        standardRate DECIMAL(5,2) DEFAULT 10.00,
        returnReversalRate DECIMAL(5,2) DEFAULT 100.00,
        minPayoutThreshold DECIMAL(10,2) DEFAULT 1000.00,
        categoryTaxRate DECIMAL(5,2) DEFAULT 18.00,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // 6. Reports Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id VARCHAR(100) PRIMARY KEY,
        customerName VARCHAR(255),
        customerEmail VARCHAR(255),
        productName VARCHAR(255),
        productId VARCHAR(100),
        sellerName VARCHAR(255),
        reason TEXT,
        priority VARCHAR(50) DEFAULT 'Medium',
        status VARCHAR(50) DEFAULT 'Open',
        warningSent BOOLEAN DEFAULT FALSE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 7. Seller Warnings Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS seller_warnings (
        id VARCHAR(100) PRIMARY KEY,
        reportId VARCHAR(100),
        sellerName VARCHAR(255),
        productName VARCHAR(255),
        customerName VARCHAR(255),
        reason TEXT,
        priority VARCHAR(50),
        message TEXT,
        status VARCHAR(50) DEFAULT 'Unread',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 8. Categories Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        image_url TEXT,
        image_public_id VARCHAR(255),
        sortOrder INT DEFAULT 0,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 9. Wallet Transactions Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id VARCHAR(100) PRIMARY KEY,
        userId VARCHAR(100) NOT NULL,
        type VARCHAR(20) NOT NULL,
        title VARCHAR(255) NOT NULL,
        category VARCHAR(50) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        date VARCHAR(100),
        status VARCHAR(20) DEFAULT 'completed',
        referenceId VARCHAR(100),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_wallet_userId (userId)
      )
    `);

    // Seed Initial Categories if Empty
    const [catRows] = await connection.query('SELECT COUNT(*) as count FROM categories');
    if (catRows[0].count === 0) {
      await connection.query(`
        INSERT INTO categories (id, name, image_url, sortOrder) VALUES
        ('cat_1', 'Living Room', 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&q=80', 1),
        ('cat_2', 'Bedroom', 'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=400&q=80', 2),
        ('cat_3', 'Dining', 'https://images.unsplash.com/photo-1599327286062-3f4d8f3aaf77?w=400&q=80', 3),
        ('cat_4', 'Study', 'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=400&q=80', 4),
        ('cat_5', 'Storage', 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80', 5)
      `);
      console.log('🌱 Default categories seeded.');
    }

    // Seed Admin User Only if No Users Exist
    const bcrypt = require('bcryptjs');
    const [userRows] = await connection.query('SELECT COUNT(*) as count FROM users');
    if (userRows[0].count === 0) {
      const adminHash = await bcrypt.hash('Admin@2024', 10);
      await connection.query(
        `INSERT INTO users (id, name, email, password, role, status, isApproved) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['admin_001', 'Admin User', 'admin@shopmart.com', adminHash, 'admin', 'Active', 1]
      );
      console.log('🌱 Admin user seeded with bcrypt hashed password into Railway MySQL database.');
    } else {
      // Hash any legacy plain text passwords in DB on startup
      const [allUsers] = await connection.query('SELECT id, password FROM users');
      for (const u of allUsers) {
        if (u.password && !u.password.startsWith('$2a$') && !u.password.startsWith('$2b$')) {
          const hashed = await bcrypt.hash(u.password, 10);
          await connection.query('UPDATE users SET password = ? WHERE id = ?', [hashed, u.id]);
          console.log(`🔒 Auto-hashed legacy plain text password for user ${u.id}`);
        }
      }
    }



    // Seed Initial Commission Rules if Empty
    const [commRows] = await connection.query('SELECT COUNT(*) as count FROM commission_rules');
    if (commRows[0].count === 0) {
      await connection.query(`
        INSERT INTO commission_rules (standardRate, returnReversalRate, minPayoutThreshold, categoryTaxRate)
        VALUES (10.00, 100.00, 1000.00, 18.00)
      `);
      console.log('🌱 Commission rules seeded into Railway MySQL database.');
    }

    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize Railway MySQL database:', error.message);
    return false;
  }
}

module.exports = { pool, initDb };
