const { initializeApp, getApps, getApp, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
require('dotenv').config();

let firebaseApp = null;

/**
 * Initialise Firebase Admin SDK (lazy singleton).
 * Supports two configuration styles:
 *   1. FIREBASE_SERVICE_ACCOUNT_JSON – a JSON string of the service-account key file
 *   2. Individual env vars: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 */
function getFirebaseApp() {
  if (firebaseApp) return firebaseApp;

  // Already initialised by another module
  if (getApps().length > 0) {
    firebaseApp = getApp();
    return firebaseApp;
  }

  let credential;

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    credential = cert(serviceAccount);
  } else if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    credential = cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    });
  } else {
    console.warn('[Firebase] No credentials found — push notifications are disabled.');
    return null;
  }

  firebaseApp = initializeApp({ credential });
  console.log('[Firebase] Admin SDK initialised');
  return firebaseApp;
}

module.exports = { getFirebaseApp, getMessaging };
