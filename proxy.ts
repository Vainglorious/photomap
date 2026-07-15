import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE, decryptSession } from "@/lib/session";

/**
 * Optimistic auth routing (this Next.js renamed `middleware` → `proxy`).
 *
 * Proxy only reads the signed session cookie — no database — so it stays fast and
 * runs on every navigation. It handles the two redirects that improve UX:
 *   - logged-in users shouldn't see /login or /signup
 *   - /welcome (pick-a-username) requires a session, and is pointless once chosen
 *
 * Everything else, including public /<username> maps, passes through. The real
 * security checks live in the pages, server actions, and API routes.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await decryptSession(request.cookies.get(SESSION_COOKIE)?.value);

  const dest = (path: string) => NextResponse.redirect(new URL(path, request.url));

  if (session) {
    const home = session.username ? `/${session.username}` : "/welcome";
    if (pathname === "/login" || pathname === "/signup") return dest(home);
    if (pathname === "/welcome" && session.username) return dest(home);
  } else if (pathname === "/welcome") {
    return dest("/login");
  }

  return NextResponse.next();
}

export const config = {
  // Run on pages, not on API routes, Next internals, or static assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
