// Parses a human-friendly TTL ("15m", "24h", "30d") into milliseconds so the
// same strings used by JWT can also drive expiry dates stored in the database.
const TTL_PATTERN = /^(\d+)([smhd])$/;

export function ttlToMs(ttl: string): number {
  const match = TTL_PATTERN.exec(ttl);
  if (!match) throw new Error(`Invalid TTL format: "${ttl}" (expected e.g. 15m, 24h, 30d)`);
  const value = Number(match[1]);
  const unit = match[2] ?? '';
  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return value * multipliers[unit]!;
}

export function expiresIn(ttl: string): Date {
  return new Date(Date.now() + ttlToMs(ttl));
}
