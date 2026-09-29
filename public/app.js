// Starweb API Tester – frontend
const $ = sel => document.querySelector(sel);
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

const state = {
  spec: null,
  ops: [],          // { method, path, tag, summary, description, parameters, requestBody }
  current: null,    // vald operation (eller null = fritt anrop)
  token: null,
  tokenExpires: 0,
  hasEnvSecret: false,
  lastResponse: null,
  respTab: 'body',
  history: loadJson('sw.history', []),
  vars: loadJson('sw.vars', {}),   // t.ex. { productId: '91', variantId: '1743' }
};

// ---------- lagring (bara bekvämlighet – aldrig client secret) ----------
function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function saveJson(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

function connection() {
  return { shopId: $('#shopId').value.trim(), baseUrl: $('#baseUrl').value.trim() };
}
function saveConnection() {
  saveJson('sw.conn', { ...connection(), clientId: $('#clientId').value.trim() });
}

// ---------- init ----------
async function init() {
  const cfg = await fetch('/local/config').then(r => r.json()).catch(() => ({}));
  const saved = loadJson('sw.conn', {});
  $('#shopId').value = saved.shopId || cfg.shopId || '';
  $('#baseUrl').value = saved.baseUrl || cfg.baseUrl || '';
  $('#clientId').value = saved.clientId || cfg.clientId || '';
  state.hasEnvSecret = !!cfg.hasEnvSecret;
  if (state.hasEnvSecret) $('#clientSecret').placeholder = '(från .env)';

  ['#shopId', '#baseUrl', '#clientId'].forEach(s => $(s).addEventListener('change', saveConnection));
  $('#btnToken').onclick = () => getToken(true);
  $('#btnReloadSpec').onclick = loadSpec;
  $('#btnSend').onclick = send;
  $('#path').addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
  $('#search').oninput = () => { renderEndpointList(); renderTemplates(); };
  $('#btnAddVar').onclick = () => {
    const name = prompt('Variabelnamn (t.ex. productId):');
    if (name && /^\w+$/.test(name)) { state.vars[name] = ''; saveVars(); }
  };
  $('#btnCustom').onclick = () => selectOp(null);
  $('#btnExample').onclick = fillExampleBody;
  $('#btnFormat').onclick = formatBody;
  $('#btnCopy').onclick = copyResponse;
  $('#btnClearHistory').onclick = () => { state.history = []; saveJson('sw.history', []); renderHistory(); };
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
  document.querySelectorAll('.rtab').forEach(b => b.onclick = () => { state.respTab = b.dataset.rtab; renderResponse(); });

  renderHistory();
  renderTemplates();
  renderVars();
  setInterval(renderTokenStatus, 1000);
  await loadSpec();
}

function showTab(name) {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== 'tab-' + name));
}

// ---------- OpenAPI ----------
async function loadSpec() {
  $('#specInfo').textContent = 'Laddar spec…';
  const q = new URLSearchParams(connection());
  try {
    const r = await fetch('/local/spec?' + q);
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    state.spec = j.spec;
    state.ops = extractOps(j.spec);
    $('#specInfo').textContent = `${j.spec.info?.title || 'API'} ${j.spec.info?.version || ''} · ${state.ops.length} endpoints · källa: ${j.source}`;
    renderEndpointList();
  } catch (e) {
    $('#specInfo').textContent = 'Kunde inte ladda spec: ' + e.message + ' (fritt anrop fungerar ändå)';
  }
}

function resolveRef(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || !obj.$ref || depth > 20) return obj;
  const parts = obj.$ref.replace(/^#\//, '').split('/').map(p => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  let cur = state.spec;
  for (const p of parts) cur = cur?.[p];
  return resolveRef(cur, depth + 1) || {};
}

function extractOps(spec) {
  const ops = [];
  for (const [p, item] of Object.entries(spec.paths || {})) {
    const shared = item.parameters || [];
    for (const m of METHODS) {
      const op = item[m];
      if (!op) continue;
      const params = [...shared, ...(op.parameters || [])].map(x => resolveRef(x));
      // op-parametrar överskuggar path-parametrar med samma namn
      const uniq = [...new Map(params.map(x => [x.in + ':' + x.name, x])).values()];
      ops.push({
        method: m.toUpperCase(), path: p, tag: (op.tags && op.tags[0]) || 'Övrigt',
        summary: op.summary || '', description: op.description || '',
        parameters: uniq, requestBody: op.requestBody ? resolveRef(op.requestBody) : null,
      });
    }
  }
  return ops;
}

function renderEndpointList() {
  const term = $('#search').value.toLowerCase();
  const groups = {};
  for (const op of state.ops) {
    const hay = `${op.method} ${op.path} ${op.summary} ${op.tag}`.toLowerCase();
    if (term && !hay.includes(term)) continue;
    (groups[op.tag] ||= []).push(op);
  }
  const nav = $('#endpointList');
  nav.innerHTML = '';
  for (const [tag, ops] of Object.entries(groups)) {
    const d = document.createElement('details');
    d.className = 'tag-group';
    d.open = !!term;
    d.innerHTML = `<summary>${esc(tag)} <small>(${ops.length})</small></summary>`;
    for (const op of ops) {
      const el = document.createElement('div');
      el.className = 'ep' + (op === state.current ? ' active' : '');
      el.title = op.summary;
      el.innerHTML = `<span class="m ${op.method}">${op.method}</span><span>${esc(op.path)}</span>`;
      el.onclick = () => selectOp(op);
      d.appendChild(el);
    }
    nav.appendChild(d);
  }
}

function selectOp(op) {
  state.current = op;
  document.querySelectorAll('.ep').forEach(e => e.classList.remove('active'));
  if (!op) {
    $('#opInfo').innerHTML = '<strong>Fritt anrop</strong> – skriv metod och sökväg (relativt base URL), t.ex. /products?page=2';
    $('#paramForm').innerHTML = '';
    $('#body').value = '';
    return;
  }
  $('#method').value = op.method;
  $('#path').value = op.path;
  $('#opInfo').innerHTML = `<strong>${esc(op.summary)}</strong>${op.description ? '\n' + esc(op.description) : ''}`;
  renderParamForm(op);
  $('#body').value = '';
  if (op.requestBody) fillExampleBody();
  showTab(op.requestBody && !op.parameters.some(p => p.in === 'path') ? 'body' : 'params');
  renderEndpointList();
}

function renderParamForm(op) {
  const form = $('#paramForm');
  form.innerHTML = '';
  const params = op.parameters.filter(p => p.in === 'path' || p.in === 'query');
  if (!params.length) { form.innerHTML = '<div class="op-info">Inga parametrar.</div>'; return; }
  params.sort((a, b) => (a.in === 'path' ? -1 : 1) - (b.in === 'path' ? -1 : 1));
  for (const p of params) {
    const schema = resolveRef(p.schema || {});
    const row = document.createElement('div');
    row.className = 'param-row';
    const type = schema.type === 'array' ? `array<${resolveRef(schema.items || {}).type || ''}>` : (schema.type || '');
    let input;
    const enumVals = schema.enum || resolveRef(schema.items || {}).enum;
    if (enumVals) {
      input = `<select data-in="${p.in}" data-name="${esc(p.name)}"><option value=""></option>${enumVals.map(v => `<option>${esc(v)}</option>`).join('')}</select>`;
    } else if (schema.type === 'boolean') {
      input = `<select data-in="${p.in}" data-name="${esc(p.name)}"><option value=""></option><option>true</option><option>false</option></select>`;
    } else {
      const ph = schema.example ?? schema.default ?? p.example ?? '';
      const pre = p.in === 'path' && state.vars[p.name] != null ? state.vars[p.name] : '';
      input = `<input data-in="${p.in}" data-name="${esc(p.name)}" placeholder="${esc(String(ph))}" value="${esc(pre)}">`;
    }
    row.innerHTML = `
      <div class="pname">${esc(p.name)}${p.required ? ' <span class="req">*</span>' : ''}<small>${p.in} · ${esc(type)}</small></div>
      <div>${input}${p.description ? `<div class="pdesc">${esc(p.description)}</div>` : ''}</div>`;
    form.appendChild(row);
  }
}

// ---------- exempel-body från schema ----------
function sampleFromSchema(schema, depth = 0, seen = new Set()) {
  if (!schema || depth > 6) return null;
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return null;
    const s2 = new Set(seen); s2.add(schema.$ref);
    return sampleFromSchema(resolveRef(schema), depth, s2);
  }
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum) return schema.enum[0];
  const all = schema.allOf || schema.oneOf || schema.anyOf;
  if (all) {
    if (schema.allOf) return Object.assign({}, ...schema.allOf.map(s => sampleFromSchema(s, depth, seen) || {}));
    return sampleFromSchema(all[0], depth, seen);
  }
  switch (schema.type) {
    case 'string':
      if (schema.format === 'date-time') return new Date().toISOString();
      if (schema.format === 'date') return new Date().toISOString().slice(0, 10);
      return 'string';
    case 'integer': case 'number': return 0;
    case 'boolean': return false;
    case 'array': {
      const v = sampleFromSchema(schema.items, depth + 1, seen);
      return v === null ? [] : [v];
    }
    default: {
      if (!schema.properties) return schema.type === 'object' ? {} : null;
      const out = {};
      for (const [k, v] of Object.entries(schema.properties)) {
        const rv = resolveRef(v);
        if (rv.readOnly || v.readOnly) continue;
        out[k] = sampleFromSchema(v, depth + 1, seen);
      }
      return out;
    }
  }
}

function fillExampleBody() {
  const rb = state.current?.requestBody;
  if (!rb) { $('#bodyError').textContent = 'Den här endpointen har ingen body i specen.'; return; }
  const content = rb.content || {};
  const media = content['application/json'] || Object.values(content)[0];
  const ex = media?.example ?? (media?.examples && Object.values(media.examples)[0]?.value) ?? sampleFromSchema(media?.schema);
  $('#body').value = JSON.stringify(ex, null, 2);
  $('#bodyError').textContent = '';
}

function formatBody() {
  try { $('#body').value = JSON.stringify(JSON.parse($('#body').value), null, 2); $('#bodyError').textContent = ''; }
  catch (e) { $('#bodyError').textContent = 'Ogiltig JSON: ' + e.message; }
}

// ---------- token ----------
async function getToken(manual = false) {
  const payload = { ...connection(), clientId: $('#clientId').value.trim(), clientSecret: $('#clientSecret').value };
  if (!payload.clientSecret && !state.hasEnvSecret) {
    if (manual) setTokenStatus('Ange Client Secret (eller lägg det i .env)', 'bad');
    return false;
  }
  saveConnection();
  setTokenStatus('Hämtar token…');
  try {
    const r = await fetch('/local/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    if (manual) showResult({ ...j, method: 'POST', headers: {} });
    const tok = j.data?.access_token;
    if (j.status >= 400 || !tok) throw new Error(`HTTP ${j.status}: ${typeof j.data === 'string' ? j.data : (j.data?.error_description || j.data?.message || j.data?.error || 'ingen access_token')}`);
    state.token = tok;
    state.tokenExpires = Date.now() + (Number(j.data.expires_in) || 3600) * 1000;
    renderTokenStatus();
    return true;
  } catch (e) {
    state.token = null;
    setTokenStatus('Tokenfel: ' + e.message, 'bad');
    return false;
  }
}
function setTokenStatus(text, cls = '') {
  const el = $('#tokenStatus'); el.textContent = text; el.className = 'token-status ' + cls;
}
function renderTokenStatus() {
  if (!state.token) return;
  const left = Math.round((state.tokenExpires - Date.now()) / 1000);
  if (left <= 0) { state.token = null; setTokenStatus('Token har gått ut', 'bad'); return; }
  const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0');
  setTokenStatus(`Token aktiv · ${mm}:${ss} kvar`, 'ok');
}

// ---------- skicka ----------
async function send() {
  const method = $('#method').value;
  let rawPath = $('#path').value.trim() || '/';
  const query = {};

  // query i själva sökvägen (fritt anrop)
  const qi = rawPath.indexOf('?');
  if (qi >= 0) {
    new URLSearchParams(rawPath.slice(qi + 1)).forEach((v, k) => { query[k] = v; });
    rawPath = rawPath.slice(0, qi);
  }

  // parametrar från formuläret
  const missing = [];
  document.querySelectorAll('#paramForm [data-name]').forEach(el => {
    const name = el.dataset.name, val = el.value.trim();
    if (el.dataset.in === 'path') {
      if (!val) { missing.push(name); return; }
      rawPath = rawPath.replace(`{${name}}`, encodeURIComponent(val));
    } else if (val) query[name] = val;
  });
  new URLSearchParams($('#extraQuery').value.trim()).forEach((v, k) => { query[k] = v; });
  // variabler: {namn} kvar i path, {{namn}} i path/query/body
  const unresolved = new Set();
  const sub = (str, single) => String(str).replace(single ? /\{\{?(\w+)\}?\}/g : /\{\{(\w+)\}\}/g, (m, n) => {
    if (state.vars[n] != null && state.vars[n] !== '') return single ? encodeURIComponent(state.vars[n]) : state.vars[n];
    unresolved.add(n); return m;
  });
  rawPath = sub(rawPath, true);
  for (const k of Object.keys(query)) query[k] = sub(query[k], false);
  missing.splice(0, missing.length, ...missing.filter(n => !(state.vars[n] && (rawPath = rawPath.replace(`{${n}}`, encodeURIComponent(state.vars[n]))))));
  if (missing.length) { alertInResponse('Fyll i path-parametrar: ' + missing.join(', ')); return; }
  const bodyText = sub($('#body').value, false);
  if (unresolved.size) { alertInResponse('Saknar värde för variabel: ' + [...unresolved].join(', ')); return; }

  let body;
  if (!['GET', 'DELETE'].includes(method) && bodyText.trim()) {
    try { body = JSON.parse(bodyText); }
    catch (e) { showTab('body'); $('#bodyError').textContent = 'Ogiltig JSON: ' + e.message; return; }
  }

  if (!state.token || Date.now() > state.tokenExpires - 10000) await getToken(false);

  $('#btnSend').disabled = true;
  $('#respStatus').textContent = '…';
  try {
    const r = await fetch('/local/proxy', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...connection(), method, path: rawPath, query, body, token: state.token }),
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    showResult(j);
    if (j.status < 300) captureVars(j.data);
    addHistory({ method, path: $('#path').value.trim(), opPath: state.current?.path, status: j.status, ms: j.ms, url: j.url, body: $('#body').value, params: collectParamValues(), extra: $('#extraQuery').value });
  } catch (e) {
    alertInResponse(e.message);
  } finally {
    $('#btnSend').disabled = false;
  }
}

function collectParamValues() {
  const o = {};
  document.querySelectorAll('#paramForm [data-name]').forEach(el => { if (el.value) o[el.dataset.name] = el.value; });
  return o;
}

// ---------- svar ----------
function showResult(j) { state.lastResponse = j; renderResponse(); }
function alertInResponse(msg) {
  state.lastResponse = null;
  $('#respStatus').textContent = 'Fel'; $('#respStatus').className = 'badge s5';
  $('#respMeta').textContent = ''; $('#respUrl').textContent = '';
  $('#respBody').textContent = msg;
}
function renderResponse() {
  document.querySelectorAll('.rtab').forEach(b => b.classList.toggle('active', b.dataset.rtab === state.respTab));
  const j = state.lastResponse;
  if (!j) return;
  $('#respStatus').textContent = `${j.status} ${j.statusText || ''}`.trim();
  $('#respStatus').className = 'badge s' + String(j.status)[0];
  $('#respMeta').textContent = `${j.ms} ms${j.size != null ? ' · ' + fmtBytes(j.size) : ''}`;
  $('#respUrl').textContent = `${j.method || ''} ${j.url || ''}`;
  const data = state.respTab === 'headers' ? j.headers : j.data;
  $('#respBody').innerHTML = typeof data === 'string' ? esc(data) : highlight(JSON.stringify(data, null, 2));
}
function copyResponse() {
  const j = state.lastResponse; if (!j) return;
  const data = state.respTab === 'headers' ? j.headers : j.data;
  navigator.clipboard.writeText(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  $('#btnCopy').textContent = 'Kopierat!'; setTimeout(() => $('#btnCopy').textContent = 'Kopiera', 1200);
}

// ---------- historik ----------
function addHistory(h) {
  state.history.unshift({ ...h, at: Date.now() });
  state.history = state.history.slice(0, 50);
  saveJson('sw.history', state.history);
  renderHistory();
}
function renderHistory() {
  const ul = $('#historyList'); ul.innerHTML = '';
  if (!state.history.length) { ul.innerHTML = '<li style="cursor:default;color:var(--muted)">Ingen historik ännu.</li>'; return; }
  state.history.forEach(h => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="m ${h.method}">${h.method}</span><span>${esc(h.url?.replace(/^https:\/\/[^/]+\/api\/v2/, '') || h.path)}</span><span class="st">${h.status} · ${new Date(h.at).toLocaleTimeString('sv-SE')}</span>`;
    li.onclick = () => restoreHistory(h);
    ul.appendChild(li);
  });
}
function restoreHistory(h) {
  const op = state.ops.find(o => o.method === h.method && o.path === h.opPath);
  selectOp(op || null);
  $('#method').value = h.method; $('#path').value = h.path;
  for (const [k, v] of Object.entries(h.params || {})) {
    const el = document.querySelector(`#paramForm [data-name="${CSS.escape(k)}"]`); if (el) el.value = v;
  }
  $('#extraQuery').value = h.extra || '';
  $('#body').value = h.body || '';
  showTab('params');
}

// ---------- mallar ----------
function renderTemplates() {
  const nav = $('#templateList'); if (!nav) return;
  const term = $('#search').value.toLowerCase();
  nav.innerHTML = '';
  for (const g of window.STARWEB_TEMPLATES || []) {
    const items = g.items.filter(t => !term || `${t.name} ${t.method} ${t.path}`.toLowerCase().includes(term));
    if (!items.length) continue;
    const d = document.createElement('details');
    d.className = 'tag-group'; d.open = true;
    d.innerHTML = `<summary>${esc(g.group)}</summary>`;
    for (const t of items) {
      const el = document.createElement('div');
      el.className = 'ep tpl'; el.title = `${t.method} ${t.path}`;
      el.innerHTML = `<span class="m ${t.method}">${t.method}</span><span class="tname">${esc(t.name)}</span>`;
      el.onclick = () => applyTemplate(t);
      d.appendChild(el);
    }
    nav.appendChild(d);
  }
}
function applyTemplate(t) {
  // standardvärden för variabler som saknas (t.ex. pricelistId = 1)
  let added = false;
  for (const [k, v] of Object.entries(t.defaults || {})) {
    if (state.vars[k] == null || state.vars[k] === '') { state.vars[k] = v; added = true; }
  }
  if (added) saveVars();
  const op = state.ops.find(o => o.method === t.method && o.path === t.path);
  selectOp(op || null);
  $('#method').value = t.method;
  $('#path').value = t.path;
  $('#opInfo').innerHTML = `<strong>${esc(t.name)}</strong>${t.note ? '\n' + esc(t.note) : ''}${op && op.summary ? '\n<em>' + esc(op.summary) + '</em>' : ''}`;
  $('#body').value = t.body ? JSON.stringify(t.body, null, 2) : '';
  showTab(t.body ? 'body' : 'params');
}

// ---------- variabler ----------
const CAPTURE_KEYS = ['productId', 'variantId', 'manufacturerId', 'stockStatusId', 'unitId', 'pricelistId', 'orderId', 'customerId', 'categoryId', 'mediaFileId'];
function captureVars(data) {
  const obj = data && data.data && !Array.isArray(data.data) ? data.data : null;
  if (!obj) return;   // bara enskilda objekt (skapa/hämta en post), inte listor
  let changed = false;
  for (const k of CAPTURE_KEYS) {
    if (obj[k] != null && typeof obj[k] !== 'object') { state.vars[k] = String(obj[k]); changed = true; }
  }
  const firstVariant = obj.variants && obj.variants.data && obj.variants.data[0];
  if (firstVariant && firstVariant.variantId != null) { state.vars.variantId = String(firstVariant.variantId); changed = true; }
  if (changed) saveVars();
}
function saveVars() { saveJson('sw.vars', state.vars); renderVars(); }
function renderVars() {
  const box = $('#varList'); box.innerHTML = '';
  const names = Object.keys(state.vars);
  if (!names.length) { box.innerHTML = '<span style="color:var(--muted)">inga ännu – fångas från svar</span>'; return; }
  for (const n of names) {
    const chip = document.createElement('span');
    chip.className = 'var-chip';
    chip.innerHTML = `${esc(n)} <input value="${esc(state.vars[n])}"><button title="Ta bort">×</button>`;
    chip.querySelector('input').onchange = e => { state.vars[n] = e.target.value.trim(); saveVars(); };
    chip.querySelector('button').onclick = () => { delete state.vars[n]; saveVars(); };
    box.appendChild(chip);
  }
}

// ---------- utils ----------
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtBytes(n) { return n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' kB'; }
function highlight(json) {
  return esc(json ?? 'null').replace(/(&quot;(?:\\.|[^&\\]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
    (m, str, colon, bool) => {
      if (str) return colon ? `<span class="j-key">${str}</span>${colon}` : `<span class="j-str">${str}</span>`;
      if (bool) return `<span class="j-bool">${m}</span>`;
      if (m === 'null') return `<span class="j-null">${m}</span>`;
      return `<span class="j-num">${m}</span>`;
    });
}

init();
