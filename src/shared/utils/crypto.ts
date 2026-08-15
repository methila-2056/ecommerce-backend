import { createHash, randomBytes } from 'node:crypto';

// Cryptographically secure random token for email-verification / password-reset
// flows. The raw token is shown to the user exactly once and never stored;
// only its SHA-256 hash is persisted so a database leak cannot be replayed.
export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
