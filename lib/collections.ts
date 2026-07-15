import { randomUUID } from "node:crypto";
import { sql } from "./db";
import { comparePhotos, type Collection, type Photo } from "./types";

/**
 * Postgres data layer for collections and their photos. This replaces the old
 * Blob manifest as the source of truth for metadata (Blob now stores only the
 * image files). Reads assemble Collection objects in the same shape the map and
 * slideshow already consume, so the UI is unchanged.
 */

/** A photo as posted by the browser after it has uploaded the derivatives to Blob. */
export interface IncomingPhoto {
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

interface PhotoRow {
  id: string;
  collectionId: string;
  webUrl: string;
  thumbUrl: string;
  caption: string;
  /** Postgres returns bigint as a string; coerced back to a number in toPhoto. */
  order: string | number;
  orderSuffix: string;
  takenAt: string | null;
  width: number;
  height: number;
  originalFilename: string;
}

interface CollectionRow {
  id: string;
  name: string;
  date: string;
  lat: number;
  lng: number;
  coverPhotoId: string | null;
  createdAt: string;
}

const COLLECTION_COLS = `
  id, name, to_char(date, 'YYYY-MM-DD') as date, lat, lng,
  cover_photo_id as "coverPhotoId", created_at as "createdAt"`;

const PHOTO_COLS = `
  id, collection_id as "collectionId", web_url as "webUrl", thumb_url as "thumbUrl",
  caption, "order", order_suffix as "orderSuffix", taken_at as "takenAt",
  width, height, original_filename as "originalFilename"`;

function toPhoto(r: PhotoRow): Photo {
  return {
    id: r.id,
    webUrl: r.webUrl,
    thumbUrl: r.thumbUrl,
    caption: r.caption,
    // bigint arrives as a string; the value is always <= MAX_SAFE_INTEGER so Number() is lossless.
    order: Number(r.order),
    orderSuffix: r.orderSuffix,
    takenAt: r.takenAt ? new Date(r.takenAt).toISOString() : null,
    width: r.width,
    height: r.height,
    originalFilename: r.originalFilename,
  };
}

/** All of a user's collections, newest first, each with its photos in author order. */
export async function listCollectionsByUserId(userId: string): Promise<Collection[]> {
  const collections = (await sql.query(
    `select ${COLLECTION_COLS} from collections where user_id = $1 order by date desc`,
    [userId],
  )) as CollectionRow[];

  if (collections.length === 0) return [];

  const ids = collections.map((c) => c.id);
  const photos = (await sql.query(
    `select ${PHOTO_COLS} from photos where collection_id = any($1::uuid[])`,
    [ids],
  )) as PhotoRow[];

  const byCollection = new Map<string, Photo[]>();
  for (const row of photos) {
    const list = byCollection.get(row.collectionId) ?? [];
    list.push(toPhoto(row));
    byCollection.set(row.collectionId, list);
  }

  return collections.map((c) => ({
    id: c.id,
    name: c.name,
    date: c.date,
    lat: c.lat,
    lng: c.lng,
    coverPhotoId: c.coverPhotoId,
    createdAt: new Date(c.createdAt).toISOString(),
    photos: (byCollection.get(c.id) ?? []).sort(comparePhotos),
  }));
}

/**
 * Inserts a collection and its photos for `userId`. Photo ids are minted here so
 * the cover can reference one before the rows exist; photos are sorted into the
 * author's filename order and the first becomes the cover.
 */
export async function createCollection(
  userId: string,
  input: { name: string; date: string; lat: number; lng: number; photos: IncomingPhoto[] },
): Promise<Collection> {
  const built: Photo[] = input.photos
    .map((p) => ({
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
    }))
    .sort(comparePhotos);

  const collectionId = randomUUID();
  const coverPhotoId = built[0]?.id ?? null;

  await sql.query(
    `insert into collections (id, user_id, name, date, lat, lng, cover_photo_id)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [collectionId, userId, input.name.trim().slice(0, 120), input.date, input.lat, input.lng, coverPhotoId],
  );

  // One multi-row insert for all photos.
  const cols = 11;
  const placeholders = built
    .map((_, i) => `(${Array.from({ length: cols }, (_, j) => `$${i * cols + j + 1}`).join(", ")})`)
    .join(", ");
  const values = built.flatMap((p) => [
    p.id,
    collectionId,
    p.webUrl,
    p.thumbUrl,
    p.caption,
    p.order,
    p.orderSuffix,
    p.takenAt,
    p.width,
    p.height,
    p.originalFilename,
  ]);

  await sql.query(
    `insert into photos
       (id, collection_id, web_url, thumb_url, caption, "order", order_suffix, taken_at, width, height, original_filename)
     values ${placeholders}`,
    values,
  );

  return {
    id: collectionId,
    name: input.name.trim().slice(0, 120),
    date: input.date,
    lat: input.lat,
    lng: input.lng,
    coverPhotoId,
    createdAt: new Date().toISOString(),
    photos: built,
  };
}

/**
 * Edits one caption, but only if the photo belongs to a collection `userId` owns.
 * Returns false when the photo doesn't exist or isn't theirs (no leakage of which).
 */
export async function updateCaptionOwned(
  userId: string,
  collectionId: string,
  photoId: string,
  caption: string,
): Promise<boolean> {
  const rows = (await sql.query(
    `update photos p
        set caption = $1
       from collections c
      where p.id = $2
        and p.collection_id = $3
        and c.id = p.collection_id
        and c.user_id = $4
      returning p.id`,
    [caption.slice(0, 500), photoId, collectionId, userId],
  )) as { id: string }[];
  return rows.length > 0;
}
