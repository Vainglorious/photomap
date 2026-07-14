import MapView from "@/components/MapView";
import { readManifest } from "@/lib/manifest";
import { EMPTY_MANIFEST } from "@/lib/types";

// Metadata lives in Blob and changes on every caption edit — never prerender it.
export const dynamic = "force-dynamic";

export default async function Home() {
  let manifest = EMPTY_MANIFEST;
  let loadError: string | null = null;

  try {
    manifest = await readManifest();
  } catch (e) {
    // A missing token or empty store shouldn't blank the page — the map still renders.
    loadError = e instanceof Error ? e.message : "Could not load collections.";
  }

  return <MapView collections={manifest.collections} loadError={loadError} />;
}
