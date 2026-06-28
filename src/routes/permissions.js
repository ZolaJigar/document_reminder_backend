const express = require('express');
const router = express.Router();

const verifyToken     = require('../middleware/verifyToken');
const checkPermission = require('../middleware/checkPermission');
const {
  listPermission,
  createPermission,
  getPermissionsDetails,
} = require('../controllers/permissionController');

router.post('/list',   verifyToken, checkPermission('permissions_list'),   listPermission);
router.post('/create', verifyToken, checkPermission('permissions_create'), createPermission);
router.post('/detail', verifyToken, checkPermission('permissions_detail'), getPermissionsDetails);

module.exports = router;
