// Persists settings to a JSON file in the OS user-data folder.
// The API key is encrypted with Electron's safeStorage when available,
// and is never returned to the settings window in plain text.

const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  // CommandOrControl => Cmd on macOS, Ctrl on Windows/Linux.
  shortcut: 'CommandOrControl+L',
  model: 'claude-fable-5',
  prompts: [
    { id: 'default', name: 'Improve writing', text: 'Make this text better.' },
  ],
  activePromptId: 'default',
};

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

function writeRaw(obj) {
  fs.writeFileSync(configPath(), JSON.stringify(obj, null, 2));
}

function getConfig() {
  const raw = readRaw();
  return {
    shortcut: raw.shortcut || DEFAULTS.shortcut,
    model: raw.model || DEFAULTS.model,
    prompts: Array.isArray(raw.prompts) && raw.prompts.length ? raw.prompts : DEFAULTS.prompts,
    activePromptId: raw.activePromptId || DEFAULTS.activePromptId,
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
  for (const key of ['shortcut', 'model', 'prompts', 'activePromptId']) {
    if (partial[key] !== undefined) next[key] = partial[key];
  }
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
