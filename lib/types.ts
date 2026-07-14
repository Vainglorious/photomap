/**
 * Shape of the metadata manifest stored in Vercel Blob.
 *
 * Every write publishes a NEW immutable revision under `manifest/<iso>.json`
 * and repoints `manifest/latest.json` at it. See photomapplan.md §6.1 — with
 * public writes and whole-file rewrites, versioning is what makes a bad edit
 * recoverable instead of permanent.
 */

export interface Photo {
  id: string;
  /** URL of the 2048px webp shown in the slideshow. */
  webUrl: string;
  /** URL of the 400px webp used in grids/hover. */
  thumbUrl: string;
  /** Editable. Empty string means "no caption yet" — never show the filename. */
  caption: string;
  /** Leading number in the filename: the author's running order. */
  order: number;
  /** Sub-index for names like "57b" — sorts after 57, before 58. */
  orderSuffix: string;
  /** EXIF DateTimeOriginal, ISO 8601. Null if absent. */
  takenAt: string | null;
  width: number;
  height: number;
  originalFilename: string;
}

export interface Collection {
  id: string;
  name: string;
  /** The single date this pin carries on the timeline. ISO yyyy-mm-dd. */
  date: string;
  /** Pin position — chosen by the user, never derived from photo EXIF. */
  lat: number;
  lng: number;
  /** Photo id used as the pin's preview image. */
  coverPhotoId: string | null;
  photos: Photo[];
  createdAt: string;
}

export interface Manifest {
  version: 1;
  collections: Collection[];
  updatedAt: string;
}

export const EMPTY_MANIFEST: Manifest = {
  version: 1,
  collections: [],
  updatedAt: "1970-01-01T00:00:00.000Z",
};

/** Photos sort by their filename number, then sub-index; un-numbered photos go last, by date. */
export function comparePhotos(a: Photo, b: Photo): number {
  if (a.order !== b.order) return a.order - b.order;
  if (a.orderSuffix !== b.orderSuffix) return a.orderSuffix.localeCompare(b.orderSuffix);
  return (a.takenAt ?? "").localeCompare(b.takenAt ?? "");
}
