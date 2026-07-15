import { NextResponse } from "next/server";
import { isUsernameTaken } from "@/lib/users";
import { firstError, usernameSchema } from "@/lib/validation";

/**
 * Live availability check for the username modal. Public and read-only: it only
 * ever reveals whether a handle is free — the same thing visiting /<username>
 * would tell you. The server action re-validates on submit.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const u = new URL(request.url).searchParams.get("u") ?? "";

  const parsed = usernameSchema.safeParse(u);
  if (!parsed.success) {
    return NextResponse.json({ available: false, reason: firstError(parsed.error) });
  }

  const taken = await isUsernameTaken(parsed.data);
  return NextResponse.json({ available: !taken });
}
