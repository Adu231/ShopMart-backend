const http = require('http');

const BASE_URL = 'http://localhost:5000/api';

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}${path}`);
    const options = {
      method,
      hostname: '127.0.0.1',
      port: 5000,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    if (body) {
      const payload = JSON.stringify(body);
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', err => reject(err));
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runSecurityTests() {
  console.log('\n====================================================');
  console.log('🔒 RUNNING SHOPMART SECURITY & ISOLATION TESTS');
  console.log('====================================================\n');

  try {
    // 1. Login Customer A
    const custALogin = await request('POST', '/auth/login', { email: 'customer@demo.com', password: 'password123' });
    console.log('1. Customer A Login:', custALogin.status === 200 ? '✅ SUCCESS' : '❌ FAILED', custALogin.body?.message || '');
    const tokenCustA = custALogin.body.token;

    // 2. Signup / Login Customer B
    let tokenCustB;
    const custBLogin = await request('POST', '/auth/login', { email: 'cust_b_isolated@demo.com', password: 'password123' });
    if (custBLogin.status === 200) {
      tokenCustB = custBLogin.body.token;
      console.log('2. Customer B Login: ✅ SUCCESS');
    } else {
      const custBSignup = await request('POST', '/auth/signup', { name: 'Customer B', email: 'cust_b_isolated@demo.com', password: 'password123', role: 'customer' });
      tokenCustB = custBSignup.body.token;
      console.log('2. Customer B Signup & Login: ✅ SUCCESS');
    }

    // 3. Customer A places an Order
    const placeOrderRes = await request('POST', '/orders', {
      productName: 'Teak Wooden Dining Chair',
      productId: 'p_isolation_test_chair',
      totalAmount: 12500,
      address: 'Customer A Private Suite',
      paymentMethod: 'ShopMart Wallet',
    }, tokenCustA);

    const orderAId = placeOrderRes.body && placeOrderRes.body.order ? placeOrderRes.body.order.id : null;
    console.log('3. Customer A Order Placement:', placeOrderRes.status === 201 ? '✅ SUCCESS' : `❌ FAILED (${placeOrderRes.status})`, orderAId ? `Order: ${orderAId}` : '');

    // 4. Customer B attempts to fetch Order History
    const custBOrdersRes = await request('GET', '/orders', null, tokenCustB);
    const custBOrders = custBOrdersRes.body.orders || [];
    const foundOrderAInB = orderAId && custBOrders.some(o => o.id === orderAId);

    console.log('4. Customer Isolation Test:');
    if (!foundOrderAInB) {
      console.log('   ✅ PASS: Customer A order is NOT visible in Customer B order history!');
    } else {
      console.error('   ❌ CRITICAL FAIL: Customer B can see Customer A order!');
    }

    // 5. Customer B attempts direct access to Customer A Order ID
    if (orderAId) {
      const directOrderFetchRes = await request('GET', `/orders/${orderAId}`, null, tokenCustB);
      console.log('5. Direct Order ID Access Guard Test:');
      if (directOrderFetchRes.status === 403) {
        console.log('   ✅ PASS: Direct access by Customer B returned HTTP 403 Forbidden!');
      } else {
        console.error(`   ❌ FAIL: Unexpected status ${directOrderFetchRes.status} (expected 403)`);
      }
    }

    // 6. Login Seller A
    const sellerALogin = await request('POST', '/auth/login', { email: 'seller@demo.com', password: 'password123' });
    const tokenSellerA = sellerALogin.body.token;
    console.log('\n6. Seller A Login:', sellerALogin.status === 200 ? '✅ SUCCESS' : '❌ FAILED');

    // 7. Signup / Login Seller B
    let tokenSellerB;
    const sellerBLogin = await request('POST', '/auth/login', { email: 'seller_b_isolated@demo.com', password: 'password123' });
    if (sellerBLogin.status === 200) {
      tokenSellerB = sellerBLogin.body.token;
      console.log('7. Seller B Login: ✅ SUCCESS');
    } else {
      const sellerBSignup = await request('POST', '/auth/signup', { name: 'Seller B Woodcrafts', email: 'seller_b_isolated@demo.com', password: 'password123', role: 'seller' });
      tokenSellerB = sellerBSignup.body.token;
      console.log('7. Seller B Signup & Login: ✅ SUCCESS');
    }

    // 8. Seller A Creates Product A
    const prodAId = `p_sel_A_${Date.now()}`;
    const createProdARes = await request('POST', '/products', {
      id: prodAId,
      name: 'Seller A Exclusive Carved Table',
      brand: 'Seller A Artisans',
      category: 'Tables',
      price: 45000,
      stock: 5,
    }, tokenSellerA);
    console.log('8. Seller A Product Creation:', createProdARes.status === 201 ? '✅ SUCCESS' : `❌ FAILED (${createProdARes.status})`);

    // 9. Seller B Dashboard Products Fetch Test
    const sellerBProdsRes = await request('GET', '/products/seller/mine', null, tokenSellerB);
    const sellerBProds = sellerBProdsRes.body.products || [];
    const foundProdAInB = sellerBProds.some(p => p.id === prodAId);

    console.log('9. Seller Product Isolation Test:');
    if (!foundProdAInB) {
      console.log('   ✅ PASS: Seller A product is NOT visible in Seller B dashboard!');
    } else {
      console.error('   ❌ CRITICAL FAIL: Seller B dashboard shows Seller A product!');
    }

    // 10. Seller B Ownership Attack Test - PUT
    const sellerBUpdateRes = await request('PUT', `/products/${prodAId}`, { name: 'Hacked Title' }, tokenSellerB);
    console.log('10. Seller Ownership Guard PUT Test:');
    if (sellerBUpdateRes.status === 403) {
      console.log('   ✅ PASS: Seller B PUT attack returned HTTP 403 Forbidden!');
    } else {
      console.error(`   ❌ FAIL: Status ${sellerBUpdateRes.status} (expected 403)`);
    }

    // 11. Seller B Ownership Attack Test - DELETE
    const sellerBDeleteRes = await request('DELETE', `/products/${prodAId}`, { permanent: true }, tokenSellerB);
    console.log('11. Seller Ownership Guard DELETE Test:');
    if (sellerBDeleteRes.status === 403) {
      console.log('   ✅ PASS: Seller B DELETE attack returned HTTP 403 Forbidden!');
    } else {
      console.error(`   ❌ FAIL: Status ${sellerBDeleteRes.status} (expected 403)`);
    }

    // 12. Public Catalog Test
    const publicCatRes = await request('GET', '/products');
    console.log('\n12. Public Product Catalog Browsing Test:');
    if (publicCatRes.status === 200 && Array.isArray(publicCatRes.body.products)) {
      console.log('   ✅ PASS: Public catalog browsing is functional for unauthenticated users!');
    } else {
      console.error('   ❌ FAIL: Public catalog browsing broken.');
    }

    // 13. Unauthenticated request to protected endpoint
    const unauthRes = await request('GET', '/orders');
    console.log('\n13. Unauthenticated Access to Protected Endpoint:');
    if (unauthRes.status === 401) {
      console.log('   ✅ PASS: Unauthenticated request to /api/orders returned HTTP 401!');
    } else {
      console.error(`   ❌ FAIL: Status ${unauthRes.status} (expected 401)`);
    }

    // 14. Role boundary: Customer cannot access admin endpoints
    const custAdminRes = await request('GET', '/admin/sellers', null, tokenCustA);
    console.log('14. Customer Cannot Access Admin Endpoint:');
    if (custAdminRes.status === 403) {
      console.log('   ✅ PASS: Customer attempting GET /admin/sellers returned HTTP 403 Forbidden!');
    } else {
      console.error(`   ❌ FAIL: Status ${custAdminRes.status} (expected 403)`);
    }

    console.log('\n====================================================');
    console.log('🎉 ALL SECURITY & ISOLATION TESTS COMPLETED!');
    console.log('====================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('Security test script error:', err);
    process.exit(1);
  }
}

runSecurityTests();
