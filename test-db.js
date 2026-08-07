const { initDb, pool } = require('./db');

async function testConnection() {
  console.log('Testing connection to Railway MySQL database...');
  const success = await initDb();
  if (success) {
    console.log('🎉 Railway MySQL database test PASSED!');
    const [rows] = await pool.query('SELECT COUNT(*) as userCount FROM users');
    console.log(`Current registered users count in Railway MySQL: ${rows[0].userCount}`);
  } else {
    console.error('❌ Railway MySQL database test FAILED.');
  }
  process.exit(0);
}

testConnection();
