"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Collection } from "@/lib/types";

/**
 * Photos advance in the author's filename order (1, 2, 3…), not by date — that
 * sequence is a deliberate walkthrough (photomapplan.md §1.3).
 *
 * Captions are editable inline. A photo with no caption shows a placeholder
 * prompt rather than its filename: "6.jpg" is not a title.
 */
export default function Slideshow({
  collection,
  canEdit,
  onClose,
  onCaptionSaved,
}: {
  collection: Collection;
  /** Only the map's owner may edit captions. Visitors see them read-only. */
  canEdit: boolean;
  onClose: () => void;
  onCaptionSaved: (collectionId: string, photoId: string, caption: string) => void;
}) {
  const [i, setI] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const photo = collection.photos[i];
  const count = collection.photos.length;

  const go = useCallback(
    (delta: number) => {
      setEditing(false);
      setSaveError(null);
      setI((prev) => (prev + delta + count) % count);
    },
    [count],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (editing) {
        if (e.key === "Escape") setEditing(false);
        return;
      }
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function startEditing() {
    setDraft(photo.caption);
    setSaveError(null);
    setEditing(true);
  }

  async function save() {
    const caption = draft.trim();
    if (caption === photo.caption) {
      setEditing(false);
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId: collection.id, photoId: photo.id, caption }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Save failed (${res.status})`);

      onCaptionSaved(collection.id, photo.id, caption);
      setEditing(false);
    } catch (e) {
      // Keep the editor open with the user's text intact — never silently lose an edit.
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!photo) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm" onClick={onClose}>
      <header className="flex shrink-0 items-center justify-between gap-4 px-5 py-3 text-sm text-zinc-300">
        <span className="truncate font-medium text-zinc-100">{collection.name}</span>
        <span className="shrink-0 tabular-nums text-zinc-400">
          {i + 1} / {count}
        </span>
        <button
          onClick={onClose}
          className="shrink-0 rounded-md px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          aria-label="Close slideshow"
        >
          ✕
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => go(-1)}
          className="absolute left-3 z-10 grid h-11 w-11 place-items-center rounded-full bg-zinc-900/70 text-xl text-zinc-200 hover:bg-zinc-800"
          aria-label="Previous photo"
        >
          ‹
        </button>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.webUrl}
          alt={photo.caption || `Photo ${i + 1} of ${count}`}
          width={photo.width}
          height={photo.height}
          className="max-h-full max-w-full rounded-lg object-contain"
        />

        <button
          onClick={() => go(1)}
          className="absolute right-3 z-10 grid h-11 w-11 place-items-center rounded-full bg-zinc-900/70 text-xl text-zinc-200 hover:bg-zinc-800"
          aria-label="Next photo"
        >
          ›
        </button>
      </div>

      <footer
        className="shrink-0 px-6 pb-6 pt-4 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {editing ? (
          <div className="mx-auto max-w-2xl">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void save();
                }
              }}
              rows={2}
              placeholder="Describe this photo…"
              className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-center text-zinc-100 outline-none focus:border-zinc-500"
            />
            <div className="mt-2 flex items-center justify-center gap-2 text-xs">
              <button
                onClick={() => void save()}
                disabled={saving}
                className="rounded-md bg-zinc-100 px-3 py-1.5 font-medium text-zinc-900 hover:bg-white disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="rounded-md px-3 py-1.5 text-zinc-400 hover:text-zinc-100"
              >
                Cancel
              </button>
              <span className="text-zinc-600">Enter to save · Shift+Enter for a new line</span>
            </div>
            {saveError && <p className="mt-2 text-xs text-red-400">{saveError}</p>}
          </div>
        ) : canEdit ? (
          <button
            onClick={startEditing}
            className="mx-auto block max-w-2xl rounded-md px-3 py-1.5 text-left hover:bg-zinc-900"
            title="Click to edit"
          >
            {photo.caption ? (
              <span className="text-zinc-100">{photo.caption}</span>
            ) : (
              <span className="text-zinc-500 italic">Add a description…</span>
            )}
          </button>
        ) : (
          // Visitor: captions are read-only; an empty one simply shows nothing.
          photo.caption && <p className="mx-auto max-w-2xl px-3 py-1.5 text-zinc-100">{photo.caption}</p>
        )}
      </footer>
    </div>
  );
}
