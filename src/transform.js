// Sends the selected text to Claude with the chosen prompt and returns
// only the transformed text. Runs in the Electron main process so the
// API key never reaches the renderer.

const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = [
  'You are a text transformation engine inside a desktop utility.',
  "Apply the user's instruction to the text that follows it and return ONLY the resulting text.",
  'Do not add any preamble, explanation, commentary, quotation marks, or markdown code fences.',
  'Preserve the original language. Keep roughly the same length and format unless the instruction says otherwise.',
  'Output the transformed text and nothing else.',
].join(' ');

function estimateMaxTokens(text) {
  // Rough headroom: ~1 token per 3-4 chars, doubled, clamped.
  const est = Math.ceil(text.length / 2);
  return Math.min(16000, Math.max(1024, est));
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

  // Opus 4.8 and Sonnet 4.6 support adaptive thinking + the effort control.
  // We keep thinking off (snappier inline edits) but run at HIGH effort for
  // stronger rewrites. Haiku 4.5 doesn't accept the effort parameter.
  if (model.startsWith('claude-opus') || model.startsWith('claude-sonnet')) {
    params.thinking = { type: 'disabled' };
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
