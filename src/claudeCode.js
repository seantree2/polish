// Transforms text by calling the locally-installed Claude Code CLI in headless
// ("print") mode. This uses the user's Claude Max/Pro subscription instead of a
// pay-as-you-go API key — no API credits required. It is slower per call than
// the API (the CLI takes a few seconds to start) and draws on the
// subscription's usage limits.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const { SYSTEM_PROMPT } = require('./transform');

// Compare version strings like "2.1.165" descending.
function byVersionDesc(a, b) {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pb[i] || 0) !== (pa[i] || 0)) return (pb[i] || 0) - (pa[i] || 0);
  }
  return 0;
}

// Find the Claude Code executable. Returns an absolute path if we can find one,
// otherwise the bare name 'claude' (relying on PATH).
function resolveClaudeBinary() {
  const candidates = [];

  if (process.platform === 'win32') {
    const base = path.join(process.env.APPDATA || '', 'Claude', 'claude-code');
    try {
      const versions = fs
        .readdirSync(base)
        .filter((v) => /^\d+\./.test(v))
        .sort(byVersionDesc);
      for (const v of versions) candidates.push(path.join(base, v, 'claude.exe'));
    } catch {
      /* folder may not exist */
    }
  } else {
    candidates.push(
      path.join(os.homedir(), '.local', 'bin', 'claude'),
      '/opt/homebrew/bin/claude',
      '/usr/local/bin/claude'
    );
  }

  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return 'claude';
}

function isAvailable() {
  const bin = resolveClaudeBinary();
  if (bin.includes(path.sep)) return fs.existsSync(bin);
  return true; // bare 'claude' — assume it might be on PATH
}

function modelAlias(model) {
  if (!model) return null;
  if (model.includes('opus')) return 'opus';
  if (model.includes('sonnet')) return 'sonnet';
  if (model.includes('haiku')) return 'haiku';
  return null;
}

function transformViaClaudeCode({ model, promptText, text, oauthToken }, { timeoutMs = 90000 } = {}) {
  return new Promise((resolve, reject) => {
    const bin = resolveClaudeBinary();
    const args = ['-p', '--output-format', 'text', '--append-system-prompt', SYSTEM_PROMPT];
    const alias = modelAlias(model);
    if (alias) args.push('--model', alias);

    // Authenticate the CLI with the Max-plan token from `claude setup-token`.
    const env = { ...process.env };
    if (oauthToken) env.CLAUDE_CODE_OAUTH_TOKEN = oauthToken;

    // Run from a neutral directory so it doesn't pick up project context/config.
    const child = spawn(bin, args, { cwd: os.tmpdir(), windowsHide: true, env });

    let out = '';
    let err = '';
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { child.kill(); } catch { /* ignore */ }
      reject(new Error('Claude Code timed out. Try again, or switch to an API key for faster responses.'));
    }, timeoutMs);

    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });

    child.on('error', (e) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (e && e.code === 'ENOENT') {
        reject(new Error('Claude Code was not found. Make sure it is installed and you are signed in, or use an API key.'));
      } else {
        reject(e);
      }
    });

    child.on('close', (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(err.trim() || `Claude Code exited with code ${code}.`));
    });

    // Feed the prompt + text via stdin to avoid command-line length/quoting limits.
    child.stdin.write(`${promptText}\n\n---\n${text}`);
    child.stdin.end();
  });
}

module.exports = { transformViaClaudeCode, isAvailable, resolveClaudeBinary };
