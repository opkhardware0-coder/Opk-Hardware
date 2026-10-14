// Static build: copies the site into dist/ and writes assets/js/env.js from environment variables.
// Only the publishable anon key is ever written. The service-role key must never be set here.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const include = ['assets'];

// Load .env for local builds (Vercel injects real env vars).
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    entry.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const f of fs.readdirSync(root)) {
  if (f.endsWith('.html')) fs.copyFileSync(path.join(root, f), path.join(dist, f));
}
for (const f of ['manifest.webmanifest', 'sw.js']) {
  const source = path.join(root, f);
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(dist, f));
}
for (const dir of include) copyDir(path.join(root, dir), path.join(dist, dir));

// Generate a protected HTML entry point for each JavaScript-backed module.
// A page explicitly supplied in the project root always takes precedence.
const modulePages = ['pos', 'products', 'inventory', 'sales', 'reports', 'settings'];
for (const p of modulePages) {
  const target = path.join(dist, `${p}.html`);
  if (fs.existsSync(target)) continue;
  fs.writeFileSync(target, `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${p[0].toUpperCase() + p.slice(1)} · OPK HARDWARES</title><meta name="robots" content="noindex">
<meta name="theme-color" content="#0B2345"><link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/assets/images/opk-icon-192.png">
<link rel="stylesheet" href="/assets/css/main.css"></head>
<body data-page="${p}"><div id="app"><div class="content"><div class="empty">Loading…</div></div></div>
<script src="/assets/js/env.js"></script><script type="module" src="/assets/js/pwa.js"></script>
<script type="module" src="/assets/js/stub.js"></script></body></html>
`);
}

const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_ANON_KEY || '';

if (/service_role/i.test(key) || (key.split('.')[1] && Buffer.from(key.split('.')[1], 'base64').toString().includes('service_role'))) {
  console.error('Refusing to build: SUPABASE_ANON_KEY looks like a service-role key.');
  process.exit(1);
}
if (!url || !key) {
  console.warn('WARNING: SUPABASE_URL / SUPABASE_ANON_KEY not set. The app will show a setup notice instead of signing in.');
}

const envJs = `window.__OPK_ENV__ = ${JSON.stringify({ SUPABASE_URL: url, SUPABASE_ANON_KEY: key })};\n`;
fs.writeFileSync(path.join(dist, 'assets', 'js', 'env.js'), envJs);
console.log('Built to dist/');
