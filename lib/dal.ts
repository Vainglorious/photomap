import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
  decryptSession,
  encryptSession,
  type SessionPayload,
} from "./session";
import { getUserById, type User } from "./users";

/**
 * Data Access Layer: the single place server code reads the current session and
 * user. Cookie writing/reading uses `next/headers`, so this must never be
 * imported by `proxy.ts` (which reads the cookie off the request instead).
 *
 * `cache()` memoises per-request so repeated calls in one render don't re-hit
 * the cookie store or the database.
 */

/** Sets/refreshes the session cookie. Called on login, signup, and username set. */
export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await encryptSession(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/** The decoded session payload, or null if logged out. Does not hit the DB. */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return decryptSession(token);
});

/** The full current user from the DB, or null. Use when you need real user data. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const session = await getSession();
  if (!session) return null;
  return getUserById(session.userId);
});
