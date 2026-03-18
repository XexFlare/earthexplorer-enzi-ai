// map.js — CLEAN & STABLE (single-pass camera, no hacks)

import {
  BASE_STYLE_URL,
  SATELLITE_SOURCE,
  TERRAIN_SOURCE,
  WORLD_VIEW,
} from './data.js';

let map = null;
let satelliteAdded = false;

// ---------------------------------------------------------------------------
// INIT
// ---------------------------------------------------------------------------

export function initMap(containerId) {
  map = new maplibregl.Map({
    container: containerId,
    style: BASE_STYLE_URL,
    center: WORLD_VIEW.center,
    zoom: WORLD_VIEW.zoom,
    pitch: WORLD_VIEW.pitch,
    bearing: WORLD_VIEW.bearing,
    antialias: true,
    maxParallelImageRequests: 6,
    fadeDuration: 100,
  });

  map.addControl(
    new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }),
    'bottom-right'
  );

  map.addControl(
    new maplibregl.NavigationControl({ showCompass: true }),
    'bottom-right'
  );

  map.on('load', () => {
    enableGlobe();
    addTerrain();
    addSkyLayer();
  });

  return map;
}

// ---------------------------------------------------------------------------
// PROJECTION
// ---------------------------------------------------------------------------

function enableGlobe() {
  try {
    map.setProjection('globe');
  } catch (err) {
    console.warn('[Map] Globe not supported:', err.message);
  }
}

// ---------------------------------------------------------------------------
// SATELLITE
// ---------------------------------------------------------------------------

function addSatelliteLayer() {
  map.addSource('satellite', SATELLITE_SOURCE);

  map.addLayer(
    {
      id: 'satellite-layer',
      type: 'raster',
      source: 'satellite',
      layout: { visibility: 'visible' },
      paint: { 'raster-opacity': 0.95 },
    },
    getFirstSymbolLayerId()
  );

  satelliteAdded = true;
}

export function setSatelliteVisible(visible) {
  if (visible && !satelliteAdded) {
    addSatelliteLayer();
    return;
  }

  if (!map.getLayer('satellite-layer')) return;

  map.setLayoutProperty(
    'satellite-layer',
    'visibility',
    visible ? 'visible' : 'none'
  );
}

// ---------------------------------------------------------------------------
// TERRAIN + SKY
// ---------------------------------------------------------------------------

function addTerrain() {
  try {
    map.addSource('terrain', TERRAIN_SOURCE);
    map.setTerrain({ source: 'terrain', exaggeration: 1.2 });
  } catch (err) {
    console.warn('[Map] Terrain unavailable:', err.message);
  }
}

function addSkyLayer() {
  try {
    map.addLayer({
      id: 'sky',
      type: 'sky',
      paint: {
        'sky-type': 'atmosphere',
        'sky-atmosphere-sun': [0.0, 90.0],
        'sky-atmosphere-sun-intensity': 10,
      },
    });
  } catch (err) {
    console.warn('[Map] Sky unavailable:', err.message);
  }
}

// ---------------------------------------------------------------------------
// CAMERA (FINAL — SIMPLE + STABLE)
// ---------------------------------------------------------------------------

function flyTo(options) {
  if (!map) return;

  map.stop();

  map.flyTo({
    center: options.center,
    zoom: options.zoom ?? 12,
    pitch: options.pitch ?? 30,
    bearing: options.bearing ?? 0,
    duration: 4000,
    essential: true,
  });
}

// ---------------------------------------------------------------------------
// PUBLIC API
// ---------------------------------------------------------------------------

export function flyToCoords(lngLat, zoom = 12, pitch = 30, bearing = 0) {
  flyTo({
    center: lngLat,
    zoom,
    pitch,
    bearing,
  });
}

export function flyToCity(city) {
  flyTo({
    center: city.center,
    zoom: city.zoom,
    pitch: city.pitch,
    bearing: city.bearing,
  });
}

export function flyToWorld() {
  if (!map) return;

  map.stop();

  map.flyTo({
    center: WORLD_VIEW.center,
    zoom: WORLD_VIEW.zoom,
    pitch: WORLD_VIEW.pitch,
    bearing: WORLD_VIEW.bearing,
    duration: 3500,
    essential: true,
  });
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function getFirstSymbolLayerId() {
  const layers = map.getStyle().layers;
  for (const layer of layers) {
    if (layer.type === 'symbol') return layer.id;
  }
  return undefined;
}

export function getMap() {
  return map;
}