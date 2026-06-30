const { getFirebaseApp, getMessaging } = require('../config/firebase');
const db = require('../config/database');

/**
 * Send a single FCM push notification to one device token.
 * Returns { success, messageId } or throws on hard failure.
 */
async function sendPushNotification({ token, title, body, data = {} }) {
  const app = getFirebaseApp();
  if (!app) {
    console.warn('[FCM] Firebase not configured — skipping push notification');
    return { success: false, reason: 'firebase_not_configured' };
  }

  const message = {
    token,
    notification: { title, body },
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    ),
    android: {
      priority: 'high',
      notification: { sound: 'default', channelId: 'document_reminders' },
    },
    apns: {
      payload: { aps: { sound: 'default', badge: 1 } },
    },
  };

  const messageId = await getMessaging(app).send(message);
  return { success: true, messageId };
}

/**
 * Send FCM push to multiple tokens in one batch (max 500 per FCM limit).
 */
async function sendMulticastPushNotification({ tokens, title, body, data = {} }) {
  const app = getFirebaseApp();
  if (!app || !tokens || tokens.length === 0) return { successCount: 0, failureCount: 0 };

  const message = {
    tokens,
    notification: { title, body },
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    ),
    android: {
      priority: 'high',
      notification: { sound: 'default', channelId: 'document_reminders' },
    },
    apns: {
      payload: { aps: { sound: 'default', badge: 1 } },
    },
  };

  const response = await getMessaging(app).sendEachForMulticast(message);
  return {
    successCount: response.successCount,
    failureCount: response.failureCount,
    responses: response.responses,
  };
}

// ─── Route handlers ───────────────────────────────────────────────────────────

/**
 * POST /api/fcm/token
 * Authenticated users call this to register or update their FCM device token.
 * Body: { fcm_token: "device_token_string" }
 */
const registerFcmToken = async (req, res) => {
  try {
    const { fcm_token } = req.body;

    if (!fcm_token || typeof fcm_token !== 'string' || fcm_token.trim() === '') {
      return res.status(400).json({ success: false, message: 'fcm_token is required' });
    }

    await db.execute(
      'UPDATE users SET fcm_token = ? WHERE id = ?',
      [fcm_token.trim(), req.user.id]
    );

    res.json({ success: true, message: 'FCM token registered successfully' });
  } catch (error) {
    console.error('Register FCM token error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * DELETE /api/fcm/token
 * Clears the FCM token for the authenticated user (e.g. on logout).
 */
const removeFcmToken = async (req, res) => {
  try {
    await db.execute(
      'UPDATE users SET fcm_token = NULL WHERE id = ?',
      [req.user.id]
    );
    res.json({ success: true, message: 'FCM token removed successfully' });
  } catch (error) {
    console.error('Remove FCM token error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * POST /api/fcm/test  (admin only)
 * Sends a test push to the authenticated admin's own device.
 */
const testPushNotification = async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT fcm_token FROM users WHERE id = ?',
      [req.user.id]
    );

    const token = rows[0]?.fcm_token;
    if (!token) {
      return res.status(400).json({ success: false, message: 'No FCM token registered for your account' });
    }

    const result = await sendPushNotification({
      token,
      title: '🔔 Test Notification',
      body: 'Firebase push notifications are working!',
      data: { type: 'test' },
    });

    res.json({ success: true, message: 'Test notification sent', data: result });
  } catch (error) {
    console.error('Test push error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to send test notification' });
  }
};

module.exports = {
  sendPushNotification,
  sendMulticastPushNotification,
  registerFcmToken,
  removeFcmToken,
  testPushNotification,
};
