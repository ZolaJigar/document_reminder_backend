const cron = require('node-cron');
const db = require('../config/database');
const { sendNotifications } = require('./notificationController');
const moment = require('moment-timezone');

// Timezone to use for all reminder comparisons.
// Set TZ in your .env to match the timezone used when creating reminders (e.g. Asia/Kolkata).
const APP_TIMEZONE = process.env.TZ || 'Asia/Kolkata';

// Run every minute to check for pending reminders
function startCronJobs() {
  // Check reminders every minute
  cron.schedule('* * * * *', async () => {
    const now = moment().tz(APP_TIMEZONE);
    const currentDate = now.format('YYYY-MM-DD');
    const currentTime = now.format('HH:mm:ss'); // full HH:mm:ss for TIME column comparison

    console.log(`[CRON] Checking reminders at ${currentDate} ${currentTime} (${APP_TIMEZONE})`);

    try {
      // Find all pending reminders that should fire today (including pre-day reminders).
      // A reminder with remind_before_days = N fires on:
      //   reminder_date - N, reminder_date - (N-1), ..., reminder_date
      // So today qualifies when: reminder_date - remind_before_days <= today <= reminder_date
      // remind_before_days defaults to 0 via COALESCE so NULL rows are handled correctly.
      const [reminders] = await db.execute(
        `SELECT r.*, d.title AS document_title, d.expiry_date, d.renewal_cost
         FROM reminders r
         JOIN documents d ON d.id = r.document_id
         WHERE r.status = 'pending'
           AND r.reminder_date >= ?
           AND DATE_SUB(r.reminder_date, INTERVAL COALESCE(r.remind_before_days, 0) DAY) <= ?
           AND r.reminder_time <= ?`,
        [currentDate, currentDate, currentTime]
      );

      if (reminders.length === 0) return;

      console.log(`[CRON] Found ${reminders.length} reminder(s) to send`);

      for (const reminder of reminders) {
        try {
          // reminder_recipients has no user_id — fetch FCM token separately via the reminder's owner
          const [recipients] = await db.execute(
            `SELECT rr.* FROM reminder_recipients rr WHERE rr.reminder_id = ?`,
            [reminder.id]
          );

          // Attach the document owner's FCM token so push notifications reach their device
          const [ownerRows] = await db.execute(
            `SELECT fcm_token, email FROM users WHERE id = ?`,
            [reminder.user_id]
          );
          const ownerFcmToken = ownerRows[0]?.fcm_token || null;
          console.log(`[CRON] Owner FCM token for user ${reminder.user_id}: ${ownerFcmToken ? ownerFcmToken.slice(0, 30) + '...' : 'NOT SET'}`);
          // Attach token to the first recipient that has a matching email, or add a synthetic entry
          if (ownerFcmToken) {
            const ownerEmail = ownerRows[0]?.email;
            const ownerRecipientIdx = ownerEmail
              ? recipients.findIndex(r => r.email === ownerEmail)
              : -1;
            if (ownerRecipientIdx >= 0) {
              recipients[ownerRecipientIdx].fcm_token = ownerFcmToken;
            } else {
              // Add a push-only synthetic recipient for the owner
              recipients.push({ fcm_token: ownerFcmToken, notify_email: false, notify_whatsapp: false });
            }
          }

          // Calculate which send number this is (1st, 2nd, 3rd…)
          // Use date-only diff to avoid time-of-day affecting the day count.
          const totalDays   = reminder.remind_before_days || 0;
          const reminderDay = moment.tz(reminder.reminder_date, APP_TIMEZONE).startOf('day');
          const today       = now.clone().startOf('day');
          const daysUntil   = reminderDay.diff(today, 'days'); // 0 on the actual reminder date
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
