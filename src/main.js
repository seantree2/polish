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
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 — most capable' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 — balanced' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — fastest' },
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
  return transformText({ apiKey, model: cfg.model, promptText: prompt.text, text });
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

  await copySelection();

  // Poll briefly for the clipboard to change away from our sentinel.
  let selected = '';
  for (let i = 0; i < 16; i++) {
    await sleep(40);
    const current = clipboard.readText();
    if (current && current !== sentinel) {
      selected = current;
      break;
    }
  }
  return { selected, original };
}

// ---------- progress spinner (shown near the cursor while transforming) ----------
let spinnerWin = null;

function ensureSpinner() {
  if (spinnerWin && !spinnerWin.isDestroyed()) return spinnerWin;
  spinnerWin = new BrowserWindow({
    width: 300,
    height: 100,
    show: false,
    frame: false,
    // Fully transparent — only the opaque purple pill is drawn, nothing else
    // (no backing rectangle around it). The pill is opaque so it composites fine.
    transparent: true,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    // backgroundThrottling off keeps the hidden renderer painting so the first
    // reveal is never an unpainted frame.
    webPreferences: { contextIsolation: true, backgroundThrottling: false },
  });
  spinnerWin.setAlwaysOnTop(true, 'screen-saver');
  // macOS: show over fullscreen apps / all Spaces (otherwise it's invisible
  // whenever the user works in a fullscreen window).
  spinnerWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreenSpaces: true });
  spinnerWin.setIgnoreMouseEvents(true);
  spinnerWin.loadFile(path.join(__dirname, 'loading.html'));
  return spinnerWin;
}

function showSpinner() {
  try {
    const w = ensureSpinner();
    // Position the pill at the bottom-center of whichever screen the cursor is on.
    // workArea excludes the Dock/menu bar, so it floats just above the Dock.
    const wa = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const [ww, wh] = w.getSize();
    const x = Math.round(wa.x + (wa.width - ww) / 2);
    const y = Math.round(wa.y + wa.height - wh - 40); // ~40px above the bottom edge
    w.setPosition(x, y);
    w.showInactive(); // shows without stealing focus from the active app
    // Re-assert top-most and force to the front of the z-order. A transparent
    // always-on-top window on macOS can otherwise report visible while actually
    // compositing behind the active app — which looks like "no spinner at all".
    w.setAlwaysOnTop(true, 'screen-saver');
    try { w.moveTop(); } catch { /* not available on every platform */ }
  } catch {
    /* spinner is best-effort */
  }
}

function hideSpinner() {
  try {
    if (spinnerWin && !spinnerWin.isDestroyed() && spinnerWin.isVisible()) spinnerWin.hide();
  } catch {
    /* ignore */
  }
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

    // Restore the user's previous clipboard once the paste has landed.
    setTimeout(() => {
      try {
        clipboard.writeText(original);
      } catch {
        /* ignore */
      }
    }, 1500);
  } catch (err) {
    notify('Transform failed', String((err && err.message) || err));
  } finally {
    hideSpinner();
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
    width: 560,
    height: 720,
    title: 'Polish — Settings',
    resizable: true,
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

    // Pre-create the spinner window (hidden) so its HTML is already rendered
    // the first time it's shown — otherwise the first use can show blank.
    ensureSpinner();

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
