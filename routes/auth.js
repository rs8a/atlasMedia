const express = require('express');
const router = express.Router();
const authController = require('../controllers/AuthController');
const { authenticate } = require('../middleware/auth');

// Rutas públicas
router.post('/login', authController.login.bind(authController));
router.post('/register', authController.register.bind(authController));

// Rutas protegidas (requieren autenticación)
router.get('/profile', authenticate, authController.getProfile.bind(authController));
router.post('/change-password', authenticate, authController.changePassword.bind(authController));

// Rutas de administración de usuarios
router.get('/users', authenticate, authController.listUsers.bind(authController));
router.get('/users/:id', authenticate, authController.getUser.bind(authController));
router.delete('/users/:id', authenticate, authController.deleteUser.bind(authController));

module.exports = router;

