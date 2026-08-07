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
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

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

    // 4. Orders Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(100) PRIMARY KEY,
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

    // Seed Initial Demo Users if Empty
    const [userRows] = await connection.query('SELECT COUNT(*) as count FROM users');
    if (userRows[0].count === 0) {
      await connection.query(`
        INSERT INTO users (id, name, email, password, role, status, isApproved) VALUES
        ('u1', 'Priya Customer', 'customer@demo.com', 'password123', 'customer', 'Active', 1),
        ('u2', 'Rahul Seller', 'seller@demo.com', 'password123', 'seller', 'Active', 1),
        ('u3', 'Admin User', 'admin@demo.com', 'password123', 'admin', 'Active', 1)
      `);
      console.log('🌱 Demo Users seeded into Railway MySQL database.');
    }

    // Seed Initial Products if Empty
    const [prodRows] = await connection.query('SELECT COUNT(*) as count FROM products');
    if (prodRows[0].count === 0) {
      await connection.query(`
        INSERT INTO products (id, name, brand, category, price, originalPrice, discount, rating, reviewCount, images, description, stock, seller, isFeatured) VALUES
        ('p1', 'Solid Teak 6-Seater Sectional Dining Set', 'Woodcraft Hub', 'Dining Room', 44999.00, 59999.00, 25, 4.80, 342, '["https://images.unsplash.com/photo-1617806118233-18e1de247200?auto=format&fit=crop&w=800&q=80"]', '100% Solid Teak Wood 6-Seater Sectional Dining Table Set.', 12, 'Samsung Electronics / Woodcraft Hub', 1),
        ('p2', 'Modern Velvet 3-Seater Sofa', 'Royal Wood', 'Sofa & Seating', 28999.00, 39999.00, 27, 4.70, 189, '["https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=80"]', 'Plush Royal Emerald Velvet Upholstered 3-Seater Sofa.', 8, 'Home Essentials Store', 1),
        ('p3', 'Ergonomic Sheesham Study Table', 'Urban Crafted', 'Home Office', 12499.00, 16999.00, 26, 4.60, 94, '["https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&w=800&q=80"]', 'Ergonomic Work From Home Sheesham Study Desk.', 15, 'TechZone India', 0)
      `);
      console.log('🌱 Products seeded into Railway MySQL database.');
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
