import { NextResponse } from "next/server";
import { getSession } from "@/lib/dal";
import { updateCaptionOwned } from "@/lib/collections";

/**
 * Edits one photo's caption. Two guards: the caller must be logged in, and the
 * photo must belong to a collection they own (enforced in the UPDATE's WHERE
 * clause, so a stranger's photo id simply matches nothing).
 */

const MAX_CAPTION = 500;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "You must be logged in." }, { status: 401 });

  let body: { collectionId?: string; photoId?: string; caption?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { collectionId, photoId, caption } = body;
  if (!collectionId || !photoId || typeof caption !== "string") {
    return NextResponse.json({ error: "collectionId, photoId and caption are required" }, { status: 400 });
  }
  if (caption.length > MAX_CAPTION) {
    return NextResponse.json({ error: `Caption is too long (max ${MAX_CAPTION} characters)` }, { status: 400 });
  }

  try {
    const ok = await updateCaptionOwned(session.userId, collectionId, photoId, caption);
    if (!ok) return NextResponse.json({ error: "No such photo, or not yours to edit" }, { status: 404 });
    return NextResponse.json({ caption });
  } catch {
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}
