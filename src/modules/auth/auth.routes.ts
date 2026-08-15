import { Router } from 'express';
import { authenticate } from '../../core/middleware/authenticate.js';
import { createRateLimiter } from '../../core/middleware/rate-limit.js';
import { validateBody, validateQuery } from '../../shared/middleware/validate.js';
import * as authController from './auth.controller.js';
import * as validators from './auth.validators.js';

const router = Router();

// Per-endpoint rate limits. Login/registration/password flows are brute-force
// targets, so they get tight budgets keyed on the client IP; the account
// lockout in the service is the second line of defense.
const registerLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  limit: 10,
  message: 'Too many registration attempts, please try again later',
  code: 'REGISTER_RATE_LIMITED',
});
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  limit: 20,
  message: 'Too many login attempts, please try again later',
  code: 'LOGIN_RATE_LIMITED',
});
const forgotPasswordLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  limit: 5,
  message: 'Too many password reset requests, please try again later',
  code: 'PASSWORD_RESET_RATE_LIMITED',
});
const resetPasswordLimiter = createRateLimiter({
  windowMs: 60 * 60_000,
  limit: 10,
  message: 'Too many password reset attempts, please try again later',
  code: 'PASSWORD_RESET_RATE_LIMITED',
});
const resendVerificationLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  limit: 5,
  message: 'Too many verification requests, please try again later',
  code: 'VERIFICATION_RATE_LIMITED',
});
const verifyEmailLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  limit: 20,
  message: 'Too many verification attempts, please try again later',
  code: 'VERIFICATION_RATE_LIMITED',
});

router.post(
  '/register',
  registerLimiter,
  validateBody(validators.registerSchema),
  authController.register,
);
router.post(
  '/verify-email',
  verifyEmailLimiter,
  validateQuery(validators.verifyEmailSchema),
  authController.verifyEmail,
);
router.post(
  '/resend-verification',
  resendVerificationLimiter,
  validateBody(validators.resendVerificationSchema),
  authController.resendVerification,
);
router.post('/login', loginLimiter, validateBody(validators.loginSchema), authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authenticate, authController.logout);
router.post('/logout-all', authenticate, authController.logoutAll);
router.post(
  '/change-password',
  authenticate,
  validateBody(validators.changePasswordSchema),
  authController.changePassword,
);
router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  validateBody(validators.forgotPasswordSchema),
  authController.forgotPassword,
);
router.post(
  '/reset-password',
  resetPasswordLimiter,
  validateBody(validators.resetPasswordSchema),
  authController.resetPassword,
);
router.get('/sessions', authenticate, authController.listSessions);
router.delete('/sessions/:id', authenticate, authController.revokeSession);
router.get('/me', authenticate, authController.getMe);

export default router;
