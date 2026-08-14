const mysql = require('mysql2/promise');
require('dotenv').config();
(async () => {
  const pool = mysql.createPool({ uri: process.env.DATABASE_URL });
  const [del] = await pool.query('DELETE FROM users WHERE email = ?', ['customer2@test.com']);
  console.log('Deleted test account:', del.affectedRows, 'row(s)');
  const [users] = await pool.query('SELECT id, name, email, role, status FROM users');
  console.log('Final users in DB:');
  console.table(users);
  pool.end();
  process.exit(0);
})();
