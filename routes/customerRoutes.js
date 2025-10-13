const express = require('express');
const { 
  getCustomers, 
  getCustomerById, 
  createCustomer, 
  updateCustomer, 
  deleteCustomer,
  getCustomerStats,
  getFilterOptions
} = require('../controllers/customerController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// All routes require authentication and admin access
router.use(authenticateToken, requireAdmin);

// @route   GET /api/customers/dashboard/stats
router.get('/dashboard/stats', getCustomerStats);

// @route   GET /api/customers/filter-options
router.get('/filter-options', getFilterOptions);

// @route   GET /api/customers
router.get('/', getCustomers);

// @route   POST /api/customers
router.post('/', createCustomer);

// @route   GET /api/customers/:id
router.get('/:id', getCustomerById);

// @route   PUT /api/customers/:id
router.put('/:id', updateCustomer);

// @route   DELETE /api/customers/:id
router.delete('/:id', deleteCustomer);

module.exports = router;