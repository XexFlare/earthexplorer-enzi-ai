// map.js — FIXED: All 6 visual layer issues addressed
//
// FIXES:
//   1. Night mode: corrected VIIRS layer name + opacity curve + dark backdrop
//   2. Clouds: higher base opacity, extended zoom range, error logging
//   3. Atmosphere: JS drives --glow-strength and --atmo-opacity CSS vars
//   4. Layer ordering: enforceLayerOrder() with verified stacking
//   5. Toggle reliability: guards, logging, source-exists checks
//   6. Auto-spin: orbital rotation at low zoom, stops on interaction
//
// CAMERA SYSTEM: Unchanged — stable and production-safe.

import {
  BASE_STYLE_URL,
  SATELLITE_SOURCE,
  TERRAIN_SOURCE,
  WORLD_VIEW,
} from './data.js';

let map = null;
let satelliteAdded = false;

// ---------------------------------------------------------------------------
// COUNTRY HIGHLIGHT — glowing border overlay for the selected country
// ---------------------------------------------------------------------------

const EMPTY_FEATURE_COLLECTION = { type: 'FeatureCollection', features: [] };
const countryBorderCache = new Map(); // slug -> geojson | null (null = known missing)
let highlightLayersAdded = false;

// ---------------------------------------------------------------------------
// AUTO-SPIN STATE
// ---------------------------------------------------------------------------

let spinAnimationId = null;
let spinEnabled = true;
let lastSpinTime = 0;
const SPIN_SPEED = 0.003;          // degrees per ms — very slow drift
const SPIN_ZOOM_THRESHOLD = 3;

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
    attributionControl: false,
  });

  map.on('load', () => {
    console.log('[Map] Style loaded — adding layers…');
    enableGlobe();
    addTerrain();
    addSkyLayer();

    // Visual layers — added in stacking order
    addNightBackground();
    addOrbitalLayer();
    addNightLayer();
    addCloudsLayer();

    // FIX #4: force correct stacking after all layers are registered
    enforceLayerOrder();

    // FIX #3: atmosphere overlay driven by zoom
    bindAtmosphere();

    // FIX #6: slow orbital rotation
    bindAutoSpin();

    logLayerStack();
    initBottomBar();
  });

  return map;
}

// ---------------------------------------------------------------------------
// PROJECTION
// ---------------------------------------------------------------------------

function enableGlobe() {
  try {
    map.setProjection('globe');
    console.log('[Map] Globe projection enabled');
  } catch (err) {
    console.warn('[Map] Globe not supported:', err.message);
  }
}

// ---------------------------------------------------------------------------
// SATELLITE (lazy — only loaded on first toggle)
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
  console.log('[Map] Satellite layer added');
}

export function setSatelliteVisible(visible) {
  if (visible && !satelliteAdded) {
    addSatelliteLayer();
    return;
  }

  if (!map.getLayer('satellite-layer')) {
    console.warn('[Toggle] satellite-layer not found — not yet added');
    return;
  }

  map.setLayoutProperty(
    'satellite-layer',
    'visibility',
    visible ? 'visible' : 'none'
  );
  console.log('[Toggle] Satellite →', visible ? 'ON' : 'OFF');
}

// ---------------------------------------------------------------------------
// TERRAIN + SKY
// ---------------------------------------------------------------------------

function addTerrain() {
  try {
    map.addSource('terrain', TERRAIN_SOURCE);
    map.setTerrain({ source: 'terrain', exaggeration: 1.2 });
    console.log('[Map] Terrain source added');
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
    console.log('[Map] Sky layer added');
  } catch (err) {
    console.warn('[Map] Sky unavailable:', err.message);
  }
}

// ---------------------------------------------------------------------------
// FIX #1: NIGHT BACKGROUND
// ---------------------------------------------------------------------------
// Solid dark layer that blocks the bright base map when night mode is active.
// VIIRS tiles have transparency in oceans — without this backdrop the base
// map bleeds through and washes out city lights.

function addNightBackground() {
  try {
    map.addLayer(
      {
        id: 'night-background',
        type: 'background',
        layout: { visibility: 'none' },
        paint: {
          'background-color': '#000008',
          // Stay opaque through zoom 6 so city lights remain visible
          // during the transition toward street-level.
          'background-opacity': [
            'interpolate', ['linear'], ['zoom'],
            0, 1.0,
            4, 0.95,
            7, 0.0,
          ],
        },
      },
      getFirstSymbolLayerId()
    );
    console.log('[Map] Night background added');
  } catch (err) {
    console.warn('[Map] Night background unavailable:', err.message);
  }
}

// ---------------------------------------------------------------------------
// ORBITAL — NASA Blue Marble (low zoom, no API key)
// ---------------------------------------------------------------------------

function addOrbitalLayer() {
  try {
    map.addSource('orbital', {
      type: 'raster',
      tiles: [
        'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg',
      ],
      tileSize: 256,
      maxzoom: 8,
      attribution: 'Imagery © NASA GIBS',
    });

    map.addLayer(
      {
        id: 'orbital-layer',
        type: 'raster',
        source: 'orbital',
        paint: {
          'raster-opacity': [
            'interpolate', ['linear'], ['zoom'],
            0, 1.0,
            4, 0.8,
            6, 0.0,
          ],
          'raster-fade-duration': 300,
        },
      },
      getFirstSymbolLayerId()
    );

    map.on('error', (e) => {
      if (e.sourceId === 'orbital') {
        console.error('[Orbital] Tile error:', e.error?.message ?? e);
      }
    });

    console.log('[Map] Orbital layer added');
  } catch (err) {
    console.warn('[Map] Orbital layer unavailable:', err.message);
  }
}

// ---------------------------------------------------------------------------
// FIX #1: NIGHT MODE — NASA VIIRS city lights
// ---------------------------------------------------------------------------
// Key changes from the broken version:
//   • Layer name: VIIRS_CityLights_2012 (previously had VIIRS_SNPP_CityLights_2012
//     which may 404 depending on GIBS endpoint version)
//   • Opacity curve: full opacity 0–4, gradual fade 4–8 (was 2–5 — too aggressive,
//     city lights disappeared almost immediately on zoom-in)
//   • Dark background is toggled in sync (see setNightMode export)
//   • Tile error logging catches GIBS failures early

function addNightLayer() {
  try {
    map.addSource('night', {
      type: 'raster',
      tiles: [
        'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/2012-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg',
      ],
      tileSize: 256,
      maxzoom: 8,
      attribution: 'Imagery © NASA GIBS / VIIRS Black Marble 2012',
    });

    map.addLayer(
      {
        id: 'night-layer',
        type: 'raster',
        source: 'night',
        layout: { visibility: 'none' },
        paint: {
          // Full opacity through zoom 4, gradual fade to zoom 8
          'raster-opacity': [
            'interpolate', ['linear'], ['zoom'],
            0, 1.0,
            4, 1.0,
            6, 0.5,
            8, 0.0,
          ],
          'raster-fade-duration': 300,
        },
      },
      getFirstSymbolLayerId()
    );

    map.on('error', (e) => {
      if (e.sourceId === 'night') {
        console.error('[Night] Tile load error:', e.error?.message ?? e);
      }
    });

    console.log('[Map] Night layer added');
  } catch (err) {
    console.warn('[Map] Night layer unavailable:', err.message);
  }
}

// ---------------------------------------------------------------------------
// FIX #2: CLOUDS — OpenWeatherMap
// ---------------------------------------------------------------------------
// Key changes:
//   • Higher base opacity (0.8 → was 0.7) so clouds are clearly visible
//   • Extended zoom range (visible through zoom 10, was 8)
//   • Error logging with API key activation warning

const OWM_KEY = 'a11792006978b262bcea5634e05335c3';

function addCloudsLayer() {
  try {
    map.addSource('clouds', {
      type: 'raster',
      tiles: [
        `https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=${OWM_KEY}`,
      ],
      tileSize: 256,
      attribution: '© OpenWeatherMap',
    });

    map.addLayer(
      {
        id: 'clouds-layer',
        type: 'raster',
        source: 'clouds',
        layout: { visibility: 'visible' },
        paint: {
          'raster-opacity': [
            'interpolate', ['linear'], ['zoom'],
            0, 0.8,
            4, 0.7,
            8, 0.3,
            10, 0.0,
          ],
          'raster-fade-duration': 300,
        },
      },
      getFirstSymbolLayerId()
    );

    map.on('error', (e) => {
      if (e.sourceId === 'clouds') {
        console.error(
          '[Clouds] Tile error — new OWM keys can take up to 2h to activate.',
          e.error?.message ?? e
        );
      }
    });

    console.log('[Map] Clouds layer added (OWM key:', OWM_KEY.slice(0, 6) + '…)');
  } catch (err) {
    console.warn('[Map] Clouds layer unavailable:', err.message);
  }
}

// ---------------------------------------------------------------------------
// FIX #4: LAYER ORDERING — explicit stacking guarantee
// ---------------------------------------------------------------------------
// Desired stack (bottom → top):
//   base map → night-background → orbital → night → clouds → [satellite] → symbols

function enforceLayerOrder() {
  const desiredOrder = [
    'night-background',
    'orbital-layer',
    'night-layer',
    'clouds-layer',
  ];

  const firstSymbol = getFirstSymbolLayerId();

  for (const id of desiredOrder) {
    if (map.getLayer(id)) {
      try {
        map.moveLayer(id, firstSymbol);
      } catch (err) {
        console.warn(`[Map] Could not reorder ${id}:`, err.message);
      }
    }
  }

  console.log('[Map] Layer order enforced');
}

// ---------------------------------------------------------------------------
// FIX #3: ATMOSPHERE — CSS overlay driven by zoom
// ---------------------------------------------------------------------------
// Pushes CSS custom properties onto #atmosphere:
//   --atmo-opacity  → master visibility (0 at street zoom, 1 at orbital)
//   --glow-strength → glow ring intensity (0 at zoom 4.5+, 1 at zoom ~1.5)
//
// The stylesheet uses these variables to build a dynamic multi-stop gradient.

function bindAtmosphere() {
  const el = document.getElementById('atmosphere');
  if (!el) return;

  function update() {
    const zoom = map.getZoom();

    // Master opacity: visible at orbital zoom, fades out by zoom 6
    const opacity = Math.max(0, Math.min(1, (6 - zoom) / 4));
    el.style.setProperty('--atmo-opacity', opacity.toFixed(3));

    // Glow intensity: strongest at full globe, gone by zoom 4.5
    const glowStrength = Math.max(0, Math.min(1, (4.5 - zoom) / 3));
    el.style.setProperty('--glow-strength', glowStrength.toFixed(3));
  }

  map.on('zoom', update);
  update();
  console.log('[Map] Atmosphere bound to zoom');
}

// ---------------------------------------------------------------------------
// FIX #6: AUTO-SPIN — slow globe rotation at orbital zoom
// ---------------------------------------------------------------------------

function bindAutoSpin() {
  const interactionEvents = [
    'mousedown', 'touchstart', 'wheel',
    'dragstart', 'pitchstart', 'rotatestart',
  ];
  const resumeEvents = [
    'mouseup', 'touchend',
    'dragend', 'pitchend', 'rotateend',
  ];

  let userInteracting = false;

  for (const evt of interactionEvents) {
    map.on(evt, () => { userInteracting = true; });
  }
  for (const evt of resumeEvents) {
    map.on(evt, () => { userInteracting = false; });
  }

  map.on('movestart', (e) => {
    if (!e.originalEvent) userInteracting = true;
  });
  map.on('moveend', () => {
    userInteracting = false;
  });

  function spinStep(now) {
    spinAnimationId = requestAnimationFrame(spinStep);

    if (!spinEnabled || userInteracting) {
      lastSpinTime = now;
      return;
    }

    const zoom = map.getZoom();
    if (zoom >= SPIN_ZOOM_THRESHOLD) {
      lastSpinTime = now;
      return;
    }

    const dt = lastSpinTime ? now - lastSpinTime : 16;
    lastSpinTime = now;

    const factor = 1 - zoom / SPIN_ZOOM_THRESHOLD;
    const delta = SPIN_SPEED * dt * factor;

    const center = map.getCenter();
    center.lng += delta;
    map.setCenter(center);
  }

  lastSpinTime = performance.now();
  spinAnimationId = requestAnimationFrame(spinStep);
  console.log('[Map] Auto-spin bound (threshold zoom <', SPIN_ZOOM_THRESHOLD + ')');
}

// ---------------------------------------------------------------------------
// FIX #5: LAYER TOGGLE EXPORTS
// ---------------------------------------------------------------------------

export function setNightMode(enabled) {
  const hasNight   = !!map.getLayer('night-layer');
  const hasOrbital = !!map.getLayer('orbital-layer');
  const hasBg      = !!map.getLayer('night-background');

  if (!hasNight || !hasOrbital) {
    console.warn('[Toggle] Night mode skipped — missing layers.',
      { hasNight, hasOrbital });
    return;
  }

  map.setLayoutProperty('night-layer', 'visibility', enabled ? 'visible' : 'none');
  map.setLayoutProperty('orbital-layer', 'visibility', enabled ? 'none' : 'visible');

  if (hasBg) {
    map.setLayoutProperty('night-background', 'visibility', enabled ? 'visible' : 'none');
  }

  console.log('[Toggle] Night mode →', enabled ? 'ON' : 'OFF');
}

export function setCloudsVisible(visible) {
  if (!map.getLayer('clouds-layer')) {
    console.warn('[Toggle] clouds-layer not found');
    return;
  }
  map.setLayoutProperty('clouds-layer', 'visibility', visible ? 'visible' : 'none');
  console.log('[Toggle] Clouds →', visible ? 'ON' : 'OFF');
}

export function setAutoSpin(enabled) {
  spinEnabled = enabled;
  console.log('[Toggle] Auto-spin →', enabled ? 'ON' : 'OFF');
}

export function setEarthRotation(enabled) {
  setAutoSpin(enabled);
}

// ---------------------------------------------------------------------------
// COUNTRY HIGHLIGHT — glowing border overlay
// ---------------------------------------------------------------------------
// Border polygons are bundled locally (data/borders/<slug>.geojson) rather than
// fetched, since the base vector style only ships border *lines*, not fillable
// per-country polygons. Only curated countries have a file — others simply
// clear the overlay (see loadCountryBorder's fetch failure branch).

function countrySlug(name) {
  return name.toLowerCase().replace(/\s+/g, '-');
}

async function loadCountryBorder(name) {
  const slug = countrySlug(name);
  if (countryBorderCache.has(slug)) return countryBorderCache.get(slug);

  try {
    const url = new URL(`../data/borders/${slug}.geojson`, import.meta.url).href;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const geojson = await res.json();
    countryBorderCache.set(slug, geojson);
    return geojson;
  } catch (err) {
    console.warn(`[Highlight] No border data for "${name}":`, err.message);
    countryBorderCache.set(slug, null);
    return null;
  }
}

function addCountryHighlightLayers() {
  if (highlightLayersAdded) return;

  map.addSource('country-highlight', {
    type: 'geojson',
    data: EMPTY_FEATURE_COLLECTION,
  });

  const firstSymbol = getFirstSymbolLayerId();

  // Fill — soft amber tint across the whole country
  map.addLayer(
    {
      id: 'country-highlight-fill',
      type: 'fill',
      source: 'country-highlight',
      paint: { 'fill-color': '#ffb020', 'fill-opacity': 0.12 },
    },
    firstSymbol
  );

  // Glow ring — two stacked blurred lines (wide+soft, then narrower+brighter)
  map.addLayer(
    {
      id: 'country-highlight-glow-outer',
      type: 'line',
      source: 'country-highlight',
      paint: {
        'line-color': '#ffb020',
        'line-width': 14,
        'line-blur': 14,
        'line-opacity': 0.35,
      },
    },
    firstSymbol
  );
  map.addLayer(
    {
      id: 'country-highlight-glow-inner',
      type: 'line',
      source: 'country-highlight',
      paint: {
        'line-color': '#ffcf6b',
        'line-width': 5,
        'line-blur': 5,
        'line-opacity': 0.55,
      },
    },
    firstSymbol
  );

  // Crisp border on top
  map.addLayer(
    {
      id: 'country-highlight-line',
      type: 'line',
      source: 'country-highlight',
      paint: {
        'line-color': '#ffe6b3',
        'line-width': 1.5,
        'line-opacity': 0.9,
      },
    },
    firstSymbol
  );

  highlightLayersAdded = true;
  console.log('[Map] Country highlight layers added');
}

function applyCountryHighlight(name, geojson) {
  addCountryHighlightLayers();
  const source = map.getSource('country-highlight');
  if (!source) return;

  source.setData(geojson ?? EMPTY_FEATURE_COLLECTION);
  console.log('[Highlight] Country →', name, geojson ? 'ON' : '(no border data)');
}

export async function highlightCountry(name) {
  if (!map || !name) return;

  const geojson = await loadCountryBorder(name);

  // addSource/addLayer throw if the style hasn't finished loading yet — a real
  // race if a curated country is clicked (UI is interactive immediately) before
  // the vector tile style resolves. Defer to the pending 'load' event instead.
  if (!map.isStyleLoaded()) {
    map.once('load', () => applyCountryHighlight(name, geojson));
    return;
  }

  applyCountryHighlight(name, geojson);
}

export function clearCountryHighlight() {
  if (!map) return;
  const source = map.getSource('country-highlight');
  if (source) source.setData(EMPTY_FEATURE_COLLECTION);
}

// ---------------------------------------------------------------------------
// CAMERA (STABLE — DO NOT MODIFY)
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

export function flyToCoords(lngLat, zoom = 12, pitch = 30, bearing = 0) {
  flyTo({ center: lngLat, zoom, pitch, bearing });
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

function logLayerStack() {
  const layers = map.getStyle().layers;
  const custom = layers.filter(l =>
    ['orbital-layer', 'night-layer', 'night-background',
     'clouds-layer', 'satellite-layer', 'sky'].includes(l.id)
  );
  console.log(
    '[Map] Layer stack (custom):',
    custom.map(l => `${l.id} [${l.layout?.visibility ?? 'visible'}]`)
  );
}

// ---------------------------------------------------------------------------
// BOTTOM BAR — custom control container
// ---------------------------------------------------------------------------
// Adds Attribution, Scale, and Navigation controls to the map then moves
// their rendered DOM nodes into #bottom-bar in the desired order:
//   [Built by Xexin.] [Attribution] [Scale] [Nav]

function initBottomBar() {
  const bar = document.getElementById('bottom-bar');
  if (!bar) return;

  const attribCtrl = new maplibregl.AttributionControl({ compact: true });
  const scaleCtrl  = new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' });
  const navCtrl    = new maplibregl.NavigationControl({ showCompass: true });

  // Add to map so MapLibre wires up their internal state
  map.addControl(attribCtrl, 'bottom-right');
  map.addControl(scaleCtrl,  'bottom-right');
  map.addControl(navCtrl,    'bottom-right');

  // After a tick the controls have rendered their _container elements
  requestAnimationFrame(() => {
    const credit = bar.querySelector('.bar-credit');

    // Insert in order after the credit span
    if (attribCtrl._container) bar.insertBefore(attribCtrl._container, null);
    if (scaleCtrl._container)  bar.insertBefore(scaleCtrl._container, null);
    if (navCtrl._container)    bar.insertBefore(navCtrl._container, null);

    // Hide the now-empty MapLibre corner container
    const corner = document.querySelector('.maplibregl-ctrl-bottom-right');
    if (corner) corner.style.display = 'none';

    console.log('[Map] Bottom bar assembled');
  });
}

export function getMap() {
  return map;
}
