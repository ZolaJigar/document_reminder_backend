const nodemailer = require('nodemailer');
const db = require('../config/database');
require('dotenv').config();

// Email transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: { rejectUnauthorized: false },
});

// Send email notification
async function sendEmail(to, subject, htmlBody) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || `Document Reminder <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html: htmlBody,
  });
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

// Build email HTML template
function buildEmailHtml(reminder, documentTitle) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: #1976D2; color: white; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .body { padding: 28px; }
    .doc-title { font-size: 20px; font-weight: bold; color: #1976D2; margin-bottom: 10px; }
    .info-row { display: flex; margin: 8px 0; }
    .label { font-weight: bold; width: 140px; color: #555; }
    .value { color: #333; }
    .message-box { background: #E3F2FD; border-left: 4px solid #1976D2; padding: 12px; margin: 20px 0; border-radius: 4px; }
    .footer { background: #f8f8f8; padding: 16px; text-align: center; font-size: 12px; color: #999; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 13px; }
    .badge-warning { background: #FFF3E0; color: #E65100; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📄 Document Reminder</h1>
    </div>
    <div class="body">
      <p>This is a reminder for your document:</p>
      <div class="doc-title">${documentTitle}</div>
      
      <div class="info-row">
        <span class="label">Reminder Date:</span>
        <span class="value">${reminder.reminder_date}</span>
      </div>
      <div class="info-row">
        <span class="label">Reminder Time:</span>
        <span class="value">${reminder.reminder_time}</span>
      </div>
      ${reminder.expiry_date ? `<div class="info-row"><span class="label">Expiry Date:</span><span class="value"><span class="badge badge-warning">⚠️ ${reminder.expiry_date}</span></span></div>` : ''}
      
      ${reminder.message ? `<div class="message-box"><strong>Note:</strong><br>${reminder.message}</div>` : ''}
      
      <p style="color: #888; font-size: 13px;">Please take necessary action before the document expires.</p>
    </div>
    <div class="footer">
      Document Reminder App &bull; This is an automated notification
    </div>
  </div>
</body>
</html>`;
}

// Core function to send notifications for a reminder
async function sendNotifications(reminder, recipients) {
  const results = { email: [], whatsapp: [] };

  // Deduplicate recipients by email and phone to avoid sending twice
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
  const htmlBody = buildEmailHtml(reminder, reminder.document_title);
  const whatsappMessage = `📄 *Document Reminder*\n\nDocument: *${reminder.document_title}*\nDate: ${reminder.reminder_date}\nTime: ${reminder.reminder_time}${reminder.expiry_date ? `\nExpiry: ${reminder.expiry_date}` : ''}${reminder.message ? `\n\nNote: ${reminder.message}` : ''}`;

  for (const recipient of recipients) {
    // Email
    if (recipient.notify_email && recipient.email) {
      try {
        await sendEmail(recipient.email, subject, htmlBody);
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
  }

  return results;
}

module.exports = { sendNotifications, sendEmail, sendWhatsApp };
