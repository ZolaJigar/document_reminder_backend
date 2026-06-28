const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
const JWT_EXPIRES_IN = '7d';

/**
 * Insert a record into login_logs.
 * Fire-and-forget — errors are swallowed so they never break the login flow.
 */
const recordLoginLog = async ({ user_id, login_status, failed_reason, req }) => {
  try {
    const ip_address = (
      req.headers['x-forwarded-for']?.split(',')[0] ||
      req.socket?.remoteAddress ||
      null
    );
    const browser = req.headers['user-agent'] || null;

    await db.execute(
      'INSERT INTO login_logs (user_id, login_status, failed_reason, ip_address, browser) VALUES (?, ?, ?, ?, ?)',
      [user_id || null, login_status, failed_reason || null, ip_address, browser]
    );
  } catch (err) {
    console.error('Failed to record login log:', err);
  }
};

// Login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const [users] = await db.execute(
      'SELECT id, name, email, password, phone, is_admin, is_active, role_id FROM users WHERE email = ?',
      [email.toLowerCase().trim()]
    );

    if (users.length === 0) {
      await recordLoginLog({ login_status: 'failed', failed_reason: 'User not found', req });
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const user = users[0];

    if (!user.is_active) {
      await recordLoginLog({ user_id: user.id, login_status: 'failed', failed_reason: 'Account deactivated', req });
      return res.status(403).json({ success: false, message: 'Account is deactivated. Please contact support.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      await recordLoginLog({ user_id: user.id, login_status: 'failed', failed_reason: 'Wrong password', req });
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, is_admin: Boolean(user.is_admin), role_id: user.role_id },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    await recordLoginLog({ user_id: user.id, login_status: 'success', req });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: { id: user.id, name: user.name, email: user.email, phone: user.phone, is_admin: Boolean(user.is_admin), role_id: user.role_id },
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
};

// Get current user profile
const getProfile = async (req, res) => {
  try {
    const [users] = await db.execute(
      'SELECT id, name, email, phone, created_at FROM users WHERE id = ?',
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, data: users[0] });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Update profile
const updateProfile = async (req, res) => {
  try {
    const { name, phone } = req.body;

    await db.execute(
      'UPDATE users SET name = ?, phone = ? WHERE id = ?',
      [name, phone || null, req.user.id]
    );

    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Both current and new password required' });
    }

    const [users] = await db.execute('SELECT password FROM users WHERE id = ?', [req.user.id]);
    const isMatch = await bcrypt.compare(currentPassword, users[0].password);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    const hashedNew = await bcrypt.hash(newPassword, 12);
    await db.execute('UPDATE users SET password = ? WHERE id = ?', [hashedNew, req.user.id]);

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { login, getProfile, updateProfile, changePassword };
