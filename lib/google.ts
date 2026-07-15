import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Minimal Google OAuth 2.0 (authorization code) flow — no third-party auth
 * library. Two steps:
 *   1. getGoogleAuthUrl() → redirect the user to Google's consent screen.
 *   2. exchangeCode() on the callback → swap the code for tokens, verify the
 *      id_token against Google's public keys, and return the profile.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function credentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google sign-in isn't configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).");
  }
  return { clientId, clientSecret };
}

export function getGoogleAuthUrl(redirectUri: string, state: string): string {
  const { clientId } = credentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/** Exchanges the authorization code for a verified Google profile. */
export async function exchangeCode(code: string, redirectUri: string): Promise<GoogleProfile> {
  const { clientId, clientSecret } = credentials();

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status}).`);
  }

  const tokens = (await res.json()) as { id_token?: string };
  if (!tokens.id_token) throw new Error("Google did not return an id_token.");

  // Verify signature, issuer, and audience against Google's published keys.
  const { payload } = await jwtVerify(tokens.id_token, JWKS, {
    issuer: ISSUERS,
    audience: clientId,
  });

  if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
    throw new Error("Google id_token is missing required claims.");
  }

  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === "string" ? payload.name : null,
    picture: typeof payload.picture === "string" ? payload.picture : null,
  };
}
