const express = require('express');
const router = express.Router();
const {
  getDailyRecords,
  markAttendance,
  getTodayStats,
  createDailyTracking
} = require('../controllers/dailyTrackingController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// All routes require authentication and admin access
router.use(authenticateToken, requireAdmin);

// Routes
router.route('/')
  .get(getDailyRecords)
  .post(createDailyTracking);

router.post('/attendance', markAttendance);
router.get('/stats/today', getTodayStats);

module.exports = router;