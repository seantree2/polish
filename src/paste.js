// Simulates the Copy and Paste keystrokes against whatever app currently
// has focus. Uses built-in OS automation (AppleScript on macOS, PowerShell
// SendKeys on Windows, xdotool on Linux) so there are no native modules to
// compile — which keeps the app easy to build and package.

const { exec } = require('child_process');

function run(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { windowsHide: true }, (err) => (err ? reject(err) : resolve()));
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const WIN_COPY =
  'powershell -NoProfile -WindowStyle Hidden -Command ' +
  '"Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'^c\')"';
// Ctrl+Shift+V = "paste without formatting" / paste-and-match-style in most
// editors (Google Docs, Gmail, etc.) — the pasted text takes on the existing
// text's formatting instead of resetting it to the document default.
const WIN_PASTE =
  'powershell -NoProfile -WindowStyle Hidden -Command ' +
  '"Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'^+v\')"';

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
    // Cmd+Shift+V = paste and match style (keeps the existing text's formatting).
    await run(`osascript -e 'tell application "System Events" to keystroke "v" using {command down, shift down}'`);
  } else if (process.platform === 'win32') {
    await run(WIN_PASTE);
  } else {
    await run('xdotool key --clearmodifiers ctrl+shift+v');
  }
}

module.exports = { copySelection, pasteClipboard, sleep };
