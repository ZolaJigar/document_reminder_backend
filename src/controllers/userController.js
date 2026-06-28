const bcrypt = require('bcryptjs');
const db = require('../config/database');

// ─── Admin: List all users ────────────────────────────────────────────────────
// GET /api/users?search=&is_active=&is_admin=&page=1&limit=20
const getUsers = async (req, res) => {
  try {
    const { search, is_active, is_admin } = req.query;
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    let query = `
      SELECT u.id, u.name, u.email, u.phone, u.is_admin, u.is_active, u.role_id,
             r.name AS role_name, r.slug AS role_slug,
             u.created_at, u.updated_at
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id AND r.is_deleted = 0
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ' AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (is_active !== undefined && is_active !== '') {
      query += ' AND u.is_active = ?';
      params.push(is_active === 'true' ? 1 : 0);
    }
    if (is_admin !== undefined && is_admin !== '') {
      query += ' AND u.is_admin = ?';
      params.push(is_admin === 'true' ? 1 : 0);
    }

    // Count total (same filters, no pagination)
    const countQuery = query.replace(
      /SELECT u\.id.*?u\.updated_at/s,
      'SELECT COUNT(*) AS total'
    );
    const [[{ total }]] = await db.execute(countQuery, params);

    query += ` ORDER BY u.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const [rows] = await db.execute(query, params);

    const data = rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      is_admin: u.is_admin,
      is_active: u.is_active,
      created_at: u.created_at,
      updated_at: u.updated_at,
      role: u.role_id ? { id: u.role_id, name: u.role_name, slug: u.role_slug } : null,
    }));

    res.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── Admin: Get single user ───────────────────────────────────────────────────
// GET /api/users/:id
const getUser = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT u.id, u.name, u.email, u.phone, u.is_admin, u.is_active, u.role_id,
              r.name AS role_name, r.slug AS role_slug,
              u.created_at, u.updated_at
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id AND r.is_deleted = 0
       WHERE u.id = ?`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const u = rows[0];

    // Include document count
    const [[{ doc_count }]] = await db.execute(
      'SELECT COUNT(*) AS doc_count FROM documents WHERE user_id = ?',
      [req.params.id]
    );

    res.json({
      success: true,
      data: {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        is_admin: u.is_admin,
        is_active: u.is_active,
        created_at: u.created_at,
        updated_at: u.updated_at,
        doc_count,
        role: u.role_id ? { id: u.role_id, name: u.role_name, slug: u.role_slug } : null,
      },
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── Admin: Create user ───────────────────────────────────────────────────────
// POST /api/users
const createUser = async (req, res) => {
  try {
    const { name, email, password, phone, is_admin = false, role_id = null } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const [existing] = await db.execute(
      'SELECT id FROM users WHERE email = ?',
      [email.toLowerCase().trim()]
    );
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    // Validate role_id if provided
    if (role_id !== null && role_id !== undefined) {
      const [roleRows] = await db.execute(
        'SELECT id FROM roles WHERE id = ? AND is_deleted = 0',
        [role_id]
      );
      if (roleRows.length === 0) {
        return res.status(404).json({ success: false, message: 'Role not found' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const [result] = await db.execute(
      'INSERT INTO users (name, email, password, phone, is_admin, role_id) VALUES (?, ?, ?, ?, ?, ?)',
      [name.trim(), email.toLowerCase().trim(), hashedPassword, phone || null, is_admin ? 1 : 0, role_id || null]
    );

    const [created] = await db.execute(
      `SELECT u.id, u.name, u.email, u.phone, u.is_admin, u.is_active, u.role_id,
              r.name AS role_name, r.slug AS role_slug, u.created_at
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id AND r.is_deleted = 0
       WHERE u.id = ?`,
      [result.insertId]
    );

    const u = created[0];
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        is_admin: u.is_admin,
        is_active: u.is_active,
        created_at: u.created_at,
        role: u.role_id ? { id: u.role_id, name: u.role_name, slug: u.role_slug } : null,
      },
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── Admin: Update user ───────────────────────────────────────────────────────
// PUT /api/users/:id
const updateUser = async (req, res) => {
  try {
    const [existing] = await db.execute(
      'SELECT * FROM users WHERE id = ?',
      [req.params.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const current = existing[0];
    const { name, email, phone, is_admin, is_active, password, role_id } = req.body;

    // Prevent an admin from demoting themselves
    if (
      String(req.params.id) === String(req.user.id) &&
      is_admin !== undefined &&
      !is_admin
    ) {
      return res.status(400).json({ success: false, message: 'You cannot remove your own admin rights' });
    }

    // Check email uniqueness if changing
    const newEmail = email ? email.toLowerCase().trim() : current.email;
    if (newEmail !== current.email) {
      const [dup] = await db.execute(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [newEmail, req.params.id]
      );
      if (dup.length > 0) {
        return res.status(409).json({ success: false, message: 'Email already in use' });
      }
    }

    // Validate role_id if provided
    let newRoleId = current.role_id;
    if (role_id !== undefined) {
      if (role_id === null) {
        newRoleId = null;
      } else {
        const [roleRows] = await db.execute(
          'SELECT id FROM roles WHERE id = ? AND is_deleted = 0',
          [role_id]
        );
        if (roleRows.length === 0) {
          return res.status(404).json({ success: false, message: 'Role not found' });
        }
        newRoleId = role_id;
      }
    }

    const newName     = name      !== undefined ? name.trim()          : current.name;
    const newPhone    = phone     !== undefined ? (phone || null)      : current.phone;
    const newIsAdmin  = is_admin  !== undefined ? (is_admin  ? 1 : 0) : current.is_admin;
    const newIsActive = is_active !== undefined ? (is_active ? 1 : 0) : current.is_active;

    // Optional password reset by admin
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
      }
      const hashed = await bcrypt.hash(password, 12);
      await db.execute(
        'UPDATE users SET name = ?, email = ?, phone = ?, is_admin = ?, is_active = ?, role_id = ?, password = ? WHERE id = ?',
        [newName, newEmail, newPhone, newIsAdmin, newIsActive, newRoleId, hashed, req.params.id]
      );
    } else {
      await db.execute(
        'UPDATE users SET name = ?, email = ?, phone = ?, is_admin = ?, is_active = ?, role_id = ? WHERE id = ?',
        [newName, newEmail, newPhone, newIsAdmin, newIsActive, newRoleId, req.params.id]
      );
    }

    const [updatedRows] = await db.execute(
      `SELECT u.id, u.name, u.email, u.phone, u.is_admin, u.is_active, u.role_id,
              r.name AS role_name, r.slug AS role_slug,
              u.created_at, u.updated_at
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id AND r.is_deleted = 0
       WHERE u.id = ?`,
      [req.params.id]
    );

    const u = updatedRows[0];
    res.json({
      success: true,
      message: 'User updated successfully',
      data: {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        is_admin: u.is_admin,
        is_active: u.is_active,
        created_at: u.created_at,
        updated_at: u.updated_at,
        role: u.role_id ? { id: u.role_id, name: u.role_name, slug: u.role_slug } : null,
      },
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── Admin: Delete user ───────────────────────────────────────────────────────
// DELETE /api/users/:id
const deleteUser = async (req, res) => {
  try {
    // Prevent self-deletion
    if (String(req.params.id) === String(req.user.id)) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
    }

    const [existing] = await db.execute(
      'SELECT id FROM users WHERE id = ?',
      [req.params.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // CASCADE deletes documents, reminders, etc. (set up in schema FK)
    await db.execute('DELETE FROM users WHERE id = ?', [req.params.id]);

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── Admin: Toggle active status ─────────────────────────────────────────────
// PATCH /api/users/:id/toggle-status
const toggleUserStatus = async (req, res) => {
  try {
    if (String(req.params.id) === String(req.user.id)) {
      return res.status(400).json({ success: false, message: 'You cannot deactivate your own account' });
    }

    const [existing] = await db.execute(
      'SELECT id, is_active FROM users WHERE id = ?',
      [req.params.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const newStatus = existing[0].is_active ? 0 : 1;
    await db.execute('UPDATE users SET is_active = ? WHERE id = ?', [newStatus, req.params.id]);

    res.json({
      success: true,
      message: `User ${newStatus ? 'activated' : 'deactivated'} successfully`,
      data: { id: parseInt(req.params.id), is_active: Boolean(newStatus) },
    });
  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { getUsers, getUser, createUser, updateUser, deleteUser, toggleUserStatus };
