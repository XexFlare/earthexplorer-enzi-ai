// events.js — Navigation state and map event coordination
//
// Owns the nav stack. All navigation actions go through this module.
// map.js is called here for camera movement; ui.js registers a callback
// to be notified of state changes and re-render accordingly.
//
// Dependency chain: ui.js → events.js → map.js  (no circular imports)

import { getMap, flyToCoords, flyToWorld } from './map.js';
import { toMapCenter } from './data.js';

// ---------------------------------------------------------------------------
// Navigation state
// ---------------------------------------------------------------------------
// Each stack frame: { level, country?, city?, location? }
// Levels: 'countries' | 'cities' | 'locations' | 'detail'

let navStack = [{ level: 'countries' }];
let navChangeCallback = null;

export function onNavChange(callback) {
  navChangeCallback = callback;
}

export function getCurrentState() {
  return navStack[navStack.length - 1];
}

export function isAtTopLevel() {
  return navStack.length === 1;
}

// ---------------------------------------------------------------------------
// Navigation actions
// ---------------------------------------------------------------------------

export function navigateTo(entry) {
  navStack.push(entry);
  moveCamera(entry, 'forward');
  navChangeCallback?.({ direction: 'forward', state: entry });
}

export function navigateBack() {
  if (navStack.length <= 1) return;
  navStack.pop();
  const state = getCurrentState();
  moveCamera(state, 'backward');
  navChangeCallback?.({ direction: 'backward', state });
}

// Reset to top level and return camera to world view (used by the World View button).
export function resetNavigation() {
  navStack = [{ level: 'countries' }];
  flyToWorld();
  navChangeCallback?.({ direction: 'backward', state: getCurrentState() });
}

// ---------------------------------------------------------------------------
// Camera movements
// ---------------------------------------------------------------------------

function moveCamera(state, direction) {
  switch (state.level) {

    case 'countries':
      // Returning to the top level — fly out to world view.
      flyToWorld();
      break;

    case 'cities':
      // Entering a country's city list — no single coordinate to fly to.
      break;

    case 'locations':
      // Forward: flying into a city. Backward: returning from a location detail.
      // In both cases, centre on the city.
      if (state.city) {
        const { coordinates, zoom = 12, pitch = 55, bearing = 0 } = state.city;
        flyToCoords(toMapCenter(coordinates), zoom, pitch, bearing);
      }
      break;

    case 'detail':
      // Flying to a specific highlight location.
      if (state.location) {
        flyToCoords(toMapCenter(state.location.coordinates), 15, 60, 0);
      }
      break;
  }
}

// ---------------------------------------------------------------------------
// Map event listeners
// ---------------------------------------------------------------------------

export function initEvents() {
  const map = getMap();
  if (!map) return;

  // Log coordinates on click — useful for debugging and future AI context.
  map.on('click', e => {
    const { lng, lat } = e.lngLat;
    console.log('[Events] Clicked:', { lng: lng.toFixed(5), lat: lat.toFixed(5) });
  });
}
