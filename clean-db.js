const { pool, initDb } = require('./db');

async function cleanDatabase() {
  await initDb();
  console.log('\n========================================');
  console.log('🧹 EXECUTING DATABASE MOCK DATA CLEANUP');
  console.log('========================================\n');

  try {
    // 1. Delete mock/sample products ('p1', 'p2', 'p3', 'p_1786354665243')
    const [delResult] = await pool.query(`DELETE FROM products WHERE id IN ('p1', 'p2', 'p3', 'p_1786354665243')`);
    console.log(`✅ Deleted ${delResult.affectedRows} mock/sample product records from products table.`);

    // 2. Verify remaining products count
    const [prodCount] = await pool.query('SELECT COUNT(*) as count FROM products');
    console.log(`📊 Remaining products in products table: ${prodCount[0].count}`);

    // 3. Verify users table (preserving all required login/authentication accounts)
    const [users] = await pool.query('SELECT id, name, email, role FROM users');
    console.log(`\n🔒 PRESERVED USER ACCOUNTS (${users.length} total):`);
    console.table(users);

    console.log('\n🎉 Database cleanup complete!');
  } catch (error) {
    console.error('❌ Error during database cleanup:', error.message);
  }

  process.exit(0);
}

cleanDatabase();
