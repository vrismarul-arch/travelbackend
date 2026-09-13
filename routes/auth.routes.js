// routes/auth.routes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { verifyToken } = require('../middleware/auth');

// Public routes
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/resend-otp', authController.resendOtp);

// Protected routes
router.get('/me', verifyToken, authController.getMe);

// Debug route
router.post('/debug-login-check', authController.debugLoginCheck);

module.exports = router;