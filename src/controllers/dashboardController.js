const db = require('../config/database');

/**
 * GET /api/dashboard/reminders
 *
 * Query params (all optional — combine freely):
 *   filter        = "date" | "month" | "year" | "all"   (default: "all")
 *   date          = YYYY-MM-DD          (used when filter=date)
 *   month         = YYYY-MM             (used when filter=month)
 *   year          = YYYY                (used when filter=year)
 *   document_type_id = number           (filter by document type)
 *   status        = pending|sent|failed (filter by reminder status)
 *   page          = number              (default: 1)
 *   limit         = number              (default: 20, max: 100)
 */
const getReminderDashboard = async (req, res) => {
  try {
    const {
      filter = 'all',
      date,
      month,
      year,
      document_type_id,
      status,
    } = req.query;

    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    // ── Base WHERE clause ────────────────────────────────────────────────────
    const whereClauses = ['r.user_id = ?'];
    const params       = [req.user.id];

    // Date / period filter
    if (filter === 'date' && date) {
      whereClauses.push('r.reminder_date = ?');
      params.push(date);
    } else if (filter === 'month' && month) {
      // month = "YYYY-MM"
      whereClauses.push("DATE_FORMAT(r.reminder_date, '%Y-%m') = ?");
      params.push(month);
    } else if (filter === 'year' && year) {
      whereClauses.push('YEAR(r.reminder_date) = ?');
      params.push(parseInt(year));
    }
    // filter=all → no date restriction

    // Document-type filter
    if (document_type_id) {
      whereClauses.push('d.document_type_id = ?');
      params.push(parseInt(document_type_id));
    }

    // Status filter
    if (status) {
      whereClauses.push('r.status = ?');
      params.push(status);
    }

    const whereSQL = 'WHERE ' + whereClauses.join(' AND ');

    // ── Summary counts (run in parallel with the list query) ────────────────
    const summarySQL = `
      SELECT
        COUNT(*)                                            AS total,
        SUM(r.status = 'pending')                          AS pending,
        SUM(r.status = 'sent')                             AS sent,
        SUM(r.status = 'failed')                           AS failed,
        SUM(r.reminder_date  < CURDATE() AND r.status = 'pending') AS overdue,
        SUM(r.reminder_date  = CURDATE() AND r.status = 'pending') AS due_today,
        SUM(r.reminder_date BETWEEN DATE_ADD(CURDATE(), INTERVAL 1 DAY)
                              AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
            AND r.status = 'pending')                      AS due_next_7_days
      FROM reminders r
      JOIN documents d ON d.id = r.document_id
      ${whereSQL}
    `;

    // ── By-document-type breakdown ────────────────────────────────────────
    const byTypeSQL = `
      SELECT
        dt.id                                              AS document_type_id,
        COALESCE(dt.name, 'Unclassified')                  AS document_type_name,
        COUNT(*)                                           AS total,
        SUM(r.status = 'pending')                          AS pending,
        SUM(r.status = 'sent')                             AS sent,
        SUM(r.status = 'failed')                           AS failed
      FROM reminders r
      JOIN documents d ON d.id = r.document_id
      LEFT JOIN document_types dt ON dt.id = d.document_type_id
      ${whereSQL}
      GROUP BY dt.id, dt.name
      ORDER BY total DESC
    `;

    // ── Monthly trend (always last 12 months regardless of filter) ──────────
    const trendSQL = `
      SELECT
        DATE_FORMAT(r.reminder_date, '%Y-%m')              AS month,
        COUNT(*)                                           AS total,
        SUM(r.status = 'pending')                          AS pending,
        SUM(r.status = 'sent')                             AS sent,
        SUM(r.status = 'failed')                           AS failed
      FROM reminders r
      JOIN documents d ON d.id = r.document_id
      WHERE r.user_id = ?
        AND r.reminder_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(r.reminder_date, '%Y-%m')
      ORDER BY month ASC
    `;

    // ── Paginated reminder list ──────────────────────────────────────────────
    const listSQL = `
      SELECT
        r.id,
        r.reminder_date,
        r.reminder_time,
        r.message,
        r.status,
        r.notify_email,
        r.notify_whatsapp,
        r.remind_before_days,
        r.sent_at,
        r.created_at,
        d.id             AS document_id,
        d.title          AS document_title,
        d.expiry_date    AS document_expiry_date,
        d.renewal_cost   AS document_renewal_cost,
        d.category       AS document_category,
        dt.id            AS document_type_id,
        dt.name          AS document_type_name
      FROM reminders r
      JOIN documents d  ON d.id  = r.document_id
      LEFT JOIN document_types dt ON dt.id = d.document_type_id
      ${whereSQL}
      ORDER BY r.reminder_date ASC, r.reminder_time ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const countSQL = `
      SELECT COUNT(*) AS total
      FROM reminders r
      JOIN documents d ON d.id = r.document_id
      ${whereSQL}
    `;

    // Run all queries in parallel
    const [
      [summaryRows],
      [byTypeRows],
      [trendRows],
      [listRows],
      [[countRow]],
    ] = await Promise.all([
      db.execute(summarySQL, params),
      db.execute(byTypeSQL, params),
      db.execute(trendSQL, [req.user.id]),
      db.execute(listSQL, params),
      db.execute(countSQL, params),
    ]);

    const summary = summaryRows[0] || {};

    res.json({
      success: true,
      data: {
        summary: {
          total:          Number(summary.total)         || 0,
          pending:        Number(summary.pending)       || 0,
          sent:           Number(summary.sent)          || 0,
          failed:         Number(summary.failed)        || 0,
          overdue:        Number(summary.overdue)       || 0,
          due_today:      Number(summary.due_today)     || 0,
          due_next_7_days: Number(summary.due_next_7_days) || 0,
        },
        by_document_type: byTypeRows.map(row => ({
          document_type_id:   row.document_type_id,
          document_type_name: row.document_type_name,
          total:   Number(row.total)   || 0,
          pending: Number(row.pending) || 0,
          sent:    Number(row.sent)    || 0,
          failed:  Number(row.failed)  || 0,
        })),
        monthly_trend: trendRows.map(row => ({
          month:   row.month,
          total:   Number(row.total)   || 0,
          pending: Number(row.pending) || 0,
          sent:    Number(row.sent)    || 0,
          failed:  Number(row.failed)  || 0,
        })),
        reminders: listRows,
        pagination: {
          page,
          limit,
          total:  Number(countRow.total) || 0,
          pages:  Math.ceil((Number(countRow.total) || 0) / limit),
        },
        // Echo back applied filters for the client
        filters: {
          filter,
          ...(filter === 'date'  && date  ? { date }  : {}),
          ...(filter === 'month' && month ? { month } : {}),
          ...(filter === 'year'  && year  ? { year }  : {}),
          ...(document_type_id ? { document_type_id: parseInt(document_type_id) } : {}),
          ...(status           ? { status }           : {}),
        },
      },
    });
  } catch (error) {
    console.error('Dashboard reminders error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * GET /api/dashboard/summary
 *
 * Top-level counts — documents + reminders totals for the logged-in user.
 * No filters needed; always returns live totals.
 */
const getSummary = async (req, res) => {
  try {
    const userId = req.user.id;

    const [
      [[docRow]],
      [[reminderRow]],
      [upcomingRows],
    ] = await Promise.all([
      // Document counts
      db.execute(`
        SELECT
          COUNT(*)                              AS total,
          SUM(status = 'active')                AS active,
          SUM(status = 'expiring_soon')         AS expiring_soon,
          SUM(status = 'expired')               AS expired,
          SUM(renewal_cost IS NOT NULL)         AS with_renewal_cost,
          SUM(COALESCE(renewal_cost, 0))        AS total_renewal_cost
        FROM documents
        WHERE user_id = ?
      `, [userId]),

      // Reminder counts
      db.execute(`
        SELECT
          COUNT(*)                                                    AS total,
          SUM(status = 'pending')                                     AS pending,
          SUM(status = 'sent')                                        AS sent,
          SUM(status = 'failed')                                      AS failed,
          SUM(reminder_date < CURDATE() AND status = 'pending')       AS overdue,
          SUM(reminder_date = CURDATE() AND status = 'pending')       AS due_today,
          SUM(reminder_date BETWEEN DATE_ADD(CURDATE(), INTERVAL 1 DAY)
                              AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
              AND status = 'pending')                                 AS due_next_7_days
        FROM reminders
        WHERE user_id = ?
      `, [userId]),

      // Next 5 upcoming reminders
      db.execute(`
        SELECT
          r.id, r.reminder_date, r.reminder_time, r.status,
          d.title AS document_title,
          dt.name AS document_type_name
        FROM reminders r
        JOIN documents d ON d.id = r.document_id
        LEFT JOIN document_types dt ON dt.id = d.document_type_id
        WHERE r.user_id = ? AND r.status = 'pending' AND r.reminder_date >= CURDATE()
        ORDER BY r.reminder_date ASC, r.reminder_time ASC
        LIMIT 5
      `, [userId]),
    ]);

    res.json({
      success: true,
      data: {
        documents: {
          total:              Number(docRow.total)              || 0,
          active:             Number(docRow.active)             || 0,
          expiring_soon:      Number(docRow.expiring_soon)      || 0,
          expired:            Number(docRow.expired)            || 0,
          with_renewal_cost:  Number(docRow.with_renewal_cost)  || 0,
          total_renewal_cost: parseFloat(docRow.total_renewal_cost) || 0,
        },
        reminders: {
          total:           Number(reminderRow.total)           || 0,
          pending:         Number(reminderRow.pending)         || 0,
          sent:            Number(reminderRow.sent)            || 0,
          failed:          Number(reminderRow.failed)          || 0,
          overdue:         Number(reminderRow.overdue)         || 0,
          due_today:       Number(reminderRow.due_today)       || 0,
          due_next_7_days: Number(reminderRow.due_next_7_days) || 0,
        },
        upcoming_reminders: upcomingRows,
      },
    });
  } catch (error) {
    console.error('Dashboard summary error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { getReminderDashboard, getSummary };
