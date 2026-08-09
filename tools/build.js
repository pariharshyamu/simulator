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
