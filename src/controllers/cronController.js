const cron = require('node-cron');
const db = require('../config/database');
const { sendNotifications } = require('./notificationController');
const moment = require('moment');

// Run every minute to check for pending reminders
function startCronJobs() {
  // Check reminders every minute
  cron.schedule('* * * * *', async () => {
    const now = moment().utc();
    const currentDate = now.format('YYYY-MM-DD');
    const currentTime = now.format('HH:mm');

    console.log(`[CRON] Checking reminders at ${currentDate} ${currentTime}`);

    try {
      // Find all pending reminders due now
      const [reminders] = await db.execute(
        `SELECT r.*, d.title AS document_title, d.expiry_date
         FROM reminders r
         JOIN documents d ON d.id = r.document_id
         WHERE r.status = 'pending'
           AND r.reminder_date = ?
           AND r.reminder_time <= ?`,
        [currentDate, currentTime + ':59']
      );

      if (reminders.length === 0) return;

      console.log(`[CRON] Found ${reminders.length} reminder(s) to send`);

      for (const reminder of reminders) {
        try {
          const [recipients] = await db.execute(
            'SELECT * FROM reminder_recipients WHERE reminder_id = ?',
            [reminder.id]
          );

          await sendNotifications(reminder, recipients);

          // Mark as sent
          await db.execute(
            "UPDATE reminders SET status = 'sent', sent_at = NOW() WHERE id = ?",
            [reminder.id]
          );

          console.log(`[CRON] Reminder ${reminder.id} sent successfully`);
        } catch (err) {
          console.error(`[CRON] Failed to send reminder ${reminder.id}:`, err.message);
          await db.execute(
            "UPDATE reminders SET status = 'failed' WHERE id = ?",
            [reminder.id]
          );
        }
      }
    } catch (err) {
      console.error('[CRON] Error in reminder check:', err.message);
    }
  });

  // Daily job to update document statuses (runs at midnight)
  cron.schedule('0 0 * * *', async () => {
    console.log('[CRON] Updating document statuses...');
    try {
      await db.execute(`
        UPDATE documents SET status = 'expired'
        WHERE expiry_date < CURDATE() AND status != 'expired'
      `);
      await db.execute(`
        UPDATE documents SET status = 'expiring_soon'
        WHERE expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) AND status = 'active'
      `);
      console.log('[CRON] Document statuses updated');
    } catch (err) {
      console.error('[CRON] Status update error:', err.message);
    }
  });

  console.log('✅ Cron jobs started');
}

module.exports = { startCronJobs };
