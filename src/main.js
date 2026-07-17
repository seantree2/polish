// Polish — main process.
// A tray (menu-bar) app that, on a global shortcut, copies the user's current
// selection, sends it to Claude with the active prompt, and pastes the result
// back in place.

const { app, Tray, Menu, BrowserWindow, globalShortcut, clipboard, nativeImage, Notification, ipcMain, shell, screen, dialog, systemPreferences } = require('electron');
const path = require('path');

const store = require('./settingsStore');
const { transformText } = require('./transform');
const { copySelection, pasteClipboard, sleep } = require('./paste');

const ASSETS = path.join(__dirname, '..', 'assets');

const MODELS = [
  { id: 'claude-fable-5', label: 'Fable 5' },
  { id: 'claude-opus-4-8', label: 'Opus 4.8' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
];

let tray = null;
let settingsWindow = null;
let busy = false;

// ---------- model call ----------
function activePrompt(cfg) {
  return cfg.prompts.find((p) => p.id === cfg.activePromptId) || cfg.prompts[0];
}

async function callModel(cfg, text) {
  const prompt = activePrompt(cfg);
  const apiKey = store.getApiKey();
  if (!apiKey) throw new Error('No API key saved. Open Settings and add your Claude API key.');
  // Hard cap: abort a hung/slow request after 75s so it can never leave the app
  // stuck "busy" (which previously made the shortcut stop working until restart).
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error('Polish timed out — please try again')), 75000);
  try {
    return await transformText({ apiKey, model: cfg.model, promptText: prompt.text, text, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------- notifications ----------
function notify(title, body) {
  try {
    new Notification({ title, body, silent: true }).show();
  } catch {
    // Notifications can be unavailable on some setups; fail quietly.
  }
}

// ---------- selection capture ----------
async function getSelectedText() {
  const original = clipboard.readText();
  const sentinel = `__POLISH_${Date.now()}__`;
  clipboard.writeText(sentinel);

  // Let the shortcut's own keys (Cmd+L) lift before we synthesize Cmd+C. If a
  // modifier is still held, the combined key state can garble the copy in strict
  // native apps (e.g. Stickies, TextEdit), where it then silently captures
  // nothing — even though the same copy works in browsers and on a manual Cmd+C.
  await sleep(150);

  // Copy, then poll briefly for the clipboard to change away from the sentinel.
  // Retry the copy once if the first synthetic Cmd+C didn't register.
  let selected = '';
  for (let attempt = 0; attempt < 2 && !selected; attempt++) {
    await copySelection();
    for (let i = 0; i < 16; i++) {
      await sleep(40);
      const current = clipboard.readText();
      if (current && current !== sentinel) {
        selected = current;
        break;
      }
    }
  }
  return { selected, original };
}

// ---------- progress spinner (shown near the cursor while transforming) ----------
let spinnerWin = null;

function createSpinner() {
  const w = new BrowserWindow({
    width: 400,
    height: 150,
    show: false,
    frame: false,
    // macOS: a 'panel' (NSPanel) is the window type that can float ABOVE another
    // app's fullscreen Space. A normal window — even alwaysOnTop with
    // visibleOnFullScreenSpaces — does NOT draw over a fullscreen app, which is why
    // the spinner vanished in Slack/Notion/Claude Code when they were fullscreen but
    // showed fine the moment those apps were in a normal window.
    type: 'panel',
    // Transparent window. The ~0.4%-alpha backgroundColor (#00000001) is the macOS
    // workaround that lets the transparent window actually composite over GPU/browser
    // apps (Google Docs, Claude Code). Sized generously larger than the pill — the
    // entrance fade-in and the gentle fade-out (slight shrink, copied from the reference
    // video) stay well inside these bounds. The 0.4%-alpha backing is imperceptible at
    // any size and mouse events pass through, so the empty margin is invisible and
    // harmless — still no visible box around the centered capsule.
    transparent: true,
    backgroundColor: '#00000001',
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    // autoplayPolicy lets the soft "pop" play without a user gesture (the spinner is
    // shown programmatically, so there is no click to satisfy the default policy).
    webPreferences: { contextIsolation: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' },
  });
  w.setAlwaysOnTop(true, 'screen-saver');
  // macOS: show over fullscreen apps / all Spaces (otherwise it's invisible
  // whenever the user works in a fullscreen window).
  w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreenSpaces: true });
  w.setIgnoreMouseEvents(true);
  return w;
}

function showSpinner() {
  try {
    // Build a FRESH window every time. A long-idle hidden window can lose its
    // render surface (macOS App Nap / compositor recycle) and then show blank —
    // rebuilding guarantees the spinner always paints, even after the app has sat
    // idle for a long time. (This is why quit+reopen used to "fix" it.)
    if (spinnerWin && !spinnerWin.isDestroyed()) { try { spinnerWin.destroy(); } catch { /* ignore */ } }
    const w = createSpinner();
    spinnerWin = w;
    // Reveal only once it has actually painted its first frame.
    w.once('ready-to-show', () => {
      if (!w || w.isDestroyed()) return;
      try {
        // Center on whichever screen the cursor is currently on.
        const b = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds;
        const [ww, wh] = w.getSize();
        w.setPosition(Math.round(b.x + (b.width - ww) / 2), Math.round(b.y + (b.height - wh) / 2));
        w.showInactive(); // shows without stealing focus from the active app
        w.setAlwaysOnTop(true, 'screen-saver');
        try { w.moveTop(); } catch { /* not available on every platform */ }
      } catch { /* ignore */ }
    });
    // Tell the spinner page whether to play the soft pop. Read fresh each time so the
    // Settings toggle takes effect on the very next refine.
    const soundOn = store.getConfig().sound !== false;
    w.loadFile(path.join(__dirname, 'loading.html'), { query: { sound: soundOn ? '1' : '0' } });
  } catch {
    /* spinner is best-effort */
  }
}

function hideSpinner({ animate = false } = {}) {
  // Release the reference immediately so the next transform always builds a fresh
  // window — no stale hidden window left to go bad while the app is idle. (Any
  // still-animating window below self-destroys on its own timer.)
  const w = spinnerWin;
  spinnerWin = null;
  if (!w || w.isDestroyed()) return;

  if (!animate) {
    try { w.destroy(); } catch { /* ignore */ }
    return;
  }

  // Success: gentle fade-out + the distinct "finish" sound (with its natural decay tail).
  // polishExit() in the page plays pop-out.wav (when sound is on) and adds .bye to start
  // the fade; we keep the now-invisible window alive until the sound's tail has fully rung
  // out (~0.8s) so it's never cut off, then destroy it. (Transparent + click-through, so
  // the extra idle time is imperceptible.)
  try {
    w.webContents
      .executeJavaScript("window.polishExit ? window.polishExit() : (function(){var p=document.querySelector('.pill'); if(p)p.classList.add('bye');})();")
      .catch(() => {});
  } catch { /* ignore */ }
  setTimeout(() => { try { if (!w.isDestroyed()) w.destroy(); } catch { /* ignore */ } }, 950);
}

// ---------- the main action ----------
async function runTransform() {
  if (busy) return;

  const cfg = store.getConfig();
  if (!store.getApiKey()) {
    notify('Polish needs your API key', 'Open Settings and paste your Claude API key.');
    openSettings();
    return;
  }

  busy = true;
  setTrayState(true);
  let ok = false;
  try {
    // Immediate feedback the moment the shortcut fires — shown BEFORE the copy
    // step and kept up through the whole copy -> Claude -> paste flow. The
    // hideSpinner() in `finally` guarantees it's always removed afterward,
    // whether we finish, find nothing selected, or hit an error.
    showSpinner();

    const { selected, original } = await getSelectedText();
    if (!selected || !selected.trim()) {
      notify('Nothing selected', 'Select some text first, then press the shortcut.');
      return;
    }

    const result = await callModel(cfg, selected);

    if (!result) {
      notify('No result', 'Claude returned an empty response.');
      return;
    }

    clipboard.writeText(result);
    await sleep(60);
    await pasteClipboard();
    ok = true; // refine succeeded — the spinner gets the "Squash & Poof" exit

    // Restore the user's previous clipboard ASAP once the paste has landed. The paste
    // already completed during pasteClipboard() above, so 700ms never risks the paste
    // grabbing the old clipboard — it just minimises how long the refined result sits on
    // the clipboard (less window for any third-party clipboard manager to capture it).
    setTimeout(() => {
      try {
        clipboard.writeText(original);
      } catch {
        /* ignore */
      }
    }, 700);
  } catch (err) {
    notify('Transform failed', String((err && err.message) || err));
  } finally {
    hideSpinner({ animate: ok });
    busy = false;
    setTrayState(false);
  }
}

// Fallback: transform whatever is already on the clipboard (no keystrokes).
async function runTransformClipboard() {
  if (busy) return;
  const cfg = store.getConfig();
  if (!store.getApiKey()) {
    notify('Polish needs your API key', 'Open Settings and paste your Claude API key.');
    openSettings();
    return;
  }
  const text = clipboard.readText();
  if (!text || !text.trim()) {
    notify('Clipboard is empty', 'Copy some text first, then use this option.');
    return;
  }
  busy = true;
  setTrayState(true);
  try {
    const result = await callModel(cfg, text);
    if (result) {
      clipboard.writeText(result);
      notify('Done', 'Transformed text is on your clipboard — paste it anywhere.');
    } else {
      notify('No result', 'Claude returned an empty response.');
    }
  } catch (err) {
    notify('Transform failed', String((err && err.message) || err));
  } finally {
    hideSpinner();
    busy = false;
    setTrayState(false);
  }
}

// ---------- tray ----------
function trayImage() {
  if (process.platform === 'darwin') {
    const img = nativeImage.createFromPath(path.join(ASSETS, 'trayTemplate.png'));
    img.setTemplateImage(true);
    return img;
  }
  return nativeImage.createFromPath(path.join(ASSETS, 'tray.png'));
}

function setTrayState(working) {
  if (!tray) return;
  tray.setToolTip(working ? 'Polish — working…' : 'Polish');
}

function buildTrayMenu() {
  const cfg = store.getConfig();
  const active = cfg.prompts.find((p) => p.id === cfg.activePromptId) || cfg.prompts[0];
  const menu = Menu.buildFromTemplate([
    { label: `Active prompt: ${active ? active.name : '—'}`, enabled: false },
    { label: `Shortcut: ${cfg.shortcut}`, enabled: false },
    { type: 'separator' },
    { label: 'Polish selected text', click: runTransform },
    { label: 'Transform clipboard text', click: runTransformClipboard },
    { label: 'Settings…', click: openSettings },
    { type: 'separator' },
    { label: 'Quit Polish', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

// ---------- global shortcut ----------
function registerShortcut() {
  globalShortcut.unregisterAll();
  const { shortcut } = store.getConfig();
  try {
    const ok = globalShortcut.register(shortcut, runTransform);
    if (!ok) notify('Shortcut not available', `"${shortcut}" could not be registered. Try a different combination in Settings.`);
  } catch {
    notify('Invalid shortcut', `"${shortcut}" is not a valid combination. Change it in Settings.`);
  }
}

// ---------- settings window ----------
function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 580,
    height: 600, // initial estimate only — the window auto-fits its content height (resize-to-content)
    useContentSize: true,
    title: 'Polish — Settings',
    resizable: false, // height is driven by content, so no manual resizing / dead space
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// ---------- IPC ----------
function registerIpc() {
  ipcMain.handle('get-config', () => ({
    ...store.getPublicConfig(),
    models: MODELS,
  }));

  ipcMain.handle('save-config', (_e, partial) => {
    store.saveConfig(partial || {});
    registerShortcut();
    buildTrayMenu();
    return store.getPublicConfig();
  });

  ipcMain.handle('set-api-key', (_e, key) => {
    store.setApiKey(key);
    return { hasApiKey: store.hasApiKey() };
  });

  ipcMain.handle('test-connection', async () => {
    const cfg = store.getConfig();
    const apiKey = store.getApiKey();
    if (!apiKey) return { ok: false, message: 'No API key saved yet.' };
    try {
      const out = await transformText({ apiKey, model: cfg.model, promptText: 'Reply with the single word: ok', text: 'ping' });
      return { ok: true, message: `Connected. Replied: "${out.slice(0, 40)}"` };
    } catch (err) {
      return { ok: false, message: String((err && err.message) || err) };
    }
  });

  ipcMain.handle('open-external', (_e, url) => shell.openExternal(url));

  // macOS setup health: is Accessibility actually granted? (null elsewhere)
  ipcMain.handle('perm-status', () => {
    if (process.platform !== 'darwin') return null;
    return { accessibility: systemPreferences.isTrustedAccessibilityClient(false) };
  });

  ipcMain.handle('open-accessibility-settings', () =>
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
  );

  // macOS caches the Accessibility-trust answer for a process's whole lifetime,
  // so a grant made *after* launch isn't seen until Polish restarts. This lets
  // the Settings window relaunch the app to pick up a just-enabled permission.
  ipcMain.handle('relaunch-app', () => {
    app.relaunch();
    app.exit(0);
  });

  // Auto-fit the Settings window to its content height (measured + sent by the
  // renderer), so there's no dead space at the bottom and it grows/shrinks with the
  // active prompt's length and the expandable drawers. Width is kept; clamped so it
  // never exceeds the screen.
  ipcMain.handle('resize-to-content', (_e, height) => {
    if (!settingsWindow || settingsWindow.isDestroyed()) return;
    const h = Math.round(Number(height) || 0);
    if (!h) return;
    const [w] = settingsWindow.getContentSize();
    const disp = screen.getDisplayNearestPoint(settingsWindow.getBounds());
    const maxH = Math.max(300, Math.round(disp.workAreaSize.height - 50));
    settingsWindow.setContentSize(w, Math.max(180, Math.min(h, maxH)));
  });

  // Native confirm before deleting a prompt (shows as a sheet on the Settings window on
  // macOS). Cancel is the default, so an accidental Enter/Return never deletes; returns
  // true only when the user explicitly chooses Delete.
  ipcMain.handle('confirm-delete-prompt', async (_e, name) => {
    const opts = {
      type: 'warning',
      buttons: ['Delete', 'Cancel'],
      defaultId: 1, cancelId: 1,
      message: `Delete “${name || 'this prompt'}”?`,
      detail: 'This prompt will be removed from Polish. This can’t be undone.',
    };
    const parent = settingsWindow && !settingsWindow.isDestroyed() ? settingsWindow : null;
    const { response } = await (parent ? dialog.showMessageBox(parent, opts) : dialog.showMessageBox(opts));
    return response === 0;
  });
}

// ---------- macOS: offer to install into /Applications ----------
// Non-blocking and tied to the Settings window, so it can never stall startup
// (the V6 version showed this synchronously at launch, where a dock-hidden app
// could render the dialog behind other windows and freeze before the tray
// appeared — making the app look like it wouldn't open).
function maybeOfferMoveToApplications() {
  if (process.platform !== 'darwin' || !app.isPackaged) return;
  try {
    if (app.isInApplicationsFolder()) return;
  } catch {
    return;
  }
  const fromDmg = process.execPath.startsWith('/Volumes/');
  const parent = settingsWindow && !settingsWindow.isDestroyed() ? settingsWindow : undefined;
  dialog
    .showMessageBox(parent, {
      type: 'question',
      buttons: ['Move to Applications', 'Not Now'],
      defaultId: 0,
      cancelId: 1,
      message: 'Install Polish in your Applications folder?',
      detail: fromDmg
        ? 'Polish is running from the disk image, so it would disappear after you eject it. Click "Move to Applications" to install it properly.'
        : 'Polish runs best from the Applications folder. Click "Move to Applications" to install it properly.',
    })
    .then(({ response }) => {
      if (response !== 0) return;
      try {
        // On success this relaunches from /Applications and quits this copy.
        app.moveToApplicationsFolder({ conflictHandler: () => true });
      } catch {
        /* leave it running from here if the move fails */
      }
    })
    .catch(() => {});
}

// ---------- app lifecycle ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', openSettings);

  app.whenReady().then(() => {
    if (process.platform === 'darwin' && app.dock) app.dock.hide();

    registerIpc();
    tray = new Tray(trayImage());
    setTrayState(false);
    buildTrayMenu();
    tray.on('click', () => tray.popUpContextMenu());

    registerShortcut();

    // (The progress spinner window is built fresh on each shortcut press in
    // showSpinner(), so there's nothing to pre-create here.)

    // Auto-update: only in packaged builds. Checks GitHub Releases, downloads in
    // the background, and installs on quit. Fails quietly if there's no release
    // or no network. (On macOS this requires signed + notarized builds to apply.)
    if (app.isPackaged) {
      try {
        const { autoUpdater } = require('electron-updater');
        autoUpdater.checkForUpdatesAndNotify().catch(() => {});
        // Re-check every 6 hours while running.
        setInterval(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 6 * 60 * 60 * 1000);
      } catch {
        /* updater unavailable — ignore */
      }
    }

    // Always show the Settings window on launch so users can see the app is
    // running (it keeps living in the tray/menu bar after the window closes).
    openSettings();

    // Offer to install into /Applications — AFTER startup is fully done, and
    // non-blocking, so a missed/hidden prompt can never stall launch (the app
    // is already live in the tray + Settings window before this runs).
    maybeOfferMoveToApplications();
  });

  // macOS: re-opening the app (Finder/Dock) while it's running shows Settings.
  app.on('activate', openSettings);

  // Tray app: don't quit when the settings window closes.
  app.on('window-all-closed', (e) => {
    // no-op — keep running in the tray
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());
}
