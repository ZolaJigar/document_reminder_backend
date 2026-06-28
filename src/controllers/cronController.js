const cron = require('node-cron');
const db = require('../config/database');
const { sendNotifications } = require('./notificationController');
const moment = require('moment');

// Run every minute to check for pending reminders
function startCronJobs() {
  // Check reminders every minute
  cron.schedule('* * * * *', async () => {
    const now = moment();
    const currentDate = now.format('YYYY-MM-DD');
    const currentTime = now.format('HH:mm');

    console.log(`[CRON] Checking reminders at ${currentDate} ${currentTime}`);

    try {
      // Find all pending reminders that should fire today (including pre-day reminders).
      // A reminder with remind_before_days = N fires on:
      //   reminder_date - N, reminder_date - (N-1), ..., reminder_date
      // So today qualifies when: reminder_date - remind_before_days <= today <= reminder_date
      // i.e. reminder_date >= today AND DATE_SUB(reminder_date, INTERVAL remind_before_days DAY) <= today
      const [reminders] = await db.execute(
        `SELECT r.*, d.title AS document_title, d.expiry_date
         FROM reminders r
         JOIN documents d ON d.id = r.document_id
         WHERE r.status = 'pending'
           AND r.reminder_date >= ?
           AND DATE_SUB(r.reminder_date, INTERVAL r.remind_before_days DAY) <= ?
           AND r.reminder_time <= ?`,
        [currentDate, currentDate, currentTime + ':59']
      );

      if (reminders.length === 0) return;

      console.log(`[CRON] Found ${reminders.length} reminder(s) to send`);

      for (const reminder of reminders) {
        try {
          const [recipients] = await db.execute(
            'SELECT * FROM reminder_recipients WHERE reminder_id = ?',
            [reminder.id]
          );

          // Calculate which send number this is (1st, 2nd, 3rd…)
          const totalDays   = reminder.remind_before_days || 0;
          const daysUntil   = moment(reminder.reminder_date).diff(now, 'days');
          const sendNumber  = totalDays - daysUntil + 1; // 1-based
          const isLastSend  = daysUntil === 0;           // today is the actual reminder_date

          console.log(`[CRON] Reminder ${reminder.id} — send #${sendNumber} of ${totalDays + 1}, days until: ${daysUntil}`);

          await sendNotifications(reminder, recipients);

          // Only mark 'sent' on the final send (the actual reminder_date day).
          // On pre-days keep status 'pending' so it fires again on subsequent days.
          if (isLastSend) {
            await db.execute(
              "UPDATE reminders SET status = 'sent', sent_at = NOW() WHERE id = ?",
              [reminder.id]
            );
            console.log(`[CRON] Reminder ${reminder.id} final send — marked as sent`);
          } else {
            console.log(`[CRON] Reminder ${reminder.id} pre-day send — keeping pending for next day`);
          }
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
