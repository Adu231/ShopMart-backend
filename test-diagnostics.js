const { pool, initDb } = require('./db');
const { uploadToCloudinary } = require('./cloudinary');

async function runDiagnostics() {
  console.log('--- STARTING BACKEND DIAGNOSTICS ---');
  await initDb();

  // 1. Inspect MySQL products table columns
  try {
    const [columns] = await pool.query('DESCRIBE products');
    console.log('✅ products table schema on Railway MySQL:');
    console.log(columns.map(c => `${c.Field} (${c.Type})`).join(', '));
  } catch (err) {
    console.error('❌ DESCRIBE products failed:', err.message);
  }

  // 2. Test INSERT product WITHOUT image
  try {
    const testId = `test_no_img_${Date.now()}`;
    const name = 'Test Product No Image';
    const brand = 'Test Brand';
    const category = 'Living Room';
    const price = 1000;
    const originalPrice = 1200;
    const discount = 15;
    const imagesJson = JSON.stringify(['https://images.unsplash.com/photo-1555041469-a586c61ea9bc']);
    const imageUrl = 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc';
    const imagePublicId = '';
    const description = 'Test description';
    const stock = 10;
    const seller = 'Test Seller';

    const [insertResult] = await pool.query(
      `INSERT INTO products (id, name, brand, category, price, originalPrice, discount, rating, reviewCount, images, image_url, image_public_id, description, stock, seller)
       VALUES (?, ?, ?, ?, ?, ?, ?, 5.0, 0, ?, ?, ?, ?, ?, ?)`,
      [testId, name, brand, category, price, originalPrice, discount, imagesJson, imageUrl, imagePublicId, description, stock, seller]
    );
    console.log('✅ MySQL INSERT WITHOUT image PASSED! Affected rows:', insertResult.affectedRows);

    // Clean up test row
    await pool.query('DELETE FROM products WHERE id = ?', [testId]);
    console.log('✅ Cleaned up test row.');
  } catch (err) {
    console.error('❌ MySQL INSERT WITHOUT image FAILED:', err.message);
  }

  // 3. Test Cloudinary Credentials & Stream Upload
  try {
    console.log('Testing Cloudinary config...');
    console.log('CLOUDINARY_CLOUD_NAME present:', !!process.env.CLOUDINARY_CLOUD_NAME);
    console.log('CLOUDINARY_API_KEY present:', !!process.env.CLOUDINARY_API_KEY);
    console.log('CLOUDINARY_API_SECRET present:', !!process.env.CLOUDINARY_API_SECRET);

    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.warn('⚠️ Cloudinary environment variables are MISSING or empty!');
    } else {
      const dummyBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
      const uploadRes = await uploadToCloudinary(dummyBuffer, 'shopmart/products');
      console.log('✅ Cloudinary dummy upload PASSED:', uploadRes);
    }
  } catch (err) {
    console.error('❌ Cloudinary upload FAILED:', err.message, err);
  }

  console.log('--- END DIAGNOSTICS ---');
  process.exit(0);
}

runDiagnostics();
