const db = require('../config/database');
const fs = require('fs');
const path = require('path');
const { uploadDir } = require('../middleware/upload');

// Get all documents for the logged-in user
const getDocuments = async (req, res) => {
  try {
    const { search, category, status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT d.*, 
        (SELECT COUNT(*) FROM reminders r WHERE r.document_id = d.id AND r.status = 'pending') AS pending_reminders
      FROM documents d
      WHERE d.user_id = ?
    `;
    const params = [req.user.id];

    if (search) {
      query += ' AND (d.title LIKE ? OR d.description LIKE ? OR d.category LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    if (category) {
      query += ' AND d.category = ?';
      params.push(category);
    }

    if (status) {
      query += ' AND d.status = ?';
      params.push(status);
    }

    query += ' ORDER BY d.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [docs] = await db.execute(query, params);

    // Count total
    let countQuery = 'SELECT COUNT(*) as total FROM documents WHERE user_id = ?';
    const countParams = [req.user.id];
    if (search) {
      countQuery += ' AND (title LIKE ? OR description LIKE ? OR category LIKE ?)';
      const s = `%${search}%`;
      countParams.push(s, s, s);
    }
    if (category) { countQuery += ' AND category = ?'; countParams.push(category); }
    if (status) { countQuery += ' AND status = ?'; countParams.push(status); }

    const [[{ total }]] = await db.execute(countQuery, countParams);

    res.json({
      success: true,
      data: docs,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get single document
const getDocument = async (req, res) => {
  try {
    const [docs] = await db.execute(
      'SELECT * FROM documents WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (docs.length === 0) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    // Get reminders for this document
    const [reminders] = await db.execute(
      `SELECT r.*, GROUP_CONCAT(rr.email) AS recipient_emails, GROUP_CONCAT(rr.phone) AS recipient_phones
       FROM reminders r
       LEFT JOIN reminder_recipients rr ON rr.reminder_id = r.id
       WHERE r.document_id = ?
       GROUP BY r.id
       ORDER BY r.reminder_date, r.reminder_time`,
      [req.params.id]
    );

    res.json({ success: true, data: { ...docs[0], reminders } });
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Create document
const createDocument = async (req, res) => {
  try {
    const { title, description, category, expiry_date, notes } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: 'Document title is required' });
    }

    let file_name = null, file_path = null, file_type = null, file_size = null;

    if (req.file) {
      file_name = req.file.originalname;
      file_path = req.file.filename;
      file_type = req.file.mimetype;
      file_size = req.file.size;
    }

    // Auto-calculate status based on expiry_date
    let status = 'active';
    if (expiry_date) {
      const today = new Date();
      const expiry = new Date(expiry_date);
      const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) status = 'expired';
      else if (diffDays <= 30) status = 'expiring_soon';
    }

    const [result] = await db.execute(
      `INSERT INTO documents (user_id, title, description, category, file_name, file_path, file_type, file_size, expiry_date, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, title, description || null, category || null, file_name, file_path, file_type, file_size, expiry_date || null, notes || null, status]
    );

    res.status(201).json({
      success: true,
      message: 'Document created successfully',
      data: { id: result.insertId },
    });
  } catch (error) {
    console.error('Create document error:', error);
    // Clean up uploaded file on error
    if (req.file) {
      fs.unlink(path.join(uploadDir, req.file.filename), () => {});
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Update document
const updateDocument = async (req, res) => {
  try {
    const [existing] = await db.execute(
      'SELECT * FROM documents WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const { title, description, category, expiry_date, notes } = req.body;
    const doc = existing[0];

    let file_name = doc.file_name, file_path = doc.file_path, file_type = doc.file_type, file_size = doc.file_size;

    if (req.file) {
      // Delete old file
      if (doc.file_path) {
        fs.unlink(path.join(uploadDir, doc.file_path), () => {});
      }
      file_name = req.file.originalname;
      file_path = req.file.filename;
      file_type = req.file.mimetype;
      file_size = req.file.size;
    }

    let status = 'active';
    const ed = expiry_date || doc.expiry_date;
    if (ed) {
      const diffDays = Math.ceil((new Date(ed) - new Date()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) status = 'expired';
      else if (diffDays <= 30) status = 'expiring_soon';
    }

    await db.execute(
      `UPDATE documents SET title = ?, description = ?, category = ?, file_name = ?, file_path = ?, 
       file_type = ?, file_size = ?, expiry_date = ?, notes = ?, status = ?
       WHERE id = ? AND user_id = ?`,
      [
        title || doc.title, description || null, category || null,
        file_name, file_path, file_type, file_size,
        expiry_date || null, notes || null, status,
        req.params.id, req.user.id,
      ]
    );

    res.json({ success: true, message: 'Document updated successfully' });
  } catch (error) {
    console.error('Update document error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Delete document
const deleteDocument = async (req, res) => {
  try {
    const [existing] = await db.execute(
      'SELECT * FROM documents WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    // Delete file from disk
    if (existing[0].file_path) {
      fs.unlink(path.join(uploadDir, existing[0].file_path), () => {});
    }

    await db.execute('DELETE FROM documents WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);

    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Download/view document file
const downloadDocument = async (req, res) => {
  try {
    const [docs] = await db.execute(
      'SELECT * FROM documents WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (docs.length === 0 || !docs[0].file_path) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    const filePath = path.join(uploadDir, docs[0].file_path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File not found on server' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${docs[0].file_name}"`);
    res.setHeader('Content-Type', docs[0].file_type);
    res.sendFile(filePath);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get document categories
const getCategories = async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT DISTINCT category FROM documents WHERE user_id = ? AND category IS NOT NULL ORDER BY category',
      [req.user.id]
    );
    res.json({ success: true, data: rows.map(r => r.category) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { getDocuments, getDocument, createDocument, updateDocument, deleteDocument, downloadDocument, getCategories };
