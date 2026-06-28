const express = require('express');
const router = express.Router();
const {
  getDocuments, getDocument, createDocument, updateDocument,
  deleteDocument, downloadDocument, getCategories,
} = require('../controllers/documentController');
const { authenticate } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const checkPermission = require('../middleware/checkPermission');

router.use(authenticate);

router.get('/',              checkPermission('documents_list'),   getDocuments);
router.get('/categories',    checkPermission('documents_list'),   getCategories);
router.get('/:id',           checkPermission('documents_detail'), getDocument);
router.post('/',             checkPermission('documents_create'), upload.single('file'), createDocument);
router.put('/:id',           checkPermission('documents_edit'),   upload.single('file'), updateDocument);
router.delete('/:id',        checkPermission('documents_delete'), deleteDocument);
router.get('/:id/download',  checkPermission('documents_detail'), downloadDocument);

module.exports = router;
