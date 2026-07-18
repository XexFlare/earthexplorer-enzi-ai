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
import { setSatelliteVisible, setNightMode, setCloudsVisible, setEarthRotation } from './map.js';
import { queryAI } from './ai.js';

// ---------------------------------------------------------------------------
// Country explorer state
// ---------------------------------------------------------------------------

let isExpanded = false;
let cloudsVisible = true;   // clouds on by default; toggle label shows the next action
let isRotating    = true;   // earth rotation on by default

let timeMode = 'night'; // always start in night mode

let CURATED_COUNTRIES = ['Malawi', 'South Africa', 'Portugal', 'United States'];

async function getUserCountry() {
  try {
    const res  = await fetch('https://ipapi.co/json/');
    const data = await res.json();
    return data.country_name ?? null;
  } catch (err) {
    console.warn('[IP] Country lookup failed:', err.message);
    return null;
  }
}

function isValidReplacement(countryName, allCountries) {
  const excluded = ['Malawi', 'South Africa', 'United States'];
  if (!countryName) return false;
  const exists     = allCountries.some(c => c.name === countryName);
  const isExcluded = excluded.includes(countryName);
  return exists && !isExcluded;
}

function getEnvCountryOverride() {
  if (typeof import.meta !== 'undefined' && import.meta.env)
    return import.meta.env.VITE_COUNTRY_TEST;
  if (typeof process !== 'undefined' && process.env)
    return process.env.REACT_APP_COUNTRY_TEST;
  if (typeof window !== 'undefined' && window.ENV)
    return window.ENV.COUNTRY_TEST;
  return null;
}

const RAW_ENV_COUNTRY = (getEnvCountryOverride() || '').trim();

// ISO 3166-1 alpha-2 lookup for flag emoji generation
const COUNTRY_ISO_CODES = {
  'Afghanistan': 'AF', 'Albania': 'AL', 'Algeria': 'DZ', 'Angola': 'AO',
  'Argentina': 'AR', 'Australia': 'AU', 'Austria': 'AT', 'Bangladesh': 'BD',
  'Belgium': 'BE', 'Bolivia': 'BO', 'Botswana': 'BW', 'Brazil': 'BR',
  'Cambodia': 'KH', 'Cameroon': 'CM', 'Canada': 'CA', 'Chile': 'CL',
  'China': 'CN', 'Colombia': 'CO', 'Croatia': 'HR', 'Czech Republic': 'CZ',
  'Denmark': 'DK', 'Egypt': 'EG', 'Ethiopia': 'ET', 'Finland': 'FI',
  'France': 'FR', 'Germany': 'DE', 'Ghana': 'GH', 'Greece': 'GR',
  'Hungary': 'HU', 'India': 'IN', 'Indonesia': 'ID', 'Ireland': 'IE',
  'Israel': 'IL', 'Italy': 'IT', 'Japan': 'JP', 'Jordan': 'JO',
  'Kenya': 'KE', 'Laos': 'LA', 'Lebanon': 'LB', 'Libya': 'LY',
  'Malawi': 'MW', 'Malaysia': 'MY', 'Mali': 'ML', 'Mexico': 'MX',
  'Morocco': 'MA', 'Mozambique': 'MZ', 'Myanmar': 'MM', 'Nepal': 'NP',
  'Netherlands': 'NL', 'New Zealand': 'NZ', 'Nigeria': 'NG', 'Norway': 'NO',
  'Pakistan': 'PK', 'Peru': 'PE', 'Philippines': 'PH', 'Poland': 'PL',
  'Portugal': 'PT', 'Romania': 'RO', 'Russia': 'RU', 'Rwanda': 'RW',
  'Saudi Arabia': 'SA', 'Senegal': 'SN', 'Serbia': 'RS', 'Singapore': 'SG',
  'South Africa': 'ZA', 'South Korea': 'KR', 'Spain': 'ES', 'Sri Lanka': 'LK',
  'Sudan': 'SD', 'Sweden': 'SE', 'Switzerland': 'CH', 'Syria': 'SY',
  'Taiwan': 'TW', 'Tanzania': 'TZ', 'Thailand': 'TH', 'Tunisia': 'TN',
  'Turkey': 'TR', 'Uganda': 'UG', 'Ukraine': 'UA',
  'United Arab Emirates': 'AE', 'United Kingdom': 'GB', 'United States': 'US',
  'Uruguay': 'UY', 'Venezuela': 'VE', 'Vietnam': 'VN', 'Yemen': 'YE',
  'Zambia': 'ZM', 'Zimbabwe': 'ZW',
};

// Convert country name → regional indicator emoji pair
function countryFlag(name) {
  const iso = COUNTRY_ISO_CODES[name];
  if (!iso) return '';
  return [...iso.toUpperCase()].map(c =>
    String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)
  ).join('');
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export function initUI(containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = renderShell();

  bindStaticEvents(container);

  initAIPanel();
  initEnziHome();

  // Re-render nav area whenever navigation state changes.
  onNavChange(({ direction, state }) => {
    // Collapse expanded explorer whenever navigation moves away from or resets to countries
    if (isExpanded) {
      isExpanded = false;
      document.getElementById('ui-panel').classList.remove('country-explorer');
    }
    updateNavBar(state);
    setSidebarExpanded(state.level === 'detail' && !!state.location?.image);
    setAIPanelVisible(state.level === 'detail', state);
    setEnziHomeVisible(state.level === 'countries');
    transitionNavBody(renderForState(state), direction);
  });

  // Render initial state (countries) without animation.
  const initial = getCurrentState();
  updateNavBar(initial);
  setSidebarExpanded(false);
  setAIPanelVisible(false);
  initNavBody(renderForState(initial));

  // Apply night mode default after map layers are ready
  setTimeout(() => {
    setNightMode(true);
    document.getElementById('tod-value').textContent = 'Night';
    const nightOpt = document.querySelector('.tod-option[data-mode="night"]');
    if (nightOpt) nightOpt.classList.add('tod-option--selected');
  }, 100);

  // Personalise the 3rd curated slot (Portugal) — ENV override takes priority over IP
  getUserCountry().then(userCountry => {
    const all = getCountries();
    let finalCountry = null;

    if (isValidReplacement(RAW_ENV_COUNTRY, all)) {
      finalCountry = RAW_ENV_COUNTRY;
    } else if (isValidReplacement(userCountry, all)) {
      finalCountry = userCountry;
    } else {
      return;
    }

    if (CURATED_COUNTRIES.includes(finalCountry)) return;

    CURATED_COUNTRIES[2] = finalCountry;
    console.log('[IP] Using country:', finalCountry);

    if (getCurrentState().level === 'countries') {
      initNavBody(renderForState(getCurrentState()));
    }
  });
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

        <!-- 1. Time of Day -->
        <div class="layer-toggle time-of-day-row" id="time-of-day-row">
          <span class="toggle-label-text">Time of Day</span>
          <div class="tod-selector" id="tod-selector">
            <button class="tod-btn" id="tod-btn" type="button">
              <span id="tod-value">Night</span>
              <svg class="tod-chevron" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2.5"
                   stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            <div class="tod-dropdown" id="tod-dropdown" hidden>
              <button class="tod-option" data-mode="day"   type="button">Day</button>
              <button class="tod-option" data-mode="night" type="button">Night</button>
            </div>
          </div>
        </div>

        <!-- 2. Satellite Imagery -->
        <label class="layer-toggle">
          <span class="toggle-label-text">Satellite Imagery</span>
          <div class="toggle-switch">
            <input type="checkbox" id="satellite-toggle" />
            <span class="toggle-track"></span>
          </div>
        </label>

        <!-- 3. Clouds -->
        <label class="layer-toggle">
          <span class="toggle-label-text" id="clouds-label">Clouds Off</span>
          <div class="toggle-switch">
            <input type="checkbox" id="clouds-toggle" />
            <span class="toggle-track"></span>
          </div>
        </label>

        <!-- 4. Earth Rotation -->
        <label class="layer-toggle">
          <span class="toggle-label-text" id="rotation-label">Earth Rotation Off</span>
          <div class="toggle-switch">
            <input type="checkbox" id="rotation-toggle" />
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
    if (isExpanded) {
      isExpanded = false;
      document.getElementById('ui-panel').classList.remove('country-explorer');
      transitionNavBody(renderForState(getCurrentState()), 'backward');
      updateNavBar(getCurrentState());
      return;
    }
    navigateBack();
  });

  container.querySelector('#satellite-toggle').addEventListener('change', e => {
    setSatelliteVisible(e.target.checked);
  });

  // Time of Day — dropdown toggle
  container.querySelector('#tod-btn').addEventListener('click', () => {
    const dropdown = document.getElementById('tod-dropdown');
    dropdown.hidden = !dropdown.hidden;
    document.getElementById('tod-btn').classList.toggle('tod-btn--open', !dropdown.hidden);
  });

  // Time of Day — option selection
  container.querySelectorAll('.tod-option').forEach(opt => {
    opt.addEventListener('click', () => {
      timeMode = opt.dataset.mode;
      setNightMode(timeMode === 'night');
      document.getElementById('tod-value').textContent =
        timeMode === 'night' ? 'Night' : 'Day';
      // Mark selected option
      container.querySelectorAll('.tod-option').forEach(o =>
        o.classList.toggle('tod-option--selected', o.dataset.mode === timeMode)
      );
      document.getElementById('tod-dropdown').hidden = true;
      document.getElementById('tod-btn').classList.remove('tod-btn--open');
    });
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', e => {
    const selector = document.getElementById('tod-selector');
    if (selector && !selector.contains(e.target)) {
      document.getElementById('tod-dropdown').hidden = true;
      document.getElementById('tod-btn').classList.remove('tod-btn--open');
    }
  });

  // Clouds (inverted: checked = OFF)
  container.querySelector('#clouds-toggle').addEventListener('change', e => {
    cloudsVisible = !e.target.checked;
    setCloudsVisible(cloudsVisible);
    document.getElementById('clouds-label').textContent =
      cloudsVisible ? 'Clouds Off' : 'Clouds On';
  });

  // Earth Rotation (inverted: checked = OFF, same pattern as clouds)
  container.querySelector('#rotation-toggle').addEventListener('change', e => {
    isRotating = !e.target.checked;
    setEarthRotation(isRotating);
    document.getElementById('rotation-label').textContent =
      isRotating ? 'Earth Rotation Off' : 'Earth Rotation On';
  });

  container.querySelector('#world-view-btn').addEventListener('click', () => {
    resetNavigation();
  });
}

// ---------------------------------------------------------------------------
// Nav bar — breadcrumb label and back button visibility
// ---------------------------------------------------------------------------

function updateNavBar(state) {
  document.getElementById('back-btn').hidden = isAtTopLevel() && !isExpanded;

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
  return isExpanded ? renderExpandedCountries() : renderCuratedCountries();
}

function renderCuratedCountries() {
  const all = getCountries();
  const total = all.length;

  // Preview: countries not in the curated list, sorted A→Z, first 3
  const preview = all
    .filter(c => !CURATED_COUNTRIES.includes(c.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 3)
    .map(c => c.name);

  const previewText = preview.length
    ? `${preview.join(', ')} and more`
    : '';

  const curatedHtml = CURATED_COUNTRIES.map(name => {
    const country = all.find(c => c.name === name);
    if (!country) return '';
    const n = country.cities.length;
    return navBtn(all.indexOf(country), 'country', name,
      `${n} ${n === 1 ? 'city' : 'cities'}`);
  }).join('');

  const ctaHtml = `
    <button class="nav-btn nav-btn-cta" data-action="expand">
      <div class="nav-btn-cta-body">
        <span class="nav-btn-primary">See All ${total} Countries</span>
        ${previewText ? `<span class="nav-btn-secondary">${previewText}</span>` : ''}
      </div>
      <svg class="cta-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </button>
  `;

  return `<div class="nav-list">${curatedHtml}${ctaHtml}</div>`;
}

function renderExpandedCountries() {
  const all = getCountries();
  const sorted = [...all].sort((a, b) => a.name.localeCompare(b.name));

  const rows = sorted.map(c => {
    const idx = all.indexOf(c);
    const n   = c.cities.length;
    const flag = countryFlag(c.name);
    return `
      <button class="nav-btn country-row" data-action="country" data-index="${idx}">
        <span class="country-row-name">${c.name}</span>
        <span class="country-row-cities">${n} ${n === 1 ? 'city' : 'cities'}</span>
        ${flag ? `<span class="country-row-flag">${flag}</span>` : ''}
      </button>
    `;
  }).join('');

  return `<div class="nav-list">${rows}</div>`;
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

  if (action === 'expand') {
    isExpanded = true;
    document.getElementById('ui-panel').classList.add('country-explorer');
    transitionNavBody(renderForState(getCurrentState()), 'forward');
    updateNavBar(getCurrentState());
    return;

  } else if (action === 'country') {
    // Collapse explorer panel before navigating
    if (isExpanded) {
      isExpanded = false;
      document.getElementById('ui-panel').classList.remove('country-explorer');
    }
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
// Shared chat-bubble helpers — used by both the location AI panel and the
// Enzi homepage widget so replies render and animate the same way everywhere.
// ---------------------------------------------------------------------------

async function typeIntoElement(text, el, speed = 20) {
  el.textContent = '';
  for (let i = 0; i < text.length; i++) {
    el.textContent += text[i];
    if (el.parentElement) el.parentElement.scrollTop = el.parentElement.scrollHeight;
    await new Promise(r => setTimeout(r, speed));
  }
}

function appendMessageBubble(container, role, text) {
  if (!container) return null;
  const bubble = document.createElement('div');
  bubble.className = `ai-message ai-message--${role}`;
  bubble.textContent = text;
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
  return bubble;
}

function appendThinkingBubble(container) {
  if (!container) return null;
  const bubble = document.createElement('div');
  bubble.className = 'ai-message ai-message--enzi ai-message--thinking';
  bubble.innerHTML = '<span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span>';
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
  return bubble;
}

async function typeReplyBubble(container, text) {
  if (!container) return;
  const bubble = document.createElement('div');
  bubble.className = 'ai-message ai-message--enzi';
  container.appendChild(bubble);
  await typeIntoElement(text, bubble, 15);
  container.scrollTop = container.scrollHeight;
}

// ---------------------------------------------------------------------------
// AI Panel — chat locked to whatever location is currently open
// ---------------------------------------------------------------------------

let aiHistory  = [];
let aiPending  = false;

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
      <div class="ai-messages" id="ai-messages"></div>
      <div class="ai-input-row">
        <input id="ai-input" type="text" placeholder="Ask anything…" autocomplete="off" />
        <span class="ai-input-hint">↵ Enter</span>
      </div>
    </div>
  `;

  const input = document.getElementById('ai-input');
  input.addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return;
    const query = input.value.trim();
    if (!query || aiPending) return;

    const state = getCurrentState();
    input.value = '';
    input.disabled = true;
    aiPending = true;

    const messages = document.getElementById('ai-messages');
    appendMessageBubble(messages, 'user', query);
    aiHistory.push({ role: 'user', content: query });

    const thinking = appendThinkingBubble(messages);

    try {
      const reply = await queryAI(query, {
        mode: 'location',
        location: state.location?.name ?? '',
        city: state.city?.name ?? '',
        country: state.country?.name ?? '',
        description: state.location?.description ?? '',
        knownPlaces: getCountries().map(c => c.name),
        history: aiHistory,
      });
      thinking?.remove();
      await typeReplyBubble(messages, reply);
      aiHistory.push({ role: 'assistant', content: reply });
    } catch (err) {
      console.warn('[AI] Chat failed:', err.message);
      thinking?.remove();
      await typeReplyBubble(messages, 'Enzi is resting right now… try again in a moment.');
    } finally {
      aiPending = false;
      input.disabled = false;
      input.focus();
    }
  });
}

function setAIPanelVisible(visible, state = null) {
  const panel = document.getElementById('ai-panel');
  if (!panel) return;
  panel.classList.toggle('visible', visible);
  if (visible && state) updateAIContext(state);
}

function resetAIThread() {
  aiHistory = [];
  const messages = document.getElementById('ai-messages');
  if (messages) messages.innerHTML = '';
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
  // A fresh location means a fresh conversation — Enzi shouldn't remember
  // the last location's chat once you've navigated somewhere new.
  resetAIThread();
}

// ---------------------------------------------------------------------------
// Enzi Homepage AI — top-right presence, clickable to reply or fly there
// ---------------------------------------------------------------------------

let enziSelectedCountry = null;
let enziExpanded        = false;
let enziHistory         = [];
let enziPending         = false;

async function loadEnziMock() {
  const url = new URL('../ai/enzi_ai_mock.json', import.meta.url).href;
  const res  = await fetch(url);
  return res.json();
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildEnziMessage(country, data) {
  const countryData = data.countries[country];
  const greeting = countryData?.greetings?.length
    ? pickRandom(countryData.greetings)
    : pickRandom(data.fallbackGreeting);
  const intro = pickRandom(data.introductions);
  const fact  = countryData?.facts?.length
    ? pickRandom(countryData.facts)
    : pickRandom(data.fallbackFacts);
  const cta = pickRandom(data.cta);
  return [
    `${greeting}…`,
    intro,
    `Today, I bring you to ${country}. ${fact}`,
    cta,
  ];
}

async function typeLines(lines, container) {
  container.innerHTML = '';
  for (const line of lines) {
    const el = document.createElement('div');
    container.appendChild(el);
    await typeIntoElement(line, el, 35);
    await new Promise(r => setTimeout(r, 250));
  }
}

function initEnziHome() {
  if (document.getElementById('enzi-home')) return;

  const widget = document.createElement('div');
  widget.id        = 'enzi-home';
  widget.innerHTML = `
    <div class="enzi-home-sphere">
      <span class="ai-dot"></span>
    </div>
    <div class="enzi-home-content">
      <div class="enzi-home-body" id="enzi-text"></div>
      <div class="ai-messages enzi-home-messages" id="enzi-messages"></div>
      <div class="enzi-home-actions" id="enzi-actions">
        <div class="ai-input-row">
          <input id="enzi-input" type="text" placeholder="Reply to Enzi…" autocomplete="off" />
          <span class="ai-input-hint">↵ Enter</span>
        </div>
        <button class="world-btn enzi-take-me-btn" id="enzi-take-me-btn" type="button">Take me there</button>
      </div>
    </div>
  `;
  document.body.appendChild(widget);

  // Click anywhere on the widget (outside the reply box/button) to expand it.
  widget.addEventListener('click', e => {
    if (e.target.closest('#enzi-actions')) return;
    enziExpanded = !enziExpanded;
    widget.classList.toggle('expanded', enziExpanded);
  });

  document.getElementById('enzi-take-me-btn').addEventListener('click', e => {
    e.stopPropagation();
    if (!enziSelectedCountry) return;
    navigateTo({ level: 'cities', country: enziSelectedCountry });
  });

  const enziInput = document.getElementById('enzi-input');
  enziInput.addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return;
    const query = enziInput.value.trim();
    if (!query || enziPending || !enziSelectedCountry) return;

    enziInput.value = '';
    enziInput.disabled = true;
    enziPending = true;

    const messages = document.getElementById('enzi-messages');
    appendMessageBubble(messages, 'user', query);
    enziHistory.push({ role: 'user', content: query });

    const thinking = appendThinkingBubble(messages);

    try {
      const reply = await queryAI(query, {
        mode: 'world',
        country: enziSelectedCountry.name,
        knownPlaces: getCountries().map(c => c.name),
        history: enziHistory,
      });
      thinking?.remove();
      await typeReplyBubble(messages, reply);
      enziHistory.push({ role: 'assistant', content: reply });
    } catch (err) {
      console.warn('[Enzi] Chat failed:', err.message);
      thinking?.remove();
      await typeReplyBubble(messages, 'Hmm, the winds are quiet right now… try again shortly.');
    } finally {
      enziPending = false;
      enziInput.disabled = false;
      enziInput.focus();
    }
  });

  setTimeout(async () => {
    try {
      const [data, countries] = await Promise.all([
        loadEnziMock(),
        Promise.resolve(getCountries()),
      ]);
      if (!countries.length) return;

      const selected = pickRandom(countries);
      enziSelectedCountry = selected;
      const lines = buildEnziMessage(selected.name, data);

      widget.classList.add('visible');
      const container = document.getElementById('enzi-text');
      if (!container) return;
      await typeLines(lines, container);
    } catch (err) {
      console.warn('[Enzi] Homepage AI failed:', err.message);
    }
  }, 3500);
}

function setEnziHomeVisible(visible) {
  const widget = document.getElementById('enzi-home');
  if (!widget) return;
  widget.classList.toggle('dimmed', !visible);
  if (!visible) {
    enziExpanded = false;
    widget.classList.remove('expanded');
  }
}
