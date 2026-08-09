#!/usr/bin/env node
/* The prepublish gate.

   Nothing in this repository goes public until this exits 0. It is deliberately
   made of checks that have already caught something real:

     secrets      GitHub push protection rejected an earlier push of this repo
                  over a 32-character alphanumeric literal inside a minified
                  bundle. It was a false positive and it still blocked the push.
                  So: scan for what the scanner scans for, before pushing.
     weight       nothing enormous, nothing generated, nothing ignored-but-staged.
     subpath      the site is served from /simulator/, not /. One root-absolute
                  URL and the whole page 404s only on the deployed copy.
     assets       every relative reference resolves to a file that exists.
     worker       the service worker's precache list must be true, or install
                  fails silently and the PWA is not offline-capable.
     privacy      no container paths, no personal addresses, no stray logs.
     licences     every vendored or CDN-loaded library named and attributed.
     pages        the things GitHub Pages needs in order not to mangle the site.

   Usage:  node tools/prepublish.js            check everything
           node tools/prepublish.js --verbose  list every file checked
*/
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const VERBOSE = process.argv.includes('--verbose');
const p = (...a) => path.join(ROOT, ...a);

let failures = 0, warnings = 0, checks = 0;
const RED = s => `\x1b[31m${s}\x1b[0m`, YEL = s => `\x1b[33m${s}\x1b[0m`,
      GRN = s => `\x1b[32m${s}\x1b[0m`, DIM = s => `\x1b[2m${s}\x1b[0m`;

function group(name) { console.log(`\n${name}`); }
function pass(msg)  { checks++; console.log('  ' + GRN('pass') + '  ' + msg); }
function fail(msg)  { checks++; failures++; console.log('  ' + RED('FAIL') + '  ' + msg); }
function warn(msg)  { checks++; warnings++; console.log('  ' + YEL('warn') + '  ' + msg); }
function note(msg)  { console.log('        ' + DIM(msg)); }

const tracked = cp.execSync('git ls-files -z', { cwd: ROOT, maxBuffer: 1 << 28 })
  .toString().split('\0').filter(Boolean);
const isText = f => /\.(js|mjs|cjs|json|html|htm|css|md|txt|py|yml|yaml|webmanifest|svg|xml)$/i.test(f);
const size = f => { try { return fs.statSync(p(f)).size; } catch (e) { return -1; } };
const read = f => fs.readFileSync(p(f), 'utf8');

/* Files we accept scanner noise in, because they are third-party bundles whose
   bytes are pinned by checksum elsewhere. Anything not on this list is held to
   the strict standard. */
const VENDOR = f => /(^|\/)vendor\//.test(f) || /\.min\.(js|mjs)$/.test(f);

/* An allowlist of findings a human has looked at and accepted. Each entry must
   say why, so that "we decided this was fine" never decays into "nobody looked". */
const ACCEPTED = [
  { file: 'course/fuel.txt', pattern: 'email',
    why: 'rcgen@mahagenco.in is the published departmental mailbox printed on the ' +
         'MAHAGENCO energy bill this course is built from. Not a personal address.' },
  { file: 'tools/build.js', pattern: 'container path',
    why: 'the string /tmp/entry.js appears in a help message telling the reader ' +
         'how to rebuild the three.js bundle. It is instructions, not a leak.' },
];
const accepted = (file, pattern) => ACCEPTED.find(a => a.file === file && a.pattern === pattern);

/* ===================================================================== 1 */
group('1. Secrets — what GitHub push protection will see');

const SECRET_PATTERNS = [
  ['GitHub personal access token', /gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{60,}/g, false],
  ['AWS access key id',            /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g, true],
  ['Google API key',               /AIza[0-9A-Za-z_\-]{35}/g, true],
  ['Slack token',                  /xox[baprs]-[0-9A-Za-z\-]{10,}/g, true],
  ['OpenAI-style key',             /\bsk-[A-Za-z0-9]{32,}/g, true],
  ['private key block',            /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, false],
  ['Anthropic key',                /sk-ant-[A-Za-z0-9\-_]{20,}/g, false],
  /* The one that actually blocked us: a bare 32-char lowercase-alphanumeric
     literal, which GitHub reads as a Mistral AI API key. */
  ['32-char key-shaped literal',
    /(?<![A-Za-z0-9])(?=[a-z0-9]{32}(?![A-Za-z0-9]))(?=.*[0-9])(?=.*[a-z])[a-z0-9]{32}/g, true],
  ['JSON Web Token',               /eyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g, true],
];

let secretHits = 0;
for (const f of tracked) {
  if (size(f) > 12_000_000 || !isText(f)) continue;
  let s; try { s = read(f); } catch (e) { continue; }
  for (const [name, re, bundleProne] of SECRET_PATTERNS) {
    const m = s.match(re);
    if (!m) continue;
    secretHits++;
    /* A false positive still blocks the push. Vendored or not, it fails. */
    fail(`${f} — ${m.length}× ${name}`);
    note(bundleProne && VENDOR(f)
      ? 'almost certainly random bytes inside a minified bundle, but push protection ' +
        'does not know that. Do not ship this file from git — load it from a pinned CDN.'
      : 'inspect this before doing anything else.');
    note('first match: ' + m[0].slice(0, 12) + '…');
  }
}
if (!secretHits) pass(`no key-shaped strings in ${tracked.length} tracked files`);

/* ===================================================================== 2 */
group('2. Weight — nothing enormous, nothing generated');

const LIMIT_MB = 25;
const heavy = tracked.map(f => [f, size(f)]).filter(([, n]) => n > LIMIT_MB * 1048576);
if (heavy.length) heavy.forEach(([f, n]) => fail(`${f} is ${(n / 1048576).toFixed(1)} MB (limit ${LIMIT_MB} MB)`));
else pass(`largest tracked file is ${(Math.max(...tracked.map(size)) / 1048576).toFixed(1)} MB`);

/* Tokenizer and config JSON inside models/ is deliberately committed — it is a
   few kilobytes and it is what lets get-models.py fetch only the weights. The
   weights themselves must never be here. */
const MUST_NOT_TRACK = [
  [/(^|\/)node_modules\//,                  'node_modules'],
  [/\.(onnx|onnx_data|bin|safetensors|pt)$/, 'model weights'],
  [/\.wasm$/,                               'WebAssembly binaries'],
  [/\.log$/,                                'log files'],
  [/(^|\/)\.env/,                           'environment files'],
  [/(^|\/)\.DS_Store$/,                     'macOS metadata'],
];
let staged = 0;
for (const f of tracked)
  for (const [re, what] of MUST_NOT_TRACK)
    if (re.test(f)) { fail(`${f} — ${what} should not be in the repository`); staged++; }
if (!staged) pass('no build artefacts, weights, logs or environment files tracked');

const ignoredButTracked = tracked.filter(f => {
  try { cp.execSync(`git check-ignore -q -- ${JSON.stringify(f)}`, { cwd: ROOT }); return true; }
  catch (e) { return false; }
});
if (ignoredButTracked.length)
  ignoredButTracked.forEach(f => fail(`${f} is in .gitignore but still tracked`));
else pass('nothing is both ignored and tracked');

/* ===================================================================== 3 */
group('3. Subpath safety — the site lives at /simulator/, not /');

/* Files that will be served by GitHub Pages and must survive a path prefix. */
const SITE = tracked.filter(f =>
  /\.(html|js|mjs|css|webmanifest|json)$/i.test(f) && !VENDOR(f) &&
  !/^(deck|course|tools)\//.test(f));

const ABS = [
  [/\ssrc\s*=\s*["']\/[^\/]/g,            'src="/…"'],
  [/\shref\s*=\s*["']\/[^\/]/g,           'href="/…"'],
  [/url\(\s*["']?\/[^\/"')]/g,            'url(/…)'],
  [/\bfetch\(\s*["'`]\/[^\/]/g,           "fetch('/…')"],
  [/\bimport\(\s*["'`]\/[^\/]/g,          "import('/…')"],
  [/\bfrom\s+["']\/[^\/]/g,               "from '/…'"],
  [/new\s+Worker\(\s*["'`]\/[^\/]/g,      "new Worker('/…')"],
  [/\.register\(\s*["'`]\/[^\/]/g,        "serviceWorker.register('/…')"],
];
let absHits = 0;
for (const f of SITE) {
  let s; try { s = read(f); } catch (e) { continue; }
  for (const [re, label] of ABS) {
    const m = s.match(re);
    if (m) { fail(`${f} — ${m.length}× root-absolute ${label}`); absHits++; }
  }
}
/* The web app manifest is the classic one: an absolute start_url silently
   installs a PWA pointing at the wrong origin path. */
for (const f of tracked.filter(f => f.endsWith('.webmanifest'))) {
  const j = JSON.parse(read(f));
  for (const k of ['start_url', 'scope']) {
    if (j[k] && j[k].startsWith('/')) { fail(`${f} — ${k} is "${j[k]}", must be relative`); absHits++; }
  }
  for (const ic of j.icons || [])
    if (ic.src && ic.src.startsWith('/')) { fail(`${f} — icon src "${ic.src}" must be relative`); absHits++; }
}
if (!absHits) pass(`${SITE.length} shipped files, every URL relative`);

/* ===================================================================== 4 */
group('4. Assets — every relative reference resolves');

const REF = /(?:src|href)\s*=\s*["'](\.\/[^"'#?]+)["']|(?:from|import\()\s*["'](\.\/[^"'#?]+)["']|new\s+URL\(\s*["'](\.?\.?\/?[\w.\-\/]+)["']\s*,\s*import\.meta\.url/g;
let missing = 0, refs = 0;
for (const f of SITE) {
  let s; try { s = read(f); } catch (e) { continue; }
  const dir = path.dirname(f);
  for (const m of s.matchAll(REF)) {
    const rel = m[1] || m[2] || m[3];
    if (!rel || /^https?:/.test(rel)) continue;
    /* vendor/ is fetched at runtime by get-vendor.py and is not in the repo. */
    const target = path.normalize(path.join(dir, rel));
    if (/(^|\/)vendor\//.test(target) || /(^|\/)models\//.test(target)) continue;
    refs++;
    if (!fs.existsSync(p(target))) { fail(`${f} references ${rel} — no such file`); missing++; }
  }
}
if (!missing) pass(`${refs} relative references, all resolve`);

/* ===================================================================== 5 */
group('5. Service worker — the precache list must be true');

const SW = 'pocket-rag/sw.js';
if (fs.existsSync(p(SW))) {
  const s = read(SW);
  const shell = (s.match(/const SHELL\s*=\s*\[([\s\S]*?)\]/) || [, ''])[1]
    .match(/['"]([^'"]+)['"]/g)?.map(x => x.slice(1, -1)) || [];
  let bad = 0;
  for (const u of shell) {
    if (u === './') continue;
    if (!fs.existsSync(p('pocket-rag', u))) { fail(`${SW} precaches ${u}, which does not exist`); bad++; }
  }
  if (!bad) pass(`${shell.length} precached shell files all present`);

  /* And the reverse: a shipped file the worker forgot means a broken offline load. */
  const shipped = tracked.filter(f => f.startsWith('pocket-rag/') && !VENDOR(f) &&
    /\.(html|js|mjs|css|json|webmanifest|png)$/.test(f) && !/README/.test(f))
    .map(f => './' + f.slice('pocket-rag/'.length));
  /* Deployment config is read by the host, never by the browser. */
  const NOT_APP = ['./sw.js', './vercel.json', './vendor/manifest.json', './qa-subpath.js'];
  const forgotten = shipped.filter(f => !shell.includes(f) && !NOT_APP.includes(f));
  if (forgotten.length) { forgotten.forEach(f => warn(`${SW} does not precache ${f}`)); }
  else pass('every shipped file is either precached or deliberately excluded');

  /* vendor.json is the single source of truth for library URLs; the worker must
     read it rather than carry its own copy that can drift. */
  if (/cdn\.jsdelivr\.net\/npm\/[a-z@]/.test(s))
    fail(`${SW} hard-codes a CDN URL — it must read vendor.json instead, or the two will drift`);
  else pass('the worker derives library URLs from vendor.json, no duplicated version pins');
} else warn('pocket-rag/sw.js not found — skipping');

/* ===================================================================== 5b */
group('5b. Pinned libraries — the CDN bytes are the bytes we tested');

const VJ = 'pocket-rag/vendor.json';
if (fs.existsSync(p(VJ))) {
  const libs = JSON.parse(read(VJ)).libs;
  let ok = 0;
  for (const [key, lib] of Object.entries(libs)) {
    const problems = [];
    if (!/^https:\/\/cdn\.jsdelivr\.net\/npm\/(?:@[\w.-]+\/)?[\w.-]+@\d+\.\d+\.\d+\//.test(lib.cdn))
      problems.push('CDN URL is not a pinned exact version');
    if (!/^[0-9a-f]{64}$/.test(lib.sha256 || '')) problems.push('no SHA-256');
    if (!lib.bytes) problems.push('no byte count');
    if (problems.length) fail(`${key}: ${problems.join('; ')}`);
    else ok++;
  }
  if (ok === Object.keys(libs).length) pass(`${ok} libraries, each pinned to an exact version with a checksum`);
  note('run `python3 pocket-rag/get-vendor.py --verify` to confirm the bytes on disk');
} else warn('pocket-rag/vendor.json not found — skipping');

/* ===================================================================== 6 */
group('6. Privacy — nothing about the machine that built this');

const LEAKS = [
  ['container path', /\/home\/claude|\/tmp\/[a-z0-9_.\-]{3,}|\/Users\/[a-z]/gi],
  ['email',          /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(?:com|org|net|in|co\.in)\b/g],
];
let leaks = 0;
for (const f of tracked) {
  if (VENDOR(f) || !isText(f) || size(f) > 4_000_000) continue;
  /* The scanner necessarily contains the things it scans for. */
  if (f === 'tools/prepublish.js') continue;
  let s; try { s = read(f); } catch (e) { continue; }
  for (const [what, re] of LEAKS) {
    const m = s.match(re);
    if (!m) continue;
    const ok = accepted(f, what);
    if (ok) { note(`accepted: ${f} — ${what} — ${ok.why}`); continue; }
    fail(`${f} — ${m.length}× ${what}: ${[...new Set(m)].slice(0, 3).join(', ')}`);
    leaks++;
  }
}
if (!leaks) pass('no container paths or unreviewed addresses in shipped text');

/* ===================================================================== 7 */
group('7. Attribution — every third-party library named');

const TP = 'THIRD-PARTY.md';
if (!fs.existsSync(p(TP))) fail(`${TP} is missing — vendored and CDN-loaded code must be attributed`);
else {
  const s = read(TP);
  const need = ['three.js', 'pdf.js', 'mammoth', 'transformers.js', 'WebLLM', 'ONNX Runtime'];
  const absent = need.filter(n => !new RegExp(n.replace('.', '\\.'), 'i').test(s));
  if (absent.length) fail(`${TP} does not mention: ${absent.join(', ')}`);
  else pass(`${TP} names all ${need.length} third-party libraries`);

  /* Every version pinned in vendor.json must appear in the attribution file. */
  if (fs.existsSync(p(VJ))) {
    const libs = JSON.parse(read(VJ)).libs;
    const vers = [...new Set(Object.values(libs).map(l => (l.cdn.match(/@(\d+\.\d+\.\d+)\//) || [])[1]).filter(Boolean))];
    const miss = vers.filter(v => !s.includes(v));
    if (miss.length) fail(`${TP} is missing pinned versions: ${miss.join(', ')}`);
    else pass(`all ${vers.length} pinned versions appear in ${TP}`);
  }
}

/* ===================================================================== 8 */
group('8. GitHub Pages preconditions');

if (!fs.existsSync(p('.nojekyll'))) fail('.nojekyll is missing at the repository root — Jekyll will eat _-prefixed paths');
else pass('.nojekyll present at the root');

if (!fs.existsSync(p('index.html'))) fail('index.html is missing at the repository root — Pages would serve the README');
else pass('index.html present at the root');

const awkward = tracked.filter(f => /[ #?%:*"<>|]/.test(f) || /(^|\/)_/.test(f));
if (awkward.length) awkward.forEach(f => warn(`${f} — awkward name for a static host`));
else pass('no filenames that a static host will mangle');

/* Pages cannot set COOP/COEP, so nothing shipped may depend on them. */
let sabDeps = 0;
for (const f of SITE) {
  const s = read(f);
  if (/SharedArrayBuffer/.test(s) && !/crossOriginIsolated/.test(s)) {
    fail(`${f} uses SharedArrayBuffer without checking crossOriginIsolated — Pages cannot send COOP/COEP`);
    sabDeps++;
  }
}
if (!sabDeps) pass('nothing assumes cross-origin isolation, which Pages cannot provide');

/* Every artefact the landing page links to has to actually be there. */
if (fs.existsSync(p('index.html'))) {
  const s = read('index.html');
  const links = [...s.matchAll(/href\s*=\s*["'](?!https?:|mailto:|#)([^"']+)["']/g)].map(m => m[1]);
  const broken = links.filter(l => !fs.existsSync(p(l.replace(/[?#].*$/, ''))));
  if (broken.length) broken.forEach(l => fail(`index.html links to ${l}, which does not exist`));
  else pass(`landing page: ${links.length} local links, all resolve`);
}

/* ===================================================================== 9 */
group('9. Build reproducibility');

try {
  const before = ['dist/MAHAGENCO_Algorithm_Theatre.html', 'dist/MAHAGENCO_PdM_Simulator.html',
                  'dist/MAHAGENCO_AI_Simulation_Lab.html']
    .filter(f => fs.existsSync(p(f)))
    .map(f => [f, cp.execSync(`sha256sum ${JSON.stringify(p(f))}`).toString().slice(0, 16)]);
  cp.execSync('node tools/build.js', { cwd: ROOT, stdio: 'pipe' });
  let drift = 0;
  for (const [f, h] of before) {
    const now = cp.execSync(`sha256sum ${JSON.stringify(p(f))}`).toString().slice(0, 16);
    if (now !== h) { warn(`${f} changed when rebuilt — the shipped copy is not what the source produces`); drift++; }
  }
  if (!drift) pass(`${before.length} artefacts rebuild byte-identically from source`);
} catch (e) {
  fail('tools/build.js did not run cleanly: ' + String(e.message).split('\n')[0]);
}

/* ==================================================================== 10 */
group('10. The deployed site, driven in a real browser');

const FULL = process.argv.includes('--full');
if (!FULL) {
  note('skipped — pass --full to serve the site at /simulator/ and drive it with Playwright');
  note('or run it yourself:  python3 tools/serve-subpath.py --quiet &  node pocket-rag/qa-subpath.js');
} else {
  let srv;
  try {
    srv = cp.spawn('python3', ['tools/serve-subpath.py', '--quiet', '--port', '8123'],
                   { cwd: ROOT, stdio: 'ignore', detached: true });
    cp.execSync('sleep 2');
    const out = cp.execSync('node pocket-rag/qa-subpath.js', {
      cwd: ROOT, env: { ...process.env, BASE: 'http://localhost:8123/simulator/' },
      stdio: 'pipe', timeout: 900000,
    }).toString();
    const okCount = (out.replace(/\x1b\[[0-9;]*m/g, '').match(/^ {2}ok {4}/gm) || []).length;
    pass(`browser suite passed (${okCount} assertions across the landing page, three artefacts and both library modes)`);
  } catch (e) {
    fail('browser suite failed — run it directly to see why');
    const out = (e.stdout || '').toString();
    out.split('\n').filter(l => /FAIL/.test(l)).slice(0, 6).forEach(l => note(l.trim()));
  } finally {
    if (srv) { try { process.kill(-srv.pid); } catch (e) {} }
  }
}

/* ===================================================================== */
console.log('\n' + '─'.repeat(64));
console.log(`${checks} checks · ${failures ? RED(failures + ' failed') : GRN('0 failed')} · ` +
            `${warnings ? YEL(warnings + ' warnings') : '0 warnings'}`);
if (failures) {
  console.log(RED('\nGATE CLOSED — do not push.'));
  process.exit(1);
}
console.log(GRN('\nGATE OPEN — safe to publish.'));
process.exit(0);
