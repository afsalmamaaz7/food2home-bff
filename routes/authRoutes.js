const express = require('express');
const { login, getMe, updateProfile, changePassword } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// @route   POST /api/auth/login
router.post('/login', login);

// @route   GET /api/auth/me
router.get('/me', authenticateToken, getMe);

// @route   PUT /api/auth/profile
router.put('/profile', authenticateToken, updateProfile);

// @route   PUT /api/auth/change-password
router.put('/change-password', authenticateToken, changePassword);

module.exports = router;