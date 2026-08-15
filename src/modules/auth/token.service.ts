import { jwtVerify, SignJWT } from 'jose';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors/AppError.js';
import { isRole, type Role } from '../../types/roles.js';

// Access tokens are short-lived JWTs (HS256). HS256 (not RS256) keeps key
// management trivial for this project; the signing secret is loaded from the
// environment, never hard-coded. Claims carry only what the API needs:
// userId (sub), roles, and the sessionId (sid) that links the access token to
// a refresh session so revocation of a session also invalidates its tokens.
const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export interface AccessTokenPayload {
  userId: string;
  roles: Role[];
  sessionId: string;
}

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  // Copy to a plain array: callers may pass a Mongoose array instance, which
  // jose's claim builder cannot structuredClone.
  const roles = Array.from(payload.roles);
  return new SignJWT({ roles, sid: payload.sessionId, type: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(env.ACCESS_TOKEN_TTL)
    .sign(accessSecret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  try {
    const { payload } = await jwtVerify(token, accessSecret, { algorithms: ['HS256'] });
    const { sub, sid, roles, type } = payload;
    const validRoles =
      Array.isArray(roles) && roles.every((r) => typeof r === 'string' && isRole(r));
    if (type !== 'access' || typeof sub !== 'string' || typeof sid !== 'string' || !validRoles) {
      throw new Error('malformed token payload');
    }
    return { userId: sub, sessionId: sid, roles: roles as Role[] };
  } catch (err) {
    if (err instanceof Error && (err as { code?: string }).code === 'ERR_JWT_EXPIRED') {
      throw AppError.unauthorized('Access token has expired', { errorCode: 'TOKEN_EXPIRED' });
    }
    // A forged, malformed, or wrong-secret token must look identical to the
    // client; only the error code differs so logs stay useful.
    throw AppError.unauthorized('Invalid access token', { errorCode: 'INVALID_TOKEN' });
  }
}
