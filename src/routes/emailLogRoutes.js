const express = require('express');
const router = express.Router();
const { getEmailLogs, getEmailLog, getEmailLogStats } = require('../controllers/emailLogController');
const { authenticate } = require('../middleware/auth');
const checkPermission = require('../middleware/checkPermission');

// Stats must be registered before /:id so the literal "stats" isn't matched as an id
router.get('/stats', authenticate, checkPermission('view_email_logs'), getEmailLogStats);
router.get('/',      authenticate, checkPermission('view_email_logs'), getEmailLogs);
router.get('/:id',   authenticate, checkPermission('view_email_logs'), getEmailLog);

module.exports = router;
