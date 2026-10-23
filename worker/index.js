// Thrimp's server. The game itself is plain files served straight from ./public; this Worker only runs for /api/*
// (see run_worker_first in wrangler.jsonc). It keeps one save per signed-in person in Workers KV.
//
// Cloudflare Access already guards the whole domain, but the Worker checks the Access token again on every call:
// the signature against the team's published keys, the application audience, the issuer and the expiry.
//
//   GET    /api/save   the saved colony (gzipped JSON), or 204 if there is none
//   PUT    /api/save   store a new save; 409 if another computer saved since this one loaded (x-based-on)
//   DELETE /api/save   forget it (the "New world" button)

const MAX_SAVE_BYTES = 5_000_000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const user = await accessUser(request, env, url);
    if (!user) return json({ error: 'not signed in' }, 401);
    if (url.pathname !== '/api/save') return json({ error: 'not found' }, 404);

    const key = `save:${user}`;
    if (request.method === 'GET') {
      const { value, metadata } = await env.SAVES.getWithMetadata(key, 'arrayBuffer');
      if (!value) return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
      return new Response(value, { headers: {
        'content-type': 'application/octet-stream', 'cache-control': 'no-store', 'x-saved-at': String(metadata?.savedAt || 0),
      } });
    }
    if (request.method === 'PUT') {
      const body = await request.arrayBuffer();
      if (!body.byteLength || body.byteLength > MAX_SAVE_BYTES) return json({ error: 'bad size' }, 413);
      const basedOn = Number(request.headers.get('x-based-on') || 0);
      const head = await env.SAVES.getWithMetadata(key, 'stream');
      if (head.value) await head.value.cancel(); // only the metadata is needed
      const current = head.metadata;
      if (current && current.savedAt !== basedOn) return json({ error: 'conflict', savedAt: current.savedAt }, 409);
      const savedAt = Date.now();
      await env.SAVES.put(key, body, { metadata: { savedAt } });
      return json({ savedAt });
    }
    if (request.method === 'DELETE') {
      await env.SAVES.delete(key);
      return json({ ok: true });
    }
    return json({ error: 'method not allowed' }, 405);
  },
};

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

// Returns the signed-in email, or null. DEV_EMAIL (set only in a local, gitignored .dev.vars) stands in for the
// login under `npx wrangler dev`, and only for requests from this machine. (wrangler dev rewrites the URL to the
// route's host, so the client address is the check: in production Cloudflare sets CF-Connecting-IP itself, to
// the real visitor, so it can never be 127.0.0.1 there.)
async function accessUser(request, env, url) {
  const ip = request.headers.get('cf-connecting-ip');
  if (env.DEV_EMAIL && (ip === '127.0.0.1' || ip === '::1')) return env.DEV_EMAIL;
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token || !env.TEAM_DOMAIN || !env.POLICY_AUD) return null;
  try {
    const [h, p, s] = token.split('.');
    const header = JSON.parse(utf8(base64url(h))), payload = JSON.parse(utf8(base64url(p)));
    if (header.alg !== 'RS256') return null;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(env.POLICY_AUD) || payload.iss !== env.TEAM_DOMAIN || payload.exp * 1000 < Date.now()) return null;
    const jwk = (await accessKeys(env)).find(k => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, base64url(s), new TextEncoder().encode(`${h}.${p}`));
    return ok ? (payload.email || payload.sub || null) : null;
  } catch {
    return null;
  }
}

// The team's signing keys, cached for an hour per Worker instance.
let keyCache = { keys: null, until: 0 };
async function accessKeys(env) {
  if (keyCache.keys && Date.now() < keyCache.until) return keyCache.keys;
  const r = await fetch(`${env.TEAM_DOMAIN}/cdn-cgi/access/certs`);
  const { keys } = await r.json();
  keyCache = { keys, until: Date.now() + 3600_000 };
  return keys;
}

// base64url -> bytes, by hand (no atob, matching the game's no-hidden-code rule).
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function base64url(str) {
  const out = new Uint8Array(Math.floor(str.length * 3 / 4));
  let bits = 0, acc = 0, n = 0;
  for (const ch of str) {
    const v = B64.indexOf(ch);
    if (v < 0) continue; // padding or stray characters
    acc = (acc << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out[n++] = (acc >> bits) & 0xff; }
  }
  return out.subarray(0, n);
}
const utf8 = bytes => new TextDecoder().decode(bytes);
