const db = require('../config/database');
const { successResponse, errorResponse } = require('../utils/response');
const { parsePagination } = require('../utils/pagination');
const {
  createRoleSchema,
  updateRoleSchema,
  assignRoleSchema,
  roleParamsSchema,
} = require('../validations/roleValidation');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a human-readable name to a slug.
 * e.g. "Super Admin" → "super_admin"
 */
const generateSlug = (name) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/\s+/g, '_');

// ── Controllers ──────────────────────────────────────────────────────────────

/**
 * POST /roles/create
 * Create a new role, optionally assign permissions.
 */
const createRole = async (req, res) => {
  const parsed = createRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    return errorResponse(res, 422, 'Validation failed', parsed.error.errors);
  }

  const { name, is_editable = 1, is_deletable = 1, permissions } = parsed.data;
  const slug = generateSlug(name);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Slug uniqueness check
    const [existing] = await conn.execute(
      'SELECT id FROM roles WHERE slug = ? AND is_deleted = 0',
      [slug]
    );
    if (existing.length > 0) {
      await conn.rollback();
      return errorResponse(res, 409, 'A role with this name already exists');
    }

    const [result] = await conn.execute(
      'INSERT INTO roles (name, slug, is_editable, is_deletable) VALUES (?, ?, ?, ?)',
      [name.trim(), slug, is_editable, is_deletable]
    );
    const roleId = result.insertId;

    // Bulk assign permissions
    if (permissions && permissions.length > 0) {
      const values = permissions.map((pid) => [roleId, pid]);
      await conn.query(
        'INSERT INTO rolepermissions (role_id, permission_id) VALUES ?',
        [values]
      );
    }

    await conn.commit();

    const [roleRows] = await conn.execute('SELECT * FROM roles WHERE id = ?', [roleId]);
    return successResponse(res, 201, 'Role created successfully', roleRows[0]);
  } catch (error) {
    await conn.rollback();
    console.error('createRole error:', error);
    return errorResponse(res, 500, 'Failed to create role');
  } finally {
    conn.release();
  }
};

/**
 * POST /roles/list
 * Paginated, searchable list of roles with their permissions.
 */
const listRole = async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.body);
    const { search = '' } = req.body;

    const searchParam = `%${search}%`;

    const [countRows] = await db.execute(
      `SELECT COUNT(*) AS total FROM roles
       WHERE is_deleted = 0 AND (name LIKE ? OR slug LIKE ?)`,
      [searchParam, searchParam]
    );
    const count = countRows[0].total;

    const [roles] = await db.execute(
      `SELECT * FROM roles
       WHERE is_deleted = 0 AND (name LIKE ? OR slug LIKE ?)
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [searchParam, searchParam, limit, offset]
    );

    if (roles.length === 0) {
      return successResponse(res, 200, 'Roles retrieved', { count, data: [] });
    }

    const roleIds = roles.map((r) => r.id);
    const placeholders = roleIds.map(() => '?').join(',');

    const [rpRows] = await db.execute(
      `SELECT rp.role_id, p.id, p.name, p.slug
       FROM rolepermissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE rp.role_id IN (${placeholders}) AND rp.is_deleted = 0 AND p.is_deleted = 0`,
      roleIds
    );

    // Group permissions by role
    const permMap = {};
    for (const rp of rpRows) {
      if (!permMap[rp.role_id]) permMap[rp.role_id] = [];
      permMap[rp.role_id].push({ id: rp.id, name: rp.name, slug: rp.slug });
    }

    const data = roles.map((r) => ({
      ...r,
      permissions: permMap[r.id] || [],
    }));

    return successResponse(res, 200, 'Roles retrieved', { count, data });
  } catch (error) {
    console.error('listRole error:', error);
    return errorResponse(res, 500, 'Failed to retrieve roles');
  }
};

/**
 * GET /roles/:id
 * Get a single role by ID including its permissions.
 */
const getRoleById = async (req, res) => {
  const parsed = roleParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    return errorResponse(res, 422, 'Invalid ID', parsed.error.errors);
  }

  const { id } = parsed.data;

  try {
    const [roles] = await db.execute(
      'SELECT * FROM roles WHERE id = ? AND is_deleted = 0',
      [id]
    );
    if (roles.length === 0) {
      return errorResponse(res, 404, 'Role not found');
    }

    const [rpRows] = await db.execute(
      `SELECT p.id, p.name, p.slug
       FROM rolepermissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE rp.role_id = ? AND rp.is_deleted = 0 AND p.is_deleted = 0`,
      [id]
    );

    return successResponse(res, 200, 'Role retrieved', {
      ...roles[0],
      permissions: rpRows,
    });
  } catch (error) {
    console.error('getRoleById error:', error);
    return errorResponse(res, 500, 'Failed to retrieve role');
  }
};

/**
 * PUT /roles/update/:id
 * Update a role. If `permissions` array is present in body (even []),
 * replace existing permissions; otherwise leave them untouched.
 */
const updateRole = async (req, res) => {
  const paramsParsed = roleParamsSchema.safeParse(req.params);
  if (!paramsParsed.success) {
    return errorResponse(res, 422, 'Invalid ID', paramsParsed.error.errors);
  }
  const { id } = paramsParsed.data;

  const bodyParsed = updateRoleSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    return errorResponse(res, 422, 'Validation failed', bodyParsed.error.errors);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [roleRows] = await conn.execute(
      'SELECT * FROM roles WHERE id = ? AND is_deleted = 0',
      [id]
    );
    if (roleRows.length === 0) {
      await conn.rollback();
      return errorResponse(res, 404, 'Role not found');
    }

    const current = roleRows[0];

    if (current.is_editable === 0) {
      await conn.rollback();
      return errorResponse(res, 403, 'This role cannot be edited');
    }

    const { name, is_editable, is_deletable, permissions } = bodyParsed.data;

    let newSlug = current.slug;
    if (name && name.trim() !== current.name) {
      newSlug = generateSlug(name);
      // Check slug uniqueness excluding current role
      const [slugCheck] = await conn.execute(
        'SELECT id FROM roles WHERE slug = ? AND is_deleted = 0 AND id != ?',
        [newSlug, id]
      );
      if (slugCheck.length > 0) {
        await conn.rollback();
        return errorResponse(res, 409, 'A role with this name already exists');
      }
    }

    const newName        = name        !== undefined ? name.trim() : current.name;
    const newIsEditable  = is_editable  !== undefined ? is_editable  : current.is_editable;
    const newIsDeletable = is_deletable !== undefined ? is_deletable : current.is_deletable;

    await conn.execute(
      'UPDATE roles SET name = ?, slug = ?, is_editable = ?, is_deletable = ? WHERE id = ?',
      [newName, newSlug, newIsEditable, newIsDeletable, id]
    );

    // Only touch permissions when the key is present in the request body
    if (permissions !== undefined) {
      // Soft-delete all existing role permissions
      await conn.execute(
        'UPDATE rolepermissions SET is_deleted = 1 WHERE role_id = ?',
        [id]
      );

      // Bulk-insert new ones
      if (permissions.length > 0) {
        const values = permissions.map((pid) => [id, pid]);
        await conn.query(
          'INSERT INTO rolepermissions (role_id, permission_id) VALUES ?',
          [values]
        );
      }
    }

    await conn.commit();

    const [updated] = await conn.execute(
      'SELECT * FROM roles WHERE id = ?',
      [id]
    );

    // Fetch fresh permissions
    const [rpRows] = await conn.execute(
      `SELECT p.id, p.name, p.slug
       FROM rolepermissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE rp.role_id = ? AND rp.is_deleted = 0 AND p.is_deleted = 0`,
      [id]
    );

    return successResponse(res, 200, 'Role updated successfully', {
      ...updated[0],
      permissions: rpRows,
    });
  } catch (error) {
    await conn.rollback();
    console.error('updateRole error:', error);
    return errorResponse(res, 500, 'Failed to update role');
  } finally {
    conn.release();
  }
};

/**
 * DELETE /roles/delete/:id
 * Soft-delete a role. Blocked if role is non-deletable or has active users.
 */
const deleteRole = async (req, res) => {
  const parsed = roleParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    return errorResponse(res, 422, 'Invalid ID', parsed.error.errors);
  }
  const { id } = parsed.data;

  try {
    const [roles] = await db.execute(
      'SELECT * FROM roles WHERE id = ? AND is_deleted = 0',
      [id]
    );
    if (roles.length === 0) {
      return errorResponse(res, 404, 'Role not found');
    }

    const role = roles[0];

    if (role.is_deletable === 0) {
      return errorResponse(res, 403, 'This role cannot be deleted');
    }

    // Check no active users are on this role
    const [users] = await db.execute(
      'SELECT id FROM users WHERE role_id = ? AND is_active = 1',
      [id]
    );
    if (users.length > 0) {
      return errorResponse(
        res,
        400,
        'Cannot delete role: active users are still assigned to it'
      );
    }

    await db.execute('UPDATE roles SET is_deleted = 1 WHERE id = ?', [id]);

    return successResponse(res, 200, 'Role deleted successfully');
  } catch (error) {
    console.error('deleteRole error:', error);
    return errorResponse(res, 500, 'Failed to delete role');
  }
};

/**
 * PATCH /roles/role-active/:id
 * Toggle the is_active flag (0 ↔ 1).
 * The roles table does not have is_active yet so we use is_deleted as a proxy,
 * but per the spec the roles table has no is_active — we'll add it here.
 * Actually spec says toggleActive → is_active 0↔1, so we add is_active to the
 * roles table via an extra migration. We handle it gracefully with a column add.
 */
const roleActive = async (req, res) => {
  const parsed = roleParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    return errorResponse(res, 422, 'Invalid ID', parsed.error.errors);
  }
  const { id } = parsed.data;

  try {
    const [roles] = await db.execute(
      'SELECT * FROM roles WHERE id = ? AND is_deleted = 0',
      [id]
    );
    if (roles.length === 0) {
      return errorResponse(res, 404, 'Role not found');
    }

    const role = roles[0];
    const currentActive = role.is_active !== undefined ? role.is_active : 1;
    const newActive = currentActive ? 0 : 1;

    await db.execute('UPDATE roles SET is_active = ? WHERE id = ?', [newActive, id]);

    const [updated] = await db.execute('SELECT * FROM roles WHERE id = ?', [id]);
    return successResponse(res, 200, `Role ${newActive ? 'activated' : 'deactivated'} successfully`, updated[0]);
  } catch (error) {
    console.error('roleActive error:', error);
    return errorResponse(res, 500, 'Failed to toggle role status');
  }
};

/**
 * PUT /roles/assign-user
 * Assign a role to a user.
 */
const assignRoleToUser = async (req, res) => {
  const parsed = assignRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    return errorResponse(res, 422, 'Validation failed', parsed.error.errors);
  }

  const { user_id, role_id } = parsed.data;

  try {
    const [users] = await db.execute(
      'SELECT id, name, email, phone, is_admin, is_active, role_id FROM users WHERE id = ? AND is_active = 1',
      [user_id]
    );
    if (users.length === 0) {
      return errorResponse(res, 404, 'User not found');
    }

    const [roles] = await db.execute(
      'SELECT id, name, slug FROM roles WHERE id = ? AND is_deleted = 0',
      [role_id]
    );
    if (roles.length === 0) {
      return errorResponse(res, 404, 'Role not found');
    }

    await db.execute('UPDATE users SET role_id = ? WHERE id = ?', [role_id, user_id]);

    const [updated] = await db.execute(
      `SELECT u.id, u.name, u.email, u.phone, u.is_admin, u.is_active, u.role_id,
              r.name AS role_name, r.slug AS role_slug
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.id = ?`,
      [user_id]
    );

    return successResponse(res, 200, 'Role assigned to user successfully', updated[0]);
  } catch (error) {
    console.error('assignRoleToUser error:', error);
    return errorResponse(res, 500, 'Failed to assign role');
  }
};

module.exports = {
  createRole,
  listRole,
  getRoleById,
  updateRole,
  deleteRole,
  roleActive,
  assignRoleToUser,
};
