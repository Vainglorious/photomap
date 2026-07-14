/**
 * Seeds a collection into Blob from a Dropbox folder link or a local folder.
 *
 *   npm run ingest -- --url "<dropbox share link>" --name "World Expo Osaka" \
 *                     --date 2025-07-31 --lat 34.6500 --lng 135.3900
 *   npm run ingest -- --dir ./photos/hongkong --name "Hong Kong" --date 2024-11-29 ...
 *
 * Why a script and not a Vercel route: the Osaka folder is an 872 MB zip. Pulling
 * it, transcoding ~139 images and uploading them cannot fit inside a serverless
 * function's time/memory/tmp limits (photomapplan.md §3.4). The user-facing upload
 * flow does this work in the browser instead; this script is for seeding.
 *
 * Only derivatives are uploaded — never the 6-10 MB originals (§3.3).
 */
import { config } from "dotenv";
import { put } from "@vercel/blob";
import sharp from "sharp";
import exifr from "exifr";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";

import { parseFilename, isPhoto, isVideo } from "../lib/filename";
import { readManifest, writeManifest } from "../lib/manifest";
import { comparePhotos, type Collection, type Photo } from "../lib/types";

config({ path: ".env.local" });
config({ path: ".env" });

const WEB_PX = 2048;
const THUMB_PX = 400;
const UPLOAD_CONCURRENCY = 6;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function required(name: string): string {
  const v = arg(name);
  if (!v) throw new Error(`Missing --${name}`);
  return v;
}

/** Dropbox share links serve the whole folder as a zip when dl=1. No OAuth needed. */
function toDropboxZipUrl(link: string): string {
  const u = new URL(link);
  u.searchParams.set("dl", "1");
  u.searchParams.delete("preview");
  return u.toString();
}

async function downloadFolder(link: string, workDir: string): Promise<string> {
  const zipPath = join(workDir, "folder.zip");
  console.log(`  downloading ${toDropboxZipUrl(link)}`);

  const res = await fetch(toDropboxZipUrl(link), { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(
      `Dropbox returned ${res.status}. Is the link shared publicly? ` +
        `You can also download the folder and pass --dir instead.`,
    );
  }
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(zipPath));

  const outDir = join(workDir, "photos");
  execFileSync("unzip", ["-q", "-o", "-j", zipPath, "-d", outDir]);
  return outDir;
}

async function derive(filePath: string, filename: string): Promise<Photo> {
  const buf = readFileSync(filePath);
  const { order, orderSuffix, caption } = parseFilename(filename);

  // EXIF date is a convenience only: it pre-fills the collection date and orders
  // the un-numbered stragglers. Location is never read from EXIF — pins are chosen
  // by the user (photomapplan.md §1.4).
  let takenAt: string | null = null;
  try {
    const exif = await exifr.parse(buf, { exif: true, tiff: true });
    const d = exif?.DateTimeOriginal ?? exif?.CreateDate;
    if (d instanceof Date && !isNaN(d.valueOf())) takenAt = d.toISOString();
  } catch {
    // Unreadable EXIF is not fatal — the photo still shows.
  }

  const id = randomUUID();
  const base = sharp(buf, { failOn: "none" }).rotate(); // honours EXIF orientation

  const [web, thumb] = await Promise.all([
    base.clone().resize(WEB_PX, WEB_PX, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true }),
    base.clone().resize(THUMB_PX, THUMB_PX, { fit: "inside", withoutEnlargement: true }).webp({ quality: 72 }).toBuffer(),
  ]);

  const [webBlob, thumbBlob] = await Promise.all([
    put(`photos/${id}-web.webp`, web.data, { access: "public", contentType: "image/webp", addRandomSuffix: false }),
    put(`photos/${id}-thumb.webp`, thumb, { access: "public", contentType: "image/webp", addRandomSuffix: false }),
  ]);

  return {
    id,
    webUrl: webBlob.url,
    thumbUrl: thumbBlob.url,
    caption,
    order,
    orderSuffix,
    takenAt,
    width: web.info.width,
    height: web.info.height,
    originalFilename: filename,
  };
}

/** Runs tasks with a fixed concurrency so we don't open 139 sockets at once. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    }),
  );
  return results;
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not set. Run:  vercel link && vercel env pull .env.local");
  }

  const name = required("name");
  const date = required("date");
  const lat = parseFloat(required("lat"));
  const lng = parseFloat(required("lng"));

  const workDir = mkdtempSync(join(tmpdir(), "photomap-"));
  try {
    const dir = arg("dir") ?? (await downloadFolder(required("url"), workDir));
    const entries = readdirSync(dir);

    const photoFiles = entries.filter(isPhoto).sort();
    const videos = entries.filter(isVideo);
    const other = entries.filter((f) => !isPhoto(f) && !isVideo(f));

    console.log(`\n  ${photoFiles.length} photos to ingest`);
    if (videos.length) console.log(`  skipped ${videos.length} videos (not supported in v1): ${videos.join(", ")}`);
    if (other.length) console.log(`  skipped ${other.length} other files: ${other.join(", ")}`);
    if (!photoFiles.length) throw new Error("No photos found in that folder.");

    let done = 0;
    const photos = await mapLimit(photoFiles, UPLOAD_CONCURRENCY, async (f) => {
      const p = await derive(join(dir, f), f);
      done++;
      process.stdout.write(`\r  transcoded + uploaded ${done}/${photoFiles.length}`);
      return p;
    });
    console.log();

    photos.sort(comparePhotos);

    const collection: Collection = {
      id: randomUUID(),
      name,
      date,
      lat,
      lng,
      coverPhotoId: photos[0]?.id ?? null,
      photos,
      createdAt: new Date().toISOString(),
    };

    const manifest = await readManifest();
    const collections = [...manifest.collections.filter((c) => c.name !== name), collection];
    const rev = await writeManifest({ ...manifest, collections }, new Date().toISOString());

    const captioned = photos.filter((p) => p.caption).length;
    console.log(`\n  ✓ "${name}" — ${photos.length} photos (${captioned} captioned, ${photos.length - captioned} blank)`);
    console.log(`    pinned at ${lat}, ${lng} on ${date}`);
    console.log(`    manifest revision: ${rev}`);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}`);
  process.exit(1);
});
