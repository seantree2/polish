// Optional internet tunnel using Cloudflare's `cloudflared` quick tunnels
// (no account needed — gives a temporary https://*.trycloudflare.com URL).
// On Windows the binary is auto-downloaded into the app's data folder.
// On macOS/Linux we rely on `cloudflared` being installed (e.g. `brew install cloudflared`).

const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');
const { app } = require('electron');

let child = null;
let currentUrl = null;

function binName() {
  return process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
}

function localBinPath() {
  return path.join(app.getPath('userData'), binName());
}

function downloadUrl() {
  if (process.platform === 'win32') {
    return 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
  }
  return null; // macOS/Linux: expect it on PATH
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = (u) => {
      https
        .get(u, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            return get(res.headers.location);
          }
          if (res.statusCode !== 200) {
            reject(new Error(`Download failed (${res.statusCode}).`));
            return;
          }
          res.pipe(file);
          file.on('finish', () => file.close(() => resolve(dest)));
        })
        .on('error', reject);
    };
    get(url);
  });
}

async function ensureBinary() {
  const local = localBinPath();
  if (fs.existsSync(local)) return local;
  const url = downloadUrl();
  if (!url) return 'cloudflared'; // rely on PATH (mac/linux)
  await download(url, local);
  return local;
}

function start(port) {
  return new Promise((resolve, reject) => {
    stop();
    ensureBinary()
      .then((bin) => {
        child = spawn(bin, ['tunnel', '--url', `http://localhost:${port}`, '--no-autoupdate'], { windowsHide: true });
        let settled = false;
        const scan = (buf) => {
          const m = buf.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
          if (m && !settled) {
            settled = true;
            currentUrl = m[0];
            resolve(currentUrl);
          }
        };
        child.stdout.on('data', scan);
        child.stderr.on('data', scan);
        child.on('error', (e) => {
          if (settled) return;
          settled = true;
          reject(e.code === 'ENOENT'
            ? new Error('cloudflared is not installed. On macOS run "brew install cloudflared".')
            : e);
        });
        child.on('close', () => { currentUrl = null; child = null; });
        setTimeout(() => {
          if (!settled) { settled = true; reject(new Error('Tunnel did not start in time. Try again.')); }
        }, 40000);
      })
      .catch(reject);
  });
}

function stop() {
  if (child) {
    try { child.kill(); } catch { /* ignore */ }
    child = null;
  }
  currentUrl = null;
}

function getUrl() {
  return currentUrl;
}

module.exports = { start, stop, getUrl };
