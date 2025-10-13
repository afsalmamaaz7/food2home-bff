const express = require('express');
const router = express.Router();
const {
  getSubscriptions,
  getCustomerSubscriptions,
  createSubscription,
  updateSubscription,
  cancelSubscription,
  calculateSubscriptionPricing,
  getSubscriptionStats,
  autoExtendSubscriptions,
  getEligibleForAutoExtension,
  generatePaymentsForExistingSubscriptions
} = require('../controllers/subscriptionController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// All routes require authentication and admin access
router.use(authenticateToken, requireAdmin);

// Routes - Order matters! Specific routes MUST come before parameterized routes
router.get('/stats', getSubscriptionStats);
router.post('/calculate-pricing', calculateSubscriptionPricing);
router.post('/auto-extend', autoExtendSubscriptions);
router.get('/auto-extend/eligible', getEligibleForAutoExtension);
router.post('/generate-payments', generatePaymentsForExistingSubscriptions);
router.post('/generate-payments', generatePaymentsForExistingSubscriptions);

router.get('/customer/:customerId', getCustomerSubscriptions);

router.route('/')
  .get(getSubscriptions)
  .post(createSubscription);

router.route('/:id')
  .put(updateSubscription)
  .delete(cancelSubscription);

module.exports = router;