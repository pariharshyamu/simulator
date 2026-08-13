/* =========================================================================
   Model Builder — blocks, data, training, code generation.

   The network is written out longhand rather than pulled from a library.
   Not for purity: the minimum TensorFlow.js build that can train a dense
   net is 832 KB, and this whole artefact is a single file you open by
   double-clicking. Measured on the data it actually runs on — a year of
   hourly readings, ten tags, six hidden units, 200 epochs — the arithmetic
   below takes about a quarter of a second. A megabyte of library to save
   250 ms of a computation nobody is waiting for is a bad trade, and it
   would put the interesting part behind an import somebody has to trust.
   ========================================================================= */
'use strict';

const MB = {
  /* live state */
  spec: [],            // the blocks on the canvas, in order
  data: null,          // {name, rows, tags:[{id,name,unit,v:Float64Array}], hours, source}
  model: null,         // trained network
  result: null,        // residuals, alerts, timings
  csvProfile: null,
  open: null,          // index of the block whose maths is expanded, if any
};

/* ---------------------------------------------------------------- blocks */
const CATS = [
  ['data',  'Data'],
  ['prep',  'Prepare'],
  ['model', 'Network'],
  ['train', 'Training'],
  ['out',   'Output'],
];

const BLOCKS = {
  dataset: { cat:'data', ic:'DB', label:'Machine data',
    desc:'A year of hourly readings from one machine',
    fields:[{k:'case', t:'select', label:'', opts:()=>Object.keys(CASES).map(k=>[k, CASES[k].short])}],
    def:{case:'idfan'}, unique:true },

  csv: { cat:'data', ic:'CSV', label:'My own data',
    desc:'Drop a historian export anywhere on this page',
    fields:[], def:{}, unique:true },

  window: { cat:'data', ic:'[ ]', label:'Training window',
    desc:'Which days the model is allowed to learn from',
    fields:[{k:'from', t:'num', label:'from day', min:0, max:364},
            {k:'to',   t:'num', label:'to day',   min:5, max:365}],
    def:{from:0, to:180}, unique:true },

  inputs: { cat:'data', ic:'IN', label:'Input tags',
    desc:'What the model is allowed to look at',
    fields:[{k:'tags', t:'tags'}], def:{tags:null}, unique:true },

  target: { cat:'data', ic:'Y', label:'Predict this tag',
    desc:'The model learns what this should be, from the others',
    fields:[{k:'tag', t:'select', opts:()=>tagOpts()}], def:{tag:null}, unique:true },

  normalise: { cat:'prep', ic:'~', label:'Normalise',
    desc:'Put every tag on the same scale. Almost always wanted.',
    fields:[], def:{}, unique:true },

  lag: { cat:'prep', ic:'←', label:'Add a lagged copy',
    desc:'Let the model see what each input was doing N hours ago',
    fields:[{k:'h', t:'num', label:'hours', min:1, max:48}], def:{h:6} },

  roll: { cat:'prep', ic:'≈', label:'Rolling mean',
    desc:'Smooth each input over a window — kills minute-to-minute noise',
    fields:[{k:'h', t:'num', label:'hours', min:2, max:72}], def:{h:12} },

  dense: { cat:'model', ic:'▤', label:'Hidden layer',
    desc:'Neurons, each combining everything from the layer above',
    fields:[{k:'n', t:'num', label:'neurons', min:1, max:32},
            {k:'act', t:'select', label:'', opts:()=>[['tanh','tanh'],['relu','ReLU'],['linear','linear']]}],
    def:{n:6, act:'tanh'} },

  train: { cat:'train', ic:'▶', label:'Train',
    desc:'Gradient descent on the training window',
    fields:[{k:'epochs', t:'num', label:'epochs', min:10, max:1200},
            {k:'lr', t:'num', label:'rate', min:0.001, max:0.5, step:0.005}],
    def:{epochs:220, lr:0.03}, unique:true },

  residual: { cat:'out', ic:'−', label:'Residual',
    desc:'Actual minus expected, every hour of the year',
    fields:[], def:{}, unique:true },

  alert: { cat:'out', ic:'!', label:'Alert rule',
    desc:'Raise an advisory when the residual stays out of band',
    fields:[{k:'k', t:'num', label:'× sigma', min:1, max:12, step:0.5},
            {k:'hours', t:'num', label:'for hours', min:1, max:336}],
    def:{k:4, hours:72}, unique:true },
};

/* A model that will actually run. Order is enforced by category, so a
   participant cannot put the training block above the data. */
const CAT_ORDER = {data:0, prep:1, model:2, train:3, out:4};

function validate(spec){
  const has = t => spec.some(b => b.type === t);
  const errs = [];
  if (!has('dataset') && !has('csv')) errs.push('Add a data block — either the built-in machine data or your own CSV.');
  if (!has('target')) errs.push('Add “Predict this tag”, so the model knows what it is learning.');
  if (!has('inputs')) errs.push('Add “Input tags”, so the model knows what it may look at.');
  if (!has('train')) errs.push('Add a “Train” block.');
  const ins = spec.find(b => b.type === 'inputs');
  const tg  = spec.find(b => b.type === 'target');
  if (ins && tg && ins.f.tags && tg.f.tag && ins.f.tags.includes(tg.f.tag))
    errs.push(`“${tagName(tg.f.tag)}” is both an input and the target. The model would just copy it across and score a perfect result that means nothing. Untick it from the inputs.`);
  if (ins && ins.f.tags && ins.f.tags.length === 0)
    errs.push('No input tags are ticked.');
  const w = spec.find(b => b.type === 'window');
  if (w && w.f.to - w.f.from < 5) errs.push('The training window is shorter than five days.');
  return errs;
}

/* ------------------------------------------------------------------ data */
function loadCase(caseId){
  const c = CASES[caseId];
  const ctx = context(4242);
  const fault = faultProfile(c.onset, c.ttf, c.shape);
  const truth = c.gen(ctx, fault, rng(4253), {noise:1});
  const tags = c.sensors.map(s => ({
    id:s.id, name:s.n, unit:s.u, have:!!s.have, v:truth[s.id]
  })).filter(t => t.v);
  MB.data = {
    name: c.name, short: c.short, station: c.station, rows: N, hours: N,
    tags, source:'built-in', caseId, onset: c.onset, alarm: c.alarm,
    /* The ground truth, kept so the verdict can say how far gone the machine
       actually was on the day the advisory fired — the one number a real
       deployment never has and a teaching artefact always should. */
    severity: fault, ttf: c.ttf,
    health: c.health(truth), healthName: c.healthName,
    blurb: c.blurb, mode: c.mode
  };
  return MB.data;
}

function tagOpts(){
  if (!MB.data) return [['','— load data first —']];
  return MB.data.tags.map(t => [t.id, `${t.name} (${t.unit})`]);
}
function tagName(id){
  const t = MB.data && MB.data.tags.find(x => x.id === id);
  return t ? t.name : id;
}

/* --------------------------------------------------------------- feature */
/* Build the design matrix the blocks describe. Returns column names too, so
   the Python panel and the network are guaranteed to describe the same thing. */
function buildMatrix(spec){
  const d = MB.data;
  const ins = spec.find(b => b.type === 'inputs');
  const tgt = spec.find(b => b.type === 'target');
  const wanted = (ins.f.tags || []).filter(id => id !== tgt.f.tag);
  const cols = [], names = [];

  const push = (name, arr) => { names.push(name); cols.push(arr); };
  for (const id of wanted){
    const t = d.tags.find(x => x.id === id); if (!t) continue;
    push(t.name, t.v);
  }
  /* prepare blocks apply to every input column that existed when they ran,
     which is the same left-to-right reading a pandas pipeline has */
  for (const b of spec.filter(b => b.cat === 'prep')){
    if (b.type === 'lag'){
      const base = cols.slice(0, wanted.length), bn = names.slice(0, wanted.length);
      base.forEach((a, i) => {
        const h = Math.round(b.f.h), out = new Float64Array(a.length);
        for (let j = 0; j < a.length; j++) out[j] = a[Math.max(0, j - h)];
        push(bn[i] + ` (${h} h ago)`, out);
      });
    } else if (b.type === 'roll'){
      const base = cols.slice(0, wanted.length), bn = names.slice(0, wanted.length);
      base.forEach((a, i) => {
        const h = Math.round(b.f.h), out = new Float64Array(a.length);
        let s = 0;
        for (let j = 0; j < a.length; j++){
          s += a[j]; if (j >= h) s -= a[j - h];
          out[j] = s / Math.min(j + 1, h);
        }
        push(bn[i] + ` (mean ${h} h)`, out);
      });
    }
  }
  const yTag = d.tags.find(x => x.id === tgt.f.tag);
  return { X: cols, names, y: yTag.v, yName: tagName(tgt.f.tag), yUnit: yTag.unit || '' };
}

/* -------------------------------------------------------------- training */
function mlpTrain(spec, onEpoch){
  const t0 = performance.now();
  const { X, names, y, yName, yUnit } = buildMatrix(spec);
  const w = spec.find(b => b.type === 'window') || {f:{from:0, to:180}};
  const a = Math.max(0, Math.round(w.f.from) * 24);
  const b = Math.min(X[0].length, Math.round(w.f.to) * 24);
  const doNorm = spec.some(s => s.type === 'normalise');
  const layers = spec.filter(s => s.type === 'dense').map(s => ({n:Math.round(s.f.n), act:s.f.act}));
  const tr = spec.find(s => s.type === 'train');
  const epochs = Math.round(tr.f.epochs), lr = +tr.f.lr;

  const NI = X.length, T = X[0].length;
  /* standardise on the TRAINING window only — using the whole year would leak
     the future into the fit, which is the quiet way benchmark numbers become
     fiction */
  const mu = [], sg = [];
  for (let i = 0; i < NI; i++){
    let s = 0, n = 0;
    for (let j = a; j < b; j++){ s += X[i][j]; n++; }
    const m = s / n; let v = 0;
    for (let j = a; j < b; j++) v += (X[i][j] - m) ** 2;
    mu.push(doNorm ? m : 0); sg.push(doNorm ? Math.sqrt(v / n) || 1 : 1);
  }
  let ym = 0, ys = 1;
  { let s = 0, n = 0; for (let j = a; j < b; j++){ s += y[j]; n++; }
    ym = s / n; let v = 0; for (let j = a; j < b; j++) v += (y[j] - ym) ** 2;
    ys = Math.sqrt(v / n) || 1; }

  const xs = j => { const r = new Float64Array(NI);
    for (let i = 0; i < NI; i++) r[i] = (X[i][j] - mu[i]) / sg[i]; return r; };

  /* weights */
  const r = rng(12345);
  const sizes = [NI, ...layers.map(l => l.n), 1];
  const W = [], B = [];
  for (let L = 0; L < sizes.length - 1; L++){
    const sc = Math.sqrt(2 / sizes[L]);
    W.push(Array.from({length:sizes[L]}, () =>
      Array.from({length:sizes[L+1]}, () => (r() * 2 - 1) * sc)));
    B.push(new Float64Array(sizes[L+1]));
  }
  const actOf = L => (L < layers.length ? layers[L].act : 'linear');
  const f  = (v, k) => k === 'tanh' ? Math.tanh(v) : k === 'relu' ? Math.max(0, v) : v;
  const df = (o, k) => k === 'tanh' ? 1 - o * o : k === 'relu' ? (o > 0 ? 1 : 0) : 1;

  const fwd = x => {
    const A = [x];
    for (let L = 0; L < W.length; L++){
      const o = new Float64Array(sizes[L+1]), k = actOf(L);
      for (let j = 0; j < sizes[L+1]; j++){
        let s = B[L][j];
        for (let i = 0; i < sizes[L]; i++) s += A[L][i] * W[L][i][j];
        o[j] = f(s, k);
      }
      A.push(o);
    }
    return A;
  };

  const idx = []; for (let j = a; j < b; j++) idx.push(j);
  const loss = [];
  for (let e = 0; e < epochs; e++){
    /* shuffle, deterministically */
    for (let i = idx.length - 1; i > 0; i--){ const k = Math.floor(r() * (i + 1)); [idx[i], idx[k]] = [idx[k], idx[i]]; }
    let se = 0;
    for (const j of idx){
      const A = fwd(xs(j));
      const pred = A[A.length - 1][0];
      const tgtv = (y[j] - ym) / ys;
      const err = pred - tgtv; se += err * err;
      let delta = new Float64Array([2 * err]);
      for (let L = W.length - 1; L >= 0; L--){
        const nd = new Float64Array(sizes[L]);
        for (let i = 0; i < sizes[L]; i++){
          let s = 0;
          for (let j2 = 0; j2 < sizes[L+1]; j2++) s += delta[j2] * W[L][i][j2];
          nd[i] = s * (L > 0 ? df(A[L][i], actOf(L - 1)) : 1);
        }
        for (let i = 0; i < sizes[L]; i++)
          for (let j2 = 0; j2 < sizes[L+1]; j2++) W[L][i][j2] -= lr * delta[j2] * A[L][i];
        for (let j2 = 0; j2 < sizes[L+1]; j2++) B[L][j2] -= lr * delta[j2];
        delta = nd;
      }
    }
    loss.push(se / idx.length);
    if (onEpoch && (e % 10 === 0 || e === epochs - 1)) onEpoch(e + 1, epochs, loss[loss.length - 1]);
  }

  /* predict the whole year */
  const pred = new Float64Array(T), resid = new Float64Array(T);
  for (let j = 0; j < T; j++){
    const A = fwd(xs(j));
    pred[j] = A[A.length - 1][0] * ys + ym;
    resid[j] = y[j] - pred[j];
  }
  let rs = 0, rn = 0;
  for (let j = a; j < b; j++){ rs += resid[j] * resid[j]; rn++; }
  const sigma = Math.sqrt(rs / rn) || 1e-9;

  /* How much of sigma is irreducible?

     Sigma is what sets the alert band, and the most common question a
     participant asks is why the advisory took so long. The answer is almost
     never "the machine hid it" — it is that the band is wide, and the band is
     wide because the MODEL cannot explain the training window, not because
     the instrument is noisy. Those two are worth separating on screen.

     Successive hours of a residual share whatever the model is getting
     structurally wrong — a seasonal offset is the same at 14:00 and 15:00 —
     but not the measurement noise. So the standard deviation of the
     hour-to-hour difference, divided by root two, estimates the part of
     sigma no model could remove. On the default ID-fan model that is 0.9 °C
     against a sigma of 2.0: more than half the band is the cooler's knee,
     which duty and weather alone cannot see. Add the oil temperature and
     sigma falls to 0.6 against a floor of 0.44, and the advisory arrives 25
     days sooner. It is an upper bound on the true noise — any genuinely
     hour-to-hour driver lands in it too — so it understates the gap rather
     than flattering it. */
  let ds = 0, dn = 0;
  for (let j = a + 1; j < b; j++){ const dd = resid[j] - resid[j-1]; ds += dd * dd; dn++; }
  const noise = dn ? Math.sqrt(ds / dn / 2) : sigma;

  const params = W.reduce((s, m) => s + m.length * m[0].length, 0) +
                 B.reduce((s, v) => s + v.length, 0);

  /* Keep the design matrix and the layer spec so the maths panel can replay a
     single hour through the trained network and print every term of it.
     Nothing here is recomputed for display — the numbers a participant reads
     are the numbers the model used. */
  MB.model = { W, B, sizes, layers, mu, sg, ym, ys, names, yName, yUnit, params, doNorm,
               X, y, a, b, lr, epochs, sigma, loss };
  return { pred, resid, sigma, noise, loss, trainFrom:a, trainTo:b, y, names, yName, yUnit,
           params, ms: performance.now() - t0 };
}

/* -------------------------------------------------------- forward trace
   Replay ONE hour through the trained network and hand back every
   intermediate quantity, so the maths panel can print the actual arithmetic
   rather than a textbook version of it. Same weights, same order, same
   activation as mlpTrain — if these two ever disagree the panel is lying,
   which is worse than not having one. */
function forwardTrace(hour){
  const M = MB.model;
  if (!M) return null;
  const j = Math.max(0, Math.min(M.X[0].length - 1, Math.round(hour)));
  const NI = M.sizes[0];
  const raw = [], xs = [];
  for (let i = 0; i < NI; i++){
    raw.push(M.X[i][j]);
    xs.push((M.X[i][j] - M.mu[i]) / M.sg[i]);
  }
  const actOf = L => (L < M.layers.length ? M.layers[L].act : 'linear');
  const f = (v, k) => k === 'tanh' ? Math.tanh(v) : k === 'relu' ? Math.max(0, v) : v;

  const A = [xs], Z = [];
  for (let L = 0; L < M.W.length; L++){
    const z = [], o = [], k = actOf(L);
    for (let q = 0; q < M.sizes[L+1]; q++){
      let s = M.B[L][q];
      for (let i = 0; i < M.sizes[L]; i++) s += A[L][i] * M.W[L][i][q];
      z.push(s); o.push(f(s, k));
    }
    Z.push(z); A.push(o);
  }
  const yhatStd = A[A.length - 1][0];
  return { hour: j, raw, xs, A, Z, actOf,
           yhatStd, yhat: yhatStd * M.ys + M.ym,
           yStd: (M.y[j] - M.ym) / M.ys, y: M.y[j],
           resid: M.y[j] - (yhatStd * M.ys + M.ym),
           inTraining: j >= M.a && j < M.b };
}

/* the alert rule, applied outside the training window */
function applyAlert(res, spec){
  const al = spec.find(b => b.type === 'alert');
  if (!al) return null;
  const k = +al.f.k, need = Math.round(al.f.hours);
  const thr = k * res.sigma;
  /* Count EPISODES, not re-firings. A control room opens one advisory when
     the residual leaves the band and closes it when it comes back; counting
     every `need` hours instead turned one four-month degradation into
     forty-four alerts and made the nuisance rate meaningless. */
  let run = 0, first = null, count = 0, open = false;
  for (let j = res.trainTo; j < res.resid.length; j++){
    if (Math.abs(res.resid[j]) > thr){
      run++;
      if (run >= need && !open){ open = true; count++; if (first === null) first = j - need + 1; }
    } else { run = 0; open = false; }
  }
  const onset = MB.data.onset;

  /* Whether an advisory fired is only half the story, and on this machine it
     is the less interesting half. A model trained on winter runs several
     degrees wrong all through May, but diurnally — the cooling water crosses
     the cooler's design point in the afternoon and falls back at night — so
     a 72-hour persistence rule filters it out and nothing is raised. The
     model is plainly wrong and the alert rule is quietly covering for it.
     So measure the drift itself, over the months before any fault exists. */
  let dsum = 0, dn = 0, dmax = 0;
  const preEnd = onset != null ? Math.min(res.resid.length, onset * 24) : res.resid.length;
  for (let j = res.trainTo; j < preEnd; j++){
    dsum += res.resid[j]; dn++;
    if (Math.abs(res.resid[j]) > dmax) dmax = Math.abs(res.resid[j]);
  }
  const drift = dn ? dsum / dn : 0;

  /* Which way does the residual break once the fault is running?

     A negative one is the question this artefact gets asked most, and it is
     nearly always misread as "the reading fell". It did not. Residual is
     actual minus expected, so a negative value means the model expected MORE
     than the plant delivered — and if an input is itself moved by the fault,
     the expectation is what moved. Predict fan motor current from bearing
     temperature and vibration and you get exactly that: in the healthy window
     the only thing that raised those two was load, so the model learnt
     "hot and shaking = working hard = drawing current". After onset they rise
     on their own, the fan keeps pulling the same duty, and the residual goes
     30 A negative on a machine whose current never changed. */
  let fsum = 0, fn = 0;
  if (onset != null)
    for (let j = Math.max(res.trainTo, onset * 24); j < res.resid.length; j++){ fsum += res.resid[j]; fn++; }
  const faultMean = fn ? fsum / fn : 0;

  /* True severity on the day the advisory fired, 0..1 of the way to failure. */
  const sev = MB.data.severity;
  const sevAt = (first !== null && sev) ? sev[Math.min(sev.length - 1, Math.round(first))] : null;

  return { thr, k, need, firstDay: first === null ? null : first / 24, count,
           drift, driftMax: dmax, driftSigmas: dn ? Math.abs(drift) / res.sigma : 0,
           preDays: dn / 24, faultMean, sevAt,
           beforeFault: (first !== null && onset != null) ? (onset - first / 24) : null };
}
