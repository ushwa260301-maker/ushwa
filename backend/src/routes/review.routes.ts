import { Router } from 'express';
import {
  createReview,
  getShopReviews,
  getMyReviews,
  replyToReview,
  deleteReview,
} from '../controllers/review.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';

const router = Router();

// Customer routes
router.post('/', authenticate, authorize('customer'), createReview);
router.get('/my', authenticate, authorize('customer'), getMyReviews);
router.delete('/:id', authenticate, authorize('customer'), deleteReview);

// Public
router.get('/shop/:shopId', getShopReviews);

// Owner routes
router.post('/:id/reply', authenticate, authorize('owner'), replyToReview);

export default router;
