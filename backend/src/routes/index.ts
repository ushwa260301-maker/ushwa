import { Router } from 'express';
import authRoutes from './auth.routes';
import shopRoutes from './shop.routes';
import productRoutes from './product.routes';
import orderRoutes from './order.routes';
import reviewRoutes from './review.routes';
import categoryRoutes from './category.routes';
import userRoutes from './user.routes';
import notificationRoutes from './notification.routes';
import adminRoutes from './admin.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/shops', shopRoutes);
router.use('/products', productRoutes);
router.use('/orders', orderRoutes);
router.use('/reviews', reviewRoutes);
router.use('/categories', categoryRoutes);
router.use('/users', userRoutes);
router.use('/notifications', notificationRoutes);
router.use('/admin', adminRoutes);

export default router;
