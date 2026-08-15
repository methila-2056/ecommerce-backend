import bcrypt from 'bcrypt';

const BCRYPT_COST = 12;

// Password hashing uses bcrypt with a cost factor of 12. bcrypt is memory-hard
// and deliberately slow, which is exactly what you want for passwords: the cost
// makes offline brute-force of a leaked hash database expensive. Cost 12 (~200ms
// per hash on modern hardware) is a reasonable production default.
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}
