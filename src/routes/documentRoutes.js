const express = require('express');
const router = express.Router();
const {
  getDocuments, getDocument, createDocument, updateDocument,
  deleteDocument, downloadDocument, getCategories,
} = require('../controllers/documentController');
const { authenticate } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

router.use(authenticate);

router.get('/', getDocuments);
router.get('/categories', getCategories);
router.get('/:id', getDocument);
router.post('/', upload.single('file'), createDocument);
router.put('/:id', upload.single('file'), updateDocument);
router.delete('/:id', deleteDocument);
router.get('/:id/download', downloadDocument);

module.exports = router;
