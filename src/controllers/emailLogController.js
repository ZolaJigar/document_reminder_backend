const db = require('../config/database');

/**
 * GET /api/email-logs
 *
 * Query params:
 *   reminder_id      – filter by specific reminder
 *   status           – 'sent' | 'failed'
 *   search           – partial match on recipient_email
 *   date_from        – ISO date string (inclusive)
 *   date_to          – ISO date string (inclusive, end of day)
 *   page             – default 1
 *   limit            – default 20, max 100
 */
const getEmailLogs = async (req, res) => {
  try {
    const { reminder_id, status, search, date_from, date_to } = req.query;

    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    let where    = "WHERE nl.channel = 'email'";
    const params = [];

    if (reminder_id) {
      where += ' AND nl.reminder_id = ?';
      params.push(reminder_id);
    }

    if (status && ['sent', 'failed'].includes(status)) {
      where += ' AND nl.status = ?';
      params.push(status);
    }

    if (search) {
      where += ' AND nl.recipient_email LIKE ?';
      params.push(`%${search}%`);
    }

    if (date_from) {
      where += ' AND nl.sent_at >= ?';
      params.push(`${date_from} 00:00:00`);
    }

    if (date_to) {
      where += ' AND nl.sent_at <= ?';
      params.push(`${date_to} 23:59:59`);
    }

    const baseQuery = `
      FROM notification_logs nl
      LEFT JOIN reminders r  ON r.id  = nl.reminder_id
      LEFT JOIN documents d  ON d.id  = r.document_id
      LEFT JOIN users u      ON u.id  = r.user_id
      ${where}
    `;

    // Total count
    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) AS total ${baseQuery}`,
      params
    );

    // Paginated rows
    const [rows] = await db.execute(
      `SELECT
         nl.id,
         nl.reminder_id,
         nl.recipient_email,
         nl.status,
         nl.error_message,
         nl.sent_at,
         r.reminder_date,
         r.reminder_time,
         d.id    AS document_id,
         d.title AS document_title,
         u.id    AS user_id,
         u.name  AS user_name,
         u.email AS user_email
       ${baseQuery}
       ORDER BY nl.sent_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    return res.json({
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get email logs error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * GET /api/email-logs/:id
 * Single email log entry detail.
 */
const getEmailLog = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT
         nl.id,
         nl.reminder_id,
         nl.recipient_email,
         nl.status,
         nl.error_message,
         nl.sent_at,
         r.reminder_date,
         r.reminder_time,
         r.message AS reminder_message,
         d.id      AS document_id,
         d.title   AS document_title,
         d.expiry_date,
         u.id      AS user_id,
         u.name    AS user_name,
         u.email   AS user_email
       FROM notification_logs nl
       LEFT JOIN reminders r ON r.id  = nl.reminder_id
       LEFT JOIN documents d ON d.id  = r.document_id
       LEFT JOIN users u     ON u.id  = r.user_id
       WHERE nl.id = ? AND nl.channel = 'email'`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Email log not found' });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Get email log error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * GET /api/email-logs/stats
 * Summary counts: total, sent, failed — optionally filtered by date range.
 *
 * Query params: date_from, date_to
 */
const getEmailLogStats = async (req, res) => {
  try {
    const { date_from, date_to } = req.query;

    let where    = "WHERE nl.channel = 'email'";
    const params = [];

    if (date_from) {
      where += ' AND nl.sent_at >= ?';
      params.push(`${date_from} 00:00:00`);
    }

    if (date_to) {
      where += ' AND nl.sent_at <= ?';
      params.push(`${date_to} 23:59:59`);
    }

    const [[stats]] = await db.execute(
      `SELECT
         COUNT(*)                                      AS total,
         SUM(nl.status = 'sent')                       AS sent,
         SUM(nl.status = 'failed')                     AS failed
       FROM notification_logs nl
       ${where}`,
      params
    );

    return res.json({
      success: true,
      data: {
        total:  Number(stats.total),
        sent:   Number(stats.sent),
        failed: Number(stats.failed),
      },
    });
  } catch (error) {
    console.error('Get email log stats error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { getEmailLogs, getEmailLog, getEmailLogStats };
