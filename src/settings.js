// Settings window logic. Talks to the main process only through window.polish.

let config = null;
const el = (id) => document.getElementById(id);

function uid() {
  return 'p_' + Math.random().toString(36).slice(2, 9);
}

function setStatus(node, message, kind) {
  node.textContent = message;
  node.className = 'status' + (kind ? ' ' + kind : '');
}

// Friendlier display of an Electron accelerator (e.g. CommandOrControl+L -> Ctrl+L)
function prettyShortcut(accel) {
  const isMac = navigator.platform.toLowerCase().includes('mac');
  return accel
    .replace(/CommandOrControl|CmdOrCtrl/gi, isMac ? 'Cmd' : 'Ctrl')
    .replace(/Command/gi, 'Cmd')
    .replace(/Control/gi, 'Ctrl')
    .replace(/Option/gi, 'Alt');
}

function renderModels() {
  const sel = el('model');
  sel.innerHTML = '';
  for (const m of config.models) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.label;
    if (m.id === config.model) opt.selected = true;
    sel.appendChild(opt);
  }
}

function renderPrompts() {
  const wrap = el('prompts');
  wrap.innerHTML = '';
  config.prompts.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'prompt';

    const head = document.createElement('div');
    head.className = 'prompt-head';

    const name = document.createElement('input');
    name.type = 'text';
    name.value = p.name;
    name.placeholder = 'Name (label only)';
    name.addEventListener('input', () => { p.name = name.value; });

    const activeLabel = document.createElement('label');
    activeLabel.className = 'active-label';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'active';
    radio.checked = p.id === config.activePromptId;
    radio.addEventListener('change', () => { config.activePromptId = p.id; });
    activeLabel.appendChild(radio);
    activeLabel.appendChild(document.createTextNode('Active'));

    const del = document.createElement('button');
    del.className = 'secondary tiny';
    del.textContent = 'Delete';
    del.addEventListener('click', () => {
      if (config.prompts.length === 1) return;
      config.prompts = config.prompts.filter((x) => x.id !== p.id);
      if (config.activePromptId === p.id) config.activePromptId = config.prompts[0].id;
      renderPrompts();
    });

    head.appendChild(name);
    head.appendChild(activeLabel);
    head.appendChild(del);

    const text = document.createElement('textarea');
    text.value = p.text;
    text.placeholder = 'e.g. Make this text better.';
    text.addEventListener('input', () => { p.text = text.value; });

    const nameCap = document.createElement('div');
    nameCap.className = 'caption';
    nameCap.textContent = 'Name — a label for you only (not sent to Claude)';
    const textCap = document.createElement('div');
    textCap.className = 'caption';
    textCap.textContent = 'Instruction sent to Claude ↓ (this is what runs)';

    card.appendChild(nameCap);
    card.appendChild(head);
    card.appendChild(textCap);
    card.appendChild(text);
    wrap.appendChild(card);
  });
}

// ---- shortcut recorder (applies immediately) ----
function accelFromEvent(e) {
  const parts = [];
  if (e.ctrlKey) parts.push('Control');
  if (e.metaKey) parts.push('Command');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  let key = e.key;
  if (['Control', 'Meta', 'Alt', 'Shift'].includes(key)) return null; // wait for a real key
  if (key === ' ') key = 'Space';
  else if (key.length === 1) key = key.toUpperCase();

  if (!parts.length) return null; // require at least one modifier
  parts.push(key);
  return parts.join('+');
}

function startRecording() {
  const input = el('shortcut');
  const prev = input.value;
  input.value = 'Press keys…';
  const handler = async (e) => {
    e.preventDefault();
    const accel = accelFromEvent(e);
    if (!accel) return;
    window.removeEventListener('keydown', handler, true);
    config.shortcut = accel;
    input.value = prettyShortcut(accel);
    // Apply right away — no need to click "Save settings".
    await window.polish.saveConfig({ shortcut: accel });
    setStatus(el('shortcutStatus'), `Shortcut set to ${prettyShortcut(accel)} ✓`, 'ok');
  };
  window.addEventListener('keydown', handler, true);
  setTimeout(() => { if (input.value === 'Press keys…') input.value = prev; }, 6000);
}

// ---- wiring ----
async function load() {
  config = await window.polish.getConfig();
  renderModels();
  renderPrompts();
  el('shortcut').value = prettyShortcut(config.shortcut);
  setStatus(el('keyStatus'), config.hasApiKey ? 'A key is saved.' : 'No key saved yet.', config.hasApiKey ? 'ok' : 'err');
}

el('model').addEventListener('change', (e) => { config.model = e.target.value; });
el('addPrompt').addEventListener('click', () => {
  config.prompts.push({ id: uid(), name: 'New prompt', text: '' });
  renderPrompts();
});
el('recordBtn').addEventListener('click', startRecording);

el('saveKey').addEventListener('click', async () => {
  const key = el('apiKey').value.trim();
  if (!key) { setStatus(el('keyStatus'), 'Enter a key first.', 'err'); return; }
  await window.polish.setApiKey(key);
  el('apiKey').value = '';
  setStatus(el('keyStatus'), 'Key saved.', 'ok');
  config.hasApiKey = true;
});

el('testBtn').addEventListener('click', async () => {
  setStatus(el('keyStatus'), 'Testing…');
  const res = await window.polish.testConnection();
  setStatus(el('keyStatus'), res.message, res.ok ? 'ok' : 'err');
});

el('saveAll').addEventListener('click', async () => {
  await window.polish.saveConfig({
    shortcut: config.shortcut,
    model: config.model,
    prompts: config.prompts,
    activePromptId: config.activePromptId,
  });
  setStatus(el('savedNote'), 'Saved ✓', 'ok');
  setTimeout(() => setStatus(el('savedNote'), ''), 2000);
});

el('keyLink').addEventListener('click', (e) => {
  e.preventDefault();
  window.polish.openExternal('https://console.anthropic.com/settings/keys');
});

load();
