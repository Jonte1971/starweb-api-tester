// Starweb API Tester – lokal server
// Serverar webbgränssnittet och fungerar som proxy mot Starwebs API
// (undviker CORS och håller client_secret borta från webbläsaren om du vill).
// Kräver Node 18+ (inbyggd fetch). Inga npm-beroenden.

const http = require('http');
const fs = require('fs');
const path = require('path');

// ---------- .env (enkel parser, inga beroenden) ----------
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
loadEnv(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 3000);
const HOST = '127.0.0.1';
const ENV = {
  shopId: process.env.STARWEB_SHOP_ID || '',
  baseUrl: process.env.STARWEB_BASE_URL || '',
  clientId: process.env.STARWEB_CLIENT_ID || '',
  clientSecret: process.env.STARWEB_CLIENT_SECRET || '',
};
const DEFAULT_SPEC_URL = 'https://leksaker.starweb.se/api/v2/openapi.json';

// Tillåt bara anrop mot Starweb-domäner (proxyn ska inte vara öppen)
const ALLOWED_HOST = /(^|\.)(starwebserver\.se|starweb\.se)$/i;

function resolveBase(shopId, baseUrl) {
  const raw = (baseUrl || '').trim() || (shopId ? `https://${shopId.trim()}.starwebserver.se/api/v2` : '');
  if (!raw) throw new Error('Ange Shop ID eller Base URL.');
  const u = new URL(raw);
  if (u.protocol !== 'https:') throw new Error('Base URL måste vara https.');
  if (!ALLOWED_HOST.test(u.hostname)) throw new Error(`Värden ${u.hostname} är inte en Starweb-domän.`);
  return u.toString().replace(/\/+$/, '');
}

// ---------- hjälpare ----------
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.normalize(path.join(__dirname, 'public', urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': (MIME[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' });
    res.end(data);
  });
}

// ---------- API-rutter ----------
async function handleLocal(req, res, route) {
  // Konfiguration från .env (hemligheten skickas aldrig till webbläsaren)
  if (route === 'config' && req.method === 'GET') {
    return sendJson(res, 200, {
      shopId: ENV.shopId, baseUrl: ENV.baseUrl, clientId: ENV.clientId,
      hasEnvSecret: Boolean(ENV.clientSecret), defaultSpecUrl: DEFAULT_SPEC_URL,
    });
  }

  // Hämta OpenAPI-specen (från din butik, med fallback till Starwebs demobutik)
  if (route === 'spec' && req.method === 'GET') {
    const q = new URL(req.url, 'http://x').searchParams;
    const candidates = [];
    try { candidates.push(resolveBase(q.get('shopId') || ENV.shopId, q.get('baseUrl') || ENV.baseUrl) + '/openapi.json'); } catch {}
    candidates.push(DEFAULT_SPEC_URL);
    for (const url of candidates) {
      try {
        const r = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!r.ok) continue;
        const spec = await r.json();
        return sendJson(res, 200, { source: url, spec });
      } catch {}
    }
    return sendJson(res, 502, { error: 'Kunde inte hämta OpenAPI-specen.', tried: candidates });
  }

  // Hämta access token (client credentials)
  if (route === 'token' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    const base = resolveBase(body.shopId || ENV.shopId, body.baseUrl || ENV.baseUrl);
    const form = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: body.clientId || ENV.clientId,
      client_secret: body.clientSecret || ENV.clientSecret,
    });
    const started = Date.now();
    const r = await fetch(base + '/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: form,
    });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return sendJson(res, 200, { status: r.status, ms: Date.now() - started, url: base + '/token', data });
  }

  // Generell proxy: { method, path, query, headers, body, token, shopId, baseUrl }
  if (route === 'proxy' && req.method === 'POST') {
    const p = JSON.parse((await readBody(req)).toString() || '{}');
    const base = resolveBase(p.shopId || ENV.shopId, p.baseUrl || ENV.baseUrl);
    const target = new URL(base + '/' + String(p.path || '').replace(/^\/+/, ''));
    for (const [k, v] of Object.entries(p.query || {})) {
      if (v !== undefined && v !== null && v !== '') target.searchParams.append(k, v);
    }
    if (!ALLOWED_HOST.test(target.hostname)) throw new Error('Otillåten måldomän.');
    const method = String(p.method || 'GET').toUpperCase();
    const headers = { Accept: 'application/json', ...(p.headers || {}) };
    if (p.token) headers.Authorization = 'Bearer ' + p.token;
    let body;
    if (p.body !== undefined && p.body !== null && p.body !== '' && !['GET', 'HEAD'].includes(method)) {
      body = typeof p.body === 'string' ? p.body : JSON.stringify(p.body);
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }
    const started = Date.now();
    const r = await fetch(target, { method, headers, body });
    const ms = Date.now() - started;
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    const respHeaders = {};
    r.headers.forEach((v, k) => { respHeaders[k] = v; });
    return sendJson(res, 200, {
      status: r.status, statusText: r.statusText, ms, url: target.toString(), method,
      headers: respHeaders, size: Buffer.byteLength(text), data,
    });
  }

  sendJson(res, 404, { error: 'Okänd route' });
}

http.createServer(async (req, res) => {
  try {
    const m = req.url.match(/^\/local\/([\w-]+)/);
    if (m) return await handleLocal(req, res, m[1]);
    serveStatic(req, res);
  } catch (err) {
    sendJson(res, 500, { error: err.message || String(err) });
  }
}).listen(PORT, HOST, () => {
  console.log(`\n  Starweb API Tester körs på http://localhost:${PORT}\n`);
});
