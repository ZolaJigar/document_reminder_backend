const express = require('express');
const router = express.Router();
const {
  getDocumentTypes,
  getDocumentType,
  createDocumentType,
  updateDocumentType,
  deleteDocumentType,
} = require('../controllers/documentTypeController');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

router.get('/', getDocumentTypes);         // GET  /api/document-types
router.get('/:id', getDocumentType);       // GET  /api/document-types/:id
router.post('/', createDocumentType);      // POST /api/document-types
router.put('/:id', updateDocumentType);    // PUT  /api/document-types/:id
router.delete('/:id', deleteDocumentType); // DELETE /api/document-types/:id

module.exports = router;
