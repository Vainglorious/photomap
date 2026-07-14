# Travel PhotoMap — Planning Document

**Status:** Draft for review. Written 2026-07-14.
**Goal:** A world map where a *collection* of photos is pinned at a user-chosen location. Click a pin → slideshow of that collection, each photo captioned. Collections are filterable/sortable by date.

---

## 1. What I verified before writing this

I did not take the inputs on faith — I fetched the reference site and both Dropbox folders and inspected them. Findings that change the design are marked 🚩.

### 1.1 Reference site (flippinfreeflapjacks.com)

Its JS bundle uses **MapLibre GL JS** with **Protomaps / PMTiles** vector tiles and GeoJSON marker data. This is a good, cheap stack: MapLibre is open-source and PMTiles serves a whole basemap from a single static file with **no API key and no per-view billing** (unlike Mapbox). The URL hash pattern `#11/51.0447/-114.0719` (zoom/lat/lng) is a MapLibre built-in — worth copying so map views are shareable links.

### 1.2 The two Dropbox folders — actual contents

Both folders are **publicly downloadable without auth**: appending `dl=1` to the shared link redirects to a zip of the whole folder. That means "paste a Dropbox link" can work with no Dropbox OAuth app, no API keys.

| | Folder A | Folder B |
|---|---|---|
| Subject | World Expo, Osaka | Hong Kong (islands, ferries, Noah's Ark) |
| Files | 144 | 22 |
| Total size | **872 MB** | **178 MB** |
| Photos | 135 jpg + 4 heic | 20 jpg + 2 heic |
| Videos | 3 `.mov` | — |
| Other | 1 `.txt` (links) | — |
| EXIF dates | Present, valid (2025-07-31 → 08-02) | Present, valid (2024-11-29 → 12-01) |

🚩 **It's ~166 photos and ~1.05 GB, not "about 50 photos."** Every size, cost, and timeout decision below follows from this.

### 1.3 Filenames are the titles — and the numbers are the running order

The naming convention is `<order><sep><caption>.<ext>`, but the separator and completeness differ between folders:

```
Folder A:  1-Expo entrance with Myaku Myaku Mascot; ... .jpg     ← number + "-" + caption
           33-moon+flags.jpg
           57b-Algae x Hello Kitty.jpg                            ← sub-index "57b"
           6.jpg  16.jpg  17.jpg                                  ← number, NO caption
           z-singular cucumber.jpg                                ← "z" prefix, no number
           2025-08-01 16.21.56.jpg                                ← raw camera name, no caption

Folder B:  1 waiting for sunrise.jpg                              ← number + SPACE + caption
           11 Noah's Ark.jpg
           2.jpg  3.jpg  6.jpg                                    ← number, NO caption
```

Two consequences:

- 🚩 **The leading number is sort order, not a date.** Photo `1` in folder A is the Expo entrance and `114` is near the exit — it's a curated walkthrough. So **"sort by date" is a property of collections (pins), not of photos inside a collection.** Photos keep their author-given sequence. (Mixing these up would scramble a deliberately-told story.)
- 🚩 **Roughly a third of the photos have no caption at all** (bare `6.jpg`, `16.jpg`, …). The UI must treat a caption as optional and make it easy to add one later, not assume the filename yields a title.

Parser spec (handles both folders): `^(?<order>\d+)(?<suffix>[a-z]?)\s*[-. ]?\s*(?<caption>.*)$` → order, sub-order, caption. Names that don't match (raw camera timestamps, `z-…`) get no order (sorted last, by EXIF date) and an empty caption.

### 1.4 Photos, GPS, and dates

- **No GPS, by design.** Confirmed: the EXIF GPS block is absent from every photo sampled. This is also the intended product behaviour — **individual photos are not geotagged, and we will not try to infer location from photos.** The pin location is a single user-chosen property of the *collection*. No EXIF-GPS code will exist in this project.
- **EXIF `DateTimeOriginal` is present and correct** on every photo sampled (Sony ILCE-7 and iPhone 13 Pro bodies). We can use it to *pre-fill* the collection date field as a convenience — the user always confirms/overrides it. It is a suggestion, never a source of truth.
- 🚩 **HEIC files (6 across the two folders) will not render in any browser.** They must be transcoded to JPEG/WebP during ingest or those photos silently break.
- 🚩 **3 `.mov` videos** in folder A. Out of scope for v1 — the ingest should skip and *report* them ("3 videos skipped"), not drop them silently.
- 🚩 **Originals are 4032px, 6–10 MB each.** Serving these directly is unusable on mobile and expensive. Ingest must derive sized variants (see §3.3).

---

## 2. Product scope

### v1 (build this)
1. World map, pins = collections.
2. Click a pin → slideshow/lightbox of that collection's photos, in author order, caption under each.
3. Captions editable in the app; edits persist.
4. Create a collection by **pasting a Dropbox folder link** *or* **uploading a folder** from disk.
5. On create, user supplies: **collection name**, **date**, **pin location**.
6. Sort/filter collections by date; a timeline control that filters which pins are shown.
7. Shareable URLs: `#zoom/lat/lng`, and a deep link to an open collection.

### Explicitly out of scope for v1
Per-photo geotagging (see above) · videos · multi-user accounts/profiles · comments/likes · full-text search · offline/PWA.

---

## 3. Architecture

### 3.1 Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router) on Vercel** | Matches your deploy target; API routes for ingest. |
| Map | **MapLibre GL JS** | Free, no token, same as the reference site. |
| Basemap | **Protomaps PMTiles** (self-hosted in Blob) or CARTO free raster | No per-view billing. Fallback: Mapbox if you want their styling and accept a token + free-tier cap. |
| Image storage | **Vercel Blob** | As you suggested — correct tool for the *files*. |
| Metadata | **Versioned `manifest.json` in Blob** | Chosen: no extra infra. See §3.2 and the required mitigation in §6.1. |
| Marker clustering | MapLibre native `cluster: true` on a GeoJSON source | Handles pin overlap for free as collections grow. |
| Lightbox | `yet-another-react-lightbox` or hand-rolled | Slideshow, keyboard nav, captions. |

### 3.2 🚩 Vercel Blob is object storage, not a database

You mentioned "vercel blob (database)". Blob stores *files* (the photos) and is the right choice for them, but it has no query capability — you can't ask it "give me all collections sorted by date" or update one caption transactionally. Metadata (collections, photos, captions, coordinates, dates) needs a real store. Two options:

- **A. Postgres (Neon)** — free tier is ample here. Proper updates, ordering, and filtering. Recommended.
- **B. A single `manifest.json` in Blob** — zero extra infra, but every caption edit rewrites the whole file, and concurrent edits silently overwrite each other. Acceptable only if this stays a personal, single-editor site.

I recommend A unless you want the absolute minimum moving parts.

Schema sketch:

```sql
collections(id, name, date, lat, lng, cover_photo_id, created_at)
photos(id, collection_id, blob_url, thumb_url, caption, sort_order, sort_suffix,
       taken_at, width, height, original_filename)
```

### 3.3 Image pipeline (the part that decides whether this works)

Ingest of a ~870 MB folder is the main engineering risk. Every photo produces:

| Variant | Size | Purpose | Est. weight |
|---|---|---|---|
| `thumb` | 400px webp | Pin hover / grid | ~30 KB |
| `web` | 2048px webp q80 | Slideshow — what users actually see | ~300 KB |
| `original` | untouched | Optional download | 6–10 MB |

At 166 photos, web+thumb ≈ **55 MB total** — vs 1.05 GB of originals. **Recommendation: do not store originals in v1.** Storage and egress both drop by ~20×. (If you want originals preserved, they're already safe in Dropbox — we can add an "original" tier later.)

### 3.4 🚩 Ingest cannot run naively in a Vercel function

A Vercel serverless function cannot download an 872 MB zip, unpack it, transcode ~140 images, and upload them — it will blow the execution-time limit, the memory limit, and the 512 MB `/tmp` limit. Three viable designs:

- **A. Client-side (recommended for v1).** The browser does the work: for a *folder upload*, read files locally, resize/transcode via `createImageBitmap` + canvas (and `heic2any` for HEIC), then upload each derivative directly to Blob with a client token. No server timeout exists because there's no server in the loop. Progress bar is natural. Cost: a few minutes of the user's CPU on a 1 GB folder.
- **B. Server, streamed and chunked.** A route streams the zip entry-by-entry and processes one photo per invocation via a queue. Robust, resumable — but meaningfully more infrastructure.
- **C. Local ingest script for seeding.** A Node script run on your machine for the two existing folders, writing straight to Blob + Postgres.

**Plan: C to seed the two known folders (fast, gets us a real map today), then A for the user-facing "add a collection" flow.** The Dropbox-link path in the UI is then a thin server route that *fetches* the zip and streams it to the client, or (simpler) the user downloads from Dropbox and drops the folder in.

### 3.5 Dropbox link ingest — the caveat

`dl=1` gives us the zip with no auth, which is great. But note the link must be a **public share link**; a private/expired one yields nothing, and Dropbox rate-limits heavy zip generation. The UI must degrade gracefully: "Couldn't read that link — is it shared publicly? You can also upload the folder directly."

### 3.6 🚩 Who is allowed to create pins?

Nothing in the plan yet stops an anonymous visitor from uploading a 1 GB folder to your Blob store, or editing captions on your photos. That's a real exposure the moment this is on a public URL. Cheapest sufficient answer: a shared password / env-var secret for all write operations (create collection, edit caption), while reads stay public. Worth deciding before deploy, not after.

---

## 4. Cost check (Vercel free tier)

- **Blob:** 1 GB storage included. Derivatives-only ≈ 55 MB for both collections → fine, with room for ~30 more collections. Storing originals (1.05 GB) **exceeds the free tier immediately** — another reason for §3.3.
- **Blob egress / Fast Data Transfer:** 10 GB/mo free. A slideshow visitor pulls ~300 KB/photo; a few hundred visits is fine. Going viral is not.
- **Postgres (Neon free):** trivially within limits.
- **Basemap:** $0 with PMTiles/MapLibre. This is why we avoid Mapbox by default.

---

## 5. Build sequence

1. **Scaffold** — Next.js + MapLibre + PMTiles basemap, empty world map with URL-hash sync.
2. **Seed collection 1 (Osaka)** — local ingest script: unzip → parse filenames → transcode HEIC → derive web/thumb → Blob → Postgres. Place its pin (Osaka Expo site). **Look at the map together.** ← *your first checkpoint*
3. **Pin + slideshow UI** — click pin → lightbox in author order, captions underneath, keyboard nav, deep link.
4. **Caption editing** — inline edit, persists to Postgres.
5. **Timeline / date sort** — filter pins by date range; sorted list view of collections.
6. **Add-collection flow** — folder upload (client-side pipeline) + Dropbox-link path, with name/date/location form and a map click to drop the pin.
7. **Test with collection 2 (Hong Kong)** — ingest it *through the real UI*, not the script. This is the honest test of step 6. ← *your second checkpoint*
8. **Auth gate on writes, then deploy.**

---

## 6. Decisions (locked 2026-07-14)

| # | Decision | Consequence |
|---|---|---|
| 1 | **Metadata = single `manifest.json` in Blob.** No Postgres. | Zero extra infra. Whole-file rewrite per edit — see the mitigation below. |
| 2 | **Store derivatives only** (2048px web + 400px thumb). No originals. | ~55 MB for both collections; comfortably inside the Blob free tier. Originals remain in Dropbox. |
| 3 | **Fully public writes.** No auth gate in v1. | Anyone with the URL can add a collection or edit a caption. |
| 4 | **Videos skipped**, with an explicit "skipped 3 videos" report at ingest. | The 3 `.mov` files are not lost, just not shown. |
| 5 | **Captions:** use the filename text when it contains words; blank-but-editable when the name is only a number or camera timestamp. | `33-moon+flags.jpg` → "moon+flags". `6.jpg` and `2025-08-01 16.21.56.jpg` → blank, editable in-app. A bare "6" is never shown as a title. |
| 6 | **Photo order within a collection = the filename's leading number**, not date. | Preserves the author's curated walkthrough (Expo entrance → exit). |

### 6.1 🚩 Required mitigation: versioned manifests

Decisions 1 and 3 are each reasonable alone but dangerous together: a whole-file-rewrite metadata store with unauthenticated writes means one careless (or hostile) visitor, or two simultaneous editors, can clobber the metadata for **every** collection at once, unrecoverably.

Mitigation, which preserves both decisions and costs almost nothing:

- Write every manifest revision to an immutable timestamped key: `manifest/2026-07-14T15-02-11Z.json`.
- A tiny `manifest/latest.json` pointer (or "newest key wins") is what the app reads.
- Rollback = repoint to a previous revision. Revisions are a few KB each; keep them all.
- Add a basic rate limit on the write route so a script can't spam 10,000 revisions or 1 GB of uploads.

This is planned as part of step 2 of the build sequence, not an afterthought.

## 7. Still open

- **Pin locations:** what coordinates do you want for the two seed collections? Osaka Expo (Yumeshima) and the Hong Kong islands are my guesses — but you should place them, since the pin is a deliberate authorial choice. You'll be able to click the map to set them.
- **Collection names and dates:** "World Expo Osaka" (2025-07-31 → 08-02, per EXIF) and the Hong Kong set (2024-11-29 → 12-01). Confirm the display names and which single date each pin should carry.
