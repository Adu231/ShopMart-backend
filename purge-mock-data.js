const { pool, initDb } = require('./db');
const bcrypt = require('bcryptjs');

async function purgeAllMockData() {
  await initDb();
  console.log('\n========================================');
  console.log('🧹 PURGING ALL MOCK DATA FROM DATABASE');
  console.log('========================================\n');

  try {
    // 1. Delete ALL orders
    const [delOrders] = await pool.query(`DELETE FROM orders WHERE 1=1`);
    console.log(`✅ Deleted ${delOrders.affectedRows} order records.`);

    // 2. Delete ALL products
    const [delProducts] = await pool.query(`DELETE FROM products WHERE 1=1`);
    console.log(`✅ Deleted ${delProducts.affectedRows} product records.`);

    // 3. Delete ALL reports
    const [delReports] = await pool.query(`DELETE FROM reports WHERE 1=1`);
    console.log(`✅ Deleted ${delReports.affectedRows} report records.`);

    // 4. Delete ALL seller warnings
    const [delWarnings] = await pool.query(`DELETE FROM seller_warnings WHERE 1=1`);
    console.log(`✅ Deleted ${delWarnings.affectedRows} seller warning records.`);

    // 5. Delete ALL seller profiles
    const [delProfiles] = await pool.query(`DELETE FROM seller_profiles WHERE 1=1`);
    console.log(`✅ Deleted ${delProfiles.affectedRows} seller profile records.`);

    // 6. Delete ALL wallet transactions
    const [delWallet] = await pool.query(`DELETE FROM wallet_transactions WHERE 1=1`);
    console.log(`✅ Deleted ${delWallet.affectedRows} wallet transaction records.`);

    // 7. Delete ALL non-admin users (customers, sellers, old test accounts)
    const [delUsers] = await pool.query(`DELETE FROM users WHERE role != 'admin'`);
    console.log(`✅ Deleted ${delUsers.affectedRows} non-admin user records.`);

    // 8. Ensure admin credentials exist and are hashed
    const hashedPw = await bcrypt.hash('Admin@2024', 10);
    
    // Check admin@shopmart.com
    const [a1] = await pool.query(`SELECT id FROM users WHERE email = 'admin@shopmart.com'`);
    if (a1.length === 0) {
      await pool.query(
        `INSERT INTO users (id, name, email, password, role, status, isApproved) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['admin_001', 'ShopMart Admin', 'admin@shopmart.com', hashedPw, 'admin', 'Active', 1]
      );
    } else {
      await pool.query(`UPDATE users SET password = ? WHERE email = 'admin@shopmart.com'`, [hashedPw]);
    }

    // Check admin@woodnest.com
    const [a2] = await pool.query(`SELECT id FROM users WHERE email = 'admin@woodnest.com'`);
    if (a2.length === 0) {
      await pool.query(
        `INSERT INTO users (id, name, email, password, role, status, isApproved) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['admin_002', 'WoodNest Super Admin', 'admin@woodnest.com', hashedPw, 'admin', 'Active', 1]
      );
    } else {
      await pool.query(`UPDATE users SET password = ? WHERE email = 'admin@woodnest.com'`, [hashedPw]);
    }

    console.log('\n🔒 ONLY ADMIN ACCOUNTS REMAIN IN DATABASE:');
    const [remainingUsers] = await pool.query('SELECT id, name, email, role, status FROM users');
    console.table(remainingUsers);

    console.log('\n📊 DATABASE COUNTS AFTER PURGE:');
    const [pCount] = await pool.query('SELECT COUNT(*) as count FROM products');
    const [oCount] = await pool.query('SELECT COUNT(*) as count FROM orders');
    const [wCount] = await pool.query('SELECT COUNT(*) as count FROM wallet_transactions');
    console.log(`- Products: ${pCount[0].count}`);
    console.log(`- Orders: ${oCount[0].count}`);
    console.log(`- Wallet Transactions: ${wCount[0].count}`);

    console.log('\n🎉 Database purge complete! All mock data removed.');
  } catch (error) {
    console.error('❌ Error during database purge:', error.message);
  }

  process.exit(0);
}

purgeAllMockData();
