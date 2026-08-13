#!/usr/bin/env node
/* Build the three standalone HTML artefacts into dist/.
   Each one is a single file with three.js (where used) and all application
   code inlined, so it opens by double-clicking with no server and no network.

   Usage:  node tools/build.js            build everything
           node tools/build.js theatre    build one
*/
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const p = (...a) => path.join(ROOT, ...a);
const read = f => fs.readFileSync(p(f), 'utf8');
const kb = n => (n / 1024).toFixed(0).padStart(5) + ' KB';

const THREE = () => {
  const f = p('vendor/three.global.min.js');
  if (!fs.existsSync(f)) {
    console.error('\nMissing vendor/three.global.min.js — rebuild it with:\n' +
      '  npm i three esbuild\n' +
      '  echo "export * from \'three\';" > /tmp/entry.js\n' +
      '  npx esbuild /tmp/entry.js --bundle --format=iife --global-name=THREE --minify ' +
      '--outfile=vendor/three.global.min.js\n');
    process.exit(1);
  }
  return fs.readFileSync(f, 'utf8');
};

/* Replace each placeholder exactly once, asserting it was present. We cannot
   scan the finished file for leftovers: the three.js bundle legitimately
   contains the string `window.__THREE__`. */
function fill(html, map){
  for (const [token, value] of Object.entries(map)) {
    if (!html.includes(token)) {
      console.error(`  placeholder ${token} not found in the shell — aborting.`);
      process.exit(1);
    }
    html = html.replace(token, () => value());
  }
  return html;
}

const TARGETS = {
  theatre: () => {
    const app = ['th_core.js', 'th_m1.js', 'th_m2.js', 'th_m3.js', 'th_m4.js',
                 'th_m5.js', 'th_m6.js', 'th_boot.js']
      .map(f => read('theatre/' + f)).join('\n');
    return { out: 'dist/MAHAGENCO_Algorithm_Theatre.html',
             html: fill(read('theatre/th_shell.html'),
                        { __THREE__: THREE, __APP__: () => app }) };
  },

  pdm: () => {
    const app = ['pdm_core.js', 'pdm_3d.js', 'pdm_stages.js', 'pdm_stages2.js']
      .map(f => read('pdm-simulator/' + f)).join('\n');
    return { out: 'dist/MAHAGENCO_PdM_Simulator.html',
             html: fill(read('pdm-simulator/pdm_shell.html'),
                        { __THREE__: THREE, __APP__: () => app }) };
  },

  builder: () => {
    /* Reuses pdm_core.js so the builder trains on exactly the same year of
       data, the same five machines and the same fault definitions as the
       simulator. Two copies of that generator would drift apart within a
       week. No three.js — this artefact has no 3-D. */
    const app = [read('pdm-simulator/pdm_core.js'),
                 ...['mb_core.js', 'mb_python.js', 'mb_csv.js', 'mb_math.js',
                     'mb_touch.js', 'mb_ui.js']
                   .map(f => read('builder/' + f))].join('\n');
    return { out: 'dist/MAHAGENCO_Model_Builder.html',
             html: fill(read('builder/mb_shell.html'), { __APP__: () => app }) };
  },

  /* THIRD-PARTY.md rendered as a page the site can serve.

     The licences have to be reachable from the landing page — that is an
     obligation, not a nicety — and they used to be reachable by linking to
     the file on GitHub. The site should stand on its own without sending a
     participant to a source repository, so the same Markdown is rendered
     here instead. The links that remain inside it point at the upstream
     projects, which is exactly what an attribution notice is for. */
  licences: () => {
    const md = read('THIRD-PARTY.md');
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const inline = s => esc(s)
      .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) =>
        `<a href="${u}" rel="noopener noreferrer">${t}</a>`)
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    const cell = s => s.trim();
    const rows = md.split('\n');
    let out = '', table = null, para = [];
    const flush = () => { if (para.length){ out += `<p>${inline(para.join(' '))}</p>\n`; para = []; } };
    const endTable = () => {
      if (!table) return;
      out += '<table><thead><tr>' + table.head.map(h => `<th>${inline(h)}</th>`).join('') +
             '</tr></thead><tbody>' +
             table.body.map(r => '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
             '</tbody></table>\n';
      table = null;
    };
    for (const line of rows) {
      const t = line.trim();
      if (/^\|/.test(t)) {
        const cells = t.replace(/^\||\|$/g, '').split('|').map(cell);
        if (/^[-: ]+$/.test(cells.join(''))) continue;         // the |---| rule
        flush();
        if (!table) table = { head: cells, body: [] }; else table.body.push(cells);
        continue;
      }
      endTable();
      if (!t) { flush(); continue; }
      if (/^---+$/.test(t)) { flush(); out += '<hr>\n'; continue; }
      const h = t.match(/^(#{1,3})\s+(.*)$/);
      if (h) { flush(); out += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>\n`; continue; }
      para.push(t);
    }
    flush(); endTable();

    return { out: 'third-party.html', html: `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Third-party code — AI for Power Plants</title>
<meta name="theme-color" content="#1C2530">
<style>
:root{--ink:#1C2530;--mut:#6B7A8C;--line:#DDE4EC;--bg:#F7F9FB;--card:#fff;--acc:#1F5C8B}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:var(--bg);color:var(--ink);
  font:16px/1.62 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  -webkit-text-size-adjust:100%}
.wrap{max-width:900px;margin:0 auto;padding:0 20px}
header{background:var(--ink);color:#fff;padding:30px 0 26px}
header h1{margin:0;font-size:24px;line-height:1.2;font-weight:650}
header a{color:#B9C6D4;font-size:14px;text-decoration:none;display:inline-block;
  margin-bottom:14px;min-height:24px}
header a:hover{color:#fff}
main{padding:26px 0 60px}
h1,h2,h3{font-weight:650;line-height:1.25}
h1{font-size:23px;margin:0 0 10px}
h2{font-size:17px;margin:30px 0 10px}
h3{font-size:15px;margin:22px 0 8px}
p{margin:0 0 13px;max-width:74ch;color:#2A3644}
hr{border:0;border-top:1px solid var(--line);margin:26px 0}
code{background:#EDF1F5;border-radius:4px;padding:1px 5px;
  font:13px/1.4 ui-monospace,Consolas,"Courier New",monospace;word-break:break-word}
a{color:var(--acc)}
table{width:100%;border-collapse:collapse;margin:0 0 18px;background:var(--card);
  border:1px solid var(--line);border-radius:10px;overflow:hidden}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);
  font-size:14px;vertical-align:top}
th{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);
  background:#F2F5F8;white-space:nowrap}
tr:last-child td{border-bottom:0}
/* A five-column licence table cannot survive a phone. Turn every row into a
   labelled stack instead of letting it scroll sideways off the screen. */
@media(max-width:720px){
  thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
  table,tbody,tr,td{display:block;width:100%}
  table{border:0;background:none}
  tr{background:var(--card);border:1px solid var(--line);border-radius:10px;
     margin:0 0 12px;padding:4px 2px}
  td{border-bottom:0;padding:6px 13px}
  td:first-child{font-weight:700;font-size:15px;padding-top:11px}
  td:not(:first-child):before{content:attr(data-l);display:block;font-size:10.5px;
    letter-spacing:.08em;text-transform:uppercase;color:var(--mut);margin-bottom:1px}
}
</style>
</head>
<body>
<header><div class="wrap"><a href="./">&larr; Back to the artefacts</a>
  <h1>Third-party code</h1></div></header>
<main><div class="wrap">
${out}</div></main>
<script>
/* Label each cell with its column heading so the stacked phone layout reads
   as "Licence: MIT" rather than as an unlabelled list of fragments. */
document.querySelectorAll('table').forEach(t => {
  const h = [...t.querySelectorAll('thead th')].map(x => x.textContent);
  t.querySelectorAll('tbody tr').forEach(r =>
    [...r.children].forEach((c, i) => { if (h[i]) c.setAttribute('data-l', h[i]); }));
});
</script>
</body>
</html>
` };
  },

  lab: () => {
    const mods    = read('lab/lab_mods_a.html') + '\n' + read('lab/lab_mods_b.html');
    const scripts = read('lab/lab_js_a.js') + '\n' + read('lab/lab_js_b.js');
    const stations = JSON.stringify(JSON.parse(read('course/june2026.json')).stations);
    return { out: 'dist/MAHAGENCO_AI_Simulation_Lab.html',
             html: fill(read('lab/lab_part1.html'),
                        { __MODULES__: () => mods, __STATIONS__: () => stations,
                          __SCRIPTS__: () => scripts }) };
  }
};

const want = process.argv.slice(2).filter(a => TARGETS[a]);
const list = want.length ? want : Object.keys(TARGETS);
fs.mkdirSync(p('dist'), { recursive: true });
for (const name of list) {
  const { out, html } = TARGETS[name]();
  fs.writeFileSync(p(out), html);
  console.log(`  ${name.padEnd(8)} ${kb(Buffer.byteLength(html))}  ->  ${out}`);
}
console.log('\nOpen anything in dist/ by double-clicking it. No server needed.');
console.log('(The RAG bench in rag-bench/ is the exception — it must be served over http.)');
