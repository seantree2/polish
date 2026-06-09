// A small HTTP server that lets other people ("testers") use this computer's
// Claude API key to transform text, without needing a key of their own.
// Protected by a shared password (Bearer token). Runs inside the Polish app
// when the host enables "Share with testers".

const http = require('http');
const { transformText } = require('./transform');

let server = null;

function start({ port, getApiKey, getSecret, getModel }) {
  stop();

  server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'polish-relay' }));
      return;
    }

    if (req.method === 'POST' && req.url === '/transform') {
      const auth = req.headers['authorization'] || '';
      const token = auth.replace(/^Bearer\s+/i, '');
      const secret = getSecret();
      if (!secret || token !== secret) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Wrong or missing password.' }));
        return;
      }

      let body = '';
      let aborted = false;
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 500000) {
          aborted = true;
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Text too large.' }));
          req.destroy();
        }
      });
      req.on('end', async () => {
        if (aborted) return;
        try {
          const { model, promptText, text } = JSON.parse(body || '{}');
          if (!text || !promptText) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing promptText or text.' }));
            return;
          }
          const apiKey = getApiKey();
          if (!apiKey) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'The host has no API key configured.' }));
            return;
          }
          const result = await transformText({ apiKey, model: model || getModel(), promptText, text });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String((err && err.message) || err) }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve(true));
  });
}

function stop() {
  if (server) {
    try { server.close(); } catch { /* ignore */ }
    server = null;
  }
}

function isRunning() {
  return !!server;
}

module.exports = { start, stop, isRunning };
