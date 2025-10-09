const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// All routes require authentication and admin access
router.use(authenticateToken, requireAdmin);

router.get('/', (req, res) => {
  res.json({ 
    message: 'Legacy tracking endpoint',
    success: true,
    data: []
  });
});

router.get('/stats', (req, res) => {
  res.json({ 
    success: true,
    data: {
      totalRecords: 0,
      totalAmount: 0,
      paidRecords: 0,
      pendingRecords: 0
    }
  });
});

module.exports = router;