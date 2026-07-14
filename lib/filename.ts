/**
 * Parses a photo filename into (order, orderSuffix, caption).
 *
 * The two seed folders use the same idea with different punctuation:
 *   "1-Expo entrance with Myaku Myaku Mascot.jpg"  -> 1,   "",  "Expo entrance with…"
 *   "11 Noah's Ark.jpg"                            -> 11,  "",  "Noah's Ark"
 *   "57b-Algae x Hello Kitty.jpg"                  -> 57,  "b", "Algae x Hello Kitty"
 *   "6.jpg"                                        -> 6,   "",  ""            (no caption)
 *   "z-singular cucumber.jpg"                      -> last, "", "singular cucumber"
 *   "2025-08-01 16.21.56.jpg"                      -> last, "", ""            (camera default name)
 *
 * A caption is only produced when the filename actually contains words. A bare
 * "6" or a camera timestamp is NOT a title, so those come back empty and the
 * user fills them in later.
 */

/** Un-numbered photos sort after every numbered one, then among themselves by date. */
export const UNORDERED = Number.MAX_SAFE_INTEGER;

/** Camera/phone default names carry no human meaning: "2025-08-01 16.21.56", "IMG_4821", "DSC02931", "PXL_20240101_..." */
const CAMERA_DEFAULT =
  /^(\d{4}-\d{2}-\d{2}[ _T]\d{2}[.:-]\d{2}[.:-]\d{2}|(IMG|DSC|PXL|DJI|GOPR|MVIMG|VID)[-_]?\d+|\d{8}[-_]\d{6})$/i;

const NUMBERED = /^(\d+)([a-z]?)\s*[-–._ ]?\s*(.*)$/i;

export interface ParsedName {
  order: number;
  orderSuffix: string;
  caption: string;
}

/** True if the string has at least one letter — i.e. it says something, rather than just being an index. */
function hasWords(s: string): boolean {
  return /\p{L}/u.test(s);
}

function cleanCaption(raw: string): string {
  const c = raw.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return hasWords(c) ? c : "";
}

export function parseFilename(filename: string): ParsedName {
  const base = filename.replace(/\.[^.]+$/, "").trim();

  // Check this BEFORE the numeric match, or "2025-08-01 16.21.56" parses as order 2025.
  if (CAMERA_DEFAULT.test(base)) {
    return { order: UNORDERED, orderSuffix: "", caption: "" };
  }

  const m = base.match(NUMBERED);
  if (m) {
    const rest = (m[3] ?? "").trim();
    // "13-2.jpg" sits between 13 and 14 — a numeric sub-index, not a caption.
    // Zero-padded so the suffix compares correctly ("002" < "010").
    const numericSubIndex = /^\d+$/.test(rest) ? rest.padStart(3, "0") : "";
    return {
      order: parseInt(m[1], 10),
      orderSuffix: (m[2] || "").toLowerCase() || numericSubIndex,
      caption: numericSubIndex ? "" : cleanCaption(rest),
    };
  }

  // No leading number ("z-singular cucumber"): keep the words, sort it last.
  const withoutPrefix = base.replace(/^[a-z]\s*[-–._ ]\s*/i, "");
  return { order: UNORDERED, orderSuffix: "", caption: cleanCaption(withoutPrefix) };
}

const PHOTO_EXT = /\.(jpe?g|png|heic|heif|webp|tiff?)$/i;
const VIDEO_EXT = /\.(mov|mp4|m4v|avi|webm)$/i;

export const isPhoto = (f: string) => PHOTO_EXT.test(f);
export const isVideo = (f: string) => VIDEO_EXT.test(f);
