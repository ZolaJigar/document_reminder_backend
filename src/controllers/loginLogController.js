const db = require('../config/database');

/**
 * GET /api/login-logs
 *
 * Query params:
 *   user_id      – filter by specific user
 *   login_status – 'success' | 'failed'
 *   search       – partial match on ip_address or browser
 *   date_from    – ISO date string (inclusive)
 *   date_to      – ISO date string (inclusive, end of day)
 *   page         – default 1
 *   limit        – default 20, max 100
 */
const getLoginLogs = async (req, res) => {
  try {
    const { user_id, login_status, search, date_from, date_to } = req.query;

    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    let where  = 'WHERE 1=1';
    const params = [];

    if (user_id) {
      where += ' AND ll.user_id = ?';
      params.push(user_id);
    }

    if (login_status && ['success', 'failed'].includes(login_status)) {
      where += ' AND ll.login_status = ?';
      params.push(login_status);
    }

    if (search) {
      where += ' AND (ll.ip_address LIKE ? OR ll.browser LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s);
    }

    if (date_from) {
      where += ' AND ll.created_at >= ?';
      params.push(`${date_from} 00:00:00`);
    }

    if (date_to) {
      where += ' AND ll.created_at <= ?';
      params.push(`${date_to} 23:59:59`);
    }

    const baseQuery = `
      FROM login_logs ll
      LEFT JOIN users u ON u.id = ll.user_id
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
         ll.id,
         ll.user_id,
         u.name  AS user_name,
         u.email AS user_email,
         ll.login_status,
         ll.failed_reason,
         ll.ip_address,
         ll.browser,
         ll.created_at
       ${baseQuery}
       ORDER BY ll.created_at DESC
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
    console.error('Get login logs error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * GET /api/login-logs/:id
 * Single log entry detail.
 */
const getLoginLog = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT
         ll.id,
         ll.user_id,
         u.name  AS user_name,
         u.email AS user_email,
         ll.login_status,
         ll.failed_reason,
         ll.ip_address,
         ll.browser,
         ll.created_at
       FROM login_logs ll
       LEFT JOIN users u ON u.id = ll.user_id
       WHERE ll.id = ?`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Login log not found' });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Get login log error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { getLoginLogs, getLoginLog };
