// Sends the selected text to Claude with the chosen prompt and returns
// only the transformed text. Runs in the Electron main process so the
// API key never reaches the renderer.

const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = [
  'You are a text transformation engine inside a desktop utility.',
  "Apply the user's instruction to the text that follows it and return ONLY the resulting text.",
  'Do not add any preamble, explanation, commentary, quotation marks, or markdown code fences.',
  'Preserve the original language. Keep roughly the same length unless the instruction says otherwise.',
  'Preserve the original paragraph and line-break structure exactly: do not merge, split, add, or remove paragraphs or blank lines, and keep the same leading/trailing whitespace. Do not add markdown, bullets, headings, or any styling that was not already there.',
  'Output the transformed text and nothing else.',
].join(' ');

function estimateMaxTokens(text) {
  // Rough headroom: ~1 token per 3-4 chars, doubled, clamped.
  // Higher floor leaves room for adaptive thinking + the rewrite on short text.
  const est = Math.ceil(text.length / 2);
  return Math.min(16000, Math.max(4096, est));
}

async function transformText({ apiKey, model, promptText, text }) {
  const client = new Anthropic({ apiKey });

  const params = {
    model,
    max_tokens: estimateMaxTokens(text),
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: `${promptText}\n\n---\n${text}` },
    ],
  };

  // Fable 5, Opus 4.8, and Sonnet 4.6: adaptive thinking (Claude decides how
  // much to think per request) + HIGH effort for the strongest rewrites.
  // (Verified via the Models API: all three support adaptive + effort.)
  // Haiku 4.5 doesn't accept the effort parameter, so we send neither.
  if (model.startsWith('claude-fable') || model.startsWith('claude-opus') || model.startsWith('claude-sonnet')) {
    params.thinking = { type: 'adaptive' };
    params.output_config = { effort: 'high' };
  }

  const message = await client.messages.create(params);
  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

module.exports = { transformText, SYSTEM_PROMPT };
