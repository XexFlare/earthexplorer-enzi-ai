// ai.js — AI integration placeholder
//
// Future capabilities planned for this module:
//   - Natural language location search  ("Show me the Shire Highlands")
//   - Contextual descriptions of the current map view
//   - AI-guided exploration and narrated tours
//   - Scene analysis using vision models

export async function queryAI(prompt, context = {}) {
  console.log('[AI] Query received:', prompt, context);
  // TODO: integrate Claude or another LLM via the Anthropic API
  return { status: 'not_implemented', response: null };
}

export async function describeView(center, zoom) {
  console.log('[AI] Describe view — center:', center, 'zoom:', zoom);
  // TODO: reverse geocode + LLM summary of the current map extent
  return { status: 'not_implemented', description: null };
}
