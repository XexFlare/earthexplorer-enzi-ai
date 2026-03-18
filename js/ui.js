// ui.js — Sidebar rendering and navigation transitions
//
// Renders the panel shell once; swaps the nav-body content on each navigation
// action with a directional fade+slide animation.
// All navigation state lives in events.js — this module only renders and reacts.

import { getCountries } from './data.js';
import {
  onNavChange,
  navigateTo,
  navigateBack,
  resetNavigation,
  getCurrentState,
  isAtTopLevel,
} from './events.js';
import { setSatelliteVisible, setNightMode, setCloudsVisible } from './map.js';

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export function initUI(containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = renderShell();

  bindStaticEvents(container);

  initAIPanel();

  // Re-render nav area whenever navigation state changes.
  onNavChange(({ direction, state }) => {
    updateNavBar(state);
    setSidebarExpanded(state.level === 'detail' && !!state.location?.image);
    setAIPanelVisible(state.level === 'detail', state);
    transitionNavBody(renderForState(state), direction);
  });

  // Render initial state (countries) without animation.
  const initial = getCurrentState();
  updateNavBar(initial);
  setSidebarExpanded(false);
  setAIPanelVisible(false);
  initNavBody(renderForState(initial));
}

// ---------------------------------------------------------------------------
// Panel shell — rendered once, never replaced
// ---------------------------------------------------------------------------

function renderShell() {
  return `
    <div class="panel">

      <header class="panel-header">
        <div class="panel-logo"><img src="images/logo.png" alt="Earth Explorer logo" class="panel-logo-img" /></div>
        <div class="panel-title-group">
          <h1 class="panel-title">Earth Explorer</h1>
          <p class="panel-subtitle">Enzi</p>
        </div>
      </header>

      <div class="nav-section">
        <div class="nav-bar" id="nav-bar">
          <button class="back-btn" id="back-btn" hidden aria-label="Go back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                 stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <span class="nav-breadcrumb" id="nav-breadcrumb">Explore</span>
        </div>
        <div class="nav-body" id="nav-body"></div>
      </div>

      <section class="panel-section">
        <h2 class="section-label">Layers</h2>
        <label class="layer-toggle">
          <span class="toggle-label-text">Satellite Imagery</span>
          <div class="toggle-switch">
            <input type="checkbox" id="satellite-toggle" />
            <span class="toggle-track"></span>
          </div>
        </label>
        <label class="layer-toggle">
          <span class="toggle-label-text">City Lights</span>
          <div class="toggle-switch">
            <input type="checkbox" id="night-toggle" />
            <span class="toggle-track"></span>
          </div>
        </label>
        <label class="layer-toggle">
          <span class="toggle-label-text">Clouds</span>
          <div class="toggle-switch">
            <input type="checkbox" id="clouds-toggle" />
            <span class="toggle-track"></span>
          </div>
        </label>
      </section>

      <footer class="panel-footer">
        <button class="world-btn" id="world-view-btn" aria-label="Return to world view">
          <svg class="world-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          World View
        </button>
      </footer>

    </div>
  `;
}

// ---------------------------------------------------------------------------
// Static event bindings — wired once on init
// ---------------------------------------------------------------------------

function bindStaticEvents(container) {
  container.querySelector('#back-btn').addEventListener('click', () => {
    navigateBack();
  });

  container.querySelector('#satellite-toggle').addEventListener('change', e => {
    setSatelliteVisible(e.target.checked);
  });

  container.querySelector('#night-toggle').addEventListener('change', e => {
    setNightMode(e.target.checked);
  });

  container.querySelector('#clouds-toggle').addEventListener('change', e => {
    setCloudsVisible(e.target.checked);
  });

  container.querySelector('#world-view-btn').addEventListener('click', () => {
    resetNavigation();
  });
}

// ---------------------------------------------------------------------------
// Nav bar — breadcrumb label and back button visibility
// ---------------------------------------------------------------------------

function updateNavBar(state) {
  document.getElementById('back-btn').hidden = isAtTopLevel();

  const labels = {
    countries: 'Explore',
    cities:    state.country?.name ?? '',
    locations: state.city?.name ?? '',
    detail:    state.city?.name ?? '',
  };

  document.getElementById('nav-breadcrumb').textContent = labels[state.level] ?? '';
}

// ---------------------------------------------------------------------------
// Nav body — view rendering
// ---------------------------------------------------------------------------

function renderForState(state) {
  switch (state.level) {
    case 'countries': return renderCountries();
    case 'cities':    return renderCities(state.country);
    case 'locations': return renderLocations(state.city);
    case 'detail':    return renderDetail(state.location);
    default:          return '';
  }
}

function renderCountries() {
  return navList(
    getCountries().map((c, i) => navBtn(i, 'country', c.name,
      `${c.cities.length} ${c.cities.length === 1 ? 'city' : 'cities'}`
    ))
  );
}

function renderCities(country) {
  return navList(
    country.cities.map((c, i) => navBtn(i, 'city', c.name,
      `${c.locations.length} highlight${c.locations.length === 1 ? '' : 's'}`
    ))
  );
}

function renderLocations(city) {
  return navList(
    city.locations.map((l, i) => navBtn(i, 'location', l.name))
  );
}

function renderDetail(location) {
  const imgHtml = location.image
    ? `<img class="location-detail-image" src="${location.image}" alt="${location.name}" />`
    : '';
  return `
    <div class="location-detail">
      <h3 class="location-detail-name">${location.name}</h3>
      <p class="location-detail-desc">${location.description}</p>
      ${imgHtml}
    </div>
  `;
}

// Helpers for building nav list markup
function navList(items) {
  return `<div class="nav-list">${items.join('')}</div>`;
}

function navBtn(index, action, primary, secondary = '') {
  return `
    <button class="nav-btn" data-action="${action}" data-index="${index}">
      <span class="nav-btn-primary">${primary}</span>
      ${secondary ? `<span class="nav-btn-secondary">${secondary}</span>` : ''}
    </button>
  `;
}

// ---------------------------------------------------------------------------
// View transitions
// ---------------------------------------------------------------------------

// Expand or collapse the sidebar. Expansion only happens when a location
// detail has an image; everything else keeps the default 240px width.
function setSidebarExpanded(expand) {
  document.getElementById('ui-panel').classList.toggle('expanded', expand);
}

// If the view contains a location image, attach an onerror handler so a
// broken path collapses the sidebar and removes the broken element rather
// than leaving an empty frame.
function bindImageEvents(view) {
  const img = view.querySelector('.location-detail-image');
  if (!img) return;
  img.addEventListener('error', () => {
    img.remove();
    setSidebarExpanded(false);
  }, { once: true });
}

// Initial render — no animation.
function initNavBody(html) {
  const body = document.getElementById('nav-body');
  body.innerHTML = '';
  const view = makeView(html);
  body.appendChild(view);
  bindViewEvents(view);
  bindImageEvents(view);
}

// Animated swap: old view slides out, new view slides in.
function transitionNavBody(html, direction) {
  const body = document.getElementById('nav-body');
  const oldView = body.firstElementChild;
  const newView = makeView(html);

  if (!oldView) {
    body.appendChild(newView);
    bindViewEvents(newView);
    bindImageEvents(newView);
    return;
  }

  const exitClass  = direction === 'forward' ? 'exit-forward'  : 'exit-backward';
  const enterClass = direction === 'forward' ? 'enter-forward' : 'enter-backward';

  // Append new view first — it determines the nav-body height.
  body.appendChild(newView);
  bindViewEvents(newView);
  bindImageEvents(newView);
  newView.classList.add(enterClass);

  // Make old view absolute so it overlays without affecting layout height.
  oldView.classList.add(exitClass);

  // Remove old view after its animation ends. Fallback timeout guards against
  // rare cases where animationend doesn't fire (hidden tab, reduced motion, etc.).
  const cleanup = () => { if (oldView.parentElement) oldView.remove(); };
  oldView.addEventListener('animationend', cleanup, { once: true });
  setTimeout(cleanup, 350);
}

function makeView(html) {
  const div = document.createElement('div');
  div.className = 'nav-view';
  div.innerHTML = html;
  return div;
}

// ---------------------------------------------------------------------------
// View event bindings — re-applied on every nav render
// ---------------------------------------------------------------------------

function bindViewEvents(view) {
  view.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handleNavAction(btn));
  });
}

function handleNavAction(btn) {
  const action = btn.dataset.action;
  const idx    = parseInt(btn.dataset.index, 10);
  const state  = getCurrentState();

  if (action === 'country') {
    const country = getCountries()[idx];
    if (country) navigateTo({ level: 'cities', country });

  } else if (action === 'city') {
    const city = state.country?.cities[idx];
    if (city) navigateTo({ level: 'locations', country: state.country, city });

  } else if (action === 'location') {
    const location = state.city?.locations[idx];
    if (location) navigateTo({ level: 'detail', country: state.country, city: state.city, location });
  }
}

// ---------------------------------------------------------------------------
// AI Panel
// ---------------------------------------------------------------------------

function initAIPanel() {
  const panel = document.getElementById('ai-panel');
  if (!panel) return;

  panel.innerHTML = `
    <div class="ai-panel-inner">
      <div class="ai-header">
        <span class="ai-dot"></span>
        <span class="ai-title">Ask Earth Enzi AI about this location…</span>
      </div>
      <div class="ai-context" id="ai-context"></div>
      <div class="ai-input-row">
        <input id="ai-input" type="text" placeholder="Ask anything…" autocomplete="off" />
        <span class="ai-input-hint">↵ Enter</span>
      </div>
    </div>
  `;

  document.getElementById('ai-input').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const query = e.target.value.trim();
    if (!query) return;
    const state = getCurrentState();
    console.log('[AI] Query:', query);
    console.log('[AI] Context:', {
      locationName: state.location?.name        ?? null,
      cityName:     state.city?.name            ?? null,
      countryName:  state.country?.name         ?? null,
      description:  state.location?.description ?? null,
    });
    e.target.value = '';
  });
}

function setAIPanelVisible(visible, state = null) {
  const panel = document.getElementById('ai-panel');
  if (!panel) return;
  panel.classList.toggle('visible', visible);
  if (visible && state) updateAIContext(state);
}

function updateAIContext(state) {
  const el = document.getElementById('ai-context');
  if (!el) return;
  if (!state?.location) {
    el.innerHTML = '<p class="ai-context-hint">Ask about this location…</p>';
    return;
  }
  el.innerHTML = `
    <p class="ai-context-location">${state.location.name}</p>
    <p class="ai-context-path">${state.city?.name ?? ''}, ${state.country?.name ?? ''}</p>
  `;
}
