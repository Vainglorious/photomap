import { put, list } from "@vercel/blob";
import { EMPTY_MANIFEST, type Manifest } from "./types";

/**
 * Versioned metadata store on top of Vercel Blob.
 *
 * Blob has no query layer, so all metadata lives in one JSON file. Because the
 * app also accepts unauthenticated writes, a plain overwrite would let one bad
 * request destroy every collection's captions with no way back. So each write
 * publishes an immutable revision and moves a pointer:
 *
 *   manifest/rev/2026-07-14T15-02-11-233Z.json   <- immutable, kept forever (a few KB)
 *   manifest/latest.json                         <- { "rev": "manifest/rev/…json" }
 *
 * Rolling back a bad edit = pointing latest.json at an older revision.
 */

const LATEST_KEY = "manifest/latest.json";
const REV_PREFIX = "manifest/rev/";

interface LatestPointer {
  rev: string;
}

/** Blob URLs are CDN-cached; metadata must never be served stale. */
const NO_CACHE: RequestInit = { cache: "no-store" };

async function resolveLatestUrl(): Promise<string | null> {
  // list() is authoritative (the pointer's own URL is stable, but we look it up
  // rather than hardcode the store's public hostname).
  const { blobs } = await list({ prefix: LATEST_KEY, limit: 1 });
  return blobs[0]?.url ?? null;
}

export async function readManifest(): Promise<Manifest> {
  const pointerUrl = await resolveLatestUrl();
  if (!pointerUrl) return EMPTY_MANIFEST;

  const pointer: LatestPointer = await fetch(pointerUrl, NO_CACHE).then((r) => r.json());

  const { blobs } = await list({ prefix: pointer.rev, limit: 1 });
  if (!blobs[0]) return EMPTY_MANIFEST;

  return fetch(blobs[0].url, NO_CACHE).then((r) => r.json());
}

/** Publishes a new immutable revision and repoints latest.json at it. */
export async function writeManifest(manifest: Manifest, timestamp: string): Promise<string> {
  const next: Manifest = { ...manifest, updatedAt: timestamp };
  const revKey = `${REV_PREFIX}${timestamp.replace(/[:.]/g, "-")}.json`;

  await put(revKey, JSON.stringify(next, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    cacheControlMaxAge: 31536000, // immutable — never changes once written
  });

  await put(LATEST_KEY, JSON.stringify({ rev: revKey } satisfies LatestPointer), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  });

  return revKey;
}

/** Revision keys, newest first — the rollback menu. */
export async function listRevisions(): Promise<string[]> {
  const { blobs } = await list({ prefix: REV_PREFIX });
  return blobs.map((b) => b.pathname).sort().reverse();
}

export async function rollbackTo(revKey: string): Promise<void> {
  const { blobs } = await list({ prefix: revKey, limit: 1 });
  if (!blobs[0]) throw new Error(`No such revision: ${revKey}`);

  await put(LATEST_KEY, JSON.stringify({ rev: revKey } satisfies LatestPointer), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  });
}
