import type { RequestHandler } from 'express';
import { AppError } from '../../shared/errors/AppError.js';
import type { Role } from '../../types/roles.js';

// Role-based access control. Must run after `authenticate` (which guarantees
// `req.user` exists). A user passes if any of their roles is in the allow-list.
export function authorize(...allowedRoles: Role[]): RequestHandler {
  return (req, _res, next) => {
    const user = req.user;
    if (!user) {
      next(AppError.unauthorized('Authentication required', { errorCode: 'MISSING_TOKEN' }));
      return;
    }
    if (!user.roles.some((role) => allowedRoles.includes(role))) {
      next(
        AppError.forbidden('You do not have permission to perform this action', {
          errorCode: 'INSUFFICIENT_PERMISSIONS',
        }),
      );
      return;
    }
    next();
  };
}
