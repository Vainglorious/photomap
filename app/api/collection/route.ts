import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readManifest, writeManifest } from "@/lib/manifest";
import { comparePhotos, type Collection, type Photo } from "@/lib/types";

/**
 * Records a collection after the browser has uploaded every derivative.
 * Only metadata crosses this route — a few KB of JSON, never image bytes.
 */

interface IncomingPhoto {
  webUrl: string;
  thumbUrl: string;
  caption: string;
  order: number;
  orderSuffix: string;
  takenAt: string | null;
  width: number;
  height: number;
  originalFilename: string;
}

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

  const built: Photo[] = photos.map((p) => ({
    id: randomUUID(),
    webUrl: p.webUrl,
    thumbUrl: p.thumbUrl,
    caption: (p.caption ?? "").slice(0, 500),
    order: p.order,
    orderSuffix: p.orderSuffix ?? "",
    takenAt: p.takenAt ?? null,
    width: p.width,
    height: p.height,
    originalFilename: p.originalFilename,
  }));

  built.sort(comparePhotos);

  const collection: Collection = {
    id: randomUUID(),
    name: name.trim().slice(0, 120),
    date,
    lat,
    lng,
    coverPhotoId: built[0]?.id ?? null,
    photos: built,
    createdAt: new Date().toISOString(),
  };

  const manifest = await readManifest();
  const rev = await writeManifest(
    { ...manifest, collections: [...manifest.collections, collection] },
    new Date().toISOString(),
  );

  return NextResponse.json({ collection, rev });
}
