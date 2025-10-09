const express = require('express');
const { getUsers, createUser, updateUser, deleteUser, getUserById } = require('../controllers/userController');
const { authenticateToken, requireSuperAdmin, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// @route   GET /api/users
router.get('/', requireAdmin, getUsers);

// @route   POST /api/users
router.post('/', requireSuperAdmin, createUser);

// @route   GET /api/users/:id
router.get('/:id', requireAdmin, getUserById);

// @route   PUT /api/users/:id
router.put('/:id', requireSuperAdmin, updateUser);

// @route   DELETE /api/users/:id
router.delete('/:id', requireSuperAdmin, deleteUser);

module.exports = router;