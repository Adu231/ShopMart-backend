const { pool, initDb } = require('./db');

async function purgeAllMockData() {
  await initDb();
  console.log('\n========================================');
  console.log('🧹 PURGING ALL MOCK DATA FROM DATABASE');
  console.log('========================================\n');

  try {
    // 1. Delete ALL orders (mock data)
    const [delOrders] = await pool.query(`DELETE FROM orders WHERE 1=1`);
    console.log(`✅ Deleted ${delOrders.affectedRows} order records.`);

    // 2. Delete ALL products (mock data)
    const [delProducts] = await pool.query(`DELETE FROM products WHERE 1=1`);
    console.log(`✅ Deleted ${delProducts.affectedRows} product records.`);

    // 3. Delete ALL reports (mock data)
    const [delReports] = await pool.query(`DELETE FROM reports WHERE 1=1`);
    console.log(`✅ Deleted ${delReports.affectedRows} report records.`);

    // 4. Delete ALL seller warnings (mock data)
    const [delWarnings] = await pool.query(`DELETE FROM seller_warnings WHERE 1=1`);
    console.log(`✅ Deleted ${delWarnings.affectedRows} seller warning records.`);

    // 5. Delete ALL seller profiles (mock data)
    const [delProfiles] = await pool.query(`DELETE FROM seller_profiles WHERE 1=1`);
    console.log(`✅ Deleted ${delProfiles.affectedRows} seller profile records.`);

    // 6. Delete ALL non-admin users (customers, sellers, old demo accounts)
    const [delUsers] = await pool.query(`DELETE FROM users WHERE role != 'admin'`);
    console.log(`✅ Deleted ${delUsers.affectedRows} non-admin user records (customers & sellers).`);

    // 7. Delete old demo admin accounts (admin@demo.com, u3)
    const [delOldAdmin] = await pool.query(`DELETE FROM users WHERE email IN ('admin@demo.com', 'customer@demo.com', 'seller@demo.com')`);
    console.log(`✅ Deleted ${delOldAdmin.affectedRows} old demo admin/customer/seller accounts.`);

    // 8. Ensure the real admin account exists
    const [adminCheck] = await pool.query(`SELECT COUNT(*) as count FROM users WHERE email = 'admin@shopmart.com'`);
    if (adminCheck[0].count === 0) {
      await pool.query(`
        INSERT INTO users (id, name, email, password, role, status, isApproved) VALUES
        ('admin_001', 'Admin User', 'admin@shopmart.com', 'Admin@2024', 'admin', 'Active', 1)
      `);
      console.log(`\n✅ Admin account created: admin@shopmart.com`);
    } else {
      console.log(`\n✅ Admin account already exists: admin@shopmart.com`);
    }

    // 9. Show final state
    const [users] = await pool.query('SELECT id, name, email, role, status FROM users');
    console.log(`\n🔒 REMAINING USER ACCOUNTS (${users.length} total):`);
    console.table(users);

    const [products] = await pool.query('SELECT COUNT(*) as count FROM products');
    const [orders] = await pool.query('SELECT COUNT(*) as count FROM orders');
    console.log(`\n📊 Products remaining: ${products[0].count}`);
    console.log(`📊 Orders remaining: ${orders[0].count}`);

    console.log('\n🎉 Database purge complete! Only admin credentials remain.');
  } catch (error) {
    console.error('❌ Error during database purge:', error.message);
  }

  process.exit(0);
}

purgeAllMockData();
