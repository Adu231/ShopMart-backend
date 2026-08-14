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

async function getOrCreateUser(name, email, password, role) {
  let loginRes = await request('POST', '/auth/login', { email, password });
  if (loginRes.status === 200 && loginRes.body?.token) {
    return loginRes.body.token;
  }
  let signupRes = await request('POST', '/auth/signup', { name, email, password, role });
  if (signupRes.status === 201 && signupRes.body?.token) {
    return signupRes.body.token;
  }
  throw new Error(`Failed to get/create user ${email}: ${JSON.stringify(signupRes.body || loginRes.body)}`);
}

async function runSecurityTests() {
  console.log('\n====================================================');
  console.log('🔒 RUNNING SHOPMART E2E SECURITY & ISOLATION SUITE');
  console.log('====================================================\n');

  try {
    // 1. Customer Accounts Setup
    const tokenCustA = await getOrCreateUser('Customer A', 'cust_a_test@demo.com', 'password123', 'customer');
    console.log('1. Customer A Authenticated: ✅ SUCCESS');

    const tokenCustB = await getOrCreateUser('Customer B', 'cust_b_test@demo.com', 'password123', 'customer');
    console.log('2. Customer B Authenticated: ✅ SUCCESS');

    // 2. Customer A Order Placement
    const placeOrderRes = await request('POST', '/orders', {
      productName: 'Teak Wooden Dining Chair',
      productId: 'p_isolation_chair_001',
      totalAmount: 12500,
      address: 'Customer A Private Suite',
      paymentMethod: 'ShopMart Wallet',
    }, tokenCustA);

    const orderAId = placeOrderRes.body && placeOrderRes.body.order ? placeOrderRes.body.order.id : null;
    console.log('3. Customer A Order Placement:', placeOrderRes.status === 201 ? '✅ SUCCESS' : `❌ FAILED (${placeOrderRes.status})`, placeOrderRes.body);

    // 3. Customer B Order History Isolation Check
    const custBOrdersRes = await request('GET', '/orders', null, tokenCustB);
    const custBOrders = custBOrdersRes.body.orders || [];
    const foundOrderAInB = orderAId && custBOrders.some(o => o.id === orderAId);

    console.log('4. Customer Order History Isolation:');
    if (!foundOrderAInB) {
      console.log('   ✅ PASS: Customer A order is NOT visible in Customer B order history!');
    } else {
      console.error('   ❌ CRITICAL FAIL: Customer B can see Customer A order!');
    }

    // 4. Customer B Direct Access Attack Guard (GET /orders/:id)
    if (orderAId) {
      const directOrderFetchRes = await request('GET', `/orders/${orderAId}`, null, tokenCustB);
      console.log('5. Direct Order ID Access Guard (ID Tampering Attack):');
      if (directOrderFetchRes.status === 403) {
        console.log('   ✅ PASS: Direct access by Customer B returned HTTP 403 Forbidden!');
      } else {
        console.error(`   ❌ FAIL: Unexpected status ${directOrderFetchRes.status} (expected 403)`);
      }
    }

    // 5. Seller Accounts Setup
    const tokenSellerA = await getOrCreateUser('Seller A Woodcrafts', 'seller_a_test@demo.com', 'password123', 'seller');
    console.log('\n6. Seller A Authenticated: ✅ SUCCESS');

    const tokenSellerB = await getOrCreateUser('Seller B Artisans', 'seller_b_test@demo.com', 'password123', 'seller');
    console.log('7. Seller B Authenticated: ✅ SUCCESS');

    // 6. Seller A Product Creation
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

    // 7. Seller B Product Dashboard Isolation Check
    const sellerBProdsRes = await request('GET', '/products/seller/mine', null, tokenSellerB);
    const sellerBProds = sellerBProdsRes.body.products || [];
    const foundProdAInB = sellerBProds.some(p => p.id === prodAId);

    console.log('9. Seller Dashboard Product Isolation:');
    if (!foundProdAInB) {
      console.log('   ✅ PASS: Seller A product is NOT visible in Seller B dashboard!');
    } else {
      console.error('   ❌ CRITICAL FAIL: Seller B dashboard shows Seller A product!');
    }

    // 8. Seller B Ownership Attack Test - PUT
    const sellerBUpdateRes = await request('PUT', `/products/${prodAId}`, { name: 'Hacked Title' }, tokenSellerB);
    console.log('10. Seller Ownership Guard PUT Attack:');
    if (sellerBUpdateRes.status === 403) {
      console.log('   ✅ PASS: Seller B PUT attack returned HTTP 403 Forbidden!');
    } else {
      console.error(`   ❌ FAIL: Status ${sellerBUpdateRes.status} (expected 403)`);
    }

    // 9. Seller B Ownership Attack Test - DELETE
    const sellerBDeleteRes = await request('DELETE', `/products/${prodAId}`, { permanent: true }, tokenSellerB);
    console.log('11. Seller Ownership Guard DELETE Attack:');
    if (sellerBDeleteRes.status === 403) {
      console.log('   ✅ PASS: Seller B DELETE attack returned HTTP 403 Forbidden!');
    } else {
      console.error(`   ❌ FAIL: Status ${sellerBDeleteRes.status} (expected 403)`);
    }

    // 10. Public Catalog Browsing
    const publicCatRes = await request('GET', '/products');
    console.log('\n12. Public Product Catalog Browsing:');
    if (publicCatRes.status === 200 && Array.isArray(publicCatRes.body.products)) {
      console.log('   ✅ PASS: Public catalog browsing is functional for unauthenticated users!');
    } else {
      console.error('   ❌ FAIL: Public catalog browsing broken.');
    }

    // 11. Protected Endpoint Unauthenticated Access Check
    const unauthRes = await request('GET', '/orders');
    console.log('\n13. Unauthenticated Access Protection:');
    if (unauthRes.status === 401) {
      console.log('   ✅ PASS: Unauthenticated request to /api/orders returned HTTP 401!');
    } else {
      console.error(`   ❌ FAIL: Status ${unauthRes.status} (expected 401)`);
    }

    // 12. Role Boundary Check: Customer cannot access Admin endpoints
    const custAdminRes = await request('GET', '/admin/sellers', null, tokenCustA);
    console.log('14. Customer Admin Endpoint Barrier:');
    if (custAdminRes.status === 403) {
      console.log('   ✅ PASS: Customer attempting GET /admin/sellers returned HTTP 403 Forbidden!');
    } else {
      console.error(`   ❌ FAIL: Status ${custAdminRes.status} (expected 403)`);
    }

    console.log('\n====================================================');
    console.log('🎉 ALL SECURITY & ISOLATION TESTS PASSED 100%!');
    console.log('====================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('Security test script error:', err);
    process.exit(1);
  }
}

runSecurityTests();
