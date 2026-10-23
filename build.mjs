// Builds Thrimp: glues src/ into one HTML file in public/, copies assets/, and refuses to build on mistakes.
//
//   node build.mjs                  build public/ (exit code 1 and nothing written if a check fails)
//   node build.mjs --serve          build, serve public/ on http://localhost:8080, rebuild on every change
//   node build.mjs --serve --port 4173
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const ASSETS = path.join(ROOT, 'assets');
const OUT = path.join(ROOT, 'public');

// Concatenation order matters: a file's top-level code may use values from files above it.
const SCRIPTS = ['config', 'helpers', 'names', 'world', 'paths', 'trails', 'thrimp', 'mind', 'social', 'construction', 'ai',
  'sprites', 'ground', 'render', 'ui', 'input', 'save', 'main'];

// Never allowed in the shipped game: ways of building or hiding code at runtime.
const BANNED = [
  [/\beval\s*\(/, 'eval('],
  [/\bnew\s+Function\b/, 'new Function'],
  [/\batob\s*\(/, 'atob('],
  [/\bbtoa\s*\(/, 'btoa('],
  [/String\.fromCharCode/, 'String.fromCharCode'],
];

const where = e => String(e.stack).split('\n')[0];

function bundle() {
  const errors = [], parts = [], functions = new Map();
  for (const name of SCRIPTS) {
    const file = `src/js/${name}.js`;
    const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
    try { new vm.Script(code, { filename: file }); } catch (e) { errors.push(`${where(e)}: ${e.message}`); }
    // Two top-level functions with one name are legal JS: the later one silently replaces the earlier.
    for (const m of code.matchAll(/^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm)) {
      const at = `${file}:${code.slice(0, m.index).split('\n').length}`;
      if (functions.has(m[1])) errors.push(`${at}: function ${m[1]} is already defined at ${functions.get(m[1])}`);
      else functions.set(m[1], at);
    }
    parts.push(`// ---- ${file} ----\n${code}`);
  }
  const js = `'use strict';\n// Built by build.mjs from src/. Edit src/, not this file.\n\n${parts.join('\n')}`;
  // Catches what only shows up once the files share one scope (e.g. a const declared in two files).
  try { new vm.Script(js, { filename: 'bundle.js' }); } catch (e) { errors.push(`bundle: ${e.message}`); }

  const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8')
    .replace('/*@inline style.css*/', () => fs.readFileSync(path.join(SRC, 'style.css'), 'utf8'))
    .replace('/*@inline js*/', () => js);
  for (const [re, label] of BANNED) {
    const m = html.match(re);
    if (m) errors.push(`banned pattern "${label}" in the built page, at line ${html.slice(0, m.index).split('\n').length}`);
  }
  return { html, errors };
}

// Mirror src into dst: copy new or changed files, delete files that are gone.
function mirror(src, dst) {
  const keep = new Set();
  const walk = (from, to) => {
    fs.mkdirSync(to, { recursive: true });
    for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
      const a = path.join(from, ent.name), b = path.join(to, ent.name);
      if (ent.isDirectory()) { walk(a, b); continue; }
      keep.add(b);
      const sa = fs.statSync(a), sb = fs.existsSync(b) && fs.statSync(b);
      if (!sb || sb.size !== sa.size || sb.mtimeMs < sa.mtimeMs) fs.copyFileSync(a, b);
    }
  };
  if (fs.existsSync(src)) walk(src, dst);
  return keep;
}
function prune(dir, keep) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      prune(p, keep);
      try { fs.rmdirSync(p); } catch { /* not empty, or locked: harmless */ }
    } else if (!keep.has(p)) fs.unlinkSync(p);
  }
}

function build() {
  const started = Date.now();
  const { html, errors } = bundle();
  if (errors.length) {
    console.error(`Build failed, public/ left as it was:\n  ${errors.join('\n  ')}`);
    return false;
  }
  fs.mkdirSync(OUT, { recursive: true });
  const page = path.join(OUT, 'index.html');
  fs.writeFileSync(page, html);
  const keep = mirror(ASSETS, path.join(OUT, 'assets'));
  keep.add(page);
  prune(OUT, keep);
  console.log(`Built public/index.html (${(html.length / 1024).toFixed(0)} KB) and ${keep.size - 1} asset(s) in ${Date.now() - started} ms`);
  return true;
}

function serve(port) {
  const types = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
  http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    // Saves live in the Cloudflare Worker (npx wrangler dev runs it locally). Here, say so politely:
    // a 200 that isn't a save keeps saving off without a console error.
    if (url.startsWith('/api/')) { res.writeHead(200, { 'Content-Type': 'text/plain' }).end('no save server here'); return; }
    let file = path.join(OUT, url.endsWith('/') ? url + 'index.html' : url);
    if (!file.startsWith(OUT + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(data);
    });
  }).listen(port, () => console.log(`Serving public/ at http://localhost:${port} (rebuilds when src/ or assets/ change)`));

  let timer = null;
  const rebuild = () => { clearTimeout(timer); timer = setTimeout(build, 80); };
  for (const dir of [SRC, ASSETS]) if (fs.existsSync(dir)) fs.watch(dir, { recursive: true }, rebuild);
}

const args = process.argv.slice(2);
if (!build()) process.exit(1); // even with --serve: never serve a stale build at startup
if (args.includes('--serve')) {
  const i = args.indexOf('--port');
  serve(i >= 0 ? Number(args[i + 1]) : 8080);
}
