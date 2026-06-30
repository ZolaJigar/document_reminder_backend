const express = require('express');
const router = express.Router();
const { registerFcmToken, removeFcmToken, testPushNotification } = require('../controllers/fcmController');
const { authenticate, isAdmin } = require('../middleware/auth');

// All routes require a valid JWT
router.use(authenticate);

// Register / update FCM token for the current user
router.post('/token', registerFcmToken);           // POST   /api/fcm/token

// Remove FCM token (call on logout)
router.delete('/token', removeFcmToken);           // DELETE /api/fcm/token

// Send a test push to yourself (admin only)
router.post('/test', isAdmin, testPushNotification); // POST /api/fcm/test

module.exports = router;
