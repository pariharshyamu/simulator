/* Drive the Model Builder the way a participant will: drag a block in, change
   a field, train, read the verdict. The assertions that matter are not "did it
   render" but "does the model behave the way the course says it will" — a
   window that misses the season must cry wolf, and a window that contains the
   fault must go quiet. If those two ever stop being true the artefact is
   teaching the opposite of the handout.

   Usage:  node builder/qa-builder.js  [path/to/built.html]
*/
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');

const FILE = process.argv[2] ||
  path.resolve(__dirname, '..', 'dist', 'MAHAGENCO_Model_Builder.html');
const SHOTS = process.env.SHOTS || os.tmpdir();

let fails = 0;
const ok  = m => console.log('  \x1b[32mok\x1b[0m    ' + m);
const bad = m => { fails++; console.log('  \x1b[31mFAIL\x1b[0m  ' + m); };
const note= m => console.log('        \x1b[2m' + m + '\x1b[0m');

/* Train with a given window and return what the app concluded. */
const runWindow = (from, to) => `(async () => {
  MB.spec.find(b => b.type === 'window').f.from = ${from};
  MB.spec.find(b => b.type === 'window').f.to   = ${to};
  const res = mlpTrain(MB.spec);
  res.alert = applyAlert(res, MB.spec);
  MB.result = res;
  return { first: res.alert && res.alert.firstDay, count: res.alert && res.alert.count,
           drift: res.alert && res.alert.drift, sig: res.alert && res.alert.driftSigmas,
           onset: MB.data.onset, params: res.params, ms: res.ms,
           sigma: res.sigma, loss0: res.loss[0], lossN: res.loss[res.loss.length-1] };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 980 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });

  await page.goto('file://' + FILE, { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  console.log('\nIt opens with something that runs');
  const start = await page.evaluate(() => ({
    canvas: document.querySelectorAll('#canvas .blk').length,
    palette: document.querySelectorAll('#palette .blk').length,
    errs: validate(MB.spec).length,
    rows: MB.data.rows, tags: MB.data.tags.length,
  }));
  start.canvas >= 8 ? ok(`${start.canvas} blocks already on the canvas, ${start.palette} in the palette`)
                    : bad(`only ${start.canvas} blocks on the canvas`);
  start.errs === 0 ? ok('the starting model validates — a participant can press Train immediately')
                   : bad(`${start.errs} validation errors on load`);
  start.rows === 8760 ? ok(`${start.rows} rows, a full year, ${start.tags} tags`)
                      : bad(`${start.rows} rows, expected 8760`);

  console.log('\nIt learns, and fast enough to be interactive');
  const good = await page.evaluate(runWindow(0, 180));
  /* Loss is mean-squared on a standardised target, so predicting the mean
     scores 1.0. The test is whether the model beats that, not whether it
     halves its own starting value — with only duty and weather as inputs the
     cooler's knee is genuinely unexplainable and a plateau is the correct
     answer, not a training failure. */
  (good.lossN < 0.35 && good.lossN < good.loss0)
    ? ok(`loss ${good.loss0.toFixed(4)} → ${good.lossN.toFixed(4)} — explains ${((1-good.lossN)*100).toFixed(0)}% of the variance a mean-predictor leaves`)
    : bad(`final loss ${good.lossN.toFixed(4)} — barely better than predicting the average`);
  good.ms < 8000 ? ok(`${good.params} parameters trained in ${(good.ms/1000).toFixed(2)} s`)
                 : bad(`training took ${(good.ms/1000).toFixed(1)} s — too slow to explore`);

  console.log('\nThe two lessons the course promises');
  /* 1. a window that covers the year detects the fault, after it starts */
  (good.first !== null && good.first > good.onset)
    ? ok(`full window: advisory on day ${Math.round(good.first)}, ${Math.round(good.first-good.onset)} days after the fault began on ${good.onset}`)
    : bad(`full window: advisory ${good.first === null ? 'never raised' : 'on day ' + Math.round(good.first) + ', before the fault'}`);
  good.count <= 3 ? ok(`${good.count} advisory episode(s) over the year — a triageable rate`)
                  : bad(`${good.count} episodes — the alert rule is counting re-firings, not episodes`);

  /* A clean, season-spanning window should be honest BEFORE the fault too. */
  good.sig < 1.5
    ? ok(`full window: mean residual before the fault is ${good.drift.toFixed(2)}, ${good.sig.toFixed(1)}x sigma — the model is not drifting with the weather`)
    : bad(`full window drifts ${good.drift.toFixed(2)} (${good.sig.toFixed(1)}x sigma) before any fault`);

  /* 2. A winter-only window must be visibly wrong in summer. Testing whether
     an ADVISORY fires is the wrong question: the seasonal error here is
     diurnal, so a 72-hour persistence rule filters it out. The phenomenon to
     assert is the drift itself, which is what the verdict now reports. */
  const winter = await page.evaluate(runWindow(0, 45));
  winter.sig > 3
    ? ok(`winter-only window: runs ${winter.drift > 0 ? '+' : ''}${winter.drift.toFixed(1)} out on average before any fault exists — ${winter.sig.toFixed(1)}x its own alert band`)
    : bad(`winter-only window drifts only ${winter.sig.toFixed(1)}x sigma — the seasonal lesson is not demonstrable`);
  winter.sig > good.sig * 3
    ? ok(`and that is ${(winter.sig/good.sig).toFixed(0)}x worse than the season-spanning window — the comparison a participant is meant to make`)
    : bad(`winter (${winter.sig.toFixed(1)}x) is not clearly worse than full (${good.sig.toFixed(1)}x)`);

  /* 3. A window containing the fault must be badly late. */
  const contam = await page.evaluate(runWindow(0, 300));
  const late = contam.first === null ? 999 : contam.first - good.first;
  late > 40
    ? ok(`contaminated window: ${contam.first === null ? 'never detected' : 'detected only on day ' + Math.round(contam.first)} — ${contam.first === null ? '' : Math.round(late) + ' days later than the clean model. '}Training on the fault taught it the fault is normal`)
    : bad(`contaminated window detected on day ${Math.round(contam.first)}, only ${Math.round(late)} days later than clean — contamination is not costing anything`);

  console.log('\nIt explains itself when the answer is surprising');
  /* Two questions this artefact actually got asked, which it should now
     answer on screen rather than leaving to the presenter. */
  const why = await page.evaluate(() => {
    defaultSpec();
    const r = mlpTrain(MB.spec); r.alert = applyAlert(r, MB.spec);
    return { html: verdict(r, r.alert, false), sigma: r.sigma, noise: r.noise,
             lag: r.alert.firstDay - MB.data.onset, sev: r.alert.sevAt };
  });
  /why is not a function|undefined/.test(String(why.html)) ? bad('verdict threw') : null;
  /Why \d+ days\?/.test(why.html)
    ? ok(`the "why so long" panel appears on a ${Math.round(why.lag)}-day lag and names the band in °C`)
    : bad('no explanation of the detection lag');
  why.html.includes('property of the model, not of the machine')
    ? ok(`and attributes it: sigma ${why.sigma.toFixed(2)} against a noise floor of ${why.noise.toFixed(2)} — the band is the model's ignorance`)
    : bad('the lag is not attributed to model error vs measurement noise');
  (why.sev != null && why.sev < 0.45)
    ? ok(`ground truth: the fault was only ${(why.sev*100).toFixed(0)}% of the way to failure when it fired — the convexity point, measured`)
    : bad(`severity at detection reported as ${why.sev} — expected well under half`);

  /* A fault-contaminated INPUT drives the residual negative on a tag the
     fault never touches. Predicting fan current from bearing temperature and
     vibration is the clean demonstration: motI has no fault term at all. */
  const neg = await page.evaluate(() => {
    defaultSpec();
    MB.spec.find(b => b.type === 'target').f.tag = 'motI';
    MB.spec.find(b => b.type === 'inputs').f.tags = ['brgT', 'vib', 'amb'];
    const r = mlpTrain(MB.spec); r.alert = applyAlert(r, MB.spec);
    return { html: verdict(r, r.alert, false), mean: r.alert.faultMean, sigma: r.sigma };
  });
  neg.mean < -2 * neg.sigma
    ? ok(`fan current predicted from bearing temp and vibration runs ${neg.mean.toFixed(1)} A negative after onset — on a tag with no fault term`)
    : bad(`expected a strongly negative residual, got ${neg.mean.toFixed(2)}`);
  neg.html.includes('the expectation rose and the measurement did not follow')
    ? ok('and the sign is explained rather than left to be misread as a drop in current')
    : bad('negative residual is not explained');

  console.log('\nSwitching the machine leaves a model that still runs');
  const sw = await page.evaluate(() => {
    const out = [];
    for (const cs of Object.keys(CASES)){
      defaultSpec();
      MB.spec.find(b => b.type === 'dataset').f.case = cs;
      loadCase(cs); resetTagFields(); afterChange();
      out.push({ cs, errs: validate(MB.spec).length,
                 tgt: MB.spec.find(b => b.type === 'target').f.tag,
                 n: MB.spec.find(b => b.type === 'inputs').f.tags.length });
    }
    return out;
  });
  sw.every(s => s.errs === 0)
    ? ok(`all ${sw.length} machines validate straight after switching: ${sw.map(s => s.cs + '→' + s.tgt).join(', ')}`)
    : bad('switching machine leaves errors: ' + JSON.stringify(sw.filter(s => s.errs)));

  console.log('\nThe Python panel tracks the blocks');
  const py = await page.evaluate(() => {
    MB.spec.find(b => b.type === 'window').f.from = 0;
    MB.spec.find(b => b.type === 'window').f.to = 210;
    MB.spec.find(b => b.type === 'dense').f.n = 11;
    const a = generatePython(MB.spec);
    MB.spec.find(b => b.type === 'dense').f.act = 'relu';
    const b = generatePython(MB.spec);
    return { a, b };
  });
  py.a.includes('df.iloc[0:5040]') ? ok('the training window reaches the generated code (day 210 → iloc[0:5040])')
                                   : bad('the window is not reflected in the Python');
  py.a.includes('Dense(11') ? ok('layer size reaches the generated code') : bad('layer size missing from the Python');
  (!py.a.includes("activation='relu'") && py.b.includes("activation='relu'"))
    ? ok('changing the activation changes the code') : bad('activation not tracked');
  py.a.includes('X_train.mean(0)') ? ok('the scaler is fitted on the training window only, and says why')
                                   : bad('normalisation is not window-limited in the generated code');

  console.log('\nIt refuses to build a model that would lie');
  const leak = await page.evaluate(() => {
    const t = MB.spec.find(b => b.type === 'target').f.tag;
    MB.spec.find(b => b.type === 'inputs').f.tags.push(t);
    const e = validate(MB.spec);
    MB.spec.find(b => b.type === 'inputs').f.tags.pop();
    return e;
  });
  leak.some(e => /both an input and the target/.test(e))
    ? ok('predicting a tag from itself is caught before training, with the reason')
    : bad('target leakage into the inputs is not caught');

  console.log('\nHistorian CSV parsing');
  const csv = await page.evaluate(() => {
    const rows = ['Timestamp;Bearing Temp (degC);Load (MW);Status',
                  '01/03/2026 00:00;61,4;1 234,5;Good'];
    for (let i = 1; i < 300; i++)
      rows.push(`${String(1 + (i % 28)).padStart(2,'0')}/03/2026 ${String(i%24).padStart(2,'0')}:00;` +
                (i % 40 === 0 ? 'I/O Timeout' : (60 + (i % 17) * 0.3).toFixed(1).replace('.', ',')) +
                `;${(1200 + i).toString()};Good`);
    const p = parseHistorianCSV(rows.join('\n'));
    const prof = profileTags(p);
    return { layout:p.layout, sep:p.sep, tags:p.tags.map(t=>t.name),
             rows:p.rows, verdicts: prof.map(x => `${x.name}:${x.verdict}`),
             bad: prof.map(x => x.badCount||0) };
  });
  csv.sep === ';' ? ok('semicolon separator detected') : bad('separator detected as ' + JSON.stringify(csv.sep));
  csv.tags.length === 2 ? ok(`numeric columns kept, text column dropped: ${csv.tags.join(', ')}`)
                        : bad('columns picked up: ' + csv.tags.join(', '));
  csv.bad.some(b => b > 0) ? ok('"I/O Timeout" counted as a status string, not coerced to a number')
                           : bad('status strings were not detected');
  ok('verdicts: ' + csv.verdicts.join(', '));

  await page.evaluate(() => { TAB = 'run'; syncTabs(); MB.result = null; defaultSpec(); });
  await page.waitForTimeout(400);
  await page.click('#btnTrain');
  await page.waitForSelector('#chRes', { timeout: 120000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SHOTS, 'mb-run.png') });

  errs.length ? [...new Set(errs)].slice(0, 4).forEach(bad) : ok('\nno console or page errors throughout');
  await browser.close();
  console.log('\n' + '─'.repeat(62));
  console.log(fails ? `\x1b[31m${fails} failed\x1b[0m` : '\x1b[32mthe builder behaves the way the course says it will\x1b[0m');
  process.exit(fails ? 1 : 0);
})();
