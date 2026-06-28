const db = require('../config/database');

/**
 * Factory middleware — checks whether the authenticated user's role
 * has the given permission slug assigned.
 *
 * Super Admin (slug === "super_admin") bypasses all checks.
 *
 * @param {string} permissionSlug
 * @returns {import('express').RequestHandler}
 */
const checkPermission = (permissionSlug) => {
  return async (req, res, next) => {
    try {
      const { role_id } = req.user;

      if (!role_id) {
        return res.status(403).json({ status: 'error', message: 'No role assigned to this user' });
      }

      // Fetch role to check if Super Admin
      const [roleRows] = await db.execute(
        'SELECT id, slug FROM roles WHERE id = ? AND is_deleted = 0',
        [role_id]
      );

      if (roleRows.length === 0) {
        return res.status(403).json({ status: 'error', message: 'Role not found' });
      }

      const role = roleRows[0];

      // Super Admin bypasses all permission checks
      if (role.slug === 'super_admin') {
        return next();
      }

      // Find permission by slug
      const [permRows] = await db.execute(
        'SELECT id FROM permissions WHERE slug = ? AND is_deleted = 0',
        [permissionSlug]
      );

      if (permRows.length === 0) {
        return res.status(403).json({ status: 'error', message: 'Permission not found' });
      }

      const permission = permRows[0];

      // Check if the role has this permission
      const [rpRows] = await db.execute(
        'SELECT id FROM rolepermissions WHERE role_id = ? AND permission_id = ? AND is_deleted = 0',
        [role_id, permission.id]
      );

      if (rpRows.length === 0) {
        return res.status(403).json({
          status: 'error',
          message: 'You do not have permission to perform this action',
        });
      }

      next();
    } catch (error) {
      console.error('checkPermission error:', error);
      return res.status(500).json({ status: 'error', message: 'Permission check failed' });
    }
  };
};

module.exports = checkPermission;
