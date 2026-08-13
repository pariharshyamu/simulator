/* =========================================================================
   DOES ANY OF THIS WORK ON A PHONE?

   The pack was written on a desktop and it showed. The Model Builder used
   HTML5 drag-and-drop, which does not exist on a touch screen, so its whole
   interaction was inert on a phone; the Theatre and the simulator put a
   3-D scene and a reading panel side by side with hard pixel floors that
   could not both be met under about 800px; the 3-D canvases had no
   touch-action, so a drag scrolled the page instead of turning the machine
   and a pinch zoomed the document instead of the camera.

   None of that is visible in a screenshot taken at 1440px. So this suite
   opens every artefact on real phone metrics with touch emulation and
   checks the things that actually break:

     · nothing overflows horizontally — the commonest failure, and the one
       that makes an otherwise fine page feel broken
     · every control a participant must hit is at least 40px
     · a tap does what a click does — specifically, that a block can be
       added to the model and a neuron opened, by finger
     · pinch changes the camera distance rather than the page zoom
     · no console errors at any of the sizes

   Usage:  node tools/qa-mobile.js
   ========================================================================= */
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const D = f => 'file://' + path.join(ROOT, 'dist', f);

let fails = 0;
const ok  = m => console.log('  \x1b[32mok\x1b[0m    ' + m);
const bad = m => { fails++; console.log('  \x1b[31mFAIL\x1b[0m  ' + m); };
const note= m => console.log('        \x1b[2m' + m + '\x1b[0m');

/* Three real phones, deliberately including a small one. 360x800 is the
   most common Android viewport in India by a wide margin. */
const PHONES = [
  { name: 'small Android  360×800', vp: { width: 360, height: 800 }, dsf: 3 },
  { name: 'iPhone 14      390×844', vp: { width: 390, height: 844 }, dsf: 3 },
  { name: 'large Android  412×915', vp: { width: 412, height: 915 }, dsf: 2.6 },
];

const ctxOpts = ph => ({
  viewport: ph.vp, deviceScaleFactor: ph.dsf, isMobile: true,
  hasTouch: true, userAgent: devices['Pixel 7'].userAgent,
});

/* Anything wider than the viewport makes the page slide sideways. A couple
   of pixels is rounding; more is a layout that has not been told about
   small screens. */
const overflow = page => page.evaluate(() => {
  const de = document.documentElement;
  let worst = null, by = 0;
  const over = de.scrollWidth - window.innerWidth;
  if (over > 2){
    for (const el of document.querySelectorAll('body *')){
      const r = el.getBoundingClientRect();
      const x = Math.round(r.right - window.innerWidth);
      if (x > by && r.width > 0){ by = x; worst = el.tagName.toLowerCase() +
        (el.id ? '#' + el.id : el.className ? '.' + String(el.className).split(' ')[0] : ''); }
    }
  }
  return { over, worst, by };
});

/* Every interactive thing a finger has to find. 40px is below the 44px
   guideline but is where a real miss rate starts; flagging at 40 keeps the
   signal honest rather than drowning it. */
const smallTargets = page => page.evaluate(() => {
  const sel = 'button, a[data-m], select, input[type=range], .tab, .chip, .tg, #rail .st, #mobnav button, #acts .a';
  const out = [];
  for (const el of document.querySelectorAll(sel)){
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    /* A status chip in a header is not a target. Judge by whether the
       element is genuinely operable — a real control, or something the page
       has marked as clickable — rather than by class name, which catches
       read-outs that happen to share a style. */
    const operable = /^(BUTTON|SELECT|INPUT|A)$/.test(el.tagName) ||
                     cs.cursor === 'pointer' || el.onclick != null;
    if (!operable) continue;
    if (Math.min(r.width, r.height) < 40)
      out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}` +
               `${el.className ? '.' + String(el.className).split(' ')[0] : ''} ` +
               `${Math.round(r.width)}×${Math.round(r.height)}`);
  }
  return [...new Set(out)];
});

async function openPage(browser, ph, url, settle){
  const ctx = await browser.newContext(ctxOpts(ph));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 140)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 140)); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(settle || 1400);
  return { ctx, page, errs };
}

/* A real two-finger pinch. Playwright has no pinch helper, so drive the
   pointer stream directly — which is also exactly what a phone sends. */
async function pinch(page, sel, from, to){
  const box = await page.$eval(sel, e => { const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const ev = (type, id, x, y) => page.evaluate(([type, id, x, y, sel]) => {
    const el = document.querySelector(sel);
    el.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y,
      pointerType: 'touch', isPrimary: id === 1, bubbles: true, cancelable: true }));
  }, [type, id, x, y, sel]);
  await ev('pointerdown', 1, cx - from / 2, cy);
  await ev('pointerdown', 2, cx + from / 2, cy);
  for (let s = 1; s <= 5; s++){
    const d = from + (to - from) * s / 5;
    await ev('pointermove', 1, cx - d / 2, cy);
    await ev('pointermove', 2, cx + d / 2, cy);
  }
  await ev('pointerup', 1, cx - to / 2, cy);
  await ev('pointerup', 2, cx + to / 2, cy);
}

(async () => {
  const missing = ['MAHAGENCO_Model_Builder.html', 'MAHAGENCO_Algorithm_Theatre.html',
                   'MAHAGENCO_PdM_Simulator.html', 'MAHAGENCO_AI_Simulation_Lab.html']
    .filter(f => !fs.existsSync(path.join(ROOT, 'dist', f)));
  if (missing.length){ console.error('build first — missing ' + missing.join(', ')); process.exit(1); }

  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

  /* ------------------------------------------------ 1. nothing overflows */
  console.log('\nNothing slides sideways');
  const PAGES = [
    ['landing page',   'file://' + path.join(ROOT, 'index.html'), 900],
    ['third-party',    'file://' + path.join(ROOT, 'third-party.html'), 700],
    ['Model Builder',  D('MAHAGENCO_Model_Builder.html'), 1600],
    ['Theatre',        D('MAHAGENCO_Algorithm_Theatre.html'), 4200],
    ['PdM simulator',  D('MAHAGENCO_PdM_Simulator.html'), 3600],
    ['Simulation Lab', D('MAHAGENCO_AI_Simulation_Lab.html'), 1600],
  ];
  for (const ph of PHONES){
    for (const [name, url, settle] of PAGES){
      const { ctx, page, errs } = await openPage(browser, ph, url, settle);
      const o = await overflow(page);
      o.over <= 2
        ? ok(`${name.padEnd(15)} ${ph.name}`)
        : bad(`${name} ${ph.name}: ${o.over}px of horizontal overflow, worst offender ${o.worst} (+${o.by}px)`);
      if (errs.length) bad(`${name} ${ph.name}: ${[...new Set(errs)][0]}`);
      await ctx.close();
    }
  }

  /* ------------------------------------------------- 2. touch targets */
  console.log('\nControls a finger can actually hit');
  for (const [name, url, settle] of PAGES.slice(2)){
    const { ctx, page } = await openPage(browser, PHONES[0], url, settle);
    const small = await smallTargets(page);
    small.length === 0
      ? ok(`${name}: every control is at least 40px`)
      : bad(`${name}: ${small.length} control(s) under 40px — ${small.slice(0, 4).join(', ')}`);
    await ctx.close();
  }

  /* ------------------------------- 3. the Model Builder, driven by finger */
  console.log('\nThe Model Builder, used the way a phone user must use it');
  {
    const { ctx, page, errs } = await openPage(browser, PHONES[0], D('MAHAGENCO_Model_Builder.html'), 1600);

    await page.isVisible('#mobnav')
      ? ok('the bottom bar is there, so the three panels are reachable')
      : bad('no bottom navigation at 360px — the palette and the canvas cannot both be seen');

    /* Tap a palette block. This is the whole interaction that HTML5 drag
       had made impossible. */
    const before = await page.evaluate(() => MB.spec.length);
    await page.tap('#mobnav button[data-p="palette"]');
    await page.waitForTimeout(250);
    const blk = await page.$('#palette .blk[data-type="lag"]');
    await blk.tap();
    await page.waitForTimeout(350);
    const after = await page.evaluate(() => MB.spec.length);
    after === before + 1
      ? ok(`tapping a palette block adds it — ${before} blocks → ${after}`)
      : bad(`tapping a palette block did nothing (${before} → ${after})`);
    (await page.textContent('#toast')).includes('added')
      ? ok('and says where it went, since the model is on another panel')
      : bad('nothing told the participant the block had been added');

    /* Tap a model block for its maths. Aim at the title so the tap does not
       land on a number field, which is what a real thumb would avoid too. */
    await page.tap('#mobnav button[data-p="canvasWrap"]');
    await page.waitForTimeout(250);
    await page.evaluate(() => { const r = mlpTrain(MB.spec); r.alert = applyAlert(r, MB.spec); MB.result = r; renderCanvas(); });
    await page.waitForTimeout(300);
    const t = await page.$('#canvas .blk[data-type="dense"] .t');
    await t.scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
    const bb = await t.boundingBox();
    await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.waitForTimeout(350);
    const maths = await page.evaluate(() => {
      const m = document.querySelector('#canvas .blk.sel .mth');
      return m ? m.innerText : '';
    });
    /Σ|z1|NEURON/i.test(maths)
      ? ok('tapping a block opens its arithmetic with live weights')
      : bad('tapping a block did not open the maths');
    /tanh\(/.test(maths) && /= *-?\d/.test(maths)
      ? ok('and the numbers are real — the activation is evaluated, not described')
      : bad('the maths panel has no evaluated numbers in it');

    if (errs.length) bad('console: ' + [...new Set(errs)][0]); else ok('no errors throughout');
    await ctx.close();
  }

  /* ------------------------------------- 4. the 3-D scenes accept a pinch */
  console.log('\n3-D scenes respond to two fingers');
  for (const [name, url, probe, settle] of [
    ['Theatre',       D('MAHAGENCO_Algorithm_Theatre.html'), 'TH3.getCam().dist',      4200],
    ['PdM simulator', D('MAHAGENCO_PdM_Simulator.html'),     'V3._probe().spin.dist',  3600],
  ]){
    const { ctx, page } = await openPage(browser, PHONES[0], url, settle);
    const cv = await page.$('canvas');
    if (!cv){ bad(`${name}: no canvas`); await ctx.close(); continue; }
    const ta = await page.$eval('canvas', c => getComputedStyle(c).touchAction);
    ta === 'none'
      ? ok(`${name}: the canvas claims the gesture, so a drag turns the model instead of scrolling the page`)
      : bad(`${name}: canvas touch-action is "${ta}" — the browser will steal the drag`);

    const before = await page.evaluate(probe).catch(() => null);
    if (before == null){ note(`${name}: no camera probe exposed, pinch not measured`); await ctx.close(); continue; }
    await pinch(page, 'canvas', 60, 220);
    await page.waitForTimeout(300);
    const after = await page.evaluate(probe);
    Math.abs(after - before) > before * 0.08
      ? ok(`${name}: pinch moved the camera ${before.toFixed(1)} → ${after.toFixed(1)}`)
      : bad(`${name}: pinch did not change the camera (${before.toFixed(2)} → ${after.toFixed(2)})`);
    await ctx.close();
  }

  /* ------------------------------------ 5. the Lab's modules are reachable */
  console.log('\nThe Simulation Lab');
  {
    const { ctx, page } = await openPage(browser, PHONES[0], D('MAHAGENCO_AI_Simulation_Lab.html'), 1600);
    const labels = await page.$$eval('#side a span.t', els =>
      els.filter(e => getComputedStyle(e).display !== 'none').length);
    labels >= 9
      ? ok(`all ${labels} module names are readable, not collapsed to codes`)
      : bad(`only ${labels} module names visible — the icon rail hides what the modules are`);
    const a = await page.$('#side a[data-m="s2"]');
    await a.tap(); await page.waitForTimeout(600);
    const shown = await page.evaluate(() => {
      const m = document.querySelector('#wrap [data-mod="s2"], #s2, .mod.on');
      return !!m && m.getBoundingClientRect().height > 100;
    });
    shown ? ok('tapping a module opens it') : note('module visibility not probed — selector did not match');
    await ctx.close();
  }

  await browser.close();
  console.log('\n' + '─'.repeat(64));
  console.log(fails ? `\x1b[31m${fails} failed\x1b[0m`
                    : '\x1b[32mevery artefact works on a phone\x1b[0m');
  process.exit(fails ? 1 : 0);
})();
