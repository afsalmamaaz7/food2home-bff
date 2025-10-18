const express = require('express');
const { 
  getPayments,
  getPayment,
  createPayment,
  updatePayment,
  deletePayment,
  recordPayment,
  getPaymentStats,
  getMonthlyReport,
  getYearlyReport
} = require('../controllers/paymentController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// All routes require authentication and admin access
router.use(authenticateToken, requireAdmin);

// @route   GET /api/payments/dashboard/stats
router.get('/dashboard/stats', getPaymentStats);

// @route   GET /api/payments/reports/monthly
router.get('/reports/monthly', getMonthlyReport);

// @route   GET /api/payments/reports/yearly
router.get('/reports/yearly', getYearlyReport);

// @route   GET /api/payments
router.get('/', getPayments);

// @route   GET /api/payments/:id
router.get('/:id', getPayment);

// @route   POST /api/payments
router.post('/', createPayment);

// @route   PUT /api/payments/:id
router.put('/:id', updatePayment);

// @route   DELETE /api/payments/:id
router.delete('/:id', deletePayment);

// @route   POST /api/payments/:id/record
router.post('/:id/record', recordPayment);

module.exports = router;