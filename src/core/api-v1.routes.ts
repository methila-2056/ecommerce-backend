import { Router } from 'express';
import authRouter from '../modules/auth/auth.routes.js';
import userRouter from '../modules/user/user.routes.js';
import catalogRouter from '../modules/catalog/catalog.routes.js';
import inventoryRouter from '../modules/inventory/inventory.routes.js';
import cartRouter from '../modules/cart/cart.routes.js';
import orderRouter from '../modules/order/order.routes.js';
import couponRouter from '../modules/coupon/coupon.routes.js';
import notificationRouter from '../modules/notification/notification.routes.js';
import paymentRouter from '../modules/payment/payment.routes.js';
import wishlistRouter from '../modules/wishlist/wishlist.routes.js';
import reviewRouter from '../modules/review/review.routes.js';
import adminRouter from '../modules/admin/admin.routes.js';
import docsRouter from './docs.routes.js';

// Aggregates all versioned module routers under /api/v1. New modules mount
// their router here as they are implemented.
const router = Router();

router.use('/auth', authRouter);
router.use('/users', userRouter);
router.use('/', catalogRouter);
router.use('/inventory', inventoryRouter);
router.use('/cart', cartRouter);
router.use('/orders', orderRouter);
router.use('/coupons', couponRouter);
router.use('/notifications', notificationRouter);
router.use('/payments', paymentRouter);
router.use('/wishlist', wishlistRouter);
// Review routes share the /products path prefix with the catalog, so the
// review router must be mounted AFTER it (both routers only handle their own
// segment shapes and fall through otherwise).
router.use('/', reviewRouter);
router.use('/admin', adminRouter);

// Interactive API documentation (Swagger UI at /api/v1/docs).
router.use(docsRouter);

export default router;
