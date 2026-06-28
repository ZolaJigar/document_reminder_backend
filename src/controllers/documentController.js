const db = require('../config/database');
const fs = require('fs');
const path = require('path');
const { uploadDir } = require('../middleware/upload');

// Get all documents for the logged-in user
const getDocuments = async (req, res) => {
  try {
    const { search, category, status, document_type_id } = req.query;
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    let query = `
      SELECT d.*,
        dt.id   AS document_type_id,
        dt.name AS document_type_name,
        (SELECT COUNT(*) FROM reminders r WHERE r.document_id = d.id AND r.status = 'pending') AS pending_reminders
      FROM documents d
      LEFT JOIN document_types dt ON dt.id = d.document_type_id
      WHERE d.user_id = ?
    `;
    const params = [req.user.id];

    if (search) {
      query += ' AND (d.title LIKE ? OR d.description LIKE ? OR d.category LIKE ? OR dt.name LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    if (category) {
      query += ' AND d.category = ?';
      params.push(category);
    }

    if (document_type_id) {
      query += ' AND d.document_type_id = ?';
      params.push(document_type_id);
    }

    if (status) {
      query += ' AND d.status = ?';
      params.push(status);
    }

    query += ` ORDER BY d.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const [docs] = await db.execute(query, params);

    // Count total
    let countQuery = `
      SELECT COUNT(*) as total
      FROM documents d
      LEFT JOIN document_types dt ON dt.id = d.document_type_id
      WHERE d.user_id = ?
    `;
    const countParams = [req.user.id];

    if (search) {
      countQuery += ' AND (d.title LIKE ? OR d.description LIKE ? OR d.category LIKE ? OR dt.name LIKE ?)';
      const s = `%${search}%`;
      countParams.push(s, s, s, s);
    }
    if (category)         { countQuery += ' AND d.category = ?';          countParams.push(category); }
    if (document_type_id) { countQuery += ' AND d.document_type_id = ?';  countParams.push(document_type_id); }
    if (status)           { countQuery += ' AND d.status = ?';            countParams.push(status); }

    const [[{ total }]] = await db.execute(countQuery, countParams);

    res.json({
      success: true,
      data: docs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
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
      `SELECT d.*,
         dt.id   AS document_type_id,
         dt.name AS document_type_name
       FROM documents d
       LEFT JOIN document_types dt ON dt.id = d.document_type_id
       WHERE d.id = ? AND d.user_id = ?`,
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
    const { title, description, category, document_type_id, expiry_date, notes } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: 'Document title is required' });
    }

    // Validate document_type_id if provided
    if (document_type_id) {
      const [dtRows] = await db.execute(
        'SELECT id FROM document_types WHERE id = ? AND is_active = TRUE',
        [document_type_id]
      );
      if (dtRows.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid or inactive document type' });
      }
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
      const diffDays = Math.ceil((new Date(expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) status = 'expired';
      else if (diffDays <= 30) status = 'expiring_soon';
    }

    const [result] = await db.execute(
      `INSERT INTO documents
         (user_id, document_type_id, title, description, category, file_name, file_path, file_type, file_size, expiry_date, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        document_type_id || null,
        title,
        description || null,
        category || null,
        file_name, file_path, file_type, file_size,
        expiry_date || null,
        notes || null,
        status,
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Document created successfully',
      data: { id: result.insertId },
    });
  } catch (error) {
    console.error('Create document error:', error);
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

    const { title, description, category, document_type_id, expiry_date, notes } = req.body;
    const doc = existing[0];

    // Validate document_type_id if provided
    if (document_type_id) {
      const [dtRows] = await db.execute(
        'SELECT id FROM document_types WHERE id = ? AND is_active = TRUE',
        [document_type_id]
      );
      if (dtRows.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid or inactive document type' });
      }
    }

    let file_name = doc.file_name, file_path = doc.file_path, file_type = doc.file_type, file_size = doc.file_size;

    if (req.file) {
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

    // document_type_id: use new value if explicitly passed (even null to clear it), else keep existing
    const newDocumentTypeId = document_type_id !== undefined ? (document_type_id || null) : doc.document_type_id;

    await db.execute(
      `UPDATE documents
       SET title = ?, description = ?, category = ?, document_type_id = ?,
           file_name = ?, file_path = ?, file_type = ?, file_size = ?,
           expiry_date = ?, notes = ?, status = ?
       WHERE id = ? AND user_id = ?`,
      [
        title || doc.title,
        description || null,
        category || null,
        newDocumentTypeId,
        file_name, file_path, file_type, file_size,
        expiry_date || null,
        notes || null,
        status,
        req.params.id,
        req.user.id,
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
