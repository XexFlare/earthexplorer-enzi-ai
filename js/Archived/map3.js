// map.js — Map rendering and camera control

import {
  BASE_STYLE_URL,
  SATELLITE_SOURCE,
  TERRAIN_SOURCE,
  WORLD_VIEW,
} from './data.js';

let map = null;
let satelliteAdded = false;

// ---------------------------------------------------------------------------
// Initialisation
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

  map.on('load', onMapLoad);

  return map;
}

function onMapLoad() {
  enableGlobe();
  addTerrain();
  addSkyLayer();
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

function enableGlobe() {
  try {
    map.setProjection('globe');
  } catch (err) {
    console.warn('[Map] Globe projection unavailable:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Satellite (lazy)
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
// Terrain + sky
// ---------------------------------------------------------------------------

function addTerrain() {
  try {
    map.addSource('terrain', TERRAIN_SOURCE);
    map.setTerrain({ source: 'terrain', exaggeration: 1.4 });
  } catch (err) {
    console.warn('[Map] Terrain not available:', err.message);
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
        'sky-atmosphere-sun-intensity': 15,
      },
    });
  } catch (err) {
    console.warn('[Map] Sky layer not available:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Camera control (FINAL FIX)
// ---------------------------------------------------------------------------

function flyToStable(options) {
  map.stop();

  // Step 1: safe landing
  map.flyTo({
    ...options,
    zoom: 14, // always safe zoom
    essential: true,
  });

  // Step 2: after landing, zoom in like a user would
  map.once('moveend', () => {
    const targetZoom = options.zoom;

    if (targetZoom > 14) {
      map.zoomTo(targetZoom, {
        duration: 1200, // smooth zoom-in
        essential: true,
      });
    }
  });
}

export function flyToCoords(lngLat, zoom = 12, pitch = 55, bearing = 0) {
  flyToStable({
    center: lngLat,
    zoom,
    pitch,
    bearing,
    duration: 2800,
  });
}

export function flyToCity(city) {
  flyToStable({
    center: city.center,
    zoom: city.zoom,
    pitch: city.pitch,
    bearing: city.bearing,
    duration: 3500,
  });
}

export function flyToWorld() {
  flyToStable({
    center: WORLD_VIEW.center,
    zoom: WORLD_VIEW.zoom,
    pitch: WORLD_VIEW.pitch,
    bearing: WORLD_VIEW.bearing,
    duration: 3000,
  });
}

// ---------------------------------------------------------------------------
// Helpers
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