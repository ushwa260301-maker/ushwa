import { Router } from 'express';
import {
  getDashboard,
  getUsers,
  getUserById,
  updateUserStatus,
  getShops,
  approveShop,
  rejectShop,
  suspendShop,
} from '../controllers/admin.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';

const router = Router();

// All routes require admin authentication
router.use(authenticate);
router.use(authorize('admin'));

// Dashboard
router.get('/dashboard', getDashboard);

// User management
router.get('/users', getUsers);
router.get('/users/:id', getUserById);
router.put('/users/:id/status', updateUserStatus);

// Shop management
router.get('/shops', getShops);
router.put('/shops/:id/approve', approveShop);
router.put('/shops/:id/reject', rejectShop);
router.put('/shops/:id/suspend', suspendShop);

export default router;
