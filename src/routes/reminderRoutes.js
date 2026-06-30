const express = require('express');
const router = express.Router();
const {
  getReminders, getReminder, createReminder,
  updateReminder, deleteReminder, sendReminderNow, resetReminder,
} = require('../controllers/reminderController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/',            getReminders);
router.get('/:id',         getReminder);
router.post('/',           createReminder);
router.put('/:id',         updateReminder);
router.delete('/:id',      deleteReminder);
router.post('/:id/send-now', sendReminderNow);
router.post('/:id/reset',  resetReminder);

module.exports = router;
