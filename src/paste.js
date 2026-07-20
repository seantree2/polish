// Simulates the Copy and Paste keystrokes against whatever app currently
// has focus. Uses built-in OS automation (AppleScript on macOS, PowerShell
// SendKeys on Windows, xdotool on Linux) so there are no native modules to
// compile — which keeps the app easy to build and package.

const { exec, execFile } = require('child_process');

function run(cmd) {
  return new Promise((resolve, reject) => {
    // timeout: kill a hung keystroke command (e.g. osascript blocked on a
    // permission prompt) so it can never wedge the transform.
    exec(cmd, { windowsHide: true, timeout: 5000 }, (err) => (err ? reject(err) : resolve()));
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const WIN_COPY =
  'powershell -NoProfile -WindowStyle Hidden -Command ' +
  '"Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'^c\')"';
// Plain Ctrl+V (regular paste). We deliberately avoid Ctrl+Shift+V: that's the
// "paste and match style" shortcut only in web apps — native apps (Notepad, etc.)
// don't recognize it, so the paste-back would silently do nothing. The clipboard
// already holds plain text, so plain paste is equivalent and works everywhere.
const WIN_PASTE =
  'powershell -NoProfile -WindowStyle Hidden -Command ' +
  '"Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'^v\')"';

async function copySelection() {
  if (process.platform === 'darwin') {
    await run(`osascript -e 'tell application "System Events" to keystroke "c" using command down'`);
  } else if (process.platform === 'win32') {
    await run(WIN_COPY);
  } else {
    await run('xdotool key --clearmodifiers ctrl+c');
  }
}

async function pasteClipboard() {
  if (process.platform === 'darwin') {
    // Plain Cmd+V. NOT Cmd+Shift+V: that's "paste and match style" only in web
    // apps (Google Docs, Gmail, Slack) — native Mac apps (Stickies, TextEdit,
    // Notes, Mail) don't bind it, so the paste-back silently failed there. The
    // clipboard holds plain text, so plain paste matches the surrounding style anyway.
    await run(`osascript -e 'tell application "System Events" to keystroke "v" using command down'`);
  } else if (process.platform === 'win32') {
    await run(WIN_PASTE);
  } else {
    await run('xdotool key --clearmodifiers ctrl+v');
  }
}

// Run an AppleScript via execFile — NO shell is spawned, so an interpolated value (a
// bundle id) can never be interpreted as a shell command. Resolves the script's stdout.
// Short 1.5s timeout: these run on the Cmd+L critical path, so if the call ever hangs
// (e.g. a permission stall) it fails fast and we fall back to normal pasting rather
// than stalling the refine for seconds.
function osa(script) {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], { timeout: 1500 }, (err, stdout) => (err ? reject(err) : resolve(stdout || '')));
  });
}

// Capture which app is frontmost right now (macOS), so runTransform can paste the
// refined text back into the SAME window even if the user switches apps while the
// refine is running. Returns a bundle identifier, or null if it can't be determined.
async function getFrontmostApp() {
  if (process.platform !== 'darwin') return null;
  try {
    const out = await osa('tell application "System Events" to get bundle identifier of first application process whose frontmost is true');
    const id = (out || '').trim();
    return /^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(id) ? id : null; // reverse-DNS bundle id only
  } catch {
    return null;
  }
}

// Bring a previously-captured app back to the front (macOS) before pasting. Best-effort:
// if it fails, we just paste wherever focus currently is (the old behaviour).
async function activateApp(bundleId) {
  if (process.platform !== 'darwin' || !bundleId) return;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(bundleId)) return; // reverse-DNS id only — no metachars reach AppleScript
  try {
    await osa(`tell application id "${bundleId}" to activate`);
  } catch { /* best-effort */ }
}

module.exports = { copySelection, pasteClipboard, sleep, getFrontmostApp, activateApp };
