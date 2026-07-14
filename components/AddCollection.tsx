"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import exifr from "exifr";

import { derive } from "@/lib/imaging";
import { isPhoto, isVideo } from "@/lib/filename";
import type { Collection } from "@/lib/types";

/** Two at a time: enough to keep the network busy, few enough that 4032px bitmaps don't exhaust memory. */
const CONCURRENCY = 2;

interface Props {
  pin: { lat: number; lng: number } | null;
  placing: boolean;
  onPlacePin: () => void;
  onCreated: (c: Collection) => void;
  onClose: () => void;
}

type Phase = "idle" | "working" | "done";

export default function AddCollection({ pin, placing, onPlacePin, onCreated, onClose }: Props) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    const photos = picked.filter((f) => isPhoto(f.name));
    const others = picked.filter((f) => !isPhoto(f.name));

    setFiles(photos);
    setSkipped(others.map((f) => f.name));
    setError(null);

    if (!name && picked.length) {
      // The folder name is a decent first guess at the collection name.
      const rel = (picked[0] as File & { webkitRelativePath?: string }).webkitRelativePath;
      if (rel?.includes("/")) setName(rel.split("/")[0]);
    }

    // Pre-fill the date from the earliest photo's EXIF. It's a suggestion; the user confirms it.
    if (photos.length && !date) {
      const dates = await Promise.all(
        photos.slice(0, 12).map(async (f) => {
          try {
            const x = await exifr.parse(f, { exif: true, tiff: true });
            const d = x?.DateTimeOriginal ?? x?.CreateDate;
            return d instanceof Date && !isNaN(d.valueOf()) ? d : null;
          } catch {
            return null;
          }
        }),
      );
      const earliest = dates.filter(Boolean).sort((a, b) => a!.valueOf() - b!.valueOf())[0];
      if (earliest) setDate(earliest.toISOString().slice(0, 10));
    }
  }

  async function submit() {
    if (!name.trim()) return setError("Give the collection a name.");
    if (!date) return setError("Pick a date.");
    if (!pin) return setError("Place the pin on the map.");
    if (!files.length) return setError("Choose a folder of photos.");

    setPhase("working");
    setError(null);
    setDone(0);
    setFailed([]);

    const uploaded: unknown[] = [];
    const failures: string[] = [];
    let next = 0;

    async function worker() {
      while (next < files.length) {
        const file = files[next++];
        try {
          const d = await derive(file);
          const id = crypto.randomUUID();

          const [web, thumb] = await Promise.all([
            upload(`photos/${id}-web.webp`, d.web, { access: "public", handleUploadUrl: "/api/upload" }),
            upload(`photos/${id}-thumb.webp`, d.thumb, { access: "public", handleUploadUrl: "/api/upload" }),
          ]);

          uploaded.push({
            webUrl: web.url,
            thumbUrl: thumb.url,
            caption: d.caption,
            order: d.order,
            orderSuffix: d.orderSuffix,
            takenAt: d.takenAt,
            width: d.width,
            height: d.height,
            originalFilename: d.originalFilename,
          });
        } catch {
          // One unreadable photo shouldn't sink a 139-photo upload — record it and carry on.
          failures.push(file.name);
        } finally {
          setDone((n) => n + 1);
        }
      }
    }

    try {
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));

      if (!uploaded.length) throw new Error("Every photo failed to upload.");

      const res = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), date, lat: pin.lat, lng: pin.lng, photos: uploaded }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Failed (${res.status})`);

      const { collection } = await res.json();
      setFailed(failures);
      setPhase("done");
      onCreated(collection);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setPhase("idle");
    }
  }

  const pct = files.length ? Math.round((done / files.length) * 100) : 0;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/80 p-4 text-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">New collection</h2>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200" aria-label="Cancel">
          ✕
        </button>
      </div>

      {phase === "done" ? (
        <div className="flex flex-col gap-2">
          <p className="text-emerald-400">✓ “{name}” is on the map.</p>
          {failed.length > 0 && (
            <p className="text-xs text-amber-300">
              {failed.length} photo{failed.length === 1 ? "" : "s"} could not be read and {failed.length === 1 ? "was" : "were"} skipped:{" "}
              {failed.slice(0, 3).join(", ")}
              {failed.length > 3 ? "…" : ""}
            </p>
          )}
          <button onClick={onClose} className="rounded-md bg-zinc-100 px-3 py-1.5 font-medium text-zinc-900 hover:bg-white">
            Done
          </button>
        </div>
      ) : phase === "working" ? (
        <div className="flex flex-col gap-2">
          <p className="text-zinc-300">
            Transcoding and uploading… {done} / {files.length}
          </p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-zinc-500">
            This happens in your browser — keep the tab open. Large folders take a few minutes.
          </p>
        </div>
      ) : (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Collection name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="World Expo Osaka"
              className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 outline-none focus:border-zinc-500"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 outline-none focus:border-zinc-500"
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Pin location</span>
            <button
              onClick={onPlacePin}
              className={`rounded-md border px-2 py-1.5 text-left ${
                placing
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                  : "border-zinc-700 bg-zinc-950 hover:border-zinc-500"
              }`}
            >
              {placing
                ? "Click anywhere on the map…"
                : pin
                  ? `${pin.lat.toFixed(4)}, ${pin.lng.toFixed(4)} — click to move`
                  : "Click the map to place the pin"}
            </button>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Photos</span>
            <input
              ref={inputRef}
              type="file"
              multiple
              // @ts-expect-error — non-standard but supported in every major browser
              webkitdirectory=""
              directory=""
              onChange={onPick}
              className="text-xs file:mr-2 file:rounded-md file:border-0 file:bg-zinc-800 file:px-2 file:py-1 file:text-zinc-200"
            />
            {files.length > 0 && (
              <p className="text-xs text-zinc-400">
                {files.length} photo{files.length === 1 ? "" : "s"} ready
                {skipped.length > 0 && `, ${skipped.length} non-photo file${skipped.length === 1 ? "" : "s"} skipped`}
              </p>
            )}
            {skipped.some(isVideo) && (
              <p className="text-xs text-zinc-500">Videos aren’t supported yet — they’ll be left out.</p>
            )}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            onClick={() => void submit()}
            className="rounded-md bg-zinc-100 px-3 py-2 font-medium text-zinc-900 hover:bg-white"
          >
            Create collection
          </button>
        </>
      )}
    </div>
  );
}
