// events.js — Navigation state and map coordination (STABLE VERSION)

import { getMap, flyToCoords, flyToWorld, highlightCountry, clearCountryHighlight } from './map.js';
import { toMapCenter } from './data.js';

// ---------------------------------------------------------------------------
// Navigation state
// ---------------------------------------------------------------------------

let navStack = [{ level: 'countries' }];
let navChangeCallback = null;

// Prevent overlapping camera transitions
let isNavigating = false;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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
  // 🔥 HARD RESET — ignore any current navigation
  navStack = [{ level: 'countries' }];

  isNavigating = false; // force unlock

  const map = getMap();
  map.stop(); // kill any in-progress animation

  flyToWorld();
  clearCountryHighlight();

  navChangeCallback?.({
    direction: 'backward',
    state: getCurrentState()
  });
}

// ---------------------------------------------------------------------------
// Camera control (CORE FIX)
// ---------------------------------------------------------------------------

function moveCamera(state) {
  const map = getMap();
  if (!map) return;

  // 🔒 Prevent overlapping camera moves
  if (isNavigating) {
    map.stop(); // cancel previous movement
    isNavigating = false;
  }

  isNavigating = true;

  const done = () => {
    isNavigating = false;
  };

  switch (state.level) {

    case 'countries':
      flyToWorld();
      clearCountryHighlight();
      break;

    case 'cities':
      // no camera movement — country glows in place on the full-earth view
      if (state.country) highlightCountry(state.country.name);
      done();
      return;

    case 'locations':
      if (state.city) {
        const {
          coordinates,
          zoom = 10,
          pitch = 45,
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
          zoom = 13,
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

  // ✅ Unlock when movement actually finishes
  map.once('moveend', done);
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