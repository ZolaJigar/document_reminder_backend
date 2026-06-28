const jwt  = require('jsonwebtoken');
const db   = require('../config/database');
require('dotenv').config();

/**
 * Verify JWT, then re-fetch the user from DB so role_id is always fresh.
 * Attaches decoded payload + fresh role_id to req.user.
 */
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

    if (!token) {
      return res.status(401).json({ status: 'error', message: 'Access token required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ status: 'error', message: 'Token expired' });
      }
      return res.status(401).json({ status: 'error', message: 'Invalid token' });
    }

    // Re-fetch user so we get the live role_id
    const [rows] = await db.execute(
      'SELECT id, name, email, is_admin, is_active, role_id FROM users WHERE id = ? AND is_active = 1',
      [decoded.id]
    );

    if (rows.length === 0) {
      return res.status(401).json({ status: 'error', message: 'User not found or inactive' });
    }

    const freshUser = rows[0];
    req.user = {
      ...decoded,
      role_id: freshUser.role_id,
      is_admin: Boolean(freshUser.is_admin),
    };

    next();
  } catch (error) {
    console.error('verifyToken error:', error);
    return res.status(500).json({ status: 'error', message: 'Authentication error' });
  }
};

module.exports = verifyToken;
