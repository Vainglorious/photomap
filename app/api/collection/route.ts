import { NextResponse } from "next/server";
import { getSession } from "@/lib/dal";
import { createCollection, type IncomingPhoto } from "@/lib/collections";

/**
 * Records a collection after the browser has uploaded every derivative. Only
 * metadata crosses this route — a few KB of JSON, never image bytes.
 *
 * Writes are now scoped to the signed-in user: the collection is created under
 * their account and shows up only on their /<username> map.
 */

const BLOB_HOST = /\.public\.blob\.vercel-storage\.com$/;

/** A caller could otherwise point a "photo" at any URL on the internet. */
function isOurBlob(url: string): boolean {
  try {
    return BLOB_HOST.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "You must be logged in." }, { status: 401 });

  let body: { name?: string; date?: string; lat?: number; lng?: number; photos?: IncomingPhoto[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, date, lat, lng, photos } = body;

  if (!name?.trim()) return NextResponse.json({ error: "A collection name is required" }, { status: 400 });
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "A date (YYYY-MM-DD) is required" }, { status: 400 });
  }
  if (typeof lat !== "number" || typeof lng !== "number" || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "A valid pin location is required" }, { status: 400 });
  }
  if (!Array.isArray(photos) || photos.length === 0) {
    return NextResponse.json({ error: "A collection needs at least one photo" }, { status: 400 });
  }
  if (!photos.every((p) => isOurBlob(p.webUrl) && isOurBlob(p.thumbUrl))) {
    return NextResponse.json({ error: "Photo URLs must point at this app's Blob store" }, { status: 400 });
  }

  try {
    const collection = await createCollection(session.userId, { name, date, lat, lng, photos });
    return NextResponse.json({ collection });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not save the collection" },
      { status: 500 },
    );
  }
}
