const express = require('express');
const router = express.Router();
const { getLoginLogs, getLoginLog } = require('../controllers/loginLogController');
const { authenticate } = require('../middleware/auth');
const checkPermission = require('../middleware/checkPermission');

// Both endpoints require authentication + permission
router.get('/',   authenticate, checkPermission('view_login_logs'), getLoginLogs);
router.get('/:id', authenticate, checkPermission('view_login_logs'), getLoginLog);

module.exports = router;
