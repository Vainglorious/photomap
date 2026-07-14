"use client";

import { isHeic, heicTo } from "heic-to";
import exifr from "exifr";
import { parseFilename } from "./filename";

/**
 * Browser-side image pipeline.
 *
 * The photo bytes never touch a Vercel function: a 872 MB folder would blow the
 * execution-time, memory and /tmp limits (photomapplan.md §3.4). Instead the
 * browser decodes, resizes and re-encodes each photo, then uploads the small
 * derivatives straight to Blob. Originals are never uploaded (§3.3).
 */

export const WEB_PX = 2048;
export const THUMB_PX = 400;

export interface Derived {
  web: Blob;
  thumb: Blob;
  width: number;
  height: number;
  takenAt: string | null;
  caption: string;
  order: number;
  orderSuffix: string;
  originalFilename: string;
}

/** Chrome/Firefox can't decode HEIC natively; Safari can. Try native, fall back to wasm. */
async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    if (await isHeic(file)) {
      const jpeg = await heicTo({ blob: file, type: "image/jpeg", quality: 0.92 });
      return await createImageBitmap(jpeg);
    }
    throw new Error(`Could not decode ${file.name}`);
  }
}

function scaleTo(bitmap: ImageBitmap, max: number): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  return { w: Math.round(bitmap.width * scale), h: Math.round(bitmap.height * scale) };
}

async function encode(bitmap: ImageBitmap, max: number, quality: number): Promise<{ blob: Blob; w: number; h: number }> {
  const { w, h } = scaleTo(bitmap, max);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable in this browser.");

  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await canvas.convertToBlob({ type: "image/webp", quality });
  return { blob, w, h };
}

export async function derive(file: File): Promise<Derived> {
  const { order, orderSuffix, caption } = parseFilename(file.name);

  // EXIF date only — location is never read from photos; the pin is the user's choice (§1.4).
  let takenAt: string | null = null;
  try {
    const exif = await exifr.parse(file, { exif: true, tiff: true });
    const d = exif?.DateTimeOriginal ?? exif?.CreateDate;
    if (d instanceof Date && !isNaN(d.valueOf())) takenAt = d.toISOString();
  } catch {
    // No EXIF is fine — the photo still shows.
  }

  const bitmap = await decode(file);
  try {
    const [web, thumb] = await Promise.all([
      encode(bitmap, WEB_PX, 0.8),
      encode(bitmap, THUMB_PX, 0.72),
    ]);

    return {
      web: web.blob,
      thumb: thumb.blob,
      width: web.w,
      height: web.h,
      takenAt,
      caption,
      order,
      orderSuffix,
      originalFilename: file.name,
    };
  } finally {
    bitmap.close(); // a few hundred 4032px bitmaps will exhaust memory if not released
  }
}
