const express = require('express');
const router = express.Router();
const { getReminderDashboard, getSummary } = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/auth');
const checkPermission = require('../middleware/checkPermission');

router.use(authenticate);

// GET /api/dashboard/summary     — top-level document + reminder counts
router.get('/summary', checkPermission('dashboard_summary'), getSummary);

// GET /api/dashboard/reminders   — filterable reminder data with breakdowns
router.get('/reminders', checkPermission('dashboard_reminders'), getReminderDashboard);

module.exports = router;
