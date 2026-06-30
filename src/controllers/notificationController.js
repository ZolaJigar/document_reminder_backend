const nodemailer = require('nodemailer');
const db = require('../config/database');
const { sendPushNotification } = require('./fcmController');
require('dotenv').config();

// Email transporter — use port 465 (SSL) by default for Gmail; more reliable than 587 (STARTTLS)
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT) || 465;
const EMAIL_SECURE = EMAIL_PORT === 465; // true for 465, false for 587

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: EMAIL_PORT,
  secure: EMAIL_SECURE,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: { rejectUnauthorized: false },
  // Connection pool — reuse connections instead of opening a new one per email
  pool: true,
  maxConnections: 3,
  maxMessages: 50,
  // Timeouts to avoid hanging on ECONNRESET
  connectionTimeout: 10000,  // 10s to establish connection
  greetingTimeout: 10000,    // 10s for server greeting
  socketTimeout: 15000,      // 15s idle socket timeout
});

// Send email with one retry on transient network errors
async function sendEmail(to, subject, htmlBody, textBody) {
  const mailOptions = {
    from: process.env.EMAIL_FROM || `Document Reminder <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html: htmlBody,
    text: textBody || subject, // plain text fallback improves deliverability
  };

  const attempt = async () => transporter.sendMail(mailOptions);

  try {
    return await attempt();
  } catch (err) {
    // Retry once on transient errors (ECONNRESET, ETIMEDOUT, ECONNREFUSED)
    const transient = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ESOCKET'];
    if (transient.some(code => err.code === code || err.message.includes(code))) {
      console.warn(`[Email] Transient error (${err.code || err.message}), retrying in 3s…`);
      await new Promise(r => setTimeout(r, 3000));
      return await attempt();
    }
    throw err;
  }
}

// Send WhatsApp via Twilio
async function sendWhatsApp(to, message) {
  const twilio = require('twilio');
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  // Ensure number is in E.164 format
  const formattedTo = to.startsWith('+') ? to : `+${to}`;

  await client.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886',
    to: `whatsapp:${formattedTo}`,
    body: message,
  });
}

// Format a date value (Date object or "YYYY-MM-DD" string) → "29 Jun 2026"
// MySQL DATE columns come back as JS Date objects at UTC midnight — extract parts directly
// to avoid timezone shift (e.g. UTC midnight = June 28 in IST)
function formatDate(val) {
  if (!val) return '—';
  if (val instanceof Date) {
    // Use UTC getters so UTC midnight "2026-06-29T00:00:00Z" stays as June 29
    const dd = String(val.getUTCDate()).padStart(2, '0');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const mon = months[val.getUTCMonth()];
    const yyyy = val.getUTCFullYear();
    return `${dd} ${mon} ${yyyy}`;
  }
  // String like "2026-06-29" or "2026-06-29T00:00:00.000Z"
  const str = String(val).substring(0, 10); // take "YYYY-MM-DD"
  const parts = str.split('-');
  if (parts.length !== 3) return val;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mon = months[parseInt(parts[1], 10) - 1] || parts[1];
  return `${parts[2]} ${mon} ${parts[0]}`;
}

// Format a time value (string like "14:30:00" or "14:30") → "02:30 PM"
function formatTime(val) {
  if (!val) return '—';
  // Handle "HH:mm:ss" or "HH:mm" strings
  const match = String(val).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return String(val);
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
}

// Build email HTML template
function buildEmailHtml(reminder, documentTitle, recipientName) {
  const reminderDateFormatted = formatDate(reminder.reminder_date);
  const reminderTimeFormatted = formatTime(reminder.reminder_time);
  const expiryDateFormatted   = reminder.expiry_date ? formatDate(reminder.expiry_date) : null;
  const renewalCost           = reminder.renewal_cost != null
    ? `₹${parseFloat(reminder.renewal_cost).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
    : null;
  const logoUrl               = (process.env.LOGO_URL || '').trim();
  const isRealLogo            = logoUrl && !logoUrl.includes('yourdomain.com');
  const greeting              = recipientName ? `Hello, ${recipientName}!` : 'Hello!';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document Reminder</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0f4f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.10);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1565C0 0%,#1976D2 60%,#42A5F5 100%);padding:32px 28px;text-align:center;">
              ${isRealLogo
                ? `<img src="${logoUrl}" alt="Logo" style="max-height:60px;max-width:200px;margin-bottom:14px;display:block;margin-left:auto;margin-right:auto;" />`
                : `<div style="display:inline-block;background:rgba(255,255,255,0.18);border-radius:12px;padding:8px 22px;margin-bottom:14px;">
                     <span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:2px;font-family:Arial,sans-serif;">📄 DocReminder</span>
                   </div>`
              }
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">Document Reminder</h1>
              <p style="margin:6px 0 0;color:#BBDEFB;font-size:13px;">Automated notification from Document Reminder App</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 32px;">

              <p style="margin:0 0 8px;color:#424242;font-size:15px;font-weight:600;">${greeting}</p>
              <p style="margin:0 0 20px;color:#424242;font-size:15px;">This is a reminder for the following document:</p>

              <!-- Document Title Card -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#E3F2FD;border-left:4px solid #1976D2;border-radius:4px;margin-bottom:24px;">
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#1976D2;font-weight:700;">Document</p>
                    <p style="margin:4px 0 0;font-size:18px;font-weight:700;color:#0D47A1;">${documentTitle}</p>
                  </td>
                </tr>
              </table>

              <!-- Info Grid: Date + Time -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
                <tr>
                  <!-- Reminder Date -->
                  <td width="48%" style="padding:0 8px 0 0;vertical-align:top;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F5F5;border-radius:8px;">
                      <tr>
                        <td style="padding:14px 16px;">
                          <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#757575;font-weight:700;">📅 Reminder Date</p>
                          <p style="margin:6px 0 0;font-size:16px;font-weight:700;color:#212121;">${reminderDateFormatted}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <!-- Reminder Time -->
                  <td width="48%" style="padding:0 0 0 8px;vertical-align:top;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F5F5;border-radius:8px;">
                      <tr>
                        <td style="padding:14px 16px;">
                          <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#757575;font-weight:700;">🕐 Reminder Time</p>
                          <p style="margin:6px 0 0;font-size:16px;font-weight:700;color:#212121;">${reminderTimeFormatted}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              ${expiryDateFormatted ? `
              <!-- Expiry Date Warning -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFF8E1;border:1px solid #FFE082;border-radius:8px;margin-bottom:16px;">
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#F57F17;font-weight:700;">⚠️ Expiry Date</p>
                    <p style="margin:6px 0 0;font-size:16px;font-weight:700;color:#E65100;">${expiryDateFormatted}</p>
                    <p style="margin:4px 0 0;font-size:12px;color:#BF360C;">Please renew or take action before this date.</p>
                  </td>
                </tr>
              </table>` : ''}

              ${renewalCost ? `
              <!-- Renewal Cost -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#E8F5E9;border:1px solid #A5D6A7;border-radius:8px;margin-bottom:16px;">
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#2E7D32;font-weight:700;">💰 Renewal Cost</p>
                    <p style="margin:6px 0 0;font-size:20px;font-weight:800;color:#1B5E20;">${renewalCost}</p>
                    <p style="margin:4px 0 0;font-size:12px;color:#388E3C;">Estimated cost to renew this document.</p>
                  </td>
                </tr>
              </table>` : ''}

              ${reminder.message ? `
              <!-- Note / Message -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F3E5F5;border-left:4px solid #9C27B0;border-radius:4px;margin-bottom:16px;">
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#6A1B9A;font-weight:700;">💬 Note</p>
                    <p style="margin:6px 0 0;font-size:14px;color:#4A148C;line-height:1.6;">${reminder.message}</p>
                  </td>
                </tr>
              </table>` : ''}

              <p style="margin:20px 0 0;color:#9E9E9E;font-size:12px;line-height:1.6;">
                Please take the necessary action before the document expires. This is an automated message — do not reply to this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#F5F5F5;padding:16px 32px;text-align:center;border-top:1px solid #E0E0E0;">
              <p style="margin:0;font-size:12px;color:#9E9E9E;">
                &copy; ${new Date().getFullYear()} Document Reminder App &bull; Automated Notification
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Core function to send notifications for a reminder
async function sendNotifications(reminder, recipients) {
  const results = { email: [], whatsapp: [] };

  // Deduplicate recipients by email and phone to avoid sending twice
  console.log(`[Notify] Raw recipients for reminder ${reminder.id}:`, JSON.stringify(recipients.map(r => ({
    email: r.email, notify_email: r.notify_email, phone: r.phone, notify_whatsapp: r.notify_whatsapp, has_fcm: !!r.fcm_token
  }))));
  const seenEmails = new Set();
  const seenPhones = new Set();
  recipients = recipients.filter(r => {
    if (r.notify_email && r.email) {
      if (seenEmails.has(r.email)) return false;
      seenEmails.add(r.email);
    }
    if (r.notify_whatsapp && r.phone) {
      if (seenPhones.has(r.phone)) return false;
      seenPhones.add(r.phone);
    }
    return true;
  });

  const subject = `🔔 Reminder: ${reminder.document_title}`;

  for (const recipient of recipients) {
    const recipientName = recipient.name || null;

    // Build per-recipient email bodies so greeting is personalised
    const htmlBody = buildEmailHtml(reminder, reminder.document_title, recipientName);
    const greeting = recipientName ? `Hello ${recipientName},` : 'Hello,';
    const textBody = [
      `Document Reminder`,
      ``,
      greeting,
      ``,
      `Document: ${reminder.document_title}`,
      `Reminder Date: ${formatDate(reminder.reminder_date)}`,
      `Reminder Time: ${formatTime(reminder.reminder_time)}`,
      reminder.expiry_date ? `Expiry Date: ${formatDate(reminder.expiry_date)}` : null,
      reminder.renewal_cost != null ? `Renewal Cost: Rs. ${parseFloat(reminder.renewal_cost).toFixed(2)}` : null,
      reminder.message ? `\nNote: ${reminder.message}` : null,
      ``,
      `Please take the necessary action before the document expires.`,
      `This is an automated message from Document Reminder App.`,
    ].filter(Boolean).join('\n');
    const whatsappGreeting = recipientName ? `Hello ${recipientName}! 👋\n\n` : '';
    const whatsappMessage = `📄 *Document Reminder*\n\n${whatsappGreeting}Document: *${reminder.document_title}*\nDate: ${reminder.reminder_date}\nTime: ${reminder.reminder_time}${reminder.expiry_date ? `\nExpiry: ${reminder.expiry_date}` : ''}${reminder.renewal_cost != null ? `\n💰 Renewal Cost: Rs. ${parseFloat(reminder.renewal_cost).toFixed(2)}` : ''}${reminder.message ? `\n\nNote: ${reminder.message}` : ''}`;

    // Email
    console.log(`[Notify] Checking email for recipient: notify_email=${recipient.notify_email}, email=${recipient.email}`);
    if (recipient.notify_email && recipient.email) {
      try {
        console.log(`[Email] Attempting to send to: ${recipient.email}`);
        const info = await sendEmail(recipient.email, subject, htmlBody, textBody);
        console.log(`[Email] Sent successfully to: ${recipient.email} | messageId: ${info.messageId} | response: ${info.response}`);
        results.email.push({ to: recipient.email, status: 'sent' });
        await db.execute(
          'INSERT INTO notification_logs (reminder_id, recipient_email, channel, status) VALUES (?, ?, ?, ?)',
          [reminder.id, recipient.email, 'email', 'sent']
        );
      } catch (err) {
        console.error('Email send error:', err.message);
        results.email.push({ to: recipient.email, status: 'failed', error: err.message });
        await db.execute(
          'INSERT INTO notification_logs (reminder_id, recipient_email, channel, status, error_message) VALUES (?, ?, ?, ?, ?)',
          [reminder.id, recipient.email, 'email', 'failed', err.message]
        ).catch(() => {});
      }
    }

    // WhatsApp
    if (recipient.notify_whatsapp && recipient.phone) {
      try {
        await sendWhatsApp(recipient.phone, whatsappMessage);
        results.whatsapp.push({ to: recipient.phone, status: 'sent' });
        await db.execute(
          'INSERT INTO notification_logs (reminder_id, recipient_phone, channel, status) VALUES (?, ?, ?, ?)',
          [reminder.id, recipient.phone, 'whatsapp', 'sent']
        );
      } catch (err) {
        console.error('WhatsApp send error:', err.message);
        results.whatsapp.push({ to: recipient.phone, status: 'failed', error: err.message });
        await db.execute(
          'INSERT INTO notification_logs (reminder_id, recipient_phone, channel, status, error_message) VALUES (?, ?, ?, ?, ?)',
          [reminder.id, recipient.phone, 'whatsapp', 'failed', err.message]
        ).catch(() => {});
      }
    }

    // FCM Push Notification
    if (recipient.fcm_token) {
      try {
        console.log(`[FCM] Sending push to token: ${recipient.fcm_token.slice(0, 30)}...`);
        const pushResult = await sendPushNotification({
          token: recipient.fcm_token,
          title: `🔔 Reminder: ${reminder.document_title}`,
          body: reminder.message
            ? reminder.message
            : `Your document "${reminder.document_title}" has a reminder on ${reminder.reminder_date}`,
          data: {
            type: 'reminder',
            reminder_id: String(reminder.id),
            document_title: reminder.document_title,
            reminder_date: reminder.reminder_date,
            ...(reminder.expiry_date ? { expiry_date: reminder.expiry_date } : {}),
          },
        });

        if (pushResult.success) {
          console.log(`[FCM] Push sent successfully. messageId: ${pushResult.messageId}`);
          results.push = results.push || [];
          results.push.push({ to: recipient.fcm_token.slice(0, 20) + '...', status: 'sent' });
          // 'push' is not in the notification_logs channel ENUM — skip DB log for push
        } else {
          console.warn(`[FCM] Push not sent — reason: ${pushResult.reason}`);
        }
      } catch (err) {
        console.error(`[FCM] Push error — code: ${err.code || 'N/A'}, message: ${err.message}`);
        results.push = results.push || [];
        results.push.push({ to: recipient.fcm_token.slice(0, 20) + '...', status: 'failed', error: err.message });
        // 'push' is not in the notification_logs channel ENUM — skip DB log for push
      }
    }
  }

  return results;
}

module.exports = { sendNotifications, sendEmail, sendWhatsApp };
