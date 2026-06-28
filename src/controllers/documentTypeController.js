const db = require('../config/database');

// GET /api/document-types — list all active document types
const getDocumentTypes = async (req, res) => {
  try {
    const { include_inactive } = req.query;
    const showAll = include_inactive === 'true';

    const query = showAll
      ? 'SELECT * FROM document_types ORDER BY name ASC'
      : 'SELECT * FROM document_types WHERE is_active = TRUE ORDER BY name ASC';

    const [rows] = await db.execute(query);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Get document types error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET /api/document-types/:id — get a single document type
const getDocumentType = async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM document_types WHERE id = ?',
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Document type not found' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Get document type error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// POST /api/document-types — create a new document type
const createDocumentType = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Document type name is required' });
    }

    // Check for duplicate name
    const [existing] = await db.execute(
      'SELECT id FROM document_types WHERE name = ?',
      [name.trim()]
    );
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Document type with this name already exists' });
    }

    const [result] = await db.execute(
      'INSERT INTO document_types (name, description) VALUES (?, ?)',
      [name.trim(), description ? description.trim() : null]
    );

    const [created] = await db.execute(
      'SELECT * FROM document_types WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Document type created successfully',
      data: created[0],
    });
  } catch (error) {
    console.error('Create document type error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// PUT /api/document-types/:id — update a document type
const updateDocumentType = async (req, res) => {
  try {
    const [existing] = await db.execute(
      'SELECT * FROM document_types WHERE id = ?',
      [req.params.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Document type not found' });
    }

    const { name, description, is_active } = req.body;
    const current = existing[0];

    const newName = name ? name.trim() : current.name;
    const newDescription = description !== undefined ? (description ? description.trim() : null) : current.description;
    const newIsActive = is_active !== undefined ? Boolean(is_active) : current.is_active;

    // Check duplicate name (excluding self)
    if (newName !== current.name) {
      const [dup] = await db.execute(
        'SELECT id FROM document_types WHERE name = ? AND id != ?',
        [newName, req.params.id]
      );
      if (dup.length > 0) {
        return res.status(409).json({ success: false, message: 'Document type with this name already exists' });
      }
    }

    await db.execute(
      'UPDATE document_types SET name = ?, description = ?, is_active = ? WHERE id = ?',
      [newName, newDescription, newIsActive, req.params.id]
    );

    const [updated] = await db.execute(
      'SELECT * FROM document_types WHERE id = ?',
      [req.params.id]
    );

    res.json({
      success: true,
      message: 'Document type updated successfully',
      data: updated[0],
    });
  } catch (error) {
    console.error('Update document type error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// DELETE /api/document-types/:id — delete a document type
const deleteDocumentType = async (req, res) => {
  try {
    const [existing] = await db.execute(
      'SELECT * FROM document_types WHERE id = ?',
      [req.params.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Document type not found' });
    }

    await db.execute('DELETE FROM document_types WHERE id = ?', [req.params.id]);

    res.json({ success: true, message: 'Document type deleted successfully' });
  } catch (error) {
    console.error('Delete document type error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  getDocumentTypes,
  getDocumentType,
  createDocumentType,
  updateDocumentType,
  deleteDocumentType,
};
