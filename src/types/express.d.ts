import type { Role } from './roles.js';

declare global {
  namespace Express {
    interface Request {
      // Populated by the `authenticate` middleware from the verified access
      // token. `undefined` means the request was not authenticated.
      user?: {
        userId: string;
        roles: Role[];
        sessionId: string;
      };
    }
  }
}

export {};
