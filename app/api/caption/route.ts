import { NextResponse } from "next/server";
import { readManifest, writeManifest } from "@/lib/manifest";

/**
 * Edits one photo's caption.
 *
 * Writes are unauthenticated by decision (photomapplan.md §6), so this route is
 * deliberately narrow: it can only change a caption on a photo that already
 * exists. It cannot create, delete, or move anything. Every write also lands as
 * a new immutable manifest revision, so a bad edit is a rollback, not a loss.
 */

const MAX_CAPTION = 500;

// Serialises read-modify-write within one instance. Concurrent edits across
// instances can still interleave; the versioned manifest is what makes that survivable.
let queue: Promise<unknown> = Promise.resolve();

export async function POST(req: Request) {
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

  const run = queue.then(async () => {
    const manifest = await readManifest();

    const collection = manifest.collections.find((c) => c.id === collectionId);
    if (!collection) throw Object.assign(new Error("No such collection"), { status: 404 });

    const photo = collection.photos.find((p) => p.id === photoId);
    if (!photo) throw Object.assign(new Error("No such photo"), { status: 404 });

    if (photo.caption === caption) return { caption, rev: null };

    const next = {
      ...manifest,
      collections: manifest.collections.map((c) =>
        c.id !== collectionId
          ? c
          : { ...c, photos: c.photos.map((p) => (p.id === photoId ? { ...p, caption } : p)) },
      ),
    };

    const rev = await writeManifest(next, new Date().toISOString());
    return { caption, rev };
  });

  queue = run.catch(() => {}); // a failed edit must not wedge the queue

  try {
    return NextResponse.json(await run);
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Save failed" }, { status });
  }
}
