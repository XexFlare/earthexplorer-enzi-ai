// app.js — Main application controller
//
// Coordinates module initialisation and acts as the entry point.
// Keep orchestration logic here; domain logic belongs in the other modules.

import { loadData } from './data.js';
import { initMap, getMap } from './map.js';
import { initUI } from './ui.js';
import { initEvents } from './events.js';

async function init() {
  if (typeof maplibregl === 'undefined') {
    console.error('[App] MapLibre GL JS failed to load. Check your internet connection.');
    return;
  }

  // Location data must be ready before the UI renders any country/city lists.
  try {
    await loadData();
  } catch (err) {
    console.error('[App] Could not load location data.', err);
    // Show a visible message in the panel so it's clear what went wrong.
    const panel = document.getElementById('ui-panel');
    if (panel) panel.innerHTML = `<div style="padding:20px;color:rgba(255,255,255,0.5);font-size:13px">[Error] Failed to load locations.json.<br>${err.message}</div>`;
    return;
  }

  const map = initMap('map');
  initUI('ui-panel');

  // Wire up global map events after the map is ready
  map.on('load', () => initEvents());
}

// ES modules are deferred by default, but guard against edge cases
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
