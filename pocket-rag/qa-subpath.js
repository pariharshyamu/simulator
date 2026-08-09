/* Drive the whole site the way GitHub Pages will serve it — under /simulator/ —
   and fail on anything that only works at the origin root.

   Two passes over Pocket RAG:
     self-hosted  vendor/manifest.json present, libraries served from the site
     cdn          manifest hidden, libraries resolved to jsDelivr. This sandbox
                  has no browser network egress, so those requests are fulfilled
                  from the same bytes on disk — which still proves the URL
                  resolution, the loader and the app all work over that path.

   Run the server first:
     python3 tools/serve-subpath.py --quiet &
     node pocket-rag/qa-subpath.js
*/
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');

const BASE = process.env.BASE || 'http://localhost:8000/simulator/';
const VENDOR = path.resolve(__dirname, 'vendor');
const CDN_TO_FILE = {
  'pdfjs-dist@6.2.108/build/pdf.min.mjs':          'pdf.min.mjs',
  'pdfjs-dist@6.2.108/build/pdf.worker.min.mjs':   'pdf.worker.min.mjs',
  'mammoth@1.12.0/mammoth.browser.min.js':         'mammoth.browser.min.js',
  '@huggingface/transformers@4.2.0/dist/transformers.min.js': 'transformers.min.js',
  '@mlc-ai/web-llm@0.2.84/lib/index.js':           'web-llm.js',
};
const MIME = f => f.endsWith('.mjs') ? 'text/javascript' : 'text/javascript';

/* Two documents from this repository, chosen because they break in different
   ways: a financial PDF that is mostly a table of figures, and a 308-page Word
   file with real heading levels. Override with PDF= and DOCX= if you want to
   try your own. */
const REPO = path.resolve(__dirname, '..');
const PDF  = process.env.PDF  || path.join(REPO, 'course', 'fuel_june2026.pdf');
const DOCX = process.env.DOCX || path.join(REPO, 'dist',
                                 'AI_in_Power_Plants_MAHAGENCO_Course_Material.docx');
const SHOTS = process.env.SHOTS || require('os').tmpdir();

let failures = 0;
const ok   = m => console.log('  \x1b[32mok\x1b[0m    ' + m);
const bad  = m => { failures++; console.log('  \x1b[31mFAIL\x1b[0m  ' + m); };
const info = m => console.log('        \x1b[2m' + m + '\x1b[0m');

function watch(page) {
  const errs = [], origins = new Set();
  page.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
  page.on('request', r => { const o = new URL(r.url()).origin; if (o !== new URL(BASE).origin) origins.add(o); });
  page.on('requestfailed', r => {
    if (!/favicon/.test(r.url())) errs.push('requestfailed: ' + r.url().slice(0, 120));
  });
  return { errs, origins };
}

async function landingPage(browser) {
  console.log('\nLanding page at the subpath');
  const page = await browser.newPage();
  const w = watch(page);
  const res = await page.goto(BASE, { waitUntil: 'networkidle' });
  res.status() === 200 ? ok('GET ' + BASE + ' → 200') : bad('GET ' + BASE + ' → ' + res.status());

  const links = await page.$$eval('a[href]', as => as.map(a => a.getAttribute('href')));
  const local = links.filter(h => !/^https?:/.test(h));
  let broken = 0;
  for (const h of local) {
    const u = new URL(h, BASE).href;
    const r = await page.request.head(u).catch(() => null);
    if (!r || r.status() >= 400) { bad(`${h} → ${r ? r.status() : 'no response'}`); broken++; }
  }
  if (!broken) ok(`${local.length} artefact links all reachable under the prefix`);
  w.errs.length ? bad('console: ' + [...new Set(w.errs)][0]) : ok('no page errors');
  await page.close();
}

async function artefacts(browser) {
  console.log('\nThe three standalone artefacts, served from the subpath');
  for (const f of ['MAHAGENCO_Algorithm_Theatre.html', 'MAHAGENCO_PdM_Simulator.html',
                   'MAHAGENCO_AI_Simulation_Lab.html']) {
    const page = await browser.newPage();
    const w = watch(page);
    await page.goto(BASE + 'dist/' + f, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    const title = await page.title();
    const real = [...new Set(w.errs)].filter(e => !/favicon/.test(e));
    real.length ? bad(`${f}: ${real[0]}`) : ok(`${f.replace('MAHAGENCO_', '')} — "${title.slice(0, 42)}" clean`);
    await page.close();
  }
}

async function pocketRag(browser, mode) {
  console.log(`\nPocket RAG — ${mode}`);
  /* Service workers issue their own requests, which context.route cannot see.
     The cdn pass depends on interception, so it runs without one; the
     self-hosted pass is where the service worker is exercised. */
  const ctx = await browser.newContext({
    ...devices['Pixel 7'],
    serviceWorkers: mode === 'cdn' ? 'block' : 'allow',
  });

  if (mode === 'cdn') {
    // Hide the local manifest so vendor.js falls through to jsDelivr…
    await ctx.route(u => u.pathname.endsWith('/vendor/manifest.json'),
                    r => r.fulfill({ status: 404, contentType: 'text/plain', body: '' }));
    // …and serve those jsDelivr URLs from the identical bytes on disk, because
    // this sandbox has no outbound network from the browser.
    await ctx.route('https://cdn.jsdelivr.net/**', route => {
      const url = route.request().url();
      const hit = Object.entries(CDN_TO_FILE).find(([frag]) => url.includes(frag));
      if (!hit) return route.abort();
      const file = path.join(VENDOR, hit[1]);
      return route.fulfill({ status: 200, contentType: MIME(file), body: fs.readFileSync(file) });
    });
  }

  const page = await ctx.newPage();
  const w = watch(page);
  await page.goto(BASE + 'pocket-rag/', { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  const src = await page.evaluate(async () => {
    const m = await import('./vendor.js');
    const v = await m.vendor();
    return { source: v.__source, pdf: v.pdf, transformers: v.transformers };
  });
  const expected = mode === 'cdn' ? 'jsdelivr' : 'self-hosted';
  src.source === expected ? ok(`libraries resolve to ${src.source}`)
                          : bad(`libraries resolved to ${src.source}, expected ${expected}`);
  info('pdf.js from ' + src.pdf.replace(BASE, '…/'));

  for (const [file, q, want] of [
    [PDF,  'What is the auxiliary power consumption at Nashik?', /aux|12\.9|per cent|%/i],
    [DOCX, 'How do we stop an AI project from dying in the first six months?', /.{60,}/s],
  ]) {
    const t0 = Date.now();
    const want_name = path.basename(file);
    await page.setInputFiles('#file', file);
    await page.waitForSelector('#workspace', { state: 'visible', timeout: 240000 });
    /* The workspace is already visible on the second file, so wait for the card
       to actually be about the file we just opened. */
    await page.waitForFunction(
      n => (document.getElementById('docCard')?.innerText || '').includes(n),
      want_name, { timeout: 240000 });
    const card = (await page.evaluate(() => document.getElementById('docCard').innerText))
      .split('\n').slice(0, 2).join(' · ');
    ok(`${want_name} parsed in ${((Date.now() - t0) / 1000).toFixed(1)} s — ${card}`);

    await page.fill('#q', q);
    await page.tap('#ask');
    await page.waitForTimeout(3000);
    const ans = await page.evaluate(() => {
      const e = [...document.querySelectorAll('.ans .b')].pop();
      return e ? e.innerText.replace(/\s+/g, ' ') : '';
    });
    const hits = await page.evaluate(() =>
      [...document.querySelectorAll('.hit .ti')].map(e => e.childNodes[0].textContent.trim()).slice(0, 2));
    ans && want.test(ans) ? ok(`answered — ${ans.slice(0, 90)}…`)
                          : bad(`no usable answer for "${q.slice(0, 40)}…" (got ${ans.slice(0, 60)})`);
    info('cited: ' + hits.join(' | '));
  }

  if (mode === 'cdn') {
    info('service worker deliberately blocked in this pass');
  } else {
    const sw = await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      return r ? { scope: r.scope, active: !!r.active } : null;
    });
    if (!sw) bad('no service worker registered');
    else if (!sw.scope.endsWith('/pocket-rag/')) bad('service worker scope is ' + sw.scope);
    else ok(`service worker registered, scope ${new URL(sw.scope).pathname}`);

    /* Cut the network and reload: the document must come back from IndexedDB
       and still answer. This is the claim the app makes on its own front page. */
    await ctx.setOffline(true);
    await page.reload({ waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(1500);
    const back = await page.evaluate(() =>
      (document.getElementById('docCard')?.innerText || '').split('\n')[0] || '');
    back.includes(path.basename(DOCX)) ? ok('offline reload restored the document from storage')
                               : bad('offline reload lost the document (card said "' + back + '")');
    await ctx.setOffline(false);
  }

  const strays = [...w.origins].filter(o => o !== 'https://cdn.jsdelivr.net');
  strays.length ? bad('contacted an unexpected origin: ' + strays.join(', '))
                : ok(mode === 'cdn' ? 'only this site and jsDelivr contacted — no document ever left'
                                    : 'zero external origins contacted');

  /* The one expected 404: vendor.js asks whether a self-hosted copy of the
     libraries was installed, and on a CDN deployment the answer is no. */
  const EXPECTED_404 = /vendor\/manifest\.json|status of 404/;
  const real = [...new Set(w.errs)].filter(e => !(mode === 'cdn' && EXPECTED_404.test(e)));
  real.length ? real.slice(0, 3).forEach(e => bad(e))
              : ok('no page or console errors' +
                   (mode === 'cdn' ? ' beyond the expected manifest probe' : ''));

  await page.screenshot({ path: path.join(SHOTS, `qa-subpath-${mode}.png`), fullPage: false });
  await ctx.close();
}

(async () => {
  console.log(`Serving as GitHub Pages will: ${BASE}`);
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  await landingPage(browser);
  await artefacts(browser);
  await pocketRag(browser, 'self-hosted');
  await pocketRag(browser, 'cdn');
  await browser.close();
  console.log('\n' + '─'.repeat(60));
  console.log(failures ? `\x1b[31m${failures} failed\x1b[0m` : '\x1b[32mall checks passed\x1b[0m');
  process.exit(failures ? 1 : 0);
})();
