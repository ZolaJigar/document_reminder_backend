const express = require('express');
const router = express.Router();

const verifyToken      = require('../middleware/verifyToken');
const checkPermission  = require('../middleware/checkPermission');
const {
  listRole,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  roleActive,
  assignRoleToUser,
} = require('../controllers/roleController');

router.post(  '/list',            verifyToken, checkPermission('roles_list'),   listRole);
router.get(   '/:id',             verifyToken, checkPermission('roles_list'),   getRoleById);
router.post(  '/create',          verifyToken, checkPermission('roles_create'), createRole);
router.put(   '/update/:id',      verifyToken, checkPermission('roles_edit'),   updateRole);
router.delete('/delete/:id',      verifyToken, checkPermission('roles_delete'), deleteRole);
router.patch( '/role-active/:id', verifyToken, checkPermission('roles_edit'),   roleActive);
router.put(   '/assign-user',     verifyToken, checkPermission('roles_assign_user'), assignRoleToUser);

module.exports = router;
