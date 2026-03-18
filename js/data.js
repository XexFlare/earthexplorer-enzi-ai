// data.js — Location data loader and map source configuration

// ---------------------------------------------------------------------------
// Hierarchical location data — loaded at runtime from data/locations.json.
// Coordinates are stored as [lat, lng]; use toMapCenter() before passing to MapLibre.
// ---------------------------------------------------------------------------

// Module-level store. Populated by loadData() before anything reads it.
let countries = [];

// Fetch and parse locations.json. Must be awaited in app.js before initUI/initMap.
//
// Path is resolved relative to this module file using import.meta.url so it works
// regardless of what URL the page is served from (avoids document-base ambiguity).
export async function loadData() {
  const url = new URL('../data/locations.json', import.meta.url).href;
  console.log('[Data] Fetching:', url);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} — ${url}`);
  }

  const json = await response.json();
  countries = json.countries ?? [];
  console.log(`[Data] Loaded ${countries.length} countries from locations.json`);
}

// Returns the full countries array. Always synchronous after loadData() resolves.
export function getCountries() {
  return countries;
}

// Coordinates in this dataset are [lat, lng].
// MapLibre expects [lng, lat]. Always convert before passing to map functions.
export function toMapCenter(coords) {
  return [coords[1], coords[0]];
}

// ---------------------------------------------------------------------------
// Map configuration
// ---------------------------------------------------------------------------

// Default world view
export const WORLD_VIEW = {
  center: [15, 20],
  zoom: 2,
  pitch: 25,
  bearing: 0,
};

// Free vector tile base style — no API key required
export const BASE_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

// Esri World Imagery — free, no API key
export const SATELLITE_SOURCE = {
  type: 'raster',
  tiles: [
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  ],
  tileSize: 256,
  attribution: '© Esri — Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP',
  maxzoom: 19,
};

// AWS-hosted Mapzen terrain tiles (Terrarium encoding) — free, no API key
// minzoom: 6 — no point loading DEM tiles at world view zoom levels
export const TERRAIN_SOURCE = {
  type: 'raster-dem',
  tiles: [
    'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
  ],
  tileSize: 256,
  encoding: 'terrarium',
  minzoom: 6,
  maxzoom: 15,
};
