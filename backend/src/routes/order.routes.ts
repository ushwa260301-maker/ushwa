import { Router } from 'express';
import {
  createOrder,
  getMyOrders,
  getShopOrders,
  getOrderById,
  acceptOrder,
  rejectOrder,
  updateOrderStatus,
  cancelOrder,
} from '../controllers/order.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';

const router = Router();

// Customer routes
router.post('/', authenticate, authorize('customer'), createOrder);
router.get('/my', authenticate, authorize('customer'), getMyOrders);
router.put('/:id/cancel', authenticate, authorize('customer'), cancelOrder);

// Owner routes
router.get('/shop', authenticate, authorize('owner'), getShopOrders);
router.put('/:id/accept', authenticate, authorize('owner'), acceptOrder);
router.put('/:id/reject', authenticate, authorize('owner'), rejectOrder);
router.put('/:id/status', authenticate, authorize('owner'), updateOrderStatus);

// Authenticated (any role)
router.get('/:id', authenticate, getOrderById);

export default router;
