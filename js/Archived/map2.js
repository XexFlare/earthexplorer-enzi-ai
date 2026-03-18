// map.js — Map rendering and camera control

import {
  BASE_STYLE_URL,
  SATELLITE_SOURCE,
  TERRAIN_SOURCE,
  WORLD_VIEW,
} from './data.js';

let map = null;
let satelliteAdded = false; // lazy — only register satellite source when first enabled

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
    // Low-bandwidth tuning:
    // Limit concurrent tile requests — prevents saturating a slow connection.
    // 6 is enough to load a viewport without queueing dozens of requests at once.
    maxParallelImageRequests: 6,
    // Snap tiles in faster instead of the default 300ms dissolve.
    // On slow connections the long fade makes the map look perpetually loading.
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
  // Satellite source is NOT registered here — it is lazy-loaded on first toggle.
  // This eliminates all satellite tile traffic for users who never enable it.
  addTerrain();
  addSkyLayer();
  bindTerrainRepaint();
}

// After a flyTo ends, the render loop can go idle while terrain DEM tiles are
// still in-flight (throttled by maxParallelImageRequests). When those tiles
// arrive there is nothing to consume them — no render frame is scheduled —
// so broken terrain persists until user input restarts the loop.
//
// This listener watches specifically for terrain source loads that happen while
// the map is stationary and triggers a single repaint to apply them.
//
// Additionally, a moveend listener forces one render frame after every camera
// stop. This ensures recalculateZoom() runs against the final camera position
// before the scale bar and tile selection commit to a zoom value. Without it,
// moveend fires before the last _render() frame, so transform.zoom may reflect
// sea-level elevation rather than the actual terrain height at the destination.
function bindTerrainRepaint() {
  map.on('sourcedata', e => {
    if (e.sourceId === 'terrain' && e.isSourceLoaded && !map.isMoving()) {
      map.triggerRepaint();
    }
  });

  map.on('moveend', () => map.triggerRepaint());
}

// ---------------------------------------------------------------------------
// Globe projection
// ---------------------------------------------------------------------------

function enableGlobe() {
  try {
    map.setProjection('globe');
  } catch (err) {
    console.warn('[Map] Globe projection unavailable:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Satellite layer — lazy loaded
// ---------------------------------------------------------------------------

// Source and layer are only registered on the first enable.
// Until then, zero satellite tile requests are made.
function addSatelliteLayer() {
  map.addSource('satellite', SATELLITE_SOURCE);

  // Insert below the first symbol (label) layer so labels remain on top
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
    // First time enabling — register source and layer now
    addSatelliteLayer();
    return; // layer starts visible; nothing more to do
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
// Camera control
// ---------------------------------------------------------------------------

// Fly to an explicit [lng, lat] position. Used by events.js for both
// city-level and location-level navigation from the new data structure.
export function flyToCoords(lngLat, zoom = 12, pitch = 55, bearing = 0) {
  // Stop any in-progress animation before starting a new one. Without this,
  // rapid navigation aborts a flyTo mid-flight and leaves the terrain mesh in
  // a partially-computed state that the next transition inherits.
  map.stop();
  map.flyTo({
    center: lngLat,
    zoom,
    pitch,
    bearing,
    duration: 2800,
    essential: true,
  });
}

export function flyToCity(city) {
  map.stop();
  map.flyTo({
    center: city.center,
    zoom: city.zoom,
    pitch: city.pitch,
    bearing: city.bearing,
    duration: 3500,
    essential: true,
  });
}

export function flyToWorld() {
  map.stop();
  map.flyTo({
    center: WORLD_VIEW.center,
    zoom: WORLD_VIEW.zoom,
    pitch: WORLD_VIEW.pitch,
    bearing: WORLD_VIEW.bearing,
    duration: 3000,
    essential: true,
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
