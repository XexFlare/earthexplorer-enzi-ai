// events.js — Navigation state and map event coordination

import { getMap, flyToCoords, flyToWorld } from './map.js';
import { toMapCenter } from './data.js';

// ---------------------------------------------------------------------------
// Navigation state
// ---------------------------------------------------------------------------

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
  moveCamera(entry);
  navChangeCallback?.({ direction: 'forward', state: entry });
}

export function navigateBack() {
  if (navStack.length <= 1) return;

  navStack.pop();
  const state = getCurrentState();

  moveCamera(state);
  navChangeCallback?.({ direction: 'backward', state });
}

export function resetNavigation() {
  navStack = [{ level: 'countries' }];
  flyToWorld();
  navChangeCallback?.({ direction: 'backward', state: getCurrentState() });
}

// ---------------------------------------------------------------------------
// Camera movements (FIXED)
// ---------------------------------------------------------------------------

function moveCamera(state) {
  switch (state.level) {

    case 'countries':
      flyToWorld();
      break;

    case 'cities':
      // No camera movement needed
      break;

    case 'locations':
      if (state.city) {
        const {
          coordinates,
          zoom = 10,        // slightly safer default
          pitch = 45,       // reduce aggressive angles
          bearing = 0
        } = state.city;

        flyToCoords(
          toMapCenter(coordinates),
          zoom,
          pitch,
          bearing
        );
      }
      break;

    case 'detail':
      if (state.location) {
        const {
          coordinates,
          zoom = 13,        // IMPORTANT: no more forced deep zoom
          pitch = 45,
          bearing = 0
        } = state.location;

        flyToCoords(
          toMapCenter(coordinates),
          zoom,
          pitch,
          bearing
        );
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

  map.on('click', e => {
    const { lng, lat } = e.lngLat;
    console.log('[Events] Clicked:', {
      lng: lng.toFixed(5),
      lat: lat.toFixed(5)
    });
  });
}