import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Password hashing with scrypt from Node's stdlib — no native dependency
 * (bcrypt/argon2) to build or ship. scrypt is memory-hard and a sound choice for
 * password storage.
 *
 * Stored format:  scrypt$<saltHex>$<hashHex>
 */

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = (await scryptAsync(password, salt, expected.length)) as Buffer;

  // Constant-time compare; lengths must match first or timingSafeEqual throws.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
