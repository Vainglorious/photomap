"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { basemapStyle } from "@/lib/basemap";
import type { Collection } from "@/lib/types";
import Slideshow from "./Slideshow";

type SortDir = "newest" | "oldest";

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export default function MapView({
  collections,
  loadError,
}: {
  collections: Collection[];
  loadError: string | null;
}) {
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  const [openId, setOpenId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortDir>("newest");
  const [live, setLive] = useState<Collection[]>(collections);

  const sorted = useMemo(() => {
    const c = [...live];
    c.sort((a, b) => (sort === "newest" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
    return c;
  }, [live, sort]);

  const open = live.find((c) => c.id === openId) ?? null;

  // Map is created once; `hash: true` keeps #zoom/lat/lng in the URL so views are shareable.
  useEffect(() => {
    if (!mapNode.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapNode.current,
      style: basemapStyle,
      center: [20, 25],
      zoom: 1.6,
      hash: true,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Rebuild pins whenever the collections change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = live.map((c) => {
      const cover = c.photos.find((p) => p.id === c.coverPhotoId) ?? c.photos[0];

      const el = document.createElement("button");
      el.className = "pin";
      el.setAttribute("aria-label", `${c.name} — ${c.photos.length} photos`);
      el.innerHTML = `
        <span class="pin-img" style="background-image:url('${cover?.thumbUrl ?? ""}')"></span>
        <span class="pin-count">${c.photos.length}</span>
        <span class="pin-label">${c.name}</span>`;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        setOpenId(c.id);
      });

      return new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([c.lng, c.lat]).addTo(map);
    });
  }, [live]);

  function flyTo(c: Collection) {
    mapRef.current?.flyTo({ center: [c.lng, c.lat], zoom: 9, speed: 1.2 });
  }

  function handleCaptionSaved(collectionId: string, photoId: string, caption: string) {
    setLive((prev) =>
      prev.map((c) =>
        c.id !== collectionId
          ? c
          : { ...c, photos: c.photos.map((p) => (p.id === photoId ? { ...p, caption } : p)) },
      ),
    );
  }

  return (
    <div className="h-dvh w-full overflow-hidden bg-zinc-900 text-zinc-100">
      <div ref={mapNode} className="absolute inset-0" />

      <aside className="absolute left-0 top-0 z-10 flex h-full w-80 max-w-[85vw] flex-col gap-3 overflow-y-auto bg-zinc-950/85 p-5 backdrop-blur">
        <header>
          <h1 className="text-lg font-semibold tracking-tight">Travel PhotoMap</h1>
          <p className="text-sm text-zinc-400">
            {live.length} {live.length === 1 ? "collection" : "collections"} ·{" "}
            {live.reduce((n, c) => n + c.photos.length, 0)} photos
          </p>
        </header>

        {loadError && (
          <p className="rounded-md bg-amber-500/15 p-3 text-xs leading-relaxed text-amber-200">{loadError}</p>
        )}

        {live.length === 0 && !loadError && (
          <p className="text-sm text-zinc-400">
            No collections yet. Seed one with <code className="text-zinc-200">npm run ingest</code>.
          </p>
        )}

        {live.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-500">Sort by date</span>
            <button
              onClick={() => setSort((s) => (s === "newest" ? "oldest" : "newest"))}
              className="rounded-md bg-zinc-800 px-2 py-1 font-medium hover:bg-zinc-700"
            >
              {sort === "newest" ? "Newest first ↓" : "Oldest first ↑"}
            </button>
          </div>
        )}

        <ul className="flex flex-col gap-2">
          {sorted.map((c) => {
            const cover = c.photos.find((p) => p.id === c.coverPhotoId) ?? c.photos[0];
            return (
              <li key={c.id}>
                <button
                  onClick={() => {
                    flyTo(c);
                    setOpenId(c.id);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-zinc-800/70"
                >
                  {cover && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover.thumbUrl} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{c.name}</span>
                    <span className="block text-xs text-zinc-400">
                      {formatDate(c.date)} · {c.photos.length} photos
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {open && (
        <Slideshow collection={open} onClose={() => setOpenId(null)} onCaptionSaved={handleCaptionSaved} />
      )}
    </div>
  );
}
