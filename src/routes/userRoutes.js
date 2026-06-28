const express = require('express');
const router = express.Router();
const {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  toggleUserStatus,
} = require('../controllers/userController');
const { authenticate, isAdmin } = require('../middleware/auth');

// All user-management routes require a valid JWT + admin flag
router.use(authenticate, isAdmin);

router.get('/', getUsers);                          // GET    /api/users
router.get('/:id', getUser);                        // GET    /api/users/:id
router.post('/', createUser);                       // POST   /api/users
router.put('/:id', updateUser);                     // PUT    /api/users/:id
router.delete('/:id', deleteUser);                  // DELETE /api/users/:id
router.patch('/:id/toggle-status', toggleUserStatus); // PATCH  /api/users/:id/toggle-status

module.exports = router;
