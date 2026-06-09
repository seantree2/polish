// Client side of the relay: sends text to a shared Polish host (someone else's
// machine running the relay server) and gets the transformed text back. Used
// when the user's "Power source" is set to "Connect to a shared Polish".

async function transformViaRelay({ url, secret, model, promptText, text }, { timeoutMs = 90000 } = {}) {
  const base = String(url || '').trim().replace(/\/+$/, '');
  if (!base) throw new Error('No relay address set. Add it in Settings.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(`${base}/transform`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret || ''}`,
      },
      body: JSON.stringify({ model, promptText, text }),
      signal: controller.signal,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || `Relay error ${resp.status}.`);
    return (data.result || '').trim();
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error('The shared Polish did not respond. Is the host computer on and connected?');
    }
    if (err && (err.cause || err.code === 'ECONNREFUSED')) {
      throw new Error('Could not reach the shared Polish. Check the address.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { transformViaRelay };
