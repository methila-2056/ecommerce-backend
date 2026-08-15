import type { RequestHandler } from 'express';
import { verifyAccessToken } from '../../modules/auth/token.service.js';
import { User } from '../../modules/user/user.model.js';
import { AppError } from '../../shared/errors/AppError.js';
import type { Role } from '../../types/roles.js';

interface TokenPayload {
  userId: string;
  roles: Role[];
  sessionId: string;
  iat?: number;
}

// Requires a valid Bearer access token and attaches the verified identity to
// `req.user`. Beyond signature/expiry we re-load the user so that:
//   1. A suspended/deactivated account is blocked immediately, even if an
//      access token is still within its 15-minute lifetime.
//   2. Role changes take effect on the next request (roles are authoritative
//      from the database, never from a possibly-stale token).
//   3. Access tokens issued before a password change are rejected, so stolen
//      pre-change tokens are worthless after a compromise is remediated.
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(AppError.unauthorized('Authentication required', { errorCode: 'MISSING_TOKEN' }));
    return;
  }

  try {
    const payload: TokenPayload = await verifyAccessToken(header.slice('Bearer '.length));

    const user = await User.findById(payload.userId).lean();
    if (!user || user.status !== 'active') {
      next(
        AppError.unauthorized('Account is not active', {
          errorCode: user && user.status !== 'active' ? 'ACCOUNT_DISABLED' : 'INVALID_TOKEN',
        }),
      );
      return;
    }

    const tokenIssuedAtSec = payload.iat ?? 0;
    const passwordChangedAtSec = user.passwordChangedAt
      ? Math.floor(user.passwordChangedAt.getTime() / 1000)
      : 0;
    if (tokenIssuedAtSec < passwordChangedAtSec) {
      next(
        AppError.unauthorized('Access token is no longer valid', {
          errorCode: 'TOKEN_REVOKED',
        }),
      );
      return;
    }

    req.user = { userId: payload.userId, roles: user.roles, sessionId: payload.sessionId };
    next();
  } catch (err) {
    next(err);
  }
};
