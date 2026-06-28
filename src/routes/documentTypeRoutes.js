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
const checkPermission = require('../middleware/checkPermission');

// All routes require authentication
router.use(authenticate);

router.get('/',       checkPermission('document_types_list'),   getDocumentTypes);  // GET    /api/document-types
router.get('/:id',    checkPermission('document_types_detail'), getDocumentType);   // GET    /api/document-types/:id
router.post('/',      checkPermission('document_types_create'), createDocumentType); // POST   /api/document-types
router.put('/:id',    checkPermission('document_types_edit'),   updateDocumentType); // PUT    /api/document-types/:id
router.delete('/:id', checkPermission('document_types_delete'), deleteDocumentType); // DELETE /api/document-types/:id

module.exports = router;
