import { Router } from 'express';
import {
  getProducts,
  getProductById,
  getFeaturedProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} from '../controllers/product.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';

const router = Router();

// Public routes
router.get('/', getProducts);
router.get('/featured', getFeaturedProducts);
router.get('/:id', getProductById);

// Owner routes
router.post('/', authenticate, authorize('owner'), createProduct);
router.put('/:id', authenticate, authorize('owner'), updateProduct);
router.delete('/:id', authenticate, authorize('owner'), deleteProduct);

export default router;
