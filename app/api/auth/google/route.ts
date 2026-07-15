import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getGoogleAuthUrl, isGoogleConfigured } from "@/lib/google";

/**
 * Starts the Google OAuth flow: mints a CSRF `state`, stashes it in a short-lived
 * cookie, and redirects to Google's consent screen. The callback checks the state.
 */

export const dynamic = "force-dynamic";

const STATE_COOKIE = "g_oauth_state";

function baseUrl(requestUrl: string): string {
  return process.env.APP_URL?.replace(/\/$/, "") || new URL(requestUrl).origin;
}

export async function GET(request: Request) {
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(new URL("/login?error=google_unavailable", baseUrl(request.url)));
  }

  const state = randomUUID();
  const redirectUri = `${baseUrl(request.url)}/api/auth/google/callback`;

  (await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes to complete the round-trip
  });

  return NextResponse.redirect(getGoogleAuthUrl(redirectUri, state));
}
