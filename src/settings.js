// Settings window — card overview with inline auto-save. Talks to the main
// process only through window.polish.

const cardsEl = document.getElementById('cards');
let config = null;

const ICON = {
  key: '<svg viewBox="0 0 24 24" class="icon-stroke"><path d="M2.6 17.4A2 2 0 0 0 2 18.8V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.2a2 2 0 0 0 1.4-.6l.8-.8a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".7" class="icon-fill"/></svg>',
  keyboard: '<svg viewBox="0 0 24 24" class="icon-stroke"><rect width="20" height="16" x="2" y="4" rx="2.5"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/></svg>',
  cpu: '<svg viewBox="0 0 24 24" class="icon-stroke"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2"/></svg>',
  spark: '<svg viewBox="0 0 24 24" class="icon-fill"><path d="M12 1 C12.9 8.2, 15.8 11.1, 23 12 C15.8 12.9, 12.9 15.8, 12 23 C11.1 15.8, 8.2 12.9, 1 12 C8.2 11.1, 11.1 8.2, 12 1 Z"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" class="icon-stroke"><path d="m6 9 6 6 6-6"/></svg>',
  shield: '<svg viewBox="0 0 24 24" class="icon-stroke"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function node(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
const isMac = () => navigator.platform.toLowerCase().includes('mac');
const uid = () => 'p_' + Math.random().toString(36).slice(2, 9);
const activePrompt = () => config.prompts.find((p) => p.id === config.activePromptId) || config.prompts[0];

function modelSubtitle(id) {
  return (id.startsWith('claude-fable') || id.startsWith('claude-opus') || id.startsWith('claude-sonnet'))
    ? 'Adaptive thinking · high effort' : 'Standard mode';
}

function capLabels(accel) {
  const m = {
    CommandOrControl: isMac() ? '⌘' : 'Ctrl', CmdOrCtrl: isMac() ? '⌘' : 'Ctrl',
    Command: '⌘', Cmd: '⌘', Control: isMac() ? '⌃' : 'Ctrl', Ctrl: isMac() ? '⌃' : 'Ctrl',
    Alt: isMac() ? '⌥' : 'Alt', Option: '⌥', Shift: '⇧', Meta: '⌘',
  };
  return accel.split('+').map((p) => m[p] || (p.length === 1 ? p.toUpperCase() : p));
}

function accelFromEvent(e) {
  const parts = [];
  if (e.ctrlKey) parts.push('Control');
  if (e.metaKey) parts.push('Command');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  let key = e.key;
  if (['Control', 'Meta', 'Alt', 'Shift'].includes(key)) return null;
  if (key === ' ') key = 'Space';
  else if (key.length === 1) key = key.toUpperCase();
  if (!parts.length) return null;
  parts.push(key);
  return parts.join('+');
}

// ---- saving (inline, auto) ----
let saveT = null;
function configPayload() {
  return { shortcut: config.shortcut, model: config.model, prompts: config.prompts, activePromptId: config.activePromptId };
}
function saveSoon() { clearTimeout(saveT); saveT = setTimeout(() => window.polish.saveConfig(configPayload()), 350); }
async function saveNow() { clearTimeout(saveT); await window.polish.saveConfig(configPayload()); }

// ---------- API key card ----------
function keyCard() {
  const saved = config.hasApiKey;
  const card = node(`
    <section class="card" id="card-key">
      <div class="row">
        <span class="tile v">${ICON.key}</span>
        <span class="main"><span class="title">API key</span><span class="sub ${saved ? 'ok' : 'warn'}">${saved ? 'Saved · sk-ant-••••' : 'Not set yet'}</span></span>
        <span class="ctl"><button class="pill act" type="button">${saved ? 'Manage' : 'Add key'}</button></span>
      </div>
      <div class="drawer" hidden>
        <input class="field kf" type="password" autocomplete="off" placeholder="${saved ? 'Paste a new key to replace…' : 'Paste your sk-ant-… key'}" />
        <div class="drawer-actions">
          <button class="pill primary ksave" type="button">Save key</button>
          ${saved ? '<button class="pill danger kdel" type="button">Delete key</button>' : ''}
          <button class="pill ghost kcancel" type="button">Cancel</button>
          <span class="msg"></span>
        </div>
        <button class="link ktest" type="button">Test connection</button>
      </div>
    </section>`);
  const drawer = card.querySelector('.drawer');
  const field = card.querySelector('.kf');
  const msg = card.querySelector('.msg');
  card.querySelector('.act').addEventListener('click', () => { drawer.hidden = !drawer.hidden; if (!drawer.hidden) field.focus(); });
  card.querySelector('.ksave').addEventListener('click', async () => {
    const k = field.value.trim();
    if (!k) { msg.textContent = 'Enter a key first.'; msg.className = 'msg err'; return; }
    msg.textContent = 'Saving…'; msg.className = 'msg';
    await window.polish.setApiKey(k); config.hasApiKey = true;
    document.getElementById('card-key').replaceWith(keyCard());
  });
  const del = card.querySelector('.kdel');
  if (del) del.addEventListener('click', async () => { await window.polish.setApiKey(''); config.hasApiKey = false; document.getElementById('card-key').replaceWith(keyCard()); });
  card.querySelector('.kcancel').addEventListener('click', () => { drawer.hidden = true; field.value = ''; msg.textContent = ''; });
  card.querySelector('.ktest').addEventListener('click', async () => {
    msg.textContent = 'Testing…'; msg.className = 'msg';
    const res = await window.polish.testConnection();
    msg.textContent = res.message; msg.className = 'msg ' + (res.ok ? 'ok' : 'err');
  });
  return card;
}

// ---------- shortcut card ----------
function shortcutCard() {
  const card = node(`
    <section class="card" id="card-shortcut">
      <button class="row" type="button">
        <span class="tile m">${ICON.keyboard}</span>
        <span class="main"><span class="title">Shortcut</span><span class="sub">Improve text in place</span></span>
        <span class="ctl caps"></span>
      </button>
    </section>`);
  const caps = card.querySelector('.caps');
  const draw = () => { caps.classList.remove('recording'); caps.innerHTML = capLabels(config.shortcut).map((c) => `<kbd>${esc(c)}</kbd>`).join(''); };
  draw();
  card.querySelector('.row').addEventListener('click', () => {
    caps.classList.add('recording');
    caps.innerHTML = '<span class="caps-hint">Press keys…</span>';
    const handler = async (e) => {
      e.preventDefault();
      const accel = accelFromEvent(e);
      if (!accel) return;
      window.removeEventListener('keydown', handler, true);
      config.shortcut = accel; await saveNow(); draw();
    };
    window.addEventListener('keydown', handler, true);
    setTimeout(() => { if (caps.classList.contains('recording')) { window.removeEventListener('keydown', handler, true); draw(); } }, 6000);
  });
  return card;
}

// ---------- model card ----------
function modelCard() {
  const card = node(`
    <section class="card" id="card-model">
      <div class="row">
        <span class="tile v">${ICON.cpu}</span>
        <span class="main"><span class="title">Model</span><span class="sub modelsub">${esc(modelSubtitle(config.model))}</span></span>
        <span class="ctl model-ctl"><select class="modelsel" aria-label="Model"></select><span class="chev">${ICON.chevron}</span></span>
      </div>
    </section>`);
  const sel = card.querySelector('.modelsel');
  for (const m of config.models) {
    const o = document.createElement('option');
    o.value = m.id; o.textContent = m.label;
    if (m.id === config.model) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', async () => {
    config.model = sel.value;
    card.querySelector('.modelsub').textContent = modelSubtitle(config.model);
    await saveNow();
  });
  return card;
}

// ---------- prompt card (active shown; expand to manage all) ----------
function promptCard(open) {
  const a = activePrompt();
  const card = node(`
    <section class="card" id="card-prompt">
      <button class="row promenu ${open ? 'open' : ''}" type="button">
        <span class="tile v">${ICON.spark}</span>
        <span class="main"><span class="title acttitle">${esc(a.name) || 'Untitled'}</span><span class="sub">Active prompt</span></span>
        <span class="ctl"><span class="dot"></span><span class="chev">${ICON.chevron}</span></span>
      </button>
      <div class="prompt-inset acttext">${a.text ? esc(a.text) : '<span class="ph">No instruction yet</span>'}</div>
      <div class="drawer" ${open ? '' : 'hidden'}>
        <label class="dl">Name</label>
        <input class="field nameedit" />
        <label class="dl">Instruction (runs on the shortcut)</label>
        <textarea class="field textedit" placeholder="e.g. Make this text better."></textarea>
        <label class="dl">Your prompts</label>
        <div class="prompt-list"></div>
        <button class="pill ghost addp" type="button">+ Add prompt</button>
      </div>
    </section>`);
  const drawer = card.querySelector('.drawer');
  const inset = card.querySelector('.acttext');
  const row = card.querySelector('.promenu');
  const title = card.querySelector('.acttitle');
  const nameEdit = card.querySelector('.nameedit');
  const textEdit = card.querySelector('.textedit');
  nameEdit.value = a.name; textEdit.value = a.text;
  inset.hidden = open;
  row.addEventListener('click', () => {
    const willOpen = drawer.hidden;
    drawer.hidden = !willOpen; inset.hidden = willOpen; row.classList.toggle('open', willOpen);
  });
  nameEdit.addEventListener('input', () => { a.name = nameEdit.value; title.textContent = a.name || 'Untitled'; saveSoon(); });
  textEdit.addEventListener('input', () => {
    a.text = textEdit.value;
    inset.innerHTML = a.text ? esc(a.text) : '<span class="ph">No instruction yet</span>';
    saveSoon();
  });
  const list = card.querySelector('.prompt-list');
  for (const p of config.prompts) {
    const item = node(`<div class="prompt-pick ${p.id === config.activePromptId ? 'active' : ''}"><span class="pradio"></span><button class="pname" type="button">${esc(p.name) || 'Untitled'}</button>${config.prompts.length > 1 ? '<button class="pdel" type="button" aria-label="Delete prompt">×</button>' : ''}</div>`);
    item.querySelector('.pname').addEventListener('click', async () => { config.activePromptId = p.id; await saveNow(); document.getElementById('card-prompt').replaceWith(promptCard(true)); });
    const d = item.querySelector('.pdel');
    if (d) d.addEventListener('click', async (e) => {
      e.stopPropagation();
      config.prompts = config.prompts.filter((x) => x.id !== p.id);
      if (config.activePromptId === p.id) config.activePromptId = config.prompts[0].id;
      await saveNow();
      document.getElementById('card-prompt').replaceWith(promptCard(true));
    });
    list.appendChild(item);
  }
  card.querySelector('.addp').addEventListener('click', async () => {
    const np = { id: uid(), name: 'New prompt', text: '' };
    config.prompts.push(np); config.activePromptId = np.id;
    await saveNow();
    document.getElementById('card-prompt').replaceWith(promptCard(true));
  });
  return card;
}

// ---------- macOS permission card (only when NOT yet granted) ----------
async function refreshPerm() {
  const old = document.getElementById('card-perm');
  if (old) old.remove();
  const status = await window.polish.permStatus();
  if (!status || status.accessibility) return; // non-mac, or already granted -> no card
  const card = node(`
    <section class="card perm" id="card-perm">
      <div class="row">
        <span class="tile m">${ICON.shield}</span>
        <span class="main"><span class="title">Enable Accessibility</span><span class="sub warn">Polish needs this to copy your selection and paste the result.</span></span>
        <span class="ctl"><button class="pill primary popen" type="button">Open settings</button></span>
      </div>
      <div class="drawer">
        <div class="drawer-actions"><button class="pill prestart" type="button">Restart Polish to apply</button><span class="msg">Just turned it on? macOS only notices after a restart.</span></div>
      </div>
    </section>`);
  card.querySelector('.popen').addEventListener('click', () => window.polish.openAccessibilitySettings());
  card.querySelector('.prestart').addEventListener('click', () => window.polish.relaunchApp());
  cardsEl.prepend(card);
}

// ---------- boot ----------
function render() {
  cardsEl.innerHTML = '';
  cardsEl.appendChild(keyCard());
  cardsEl.appendChild(shortcutCard());
  cardsEl.appendChild(modelCard());
  cardsEl.appendChild(promptCard(false));
  refreshPerm();
}

async function load() {
  config = await window.polish.getConfig();
  render();
}
load();
