import { Router, Request, Response, NextFunction } from 'express';
import {
  getShops,
  getShopById,
  createShop,
  updateMyShop,
  toggleShopOpen,
  getMyShopAnalytics,
} from '../controllers/shop.controller';
import { getProductsByShop } from '../controllers/product.controller';
import { getShopReviews } from '../controllers/review.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';

const router = Router();

// Owner routes (must come before /:id to avoid 'my' being captured as :id)
router.post('/', authenticate, authorize('owner'), createShop);
router.put('/my', authenticate, authorize('owner'), updateMyShop);
router.put('/my/toggle-open', authenticate, authorize('owner'), toggleShopOpen);
router.get('/my/analytics', authenticate, authorize('owner'), getMyShopAnalytics);

// Public routes
router.get('/', getShops);
router.get('/:id', getShopById);
router.get('/:id/products', getProductsByShop);

// Map :id to :shopId for the review controller
router.get('/:id/reviews', (req: Request, _res: Response, next: NextFunction) => {
  req.params.shopId = req.params.id;
  next();
}, getShopReviews);

export default router;
