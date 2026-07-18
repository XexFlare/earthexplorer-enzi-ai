// server.js — static file server + Enzi chat proxy
//
// Replaces `python -m http.server` as the way to run this app. Serves the
// static site exactly as before, and adds POST /api/chat so the frontend
// never needs to see the OpenAI API key: this process holds it server-side
// and proxies chat requests, building a system prompt that keeps Enzi's
// replies grounded in whatever location/country the user is looking at.

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 8008;

// ---------------------------------------------------------------------------
// Minimal .env loader — no dotenv dependency, keeps this project npm-free.
// ---------------------------------------------------------------------------

function loadEnvFile() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// ---------------------------------------------------------------------------
// Static file serving
// ---------------------------------------------------------------------------

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const relPath = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = path.normalize(path.join(ROOT, relPath));

  // Prevent path traversal outside the project root.
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------------------------------------------------------------------------
// POST /api/chat — Enzi's brain
// ---------------------------------------------------------------------------

function buildSystemPrompt(context) {
  const knownPlaces = Array.isArray(context.knownPlaces) ? context.knownPlaces.join(', ') : '';

  if (context.mode === 'location') {
    return [
      `You are Enzi, a warm, knowledgeable travel guide inside the "Earth Explorer" map app.`,
      `The user is currently looking at: ${context.location} in ${context.city}, ${context.country}.`,
      context.description ? `What we know about it: ${context.description}` : '',
      ``,
      `Rules:`,
      `- Only discuss this specific location, and reasonable general knowledge about it, its city, or its country.`,
      `- If the user asks about a different place, do NOT answer that question. Instead, tell them (in character, warmly) that they'll need to go there first — name the place — then pivot back by sharing one interesting fact about ${context.location} to re-engage them.`,
      knownPlaces ? `- Places actually available to explore in this app: ${knownPlaces}. Prefer naming one of these when redirecting, if relevant.` : '',
      `- Keep replies short: 2-4 sentences, warm and in character.`,
    ].filter(Boolean).join('\n');
  }

  // mode: 'world'
  return [
    `You are Enzi, a warm, knowledgeable travel guide inside the "Earth Explorer" map app.`,
    `You've just introduced the user to ${context.country}.`,
    knownPlaces ? `Places available to explore in this app: ${knownPlaces}.` : '',
    `Chat with the user about ${context.country} — answer their questions, share interesting facts, and stay in character.`,
    `Keep replies short: 2-4 sentences, warm and in character.`,
  ].filter(Boolean).join('\n');
}

async function handleChat(req, res) {
  let body = '';
  for await (const chunk of req) body += chunk;

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  const { message, context = {} } = payload;
  if (!message || typeof message !== 'string') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing "message" string' }));
    return;
  }

  if (!OPENAI_API_KEY) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'OPENAI_API_KEY is not configured on the server.' }));
    return;
  }

  const history = Array.isArray(context.history) ? context.history.slice(-6) : [];
  const messages = [
    { role: 'system', content: buildSystemPrompt(context) },
    ...history,
    { role: 'user', content: message },
  ];

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages,
        temperature: 0.8,
        max_tokens: 200,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error('[Chat] OpenAI error:', openaiRes.status, errText);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Enzi is having trouble thinking right now.' }));
      return;
    }

    const data = await openaiRes.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || '...';

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ reply }));
  } catch (err) {
    console.error('[Chat] Request failed:', err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Enzi is having trouble thinking right now.' }));
  }
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/chat') {
    handleChat(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Earth Explorer running at http://localhost:${PORT}`);
  if (!OPENAI_API_KEY) {
    console.warn('[Chat] OPENAI_API_KEY not set — copy .env.example to .env and add your key to enable Enzi chat.');
  }
});
