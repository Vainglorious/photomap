import type { StyleSpecification } from "maplibre-gl";

/**
 * Basemap style. CARTO's raster tiles need no API key and no token, which keeps
 * the map free at any traffic level.
 *
 * (The plan originally floated self-hosting Protomaps PMTiles in Blob like the
 * reference site does. That works for a city, but a *world* basemap PMTiles file
 * is ~100 GB — far past the 1 GB Blob tier. Hence raster tiles from CARTO.)
 */
export const basemapStyle: StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      maxzoom: 20,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, © <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [{ id: "carto", type: "raster", source: "carto" }],
};
