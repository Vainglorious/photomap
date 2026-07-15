import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createSession } from "@/lib/dal";
import { exchangeCode, isGoogleConfigured } from "@/lib/google";
import { upsertGoogleUser } from "@/lib/users";

/**
 * Google OAuth callback: verifies the CSRF state, exchanges the code for a
 * verified profile, upserts the user, starts a session, and routes onward —
 * to /welcome if they still need a username, else to their map.
 */

export const dynamic = "force-dynamic";

const STATE_COOKIE = "g_oauth_state";

function baseUrl(requestUrl: string): string {
  return process.env.APP_URL?.replace(/\/$/, "") || new URL(requestUrl).origin;
}

export async function GET(request: Request) {
  const base = baseUrl(request.url);
  const fail = (reason: string) => NextResponse.redirect(new URL(`/login?error=${reason}`, base));

  if (!isGoogleConfigured()) return fail("google_unavailable");

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  if (url.searchParams.get("error")) return fail("google_denied");
  if (!code || !state || !expectedState || state !== expectedState) return fail("google_state");

  let user;
  try {
    const profile = await exchangeCode(code, `${base}/api/auth/google/callback`);
    if (!profile.emailVerified) return fail("google_unverified");

    user = await upsertGoogleUser({
      googleSub: profile.sub,
      email: profile.email,
      name: profile.name,
      image: profile.picture,
    });
  } catch {
    return fail("google_failed");
  }

  await createSession({ userId: user.id, username: user.username });
  return NextResponse.redirect(new URL(user.username ? `/${user.username}` : "/welcome", base));
}
