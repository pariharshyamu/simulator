/* =========================================================================
   Model Builder — the canvas, the charts and the wiring.
   ========================================================================= */
'use strict';

const C = { ink:'#1C2530', mut:'#6B7A8C', line:'#D3DDE5', grid:'#E9EEF3',
            blue:'#1E74C0', ember:'#D96A16', teal:'#0B8F86', red:'#A8261E', grn:'#256B45' };

/* ------------------------------------------------------------- charting */
function chart(el, o){
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = el.clientWidth || 640, h = o.height || 190;
  el.width = w * dpr; el.height = h * dpr; el.style.height = h + 'px';
  const g = el.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const L = 52, R = 12, T = 12, B = 26;
  const series = o.series.filter(s => s.data && s.data.length);
  if (!series.length) return;
  let lo = o.min, hi = o.max;
  if (lo == null || hi == null){
    lo = Infinity; hi = -Infinity;
    for (const s of series) for (const v of s.data) if (v != null && isFinite(v)){ if (v < lo) lo = v; if (v > hi) hi = v; }
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    const pad = (hi - lo) * 0.12 || 1; lo -= pad; hi += pad;
  }
  const n = Math.max(...series.map(s => s.data.length));
  const px = i => L + i * (w - L - R) / Math.max(1, n - 1);
  const py = v => T + (hi - v) * (h - T - B) / (hi - lo || 1);

  g.strokeStyle = C.grid; g.lineWidth = 1; g.font = '10px Calibri,system-ui'; g.fillStyle = C.mut;
  for (let k = 0; k <= 4; k++){
    const v = lo + (hi - lo) * k / 4, y = py(v);
    g.beginPath(); g.moveTo(L, y); g.lineTo(w - R, y); g.stroke();
    g.textAlign = 'right'; g.fillText(fmtSmall(v), L - 6, y + 3);
  }
  (o.bands || []).forEach(b => {
    g.fillStyle = b.c; g.fillRect(px(b.from), T, px(b.to) - px(b.from), h - T - B);
  });
  (o.rules || []).forEach(r => {
    g.strokeStyle = r.c; g.lineWidth = 1.2; g.setLineDash([5, 4]);
    g.beginPath(); g.moveTo(L, py(r.v)); g.lineTo(w - R, py(r.v)); g.stroke(); g.setLineDash([]);
  });
  (o.marks || []).forEach(m => {
    g.strokeStyle = m.c; g.lineWidth = 1.4; g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(px(m.i), T); g.lineTo(px(m.i), h - B); g.stroke(); g.setLineDash([]);
    g.fillStyle = m.c; g.textAlign = 'left'; g.font = '600 10px Calibri,system-ui';
    g.fillText(m.label, px(m.i) + 4, T + 10);
  });
  for (const s of series){
    g.strokeStyle = s.c; g.lineWidth = s.w || 1.6; g.beginPath();
    let started = false;
    for (let i = 0; i < s.data.length; i++){
      const v = s.data[i]; if (v == null || !isFinite(v)) { started = false; continue; }
      const X = px(i), Y = py(v);
      if (!started){ g.moveTo(X, Y); started = true; } else g.lineTo(X, Y);
    }
    g.stroke();
  }
  g.strokeStyle = C.line; g.beginPath(); g.moveTo(L, h - B); g.lineTo(w - R, h - B); g.stroke();
  g.fillStyle = C.mut; g.font = '10px Calibri,system-ui'; g.textAlign = 'center';
  (o.xTicks || []).forEach(t => g.fillText(t.label, px(t.i), h - B + 14));
}
const fmtSmall = v => Math.abs(v) >= 1000 ? (v/1000).toFixed(1)+'k'
                    : Math.abs(v) >= 10 ? v.toFixed(0)
                    : Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(2);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

/* --------------------------------------------------------------- palette */
function blockHTML(type, b, inCanvas, i){
  const B = BLOCKS[type];
  let f = '';
  if (inCanvas && B.fields.length){
    f = '<div class="flds">' + B.fields.map(fd => {
      if (fd.t === 'tags') return '';
      if (fd.t === 'select'){
        const opts = fd.opts().map(([v, l]) =>
          `<option value="${esc(v)}" ${b.f[fd.k] === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
        return `<span class="fld">${fd.label ? `<label>${fd.label}</label>` : ''}
          <select data-i="${i}" data-k="${fd.k}">${opts}</select></span>`;
      }
      return `<span class="fld"><label>${fd.label}</label>
        <input type="number" data-i="${i}" data-k="${fd.k}" value="${b.f[fd.k]}"
        min="${fd.min ?? 0}" max="${fd.max ?? 9999}" step="${fd.step ?? 1}"></span>`;
    }).join('') + '</div>';
    const tagsField = B.fields.find(fd => fd.t === 'tags');
    if (tagsField && MB.data){
      const sel = b.f.tags || [];
      f += '<div class="tags">' + MB.data.tags.map(t =>
        `<span class="tg ${sel.includes(t.id) ? 'on' : ''} ${t.have === false ? 'miss' : ''}"
          data-i="${i}" data-tag="${t.id}" title="${esc(t.name)}${t.have===false?' — not instrumented on this machine':''}"
          >${esc(t.name.length > 22 ? t.name.slice(0, 21) + '…' : t.name)}</span>`).join('') + '</div>';
    }
  }
  return `<div class="blk ${B.cat}" draggable="true" data-type="${type}" ${inCanvas ? `data-i="${i}"` : ''}>
    ${inCanvas ? '<button class="x" title="remove">×</button>' : ''}
    <div class="t"><span class="ic">${B.ic}</span>${B.label}</div>
    <div class="d">${B.desc}</div>${f}</div>`;
}

function renderPalette(){
  const el = document.getElementById('palette');
  el.innerHTML = CATS.map(([cat, name]) =>
    `<div class="grp">${name}</div>` +
    Object.entries(BLOCKS).filter(([, b]) => b.cat === cat)
      .map(([k]) => blockHTML(k, {f:{}}, false)).join('')
  ).join('');
  el.querySelectorAll('.blk').forEach(n => {
    n.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/new', n.dataset.type); e.dataTransfer.effectAllowed = 'copy';
    });
  });
}

function addBlock(type, at){
  const B = BLOCKS[type];
  if (B.unique && MB.spec.some(b => b.type === type)) return;
  const blk = { type, cat:B.cat, f: JSON.parse(JSON.stringify(B.def)) };
  if (type === 'inputs' && MB.data) blk.f.tags = MB.data.tags.filter(t => t.have !== false).map(t => t.id);
  if (type === 'target' && MB.data) blk.f.tag = MB.data.tags[0].id;
  MB.spec.splice(at == null ? MB.spec.length : at, 0, blk);
  sortSpec(); afterChange();
}
function sortSpec(){
  MB.spec.sort((a, b) => CAT_ORDER[a.cat] - CAT_ORDER[b.cat]);
}

function renderCanvas(){
  const el = document.getElementById('canvas');
  if (!MB.spec.length){
    el.innerHTML = `<div class="drop" id="dz">Drag a block here.<br><br>
      Start with <b>Machine data</b>, then <b>Predict this tag</b>.</div>`;
  } else {
    el.innerHTML = MB.spec.map((b, i) => blockHTML(b.type, b, true, i)).join('') +
      `<div class="drop" id="dz" style="margin-top:4px">drop here to add at the end</div>`;
  }
  /* field edits */
  el.querySelectorAll('input,select').forEach(n => {
    n.addEventListener('change', () => {
      const b = MB.spec[+n.dataset.i]; if (!b) return;
      b.f[n.dataset.k] = n.type === 'number' ? +n.value : n.value;
      if (b.type === 'dataset'){ loadCase(b.f.case); resetTagFields(); }
      afterChange();
    });
  });
  el.querySelectorAll('.tg').forEach(n => n.addEventListener('click', () => {
    const b = MB.spec[+n.dataset.i]; const id = n.dataset.tag;
    b.f.tags = b.f.tags || [];
    const k = b.f.tags.indexOf(id);
    if (k > -1) b.f.tags.splice(k, 1); else b.f.tags.push(id);
    afterChange();
  }));
  el.querySelectorAll('.x').forEach(n => n.addEventListener('click', e => {
    e.stopPropagation();
    MB.spec.splice(+n.parentNode.dataset.i, 1); afterChange();
  }));
  /* reorder within the canvas */
  el.querySelectorAll('.blk').forEach(n => {
    n.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/move', n.dataset.i); n.classList.add('drag');
    });
    n.addEventListener('dragend', () => n.classList.remove('drag'));
  });
  const dz = document.getElementById('dz');
  [el, dz].forEach(z => {
    z.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
    z.addEventListener('dragleave', () => dz.classList.remove('over'));
    z.addEventListener('drop', e => {
      e.preventDefault(); dz.classList.remove('over');
      const nw = e.dataTransfer.getData('text/new');
      const mv = e.dataTransfer.getData('text/move');
      if (nw) addBlock(nw);
      else if (mv !== ''){ const [b] = MB.spec.splice(+mv, 1); MB.spec.push(b); sortSpec(); afterChange(); }
    });
  });
}

/* Switching the machine in the dropdown has to leave a model that still runs.
   It used to tick every available tag as an input and then set the target to
   the first of them — so the target was also an input, validation refused the
   model, and a participant who simply wanted to look at the boiler feed pump
   was met with a red error before they had done anything wrong. Pick the
   target first, then hand the model everything except the target. */
function resetTagFields(){
  const tg = MB.spec.find(b => b.type === 'target');
  const target = MB.data.tags[0].id;
  if (tg) tg.f.tag = target;
  const ins = MB.spec.find(b => b.type === 'inputs');
  if (ins) ins.f.tags = MB.data.tags
    .filter(t => t.have !== false && t.id !== target).map(t => t.id);
}

/* ----------------------------------------------------------------- chips */
function chips(){
  const d = MB.data;
  document.getElementById('chDataset').innerHTML = d
    ? `<b>${esc(d.short)}</b> · ${d.rows.toLocaleString('en-IN')} rows · ${d.tags.length} tags`
    : 'no data';
  const layers = MB.spec.filter(b => b.type === 'dense');
  const ins = MB.spec.find(b => b.type === 'inputs');
  let ni = ins && ins.f.tags ? ins.f.tags.length : 0;
  MB.spec.filter(b => b.cat === 'prep' && b.type !== 'normalise').forEach(() => ni += (ins && ins.f.tags ? ins.f.tags.length : 0));
  const sizes = [ni, ...layers.map(l => Math.round(l.f.n)), 1];
  let p = 0; for (let i = 0; i < sizes.length - 1; i++) p += sizes[i] * sizes[i+1] + sizes[i+1];
  document.getElementById('chParams').innerHTML = `<b>${p.toLocaleString('en-IN')}</b> parameters`;
  const st = document.getElementById('chState');
  st.className = 'chip ' + (MB.result ? 'on' : 'warn');
  st.innerHTML = MB.result ? `trained in <b>${(MB.result.ms/1000).toFixed(2)} s</b>` : 'not trained';
}

/* ------------------------------------------------------------------ panes */
let TAB = 'run';
function afterChange(){ renderCanvas(); chips(); renderPane(); }

function renderPane(){
  ['run','py','data','help'].forEach(t =>
    document.getElementById('pane-' + t).classList.toggle('hide', t !== TAB));
  if (TAB === 'run')  paneRun();
  if (TAB === 'py')   panePy();
  if (TAB === 'data') paneData();
  if (TAB === 'help') paneHelp();
}

function paneRun(){
  const el = document.getElementById('pane-run');
  const errs = validate(MB.spec);
  if (errs.length){
    el.innerHTML = `<div class="card"><h3>Not runnable yet</h3>
      <div class="sub">The blocks describe a model that cannot be trained. Fix these:</div>
      ${errs.map(e => `<div class="note bad" style="margin-top:7px">${esc(e)}</div>`).join('')}</div>`;
    return;
  }
  const r = MB.result;
  el.innerHTML = `
    <div class="card">
      <h3>Train it</h3>
      <div class="sub">Everything runs on this machine. Nothing is uploaded, and there is no server to upload to.</div>
      <button class="btn go" id="btnTrain">▶ Train the network</button>
      <button class="btn alt sm" id="btnReset" style="margin-left:8px">Start over</button>
      <span id="prog" style="margin-left:12px;color:var(--muted);font-size:12.5px"></span>
    </div>
    <div id="results"></div>`;
  document.getElementById('btnTrain').onclick = doTrain;
  document.getElementById('btnReset').onclick = () => { MB.spec = []; MB.result = null; defaultSpec(); };
  if (r) renderResults(r);
}

function doTrain(){
  const p = document.getElementById('prog');
  const btn = document.getElementById('btnTrain'); btn.disabled = true;
  p.textContent = 'training…';
  setTimeout(() => {
    try {
      const res = mlpTrain(MB.spec, (e, tot) => { if (e % 40 === 0) p.textContent = `epoch ${e} of ${tot}`; });
      res.alert = applyAlert(res, MB.spec);
      MB.result = res; p.textContent = '';
      chips(); renderResults(res);
    } catch (err){
      p.innerHTML = `<span style="color:var(--red)">${esc(err.message)}</span>`;
      console.error(err);
    }
    btn.disabled = false;
  }, 30);
}

function renderResults(r){
  const d = MB.data, host = document.getElementById('results');
  const step = Math.max(1, Math.round(r.resid.length / 720));
  const dsz = a => { const o = []; for (let i = 0; i < a.length; i += step) o.push(a[i]); return o; };
  const xt = [];
  if (d.source === 'built-in')
    for (let m = 0; m < 12; m += 2) xt.push({ i: MONTH_START[m] * 24 / step, label: MONTH_NAME[m] });

  const inWin = (r.trainTo - r.trainFrom) / 24;
  const al = r.alert;
  const early = al && al.beforeFault != null && al.beforeFault > 0;

  host.innerHTML = `
  <div class="card">
    <h3>Did it learn?</h3>
    <div class="sub">Training loss, epoch by epoch. It should fall fast and then flatten.
      If it is still falling at the end, add epochs; if it never falls, the inputs cannot explain the target.</div>
    <canvas class="ch" id="chLoss"></canvas>
    <div style="margin-top:10px">
      <span class="stat"><div class="l">Parameters</div><div class="n">${r.params.toLocaleString('en-IN')}</div>
        <div class="s">weights and biases</div></span>
      <span class="stat"><div class="l">Trained in</div><div class="n em">${(r.ms/1000).toFixed(2)} s</div>
        <div class="s">in this browser tab</div></span>
      <span class="stat"><div class="l">Final loss</div><div class="n">${r.loss[r.loss.length-1].toFixed(4)}</div>
        <div class="s">mean squared, standardised</div></span>
      <span class="stat"><div class="l">Residual sigma</div><div class="n">${fmtSmall(r.sigma)}</div>
        <div class="s">${esc(r.yUnit || '')} on the training window</div></span>
      <span class="stat"><div class="l">Of which noise</div><div class="n">${fmtSmall(r.noise)}</div>
        <div class="s">${r.sigma > r.noise * 1.35
          ? `the other ${fmtSmall(Math.sqrt(Math.max(0, r.sigma*r.sigma - r.noise*r.noise)))} is the model`
          : 'the model is at the noise floor'}</div></span>
    </div>
  </div>

  <div class="card">
    <h3>Expected against actual — ${esc(r.yName)}</h3>
    <div class="sub">The shaded band is what the model was allowed to learn from (${inWin.toFixed(0)} days).
      Everywhere else it is predicting.</div>
    <canvas class="ch" id="chFit"></canvas>
  </div>

  <div class="card">
    <h3>The residual</h3>
    <div class="sub">Actual minus expected. This is the only line that matters — a flat one means the machine is
      behaving as it always did, whatever the weather is doing.</div>
    <canvas class="ch" id="chRes"></canvas>
    ${al ? verdict(r, al, early) : `<div class="note info">Add an <b>Alert rule</b> block to turn this line into a decision.</div>`}
  </div>`;

  chart(document.getElementById('chLoss'), { height:150,
    series:[{ data:r.loss, c:C.blue, w:1.8 }],
    xTicks:[{i:0,label:'epoch 1'},{i:r.loss.length-1,label:'epoch '+r.loss.length}] });

  chart(document.getElementById('chFit'), { height:200,
    bands:[{from:r.trainFrom/step, to:r.trainTo/step, c:'rgba(11,143,134,.09)'}],
    series:[{ data:dsz(r.y), c:C.ember, w:1.5 }, { data:dsz(r.pred), c:C.blue, w:1.5 }],
    marks: d.onset != null ? [{ i:d.onset*24/step, label:'fault begins', c:C.red }] : [],
    xTicks:xt });

  chart(document.getElementById('chRes'), { height:170,
    bands:[{from:r.trainFrom/step, to:r.trainTo/step, c:'rgba(11,143,134,.09)'}],
    rules: al ? [{v:al.thr, c:C.red},{v:-al.thr, c:C.red}] : [],
    series:[{ data:dsz(r.resid), c:C.ink, w:1.3 }],
    marks: d.onset != null ? [{ i:d.onset*24/step, label:'fault begins', c:C.red }] : [],
    xTicks:xt });
}

/* A residual that broke the wrong way needs explaining whatever the timing
   verdict was — including when nothing fired at all, which is the commonest
   way to meet it. So the sign note is appended to every path, not just the
   one where an advisory was raised. */
function verdict(r, al, early){
  return verdictTiming(r, al, early) + signNote(r, al);
}

function verdictTiming(r, al, early){
  const d = MB.data;
  const dl = x => d.source === 'built-in' ? ` (${dayLabel(Math.round(x))})` : '';
  if (al.firstDay === null)
    return `<div class="note ${d.onset != null ? 'bad' : 'info'}">
      <b>No advisory was ever raised.</b> The residual never stayed outside ±${al.k}σ for ${al.need} hours.
      ${d.onset != null ? `This machine does develop a fault, on day ${d.onset}${dl(d.onset)} — so the model
      missed it. Either the inputs cannot see this failure mode, or the band is too wide.`
      : 'On your own data that may simply mean nothing went wrong in this period.'}</div>`;
  if (early)
    return `<div class="note bad"><b>The model cried wolf.</b> It raised an advisory on day
      ${Math.round(al.firstDay)}${dl(al.firstDay)} — ${Math.round(al.beforeFault)} days
      <i>before</i> this machine's fault begins on day ${d.onset}${dl(d.onset)}. True severity that day was zero.
      Look at where the training band sits on the chart above: if it covers only part of the year, the model has
      never seen the conditions it is now being asked to judge, and it is reporting the weather as a fault.
      Widen the training window and train again.</div>`;
  /* Even when the timing is right, say whether the model was quietly wrong
     for months first. */
  const drifty = al.driftSigmas > 1.5 && al.preDays > 20;
  const driftNote = drifty ? `<div class="note bad" style="margin-top:9px">
      <b>But look at the residual before the fault.</b> Between the end of the training window and the day the
      fault begins, the model runs an average of ${al.drift > 0 ? '+' : ''}${fmtSmall(al.drift)} out —
      ${al.driftSigmas.toFixed(1)}× its own alert band — with excursions to ${fmtSmall(al.driftMax)}.
      Nothing was raised only because the deviation comes and goes with the day, and the rule wants
      ${al.need} hours in a row. Drop the persistence to 24 hours and you will be paged through May.
      A training window that misses a season leaves a model that is wrong long before it is useful.</div>` : '';
  const lag = d.onset != null ? al.firstDay - d.onset : null;
  return driftNote + `<div class="note ${drifty ? 'warn' : 'good'}"><b>Advisory raised on day ${Math.round(al.firstDay)}${dl(al.firstDay)}.</b>
    ${d.onset != null ? `The fault began on day ${d.onset}${dl(d.onset)}, so the model took
    ${Math.round(lag)} days to be sure of it.` : ''}
    ${al.count === 1 ? 'One advisory' : al.count + ' separate advisories'} over the year at ±${al.k}σ
    sustained for ${al.need} hours.
    ${al.count > 6 ? ' That is a lot — in a real control room this many would be ignored within a month. Raise the sigma or the persistence.' : ''}</div>`
    + whyThatLong(r, al, lag);
}

/* --------------------------------------------------- why it took that long
   The most-asked question about this artefact, answered with its own numbers
   rather than left for the presenter. Three things set the lag and only one
   of them is the machine: how wide the band is, how much of the band is the
   model's own ignorance, and how flat the start of a degradation curve is. */
function whyThatLong(r, al, lag){
  if (lag == null || lag < 25) return '';
  const d = MB.data, u = r.yUnit ? ' ' + r.yUnit : '';
  const struct = Math.sqrt(Math.max(0, r.sigma*r.sigma - r.noise*r.noise));
  const modelShare = r.sigma > 0 ? struct / r.sigma : 0;
  const sev = al.sevAt;

  /* Where the fault had got to when it was finally caught, and what fraction
     of the eventual signal that was — the P–F curve, measured not asserted. */
  const lifePct = d.ttf ? Math.round(100 * lag / d.ttf) : null;
  const sevBit = sev != null ? ` And a degradation curve is convex, so days are a poor measure of how late
    this is: ${lifePct != null ? `${Math.round(lag)} days is ${lifePct}% of the ${d.ttf} days this failure mode
    takes to run its course, but the fault had only reached <b>${(sev*100).toFixed(0)}% of its final
    severity</b>` : `the fault had reached ${(sev*100).toFixed(0)}% of its final severity`}. The first third of
    a fault produces almost none of the signal — which is why these are never caught by watching a trend, and
    why ${Math.round(lag)} days of warning is still ${d.ttf ? d.ttf - Math.round(lag) : 'many'} days before
    the machine would have failed.` : '';

  return `<div class="note info" style="margin-top:9px">
    <b>Why ${Math.round(lag)} days?</b> Not because the fault was hiding. The rule fires when the residual
    leaves ±${al.k}σ, and here that band is <b>±${fmtSmall(al.thr)}${u}</b> — so the fault had to grow that
    far before anything could be said, and then hold it for ${al.need} hours.
    ${modelShare > 0.45
      ? `Most of that width is not measurement. Hour to hour this signal only moves by ${fmtSmall(r.noise)}${u};
         the remaining ${fmtSmall(struct)}${u} is the model failing to explain its own training window.
         <b>The alarm band is a property of the model, not of the machine</b> — narrow the model's error and the
         band closes with it. Tick the lube oil cooler outlet into the inputs and watch both numbers fall.`
      : `The model is already close to the noise floor of ${fmtSmall(r.noise)}${u}, so this band is about as
         tight as this signal honestly allows. To detect sooner you need a different signal, not a better fit —
         vibration and the oil temperature move before the metal temperature does.`}
    ${sevBit}</div>`;
}

/* ------------------------------------------------- which way it broke, and why
   A negative residual is read as "the reading dropped" almost every time, and
   almost every time that is wrong. Say so on screen, with the number. */
function signNote(r, al){
  const u = r.yUnit ? ' ' + r.yUnit : '';
  if (al.faultMean >= 0 || Math.abs(al.faultMean) < r.sigma) return '';
  const ins = MB.spec.find(b => b.type === 'inputs');
  const tags = ins ? ins.f.tags.map(tagName) : [];
  return `<div class="note warn" style="margin-top:9px">
    <b>Note the sign: the residual went ${fmtSmall(al.faultMean)}${u} — negative.</b>
    That does not mean ${esc(r.yName.toLowerCase())} fell. Residual is actual minus expected, so a negative
    residual means <b>the expectation rose and the measurement did not follow</b>.
    ${tags.length ? `At least one of your inputs (${esc(tags.join(', '))}) is itself moved by this fault.` : ''}
    During the healthy window the only thing that moved those inputs was duty, so the model learnt that when
    they rise the machine is working harder and the target should rise with them. After onset they rise from
    the fault instead, the duty is unchanged, and the model's expectation runs away from a measurement that
    never moved. It is the mirror image of target leakage: a fault-contaminated <i>input</i> rather than a
    leaked target, and it will point the investigation at the wrong component. Predict the tag the fault
    actually lives in, from tags the fault cannot touch.</div>`;
}

function panePy(){
  document.getElementById('pane-py').innerHTML = `
    <div class="card">
      <h3>The same model, in Python</h3>
      <div class="sub">This is not a translation of a toy. It is what your vendor's data scientist would write,
        and every number in it came from a field on one of your blocks. Take it to the next supplier meeting.</div>
      <button class="btn alt sm" id="btnCopy">Copy</button>
      <span id="copied" style="margin-left:9px;color:var(--grn);font-size:12px"></span>
    </div>
    <pre class="py">${PY.hl(generatePython(MB.spec))}</pre>`;
  document.getElementById('btnCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(generatePython(MB.spec));
          document.getElementById('copied').textContent = 'copied'; }
    catch (e) { document.getElementById('copied').textContent = 'select the text and copy it'; }
  };
}

function paneData(){
  const d = MB.data, el = document.getElementById('pane-data');
  if (!d){ el.innerHTML = '<div class="card"><h3>No data yet</h3></div>'; return; }
  const prof = d.profile;
  el.innerHTML = `
  <div class="card">
    <h3>${esc(d.name)}</h3>
    <div class="sub">${esc(d.blurb || '')}</div>
    ${d.mode ? `<div class="note info"><b>Failure mode.</b> ${esc(d.mode)}</div>` : ''}
    ${d.source === 'built-in' ? `<div class="note warn" style="margin-top:8px">
      <b>This is synthetic data</b>, generated from a physical model of the machine with a fault injected on a
      known day. It is synthetic on purpose: a teaching dataset needs a fault whose true onset you can check the
      model against. The plant economics, tag names and limits around it are drawn from real practice.</div>` : ''}
  </div>
  <div class="card">
    <h3>Tag profile</h3>
    <div class="sub">${d.source === 'csv'
      ? 'Every column, before you model anything. This screen is usually worth more than the model.'
      : 'What the historian would give you for this machine.'}</div>
    <table class="t"><thead><tr><th>Tag</th><th>Unit</th><th class="num">Min</th><th class="num">Max</th>
      <th class="num">Mean</th><th class="num">Std dev</th>${prof ? '<th>Verdict</th>' : '<th>Instrumented</th>'}</tr></thead><tbody>
    ${(prof || d.tags.map(t => {
        let lo = Infinity, hi = -Infinity, s = 0, n = 0;
        for (const v of t.v){ if (!isFinite(v)) continue; if (v<lo) lo=v; if (v>hi) hi=v; s+=v; n++; }
        const m = s/n; let vv = 0; for (const v of t.v) if (isFinite(v)) vv += (v-m)**2;
        return {...t, lo, hi, mean:m, sd:Math.sqrt(vv/n)};
      })).map(p => `<tr>
      <td>${esc(p.name)}</td><td>${esc(p.unit || '')}</td>
      <td class="num">${fmtSmall(p.lo)}</td><td class="num">${fmtSmall(p.hi)}</td>
      <td class="num">${fmtSmall(p.mean)}</td><td class="num">${fmtSmall(p.sd)}</td>
      <td>${prof
        ? `<span style="color:${p.verdict==='usable'?'var(--grn)':p.verdict==='suspect'?'var(--amb)':'var(--red)'}">
             ${p.verdict}</span>${p.why ? ` <span style="color:var(--muted)">— ${esc(p.why)}</span>` : ''}`
        : (p.have === false ? '<span style="color:var(--red)">not instrumented</span>' : 'yes')}</td>
    </tr>`).join('')}
    </tbody></table>
  </div>
  <div class="card">
    <h3>Use your own data</h3>
    <div class="sub">Drop a CSV anywhere on this page. It is read in this tab and never sent anywhere.</div>
    <div class="note info">Wide exports (a timestamp column and one column per tag) and long exports
      (timestamp, tag, value) both work. Decimal commas, thousands separators, dd/mm/yyyy and mm/dd/yyyy are
      handled, and the words <i>Bad</i>, <i>Shutdown</i>, <i>I/O Timeout</i>, <i>Pt Created</i> and
      <i>Over Range</i> are read as missing rather than as numbers.</div>
    ${d.source === 'csv' ? '' : `<div class="note warn" style="margin-top:8px">
      <b>Expect the profile above to be the finding.</b> On real exports the commonest outcome is that a tag is
      frozen for days, or the stored interval is not the interval you asked for. That is not a failure of the
      exercise — it is the reason section 2.7 of the handout exists.</div>`}
  </div>`;
}

function paneHelp(){
  document.getElementById('pane-help').innerHTML = `
  <div class="card">
    <h3>What this actually builds</h3>
    <div class="sub">Three paragraphs, then go and drag something.</div>
    <p>Every block you drop becomes a line of Python you can read on the next tab. There is no hidden cleverness:
    the network is a few hundred multiply-and-adds, written out longhand in this file, and it trains in about a
    second on a year of hourly readings. Machine learning at this scale is arithmetic, not magic, and the point
    of this screen is that you can see all of it.</p>
    <p>The model is not learning to predict a failure. It is learning what one tag <i>should</i> read, given
    every other tag, when the machine is well. Then it subtracts. What is left over — the residual — is the only
    part that carries information about the machine, because load and weather have been taken out of it.</p>
    <p>So the two decisions that matter are not the number of neurons. They are <b>which tags the model may
    look at</b> and <b>which days it may learn from</b>. Change the layer sizes and the answer barely moves.
    Change the training window from a year to a month and the model will report every hot afternoon as a fault.
    Try it.</p>
  </div>
  <div class="card">
    <h3>Three things to try</h3>
    <table class="t"><tbody>
      <tr><td><b>Shrink the training window</b></td><td>Set it to day 0–45 and train again. The advisory will
        arrive months before the fault. The model has only seen January, and June looks abnormal to it.</td></tr>
      <tr><td><b>Include the fault in training</b></td><td>Set the window to end past the fault onset. The
        residual goes flat and the model never flags anything: it has been taught that a degrading machine is
        normal. Nothing in the loss curve reveals this.</td></tr>
      <tr><td><b>Remove the ambient tag</b></td><td>Untick it from the inputs. The model loses its only way to
        explain summer, and starts blaming the machine for the season.</td></tr>
      <tr><td><b>Add the lube oil cooler outlet</b></td><td>Tick it as an input and retrain on a
        <i>winter-only</i> window. The false alarms vanish. That tag sits downstream of the cooler, so it already
        contains the non-linearity the model was failing to learn from ambient alone — you handed the model the
        answer instead of making it infer one. This is why the choice of inputs decides more than the choice of
        layers, and why an engineer who knows the plant beats a data scientist who does not.</td></tr>
    </tbody></table>
  </div>`;
}

/* ------------------------------------------------------------------- CSV */
function wireDrop(){
  const hint = document.getElementById('drophint');
  let depth = 0;
  window.addEventListener('dragenter', e => {
    if (![...(e.dataTransfer.types||[])].includes('Files')) return;
    depth++; hint.classList.add('on');
  });
  window.addEventListener('dragleave', () => { if (--depth <= 0) hint.classList.remove('on'); });
  window.addEventListener('dragover', e => { if ([...(e.dataTransfer.types||[])].includes('Files')) e.preventDefault(); });
  window.addEventListener('drop', e => {
    if (!e.dataTransfer.files || !e.dataTransfer.files.length) return;
    e.preventDefault(); depth = 0; hint.classList.remove('on');
    const f = e.dataTransfer.files[0];
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const parsed = parseHistorianCSV(String(rd.result));
        const prof = profileTags(parsed);
        adoptCSV(parsed, prof, f.name);
        const i = MB.spec.findIndex(b => b.type === 'dataset');
        if (i > -1) MB.spec.splice(i, 1);
        if (!MB.spec.some(b => b.type === 'csv')) MB.spec.unshift({type:'csv', cat:'data', f:{}});
        resetTagFields(); MB.result = null; sortSpec();
        TAB = 'data'; syncTabs(); afterChange();
      } catch (err){
        alert('That file could not be read as a historian export.\n\n' + err.message);
      }
    };
    rd.readAsText(f);
  });
}

/* ------------------------------------------------------------------ boot */
function defaultSpec(){
  MB.spec = [];
  loadCase('idfan');
  ['dataset','window','inputs','target','normalise','dense','train','residual','alert']
    .forEach(t => addBlock(t));
  const tg = MB.spec.find(b => b.type === 'target');
  if (tg) tg.f.tag = 'brgT';
  /* The default is the honest residual model: predict bearing temperature
     from DUTY and WEATHER only — fan current, gas flow, ambient.

     Deliberately NOT the lube oil cooler outlet, even though it is available
     and it helps. That tag already contains the cooler's non-linearity, so a
     model given it never has to learn that the cooler has a knee, and a
     winter-only training window then works perfectly. Which is a real and
     useful thing to discover — it is the third row of "three things to try"
     — but it makes the wrong thing the default. Choosing inputs matters more
     than choosing layers, and the default should be the one that shows it.

     Also not the NDE bearing: it tracks the DE bearing almost exactly, so the
     model would copy it across and look excellent while learning nothing. */
  const ins = MB.spec.find(b => b.type === 'inputs');
  if (ins) ins.f.tags = ['motI', 'gasF', 'amb'].filter(id => MB.data.tags.some(t => t.id === id));
  if (ins && !ins.f.tags.length)
    ins.f.tags = MB.data.tags.filter(t => t.have !== false && t.id !== 'brgT').map(t => t.id);
  afterChange();
}
function syncTabs(){
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.t === TAB));
}
function boot(){
  renderPalette();
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    TAB = t.dataset.t; syncTabs(); renderPane();
  }));
  wireDrop();
  defaultSpec();
  window.addEventListener('resize', () => { if (MB.result && TAB === 'run') renderResults(MB.result); });
}
boot();
