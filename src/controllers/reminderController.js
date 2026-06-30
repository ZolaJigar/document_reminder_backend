const db = require('../config/database');

// ── Helper: resolve recipients array ─────────────────────────────────────────
// Each recipient can be either:
//   { user_id: 3, notify_email: true, notify_whatsapp: false }   ← picked from user list
//   { email: 'a@b.com', phone: '9999', name: 'X', notify_email: true, notify_whatsapp: false } ← manual
// Returns enriched array ready for DB insert.
async function resolveRecipients(conn, recipients) {
  const resolved = [];
  for (const r of recipients) {
    if (r.user_id) {
      // Look up the user's details from the users table
      const [[user]] = await conn.execute(
        'SELECT id, name, email, phone FROM users WHERE id = ? AND is_active = 1',
        [r.user_id]
      );
      if (!user) continue; // skip invalid / inactive user ids
      resolved.push({
        user_id:          user.id,
        name:             user.name,
        email:            user.email,
        phone:            user.phone || null,
        notify_email:     r.notify_email     !== undefined ? r.notify_email     : true,
        notify_whatsapp:  r.notify_whatsapp  !== undefined ? r.notify_whatsapp  : false,
      });
    } else if (r.email || r.phone) {
      // Manual entry — keep as-is
      resolved.push({
        user_id:         null,
        name:            r.name  || null,
        email:           r.email || null,
        phone:           r.phone || null,
        notify_email:    r.notify_email    !== undefined ? r.notify_email    : true,
        notify_whatsapp: r.notify_whatsapp !== undefined ? r.notify_whatsapp : false,
      });
    }
  }
  return resolved;
}

// Get all reminders for user
const getReminders = async (req, res) => {
  try {
    const { document_id, status } = req.query;

    let query = `
      SELECT r.*, d.title AS document_title, d.expiry_date, d.renewal_cost,
        JSON_ARRAYAGG(
          JSON_OBJECT('id', rr.id, 'user_id', rr.user_id, 'email', rr.email, 'phone', rr.phone, 'name', rr.name,
            'notify_email', rr.notify_email, 'notify_whatsapp', rr.notify_whatsapp)
        ) AS recipients
      FROM reminders r
      JOIN documents d ON d.id = r.document_id
      LEFT JOIN reminder_recipients rr ON rr.reminder_id = r.id
      WHERE r.user_id = ?
    `;
    const params = [req.user.id];

    if (document_id) { query += ' AND r.document_id = ?'; params.push(document_id); }
    if (status) { query += ' AND r.status = ?'; params.push(status); }

    query += ' GROUP BY r.id ORDER BY r.reminder_date, r.reminder_time';

    const [reminders] = await db.execute(query, params);

    // Parse JSON recipients safely
    const parsed = reminders.map(r => ({
      ...r,
      recipients: safeParseRecipients(r.recipients),
    }));

    res.json({ success: true, data: parsed });
  } catch (error) {
    console.error('Get reminders error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

function safeParseRecipients(raw) {
  try {
    if (!raw) return [];
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return arr.filter(r => r && r.id !== null);
  } catch { return []; }
}

// Get single reminder
const getReminder = async (req, res) => {
  try {
    const [reminders] = await db.execute(
      'SELECT r.*, d.title AS document_title, d.expiry_date, d.renewal_cost FROM reminders r JOIN documents d ON d.id = r.document_id WHERE r.id = ? AND r.user_id = ?',
      [req.params.id, req.user.id]
    );

    if (reminders.length === 0) {
      return res.status(404).json({ success: false, message: 'Reminder not found' });
    }

    const [recipients] = await db.execute(
      'SELECT * FROM reminder_recipients WHERE reminder_id = ?',
      [req.params.id]
    );

    res.json({ success: true, data: { ...reminders[0], recipients } });
  } catch (error) {
    console.error('Get reminder error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Create reminder
const createReminder = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const {
      document_id, reminder_date, reminder_time, message,
      remind_before_days,
      notify_email, notify_whatsapp, recipients,
    } = req.body;

    if (!document_id || !reminder_date || !reminder_time) {
      return res.status(400).json({ success: false, message: 'document_id, reminder_date, and reminder_time are required' });
    }

    // remind_before_days must be a non-negative integer
    const beforeDays = parseInt(remind_before_days) || 0;
    if (beforeDays < 0) {
      return res.status(400).json({ success: false, message: 'remind_before_days must be 0 or a positive number' });
    }

    // Verify document belongs to user
    const [docs] = await conn.execute(
      'SELECT id FROM documents WHERE id = ? AND user_id = ?',
      [document_id, req.user.id]
    );
    if (docs.length === 0) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const [result] = await conn.execute(
      `INSERT INTO reminders (document_id, user_id, reminder_date, reminder_time, message, remind_before_days, notify_email, notify_whatsapp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [document_id, req.user.id, reminder_date, reminder_time, message || null,
       beforeDays,
       notify_email !== undefined ? notify_email : true,
       notify_whatsapp !== undefined ? notify_whatsapp : false]
    );

    const reminderId = result.insertId;

    // Insert recipients — supports user_id (system user) or manual email/phone
    if (recipients && Array.isArray(recipients) && recipients.length > 0) {
      const resolved = await resolveRecipients(conn, recipients);
      for (const r of resolved) {
        await conn.execute(
          'INSERT INTO reminder_recipients (reminder_id, user_id, email, phone, name, notify_email, notify_whatsapp) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [reminderId, r.user_id, r.email, r.phone, r.name,
           r.notify_email, r.notify_whatsapp]
        );
      }
    }

    await conn.commit();

    res.status(201).json({
      success: true,
      message: 'Reminder created successfully',
      data: { id: reminderId },
    });
  } catch (error) {
    await conn.rollback();
    console.error('Create reminder error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    conn.release();
  }
};

// Update reminder
const updateReminder = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await conn.execute(
      'SELECT id FROM reminders WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Reminder not found' });
    }

    const { reminder_date, reminder_time, message, remind_before_days, notify_email, notify_whatsapp, recipients } = req.body;

    // Validate remind_before_days if provided
    let beforeDays = undefined;
    if (remind_before_days !== undefined) {
      beforeDays = parseInt(remind_before_days) || 0;
      if (beforeDays < 0) {
        return res.status(400).json({ success: false, message: 'remind_before_days must be 0 or a positive number' });
      }
    }

    await conn.execute(
      `UPDATE reminders
       SET reminder_date      = COALESCE(?, reminder_date),
           reminder_time      = COALESCE(?, reminder_time),
           message            = ?,
           remind_before_days = COALESCE(?, remind_before_days),
           notify_email       = COALESCE(?, notify_email),
           notify_whatsapp    = COALESCE(?, notify_whatsapp),
           status             = 'pending'
       WHERE id = ? AND user_id = ?`,
      [reminder_date, reminder_time, message || null, beforeDays !== undefined ? beforeDays : null,
       notify_email, notify_whatsapp, req.params.id, req.user.id]
    );

    // Replace recipients — supports user_id (system user) or manual email/phone
    if (recipients && Array.isArray(recipients)) {
      await conn.execute('DELETE FROM reminder_recipients WHERE reminder_id = ?', [req.params.id]);
      const resolved = await resolveRecipients(conn, recipients);
      for (const r of resolved) {
        await conn.execute(
          'INSERT INTO reminder_recipients (reminder_id, user_id, email, phone, name, notify_email, notify_whatsapp) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [req.params.id, r.user_id, r.email, r.phone, r.name,
           r.notify_email, r.notify_whatsapp]
        );
      }
    }

    await conn.commit();
    res.json({ success: true, message: 'Reminder updated successfully' });
  } catch (error) {
    await conn.rollback();
    console.error('Update reminder error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    conn.release();
  }
};

// Delete reminder
const deleteReminder = async (req, res) => {
  try {
    const [result] = await db.execute(
      'DELETE FROM reminders WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Reminder not found' });
    }

    res.json({ success: true, message: 'Reminder deleted successfully' });
  } catch (error) {
    console.error('Delete reminder error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Send reminder manually (test)
const sendReminderNow = async (req, res) => {
  try {
    const [reminders] = await db.execute(
      'SELECT r.*, d.title AS document_title, d.expiry_date, d.renewal_cost FROM reminders r JOIN documents d ON d.id = r.document_id WHERE r.id = ? AND r.user_id = ?',
      [req.params.id, req.user.id]
    );

    if (reminders.length === 0) {
      return res.status(404).json({ success: false, message: 'Reminder not found' });
    }

    const reminder = reminders[0];

    const [recipients] = await db.execute(
      'SELECT * FROM reminder_recipients WHERE reminder_id = ?',
      [req.params.id]
    );

    // Attach FCM token from the document owner
    const [ownerRows] = await db.execute(
      'SELECT fcm_token, email FROM users WHERE id = ?',
      [reminder.user_id]
    );
    const ownerFcmToken = ownerRows[0]?.fcm_token || null;
    if (ownerFcmToken) {
      const ownerEmail = ownerRows[0]?.email;
      const idx = ownerEmail ? recipients.findIndex(r => r.email === ownerEmail) : -1;
      if (idx >= 0) {
        recipients[idx].fcm_token = ownerFcmToken;
      } else {
        recipients.push({ fcm_token: ownerFcmToken, notify_email: false, notify_whatsapp: false });
      }
    }

    const { sendNotifications } = require('./notificationController');
    const results = await sendNotifications(reminder, recipients);

    res.json({ success: true, message: 'Reminder sent', data: results });
  } catch (error) {
    console.error('Send reminder error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Reset reminder status back to pending (useful after a failed send)
const resetReminder = async (req, res) => {
  try {
    const [result] = await db.execute(
      "UPDATE reminders SET status = 'pending', sent_at = NULL WHERE id = ? AND user_id = ?",
      [req.params.id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Reminder not found' });
    }

    res.json({ success: true, message: 'Reminder reset to pending' });
  } catch (error) {
    console.error('Reset reminder error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { getReminders, getReminder, createReminder, updateReminder, deleteReminder, sendReminderNow, resetReminder };
