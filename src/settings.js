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
  sound: '<svg viewBox="0 0 24 24" class="icon-stroke"><path d="M11 4.5 6 9H2.8a.8.8 0 0 0-.8.8v4.4a.8.8 0 0 0 .8.8H6l5 4.5z"/><path d="M15.5 8.8a4.3 4.3 0 0 1 0 6.4M18.6 6a8 8 0 0 1 0 12"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" class="icon-stroke"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>',
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function node(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
const isMac = () => navigator.platform.toLowerCase().includes('mac');
const uid = () => 'p_' + Math.random().toString(36).slice(2, 9);
const activePrompt = () => config.prompts.find((p) => p.id === config.activePromptId) || config.prompts[0];

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
  return { shortcut: config.shortcut, model: config.model, prompts: config.prompts, activePromptId: config.activePromptId, sound: config.sound, effort: config.effort };
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
  const row = card.querySelector('.row');
  let recording = false, keyH = null, downH = null, timer = null;
  const draw = () => { caps.classList.remove('recording'); caps.innerHTML = capLabels(config.shortcut).map((c) => `<kbd>${esc(c)}</kbd>`).join(''); };
  function stop() {
    recording = false;
    window.removeEventListener('keydown', keyH, true);
    document.removeEventListener('mousedown', downH, true);
    clearTimeout(timer);
    draw(); // revert to the saved shortcut's keys
  }
  function start() {
    recording = true;
    caps.classList.add('recording');
    caps.innerHTML = '<span class="caps-hint">Press keys…</span>';
    keyH = async (e) => {
      e.preventDefault();
      const accel = accelFromEvent(e);
      if (!accel) return; // wait for a real modifier+key combo
      config.shortcut = accel;
      stop(); // draw() now shows the new keys
      await saveNow();
    };
    // Cancel + revert if they click away (or click the keys again) without recording.
    downH = (e) => { if (recording && !card.contains(e.target)) stop(); };
    window.addEventListener('keydown', keyH, true);
    document.addEventListener('mousedown', downH, true);
    timer = setTimeout(stop, 6000);
  }
  row.addEventListener('click', () => { recording ? stop() : start(); });
  draw();
  return card;
}

// ---------- model card ----------
function modelCard() {
  const curLabel = () => { const m = config.models.find((x) => x.id === config.model); return m ? m.label : config.model; };
  const card = node(`
    <section class="card" id="card-model">
      <div class="row">
        <span class="tile v">${ICON.cpu}</span>
        <span class="main"><span class="title">Model</span></span>
        <span class="ctl">
          <div class="dd">
            <button class="dd-btn" type="button" aria-haspopup="listbox" aria-expanded="false" aria-label="Model">
              <span class="dd-label">${esc(curLabel())}</span><span class="dd-chev">${ICON.chevron}</span>
            </button>
            <div class="dd-pop" role="listbox" hidden>
              ${config.models.map((m) => `<button class="dd-opt ${m.id === config.model ? 'sel' : ''}" type="button" role="option" data-id="${esc(m.id)}" aria-selected="${m.id === config.model}">${esc(m.label)}</button>`).join('')}
            </div>
          </div>
        </span>
      </div>
    </section>`);
  const dd = card.querySelector('.dd');
  const btn = card.querySelector('.dd-btn');
  const pop = card.querySelector('.dd-pop');
  const label = card.querySelector('.dd-label');
  // Highlight (the accent border) is tied to aria-expanded, NOT focus, so it can
  // never get stuck. A real mousedown-outside listener (only while open) closes it
  // on the first click away — the thing a native <select> can't do.
  const onDown = (e) => { if (!dd.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  function close() { btn.setAttribute('aria-expanded', 'false'); pop.hidden = true; document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); }
  function open() { btn.setAttribute('aria-expanded', 'true'); pop.hidden = false; document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey); }
  btn.addEventListener('click', () => { (btn.getAttribute('aria-expanded') === 'true') ? close() : open(); });
  pop.querySelectorAll('.dd-opt').forEach((opt) => {
    opt.addEventListener('click', async () => {
      config.model = opt.dataset.id;
      label.textContent = curLabel();
      syncEffort(); // grey/ungrey the Effort card as the model changes (Haiku has no effort)
      pop.querySelectorAll('.dd-opt').forEach((o) => { const s = o.dataset.id === config.model; o.classList.toggle('sel', s); o.setAttribute('aria-selected', String(s)); });
      close();
      await saveNow();
    });
  });
  return card;
}

// ---------- effort card (how hard the model thinks) — sits right under Model ----------
const EFFORTS = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'xhigh', label: 'Extra high' },
  { id: 'max', label: 'Max' },
];

function effortCard() {
  const curLabel = () => { const e = EFFORTS.find((x) => x.id === (config.effort || 'high')); return e ? e.label : 'High'; };
  const card = node(`
    <section class="card" id="card-effort">
      <div class="row">
        <span class="tile m">${ICON.sliders}</span>
        <span class="main"><span class="title">Effort Level</span><span class="sub effort-sub">How hard the model thinks</span></span>
        <span class="ctl">
          <div class="dd">
            <button class="dd-btn" type="button" aria-haspopup="listbox" aria-expanded="false" aria-label="Effort level">
              <span class="dd-label">${esc(curLabel())}</span><span class="dd-chev">${ICON.chevron}</span>
            </button>
            <div class="dd-pop" role="listbox" hidden>
              ${EFFORTS.map((e) => { const s = e.id === (config.effort || 'high'); return `<button class="dd-opt ${s ? 'sel' : ''}" type="button" role="option" data-id="${esc(e.id)}" aria-selected="${s}">${esc(e.label)}</button>`; }).join('')}
            </div>
          </div>
        </span>
      </div>
    </section>`);
  const dd = card.querySelector('.dd');
  const btn = card.querySelector('.dd-btn');
  const pop = card.querySelector('.dd-pop');
  const label = card.querySelector('.dd-label');
  const onDown = (e) => { if (!dd.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  function close() { btn.setAttribute('aria-expanded', 'false'); pop.hidden = true; document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); }
  function open() { btn.setAttribute('aria-expanded', 'true'); pop.hidden = false; document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey); }
  btn.addEventListener('click', () => { (btn.getAttribute('aria-expanded') === 'true') ? close() : open(); });
  pop.querySelectorAll('.dd-opt').forEach((opt) => {
    opt.addEventListener('click', async () => {
      config.effort = opt.dataset.id;
      label.textContent = curLabel();
      pop.querySelectorAll('.dd-opt').forEach((o) => { const s = o.dataset.id === config.effort; o.classList.toggle('sel', s); o.setAttribute('aria-selected', String(s)); });
      close();
      await saveNow();
    });
  });
  return card;
}

// Effort doesn't apply to Haiku (the API rejects the effort param there), so grey the
// card out + note it whenever Haiku is the selected model.
function syncEffort() {
  const card = document.getElementById('card-effort');
  if (!card) return;
  const haiku = /haiku/i.test(config.model || '');
  card.classList.toggle('disabled', haiku);
  const sub = card.querySelector('.effort-sub');
  if (sub) sub.textContent = haiku ? 'Not used by Haiku (it has no effort setting)' : 'How hard the model thinks';
}

// ---------- sound card (toggle the spinner pop) ----------
function soundCard() {
  const on = config.sound !== false;
  const card = node(`
    <section class="card" id="card-sound">
      <div class="row">
        <span class="tile b">${ICON.sound}</span>
        <span class="main"><span class="title">Sound</span><span class="sub">Soft sounds when the spinner appears &amp; finishes</span></span>
        <span class="ctl"><button class="toggle" type="button" role="switch" aria-checked="${on}" aria-label="Sound effects"><span class="knob"></span></button></span>
      </div>
    </section>`);
  const tg = card.querySelector('.toggle');
  tg.addEventListener('click', async () => {
    config.sound = !(tg.getAttribute('aria-checked') === 'true');
    tg.setAttribute('aria-checked', String(config.sound));
    await saveNow();
  });
  return card;
}

// ---------- prompt card (active shown; expand to manage all) ----------
function promptCard(open) {
  const card = node(`
    <section class="card" id="card-prompt">
      <button class="row promenu ${open ? 'open' : ''}" type="button">
        <span class="tile v">${ICON.spark}</span>
        <span class="main"><span class="title acttitle"></span><span class="sub">Active prompt</span></span>
        <span class="ctl"><span class="dot"></span><span class="chev">${ICON.chevron}</span></span>
      </button>
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
  const row = card.querySelector('.promenu');
  const title = card.querySelector('.acttitle');
  const nameEdit = card.querySelector('.nameedit');
  const textEdit = card.querySelector('.textedit');
  const list = card.querySelector('.prompt-list');

  // Update the active-prompt display IN PLACE (no card rebuild) so switching prompts
  // never flashes/disappears. `animate` gives a soft cross-fade on the swapped content.
  function paintActive(animate) {
    const a = activePrompt();
    title.textContent = a.name || 'Untitled';
    nameEdit.value = a.name;
    textEdit.value = a.text;
    list.querySelectorAll('.prompt-pick').forEach((it) => it.classList.toggle('active', it.dataset.id === config.activePromptId));
    if (animate) {
      for (const elx of [nameEdit, textEdit]) { elx.classList.remove('swap'); void elx.offsetWidth; elx.classList.add('swap'); } // content fields cross-fade on prompt switch
    }
  }

  function renderList() {
    list.innerHTML = '';
    for (const p of config.prompts) {
      const item = node(`<div class="prompt-pick" data-id="${esc(p.id)}" role="button" tabindex="0"><span class="pradio"></span><span class="pname">${esc(p.name) || 'Untitled'}</span>${config.prompts.length > 1 ? '<button class="pdel" type="button" aria-label="Delete prompt">×</button>' : ''}</div>`);
      const pick = () => { if (config.activePromptId === p.id) return; config.activePromptId = p.id; paintActive(true); saveNow(); };
      item.addEventListener('click', pick);
      item.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      const d = item.querySelector('.pdel');
      if (d) d.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ok = await window.polish.confirmDeletePrompt(p.name || 'Untitled');
        if (!ok) return; // user cancelled — keep the prompt
        config.prompts = config.prompts.filter((x) => x.id !== p.id);
        if (config.activePromptId === p.id) config.activePromptId = config.prompts[0].id;
        renderList(); paintActive(true); await saveNow();
      });
      list.appendChild(item);
    }
  }

  row.addEventListener('click', () => {
    const willOpen = drawer.hidden;
    drawer.hidden = !willOpen; row.classList.toggle('open', willOpen);
  });
  nameEdit.addEventListener('input', () => {
    const a = activePrompt();
    a.name = nameEdit.value;
    title.textContent = a.name || 'Untitled';
    const nm = list.querySelector(`.prompt-pick[data-id="${a.id}"] .pname`);
    if (nm) nm.textContent = a.name || 'Untitled';
    saveSoon();
  });
  textEdit.addEventListener('input', () => {
    const a = activePrompt();
    a.text = textEdit.value;
    saveSoon();
  });
  card.querySelector('.addp').addEventListener('click', async () => {
    const np = { id: uid(), name: 'New prompt', text: '' };
    config.prompts.push(np); config.activePromptId = np.id;
    renderList(); paintActive(true);
    nameEdit.focus(); nameEdit.select();
    await saveNow();
  });

  renderList();
  paintActive(false);
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
  cardsEl.appendChild(effortCard());
  cardsEl.appendChild(soundCard());
  cardsEl.appendChild(promptCard(false));
  syncEffort();
  refreshPerm();
}

// Tell the main process how tall the content is, so the window fits it exactly
// (no dead space) and grows/shrinks with the active prompt's length + the drawers.
function fitWindow() {
  if (!window.polish || !window.polish.resizeToContent) return;
  const wrap = document.querySelector('.wrap');
  if (!wrap || !cardsEl) return;
  const padB = parseFloat(getComputedStyle(wrap).paddingBottom) || 0;
  const h = Math.ceil(cardsEl.offsetTop + cardsEl.offsetHeight + padB);
  if (h > 0) window.polish.resizeToContent(h);
}

async function load() {
  config = await window.polish.getConfig();
  render();
  requestAnimationFrame(fitWindow);
  // re-fit whenever the content height changes — drawer open/close, prompt switch,
  // add/delete, permission card appearing, fonts settling, etc. (transform-only
  // animations like the opening cascade don't change layout, so they don't trigger it)
  try { new ResizeObserver(() => fitWindow()).observe(cardsEl); } catch { /* ignore */ }
}
load();
