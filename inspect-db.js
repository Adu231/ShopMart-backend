const { pool, initDb } = require('./db');

async function inspectDb() {
  await initDb();
  console.log('\n========================================');
  console.log('🔍 DATABASE INSPECTION REPORT');
  console.log('========================================\n');

  // 1. Users Table
  const [users] = await pool.query('SELECT id, name, email, role, status, isApproved, createdAt FROM users');
  console.log(`--- USERS TABLE (${users.length} records) ---`);
  console.table(users);

  // 2. Products Table
  const [products] = await pool.query('SELECT id, name, category, price, stock, seller, isUnlisted, createdAt FROM products');
  console.log(`\n--- PRODUCTS TABLE (${products.length} records) ---`);
  console.table(products);

  // 3. Orders Table
  const [orders] = await pool.query('SELECT id, customerName, customerEmail, productName, productId, amount, status, createdAt FROM orders');
  console.log(`\n--- ORDERS TABLE (${orders.length} records) ---`);
  console.table(orders);

  // 4. Seller Profiles Table
  const [profiles] = await pool.query('SELECT id, userId, storeName, gstin, panNumber FROM seller_profiles');
  console.log(`\n--- SELLER PROFILES TABLE (${profiles.length} records) ---`);
  console.table(profiles);

  // 5. Reports Table
  const [reports] = await pool.query('SELECT id, customerName, productName, productId, sellerName, priority, status FROM reports');
  console.log(`\n--- REPORTS TABLE (${reports.length} records) ---`);
  console.table(reports);

  // 6. Seller Warnings Table
  const [warnings] = await pool.query('SELECT id, reportId, sellerName, productName, status FROM seller_warnings');
  console.log(`\n--- SELLER WARNINGS TABLE (${warnings.length} records) ---`);
  console.table(warnings);

  // 7. Commission Rules Table
  const [rules] = await pool.query('SELECT * FROM commission_rules');
  console.log(`\n--- COMMISSION RULES TABLE (${rules.length} records) ---`);
  console.table(rules);

  process.exit(0);
}

inspectDb();
