const express = require('express');
const router = express.Router();
const {
  getMealPlans,
  getMealPlan,
  createMealPlan,
  updateMealPlan,
  deleteMealPlan,
  getMealPlanPricing,
  getMealPlanStats
} = require('../controllers/mealPlanController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// All routes require authentication and admin access
router.use(authenticateToken, requireAdmin);

// Routes - Order matters! Specific routes MUST come before parameterized routes
router.get('/stats', getMealPlanStats);
router.get('/pricing/:planId', getMealPlanPricing);

router.route('/')
  .get(getMealPlans)
  .post(createMealPlan);

router.route('/:id')
  .get(getMealPlan)
  .put(updateMealPlan)
  .delete(deleteMealPlan);

module.exports = router;