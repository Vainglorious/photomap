import { SignJWT, jwtVerify } from "jose";

/**
 * Stateless sessions: a signed JWT carried in an httpOnly cookie. This file holds
 * only the encrypt/decrypt primitives and the cookie name — no `next/headers`,
 * no database — so it is safe to import from BOTH server code and `proxy.ts`
 * (which reads the cookie off the request directly).
 *
 * Cookie writing/reading via `next/headers` lives in lib/dal.ts.
 */

export const SESSION_COOKIE = "photomap_session";
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 7; // 7 days

export interface SessionPayload {
  userId: string;
  /** Denormalised so proxy.ts can route without a DB hit. Re-minted when the
   *  user picks a username, so it never stays stale. Null until then. */
  username: string | null;
  [key: string]: unknown; // jose JWTPayload index signature
}

const secret = process.env.SESSION_SECRET;
if (!secret) {
  throw new Error("SESSION_SECRET is not set — add it to .env.local (see .env.example).");
}
const key = new TextEncoder().encode(secret);

export async function encryptSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key);
}

export async function decryptSession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (typeof payload.userId !== "string") return null;
    return {
      userId: payload.userId,
      username: typeof payload.username === "string" ? payload.username : null,
    };
  } catch {
    // Expired or tampered token — treat as logged out.
    return null;
  }
}
