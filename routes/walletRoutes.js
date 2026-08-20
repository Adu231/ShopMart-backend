const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/auth');

// GET /api/wallet (Fetch current user balance & transaction history)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const [userRows] = await pool.query('SELECT wallet_balance FROM users WHERE id = ?', [req.user.id]);
    const balance = userRows.length > 0 ? Number(userRows[0].wallet_balance || 0) : 0;

    const [txnRows] = await pool.query(
      'SELECT id, type, title, category, amount, date, status, referenceId, createdAt FROM wallet_transactions WHERE userId = ? ORDER BY createdAt DESC',
      [req.user.id]
    );

    const formattedTxns = txnRows.map(t => ({
      id: t.id,
      type: t.type,
      title: t.title,
      category: t.category,
      amount: Number(t.amount),
      date: t.date || new Date(t.createdAt).toISOString(),
      status: t.status,
      referenceId: t.referenceId,
    }));

    return res.json({
      success: true,
      balance,
      transactions: formattedTxns,
    });
  } catch (error) {
    console.error('[GET WALLET ERROR]', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch wallet info', error: error.message });
  }
});

// POST /api/wallet/topup (Add money / deposit credit to wallet)
router.post('/topup', authenticateToken, async (req, res) => {
  const { amount, paymentMode = 'upi' } = req.body;
  const amt = Number(amount);

  if (!amt || amt <= 0 || isNaN(amt)) {
    return res.status(400).json({ success: false, message: 'Invalid top-up amount' });
  }

  if (amt > 10000000) {
    return res.status(400).json({ success: false, message: 'Top-up amount cannot exceed ₹1,00,00,000 per transaction' });
  }

  try {
    await pool.query('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [amt, req.user.id]);

    const [userRows] = await pool.query('SELECT wallet_balance FROM users WHERE id = ?', [req.user.id]);
    const newBalance = Number(userRows[0].wallet_balance || 0);

    const txnId = `TXN-${Math.floor(10000 + Math.random() * 90000)}`;
    const refId = `PAY-${Date.now()}`;
    const modeLabel = paymentMode.toUpperCase();
    const title = `Added via ${modeLabel}`;
    const dateStr = new Date().toISOString();

    await pool.query(
      'INSERT INTO wallet_transactions (id, userId, type, title, category, amount, date, status, referenceId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [txnId, req.user.id, 'credit', title, 'add_funds', amt, dateStr, 'completed', refId]
    );

    const newTxn = {
      id: txnId,
      type: 'credit',
      title,
      category: 'add_funds',
      amount: amt,
      date: dateStr,
      status: 'completed',
      referenceId: refId,
    };

    return res.json({
      success: true,
      message: `${amt} added to wallet successfully!`,
      balance: newBalance,
      transaction: newTxn,
    });
  } catch (error) {
    console.error('[TOPUP WALLET ERROR]', error);
    return res.status(500).json({ success: false, message: 'Top-up failed', error: error.message });
  }
});

// POST /api/wallet/withdraw (Withdraw money / debit from wallet)
router.post('/withdraw', authenticateToken, async (req, res) => {
  const { amount, bankName = 'Bank', accountNumber = '' } = req.body;
  const amt = Number(amount);

  if (!amt || amt <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid withdrawal amount' });
  }

  try {
    const [userRows] = await pool.query('SELECT wallet_balance FROM users WHERE id = ?', [req.user.id]);
    const currentBalance = userRows.length > 0 ? Number(userRows[0].wallet_balance || 0) : 0;

    if (amt > currentBalance) {
      return res.status(400).json({ success: false, message: 'Insufficient wallet balance for this withdrawal' });
    }

    await pool.query('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [amt, req.user.id]);

    const [updatedUserRows] = await pool.query('SELECT wallet_balance FROM users WHERE id = ?', [req.user.id]);
    const newBalance = Number(updatedUserRows[0].wallet_balance || 0);

    const txnId = `TXN-${Math.floor(10000 + Math.random() * 90000)}`;
    const refId = `NEFT-${Math.floor(100000 + Math.random() * 900000)}`;
    const last4 = accountNumber ? accountNumber.slice(-4) : 'XXXX';
    const title = `Bank Transfer to ${bankName} (**** ${last4})`;
    const dateStr = new Date().toISOString();

    await pool.query(
      'INSERT INTO wallet_transactions (id, userId, type, title, category, amount, date, status, referenceId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [txnId, req.user.id, 'debit', title, 'withdrawal', amt, dateStr, 'completed', refId]
    );

    const newTxn = {
      id: txnId,
      type: 'debit',
      title,
      category: 'withdrawal',
      amount: amt,
      date: dateStr,
      status: 'completed',
      referenceId: refId,
    };

    return res.json({
      success: true,
      message: `Withdrawal request of ${amt} submitted successfully!`,
      balance: newBalance,
      transaction: newTxn,
    });
  } catch (error) {
    console.error('[WITHDRAW WALLET ERROR]', error);
    return res.status(500).json({ success: false, message: 'Withdrawal failed', error: error.message });
  }
});

// POST /api/wallet/record (Record an order debit or refund credit)
router.post('/record', authenticateToken, async (req, res) => {
  const { type, title, category, amount, referenceId } = req.body;
  const amt = Number(amount);

  if (!type || !title || !amt || amt <= 0) {
    return res.status(400).json({ success: false, message: 'Type, title and positive amount required' });
  }

  try {
    if (type === 'credit') {
      await pool.query('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [amt, req.user.id]);
    } else if (type === 'debit') {
      await pool.query('UPDATE users SET wallet_balance = GREATEST(0, wallet_balance - ?) WHERE id = ?', [amt, req.user.id]);
    }

    const [userRows] = await pool.query('SELECT wallet_balance FROM users WHERE id = ?', [req.user.id]);
    const newBalance = Number(userRows[0]?.wallet_balance || 0);

    const txnId = `TXN-${Math.floor(10000 + Math.random() * 90000)}`;
    const dateStr = new Date().toISOString();

    await pool.query(
      'INSERT INTO wallet_transactions (id, userId, type, title, category, amount, date, status, referenceId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [txnId, req.user.id, type, title, category || 'order_payment', amt, dateStr, 'completed', referenceId || '']
    );

    return res.json({
      success: true,
      balance: newBalance,
      transaction: {
        id: txnId,
        type,
        title,
        category: category || 'order_payment',
        amount: amt,
        date: dateStr,
        status: 'completed',
        referenceId: referenceId || '',
      },
    });
  } catch (error) {
    console.error('[RECORD TRANSACTION ERROR]', error);
    return res.status(500).json({ success: false, message: 'Failed to record transaction', error: error.message });
  }
});

module.exports = router;
