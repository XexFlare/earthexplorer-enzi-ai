// ai.js — Enzi chat client
//
// Talks to the /api/chat endpoint served by server.js, which holds the
// OpenAI API key server-side and builds the system prompt that keeps
// replies grounded in whatever location/country context is passed in.

export async function queryAI(message, context = {}) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, context }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  return data.reply;
}
