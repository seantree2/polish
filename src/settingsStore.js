// Persists settings to a JSON file in the OS user-data folder.
// The API key is encrypted with Electron's safeStorage when available,
// and is never returned to the settings window in plain text.

const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  // CommandOrControl => Cmd on macOS, Ctrl on Windows/Linux.
  shortcut: 'CommandOrControl+L',
  model: 'claude-opus-4-8',
  prompts: [
    { id: 'default', name: 'Improve writing', text: 'Make this text better.' },
  ],
  activePromptId: 'default',
  // Soft "pop" when the spinner appears + finishes. On by default; toggled in Settings.
  sound: true,
};

// Models that have been retired/suspended. Anyone whose saved config still
// points at one is transparently moved to the recommended replacement, so the
// app never tries to call a model the API will 404 on.
const RETIRED_MODELS = { 'claude-fable-5': 'claude-opus-4-8' };

function normalizeModel(model) {
  return RETIRED_MODELS[model] || model || DEFAULTS.model;
}

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function readRaw() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch {
    return {};
  }
}

// PRIVACY GUARD: config.json is the ONLY thing Polish ever writes to disk, and it must
// never contain the text you refine. The writer below hard-limits what can be saved to
// this explicit allowlist of setting keys — anything else (e.g. text accidentally
// attached to the config object by future code) is dropped before it can touch disk.
// The text you refine and Claude's output live ONLY in memory during a transform; they
// are never written here, never logged, and never saved anywhere.
const PERSIST_KEYS = ['shortcut', 'model', 'prompts', 'activePromptId', 'sound', 'apiKeyEnc', 'apiKeyPlain'];

function writeRaw(obj) {
  const safe = {};
  for (const key of PERSIST_KEYS) if (obj[key] !== undefined) safe[key] = obj[key];
  fs.writeFileSync(configPath(), JSON.stringify(safe, null, 2));
}

function getConfig() {
  const raw = readRaw();
  return {
    shortcut: raw.shortcut || DEFAULTS.shortcut,
    model: normalizeModel(raw.model),
    prompts: Array.isArray(raw.prompts) && raw.prompts.length ? raw.prompts : DEFAULTS.prompts,
    activePromptId: raw.activePromptId || DEFAULTS.activePromptId,
    sound: raw.sound !== false, // default on
  };
}

// Safe view sent to the settings window — only a boolean for the secret.
function getPublicConfig() {
  return { ...getConfig(), hasApiKey: hasApiKey() };
}

function isFirstRun() {
  return !fs.existsSync(configPath());
}

function saveConfig(partial) {
  const raw = readRaw();
  const next = { ...raw };
  for (const key of ['shortcut', 'model', 'prompts', 'activePromptId', 'sound']) {
    if (partial[key] !== undefined) next[key] = partial[key];
  }
  if (next.model !== undefined) next.model = normalizeModel(next.model);
  writeRaw(next);
  return getConfig();
}

function setApiKey(key) {
  const raw = readRaw();
  if (key && safeStorage.isEncryptionAvailable()) {
    raw.apiKeyEnc = safeStorage.encryptString(key).toString('base64');
    delete raw.apiKeyPlain;
  } else if (key) {
    raw.apiKeyPlain = key;
    delete raw.apiKeyEnc;
  } else {
    delete raw.apiKeyEnc;
    delete raw.apiKeyPlain;
  }
  writeRaw(raw);
}

function getApiKey() {
  const raw = readRaw();
  if (raw.apiKeyEnc && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(raw.apiKeyEnc, 'base64'));
    } catch {
      return null;
    }
  }
  return raw.apiKeyPlain || null;
}

function hasApiKey() {
  return !!getApiKey();
}

module.exports = {
  getConfig,
  getPublicConfig,
  isFirstRun,
  saveConfig,
  setApiKey,
  getApiKey,
  hasApiKey,
};
