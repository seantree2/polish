// Browser version of Polish — a small web server that serves a review page and
// transforms text via Claude. The API key stays on the server (never sent to
// the browser), so reviewers like James don't need a key of their own.
//
//   node web/server.js            -> http://localhost:3000
//   node web/server.js --share    -> also opens a public link (via cloudflared)
//
// The API key is read from the ANTHROPIC_API_KEY env var, or from web/apikey.txt.

const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');

const { transformText } = require('../src/transform');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

function getApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY.trim();
  try {
    return fs.readFileSync(path.join(ROOT, 'apikey.txt'), 'utf8').trim();
  } catch {
    return '';
  }
}

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    fs.readFile(path.join(ROOT, 'public', 'index.html'), (err, data) => {
      if (err) return send(res, 500, 'Failed to load page', 'text/plain');
      send(res, 200, data, 'text/html');
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/transform') {
    let body = '';
    let aborted = false;
    req.on('data', (c) => {
      body += c;
      if (body.length > 500000) { aborted = true; send(res, 413, JSON.stringify({ error: 'Text too large.' })); req.destroy(); }
    });
    req.on('end', async () => {
      if (aborted) return;
      try {
        const { model, promptText, text } = JSON.parse(body || '{}');
        if (!text || !promptText) return send(res, 400, JSON.stringify({ error: 'Missing prompt or text.' }));
        const apiKey = getApiKey();
        if (!apiKey) return send(res, 503, JSON.stringify({ error: 'No API key configured. Paste your key into web/apikey.txt.' }));
        const result = await transformText({ apiKey, model: model || 'claude-opus-4-8', promptText, text });
        send(res, 200, JSON.stringify({ result }));
      } catch (err) {
        send(res, 500, JSON.stringify({ error: String((err && err.message) || err) }));
      }
    });
    return;
  }

  send(res, 404, JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`\n  Polish (web) running at:  http://localhost:${PORT}\n`);
  if (!getApiKey()) {
    console.log('  ⚠ No API key found. Paste your Claude key into web/apikey.txt, then restart.\n');
  }
  if (process.argv.includes('--share')) startTunnel(PORT);
});

// ---------- optional public link via cloudflared ----------
function cloudflaredPath() {
  const name = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  return path.join(ROOT, name);
}

function ensureCloudflared() {
  return new Promise((resolve, reject) => {
    const local = cloudflaredPath();
    if (fs.existsSync(local)) return resolve(local);
    if (process.platform !== 'win32') return resolve('cloudflared'); // expect on PATH
    const url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
    const file = fs.createWriteStream(local);
    const get = (u) => https.get(u, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { r.resume(); return get(r.headers.location); }
      if (r.statusCode !== 200) return reject(new Error(`Download failed (${r.statusCode})`));
      r.pipe(file);
      file.on('finish', () => file.close(() => resolve(local)));
    }).on('error', reject);
    console.log('  Downloading the tunnel helper (one time)…');
    get(url);
  });
}

async function startTunnel(port) {
  try {
    const bin = await ensureCloudflared();
    const child = spawn(bin, ['tunnel', '--url', `http://localhost:${port}`, '--no-autoupdate'], { windowsHide: true });
    const scan = (buf) => {
      const m = buf.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (m) console.log(`\n  ✅ Public link (send this to James):\n      ${m[0]}\n`);
    };
    child.stdout.on('data', scan);
    child.stderr.on('data', scan);
    child.on('error', (e) => console.log('  Tunnel error:', e.message));
  } catch (e) {
    console.log('  Could not start tunnel:', e.message);
  }
}
