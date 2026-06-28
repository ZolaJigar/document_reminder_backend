const db = require('../config/database');
const { successResponse, errorResponse } = require('../utils/response');
const { parsePagination } = require('../utils/pagination');

/**
 * POST /permissions/list
 * Paginated, searchable list of permissions with parent info.
 */
const listPermission = async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.body);
    const { search = '' } = req.body;
    const searchParam = `%${search}%`;

    const [countRows] = await db.execute(
      `SELECT COUNT(*) AS total FROM permissions
       WHERE is_deleted = 0 AND (name LIKE ? OR slug LIKE ?)`,
      [searchParam, searchParam]
    );
    const count = countRows[0].total;

    const [permissions] = await db.execute(
      `SELECT p.id, p.name, p.slug, p.order_index, p.parent_id, p.is_deleted, p.createdAt, p.updatedAt,
              parent.id AS parent_id_ref, parent.name AS parent_name, parent.slug AS parent_slug
       FROM permissions p
       LEFT JOIN permissions parent ON parent.id = p.parent_id
       WHERE p.is_deleted = 0 AND (p.name LIKE ? OR p.slug LIKE ?)
       ORDER BY p.order_index ASC
       LIMIT ? OFFSET ?`,
      [searchParam, searchParam, limit, offset]
    );

    const data = permissions.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      order_index: p.order_index,
      parent_id: p.parent_id,
      is_deleted: p.is_deleted,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      parent: p.parent_id
        ? { id: p.parent_id_ref, name: p.parent_name, slug: p.parent_slug }
        : null,
    }));

    return successResponse(res, 200, 'Permissions retrieved', { count, data });
  } catch (error) {
    console.error('listPermission error:', error);
    return errorResponse(res, 500, 'Failed to retrieve permissions');
  }
};

/**
 * POST /permissions/create
 * Create a new permission. Auto-assigns order_index.
 */
const createPermission = async (req, res) => {
  try {
    const { name, slug, parent_id = null } = req.body;

    if (!name || !slug) {
      return errorResponse(res, 422, 'name and slug are required');
    }

    // Check slug uniqueness
    const [existing] = await db.execute(
      'SELECT id FROM permissions WHERE slug = ? AND is_deleted = 0',
      [slug]
    );
    if (existing.length > 0) {
      return errorResponse(res, 409, 'A permission with this slug already exists');
    }

    // Auto order_index = max(order_index where same parent_id) + 1
    const [[{ maxOrder }]] = await db.execute(
      'SELECT COALESCE(MAX(order_index), 0) AS maxOrder FROM permissions WHERE parent_id <=> ?',
      [parent_id]
    );
    const order_index = maxOrder + 1;

    const [result] = await db.execute(
      'INSERT INTO permissions (name, slug, order_index, parent_id) VALUES (?, ?, ?, ?)',
      [name.trim(), slug.trim(), order_index, parent_id]
    );

    const [created] = await db.execute(
      'SELECT * FROM permissions WHERE id = ?',
      [result.insertId]
    );

    return successResponse(res, 201, 'Permission created successfully', created[0]);
  } catch (error) {
    console.error('createPermission error:', error);
    return errorResponse(res, 500, 'Failed to create permission');
  }
};

/**
 * POST /permissions/detail
 * Get structured permission tree for a role.
 * Super Admin gets all permissions.
 * Body: { role_id }
 */
const getPermissionsDetails = async (req, res) => {
  try {
    const { role_id } = req.body;

    if (!role_id) {
      return errorResponse(res, 422, 'role_id is required');
    }

    // Fetch role
    const [roleRows] = await db.execute(
      'SELECT id, slug FROM roles WHERE id = ? AND is_deleted = 0',
      [role_id]
    );
    if (roleRows.length === 0) {
      return errorResponse(res, 404, 'Role not found');
    }

    const role = roleRows[0];
    const isSuperAdmin = role.slug === 'super_admin';

    let allPerms;

    if (isSuperAdmin) {
      // Super Admin → return ALL active permissions
      [allPerms] = await db.execute(
        'SELECT id, name, slug, order_index, parent_id FROM permissions WHERE is_deleted = 0 ORDER BY order_index ASC'
      );
    } else {
      // Only permissions assigned to this role
      [allPerms] = await db.execute(
        `SELECT p.id, p.name, p.slug, p.order_index, p.parent_id
         FROM permissions p
         JOIN rolepermissions rp ON rp.permission_id = p.id
         WHERE rp.role_id = ? AND rp.is_deleted = 0 AND p.is_deleted = 0
         ORDER BY p.order_index ASC`,
        [role_id]
      );
    }

    // Build a map for quick lookup
    const permMap = {};
    for (const p of allPerms) {
      permMap[p.id] = p;
    }

    // Top-level permissions (parent_id is null)
    const topLevel = allPerms.filter((p) => p.parent_id === null);

    const operations = [];
    const menu = [];
    const tabs = [];

    for (const top of topLevel) {
      // Children of this top-level node
      const children = allPerms.filter((p) => p.parent_id === top.id);

      if (children.length === 0) {
        // Leaf at top level — treat as an operation
        operations.push(top.slug);
        continue;
      }

      // Check if any child has grandchildren (3-level tree)
      const hasGrandchildren = children.some(
        (child) => allPerms.some((p) => p.parent_id === child.id)
      );

      if (hasGrandchildren) {
        // 3-level: tab → module → CRUD
        tabs.push(top.slug);

        for (const child of children) {
          const grandchildren = allPerms.filter((p) => p.parent_id === child.id);
          if (grandchildren.length > 0) {
            menu.push(child.slug);
            for (const gc of grandchildren) {
              operations.push(gc.slug);
            }
          } else {
            // Child is itself a leaf under a tab
            operations.push(child.slug);
          }
        }
      } else {
        // 2-level: module → CRUD
        menu.push(top.slug);
        for (const child of children) {
          operations.push(child.slug);
        }
      }
    }

    return successResponse(res, 200, 'Permissions details retrieved', {
      operations: [...new Set(operations)],
      menu: [...new Set(menu)],
      tabs: [...new Set(tabs)],
    });
  } catch (error) {
    console.error('getPermissionsDetails error:', error);
    return errorResponse(res, 500, 'Failed to retrieve permissions details');
  }
};

module.exports = {
  listPermission,
  createPermission,
  getPermissionsDetails,
};
