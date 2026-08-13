/* =========================================================================
   THE MATHS BEHIND EACH BLOCK, WITH THIS MODEL'S NUMBERS IN IT

   A block-based builder has an obvious failure mode: it teaches people to
   assemble a neural network without ever showing them that a neural network
   is arithmetic. They leave able to operate the tool and no better able to
   judge a vendor's claim, which is the opposite of the point.

   So every block opens into the operation it stands for, written twice — once
   as the formula, once with the actual numbers from the model currently on the
   canvas substituted in. Not a worked example from a textbook: the real
   weights, at a real hour of the real year, printed to the precision the
   network is using. `forwardTrace` in mb_core.js replays that hour through the
   same code path training used, so the two cannot drift apart.

   The hour shown defaults to the day the advisory fired, because that is the
   moment a participant actually wants to interrogate: what did the network
   think the bearing should have been, and by how much was it wrong.
   ========================================================================= */

/* ------------------------------------------------------------- numbers */
const nf = (v, d) => {
  if (!isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a !== 0 && (a < 0.001 || a >= 1e6)) return v.toExponential(2);
  return v.toFixed(d != null ? d : (a >= 100 ? 1 : a >= 10 ? 2 : 3));
};
const sgn = v => (v < 0 ? '−' : '+') + ' ' + nf(Math.abs(v));
const N_ = v => `<span class="num">${nf(v)}</span>`;
/* Counts are counts. "4320.0 rows" and "72.00 consecutive hours" read as
   though the quantity were uncertain, which is exactly the wrong signal in a
   panel whose whole job is to be exact. */
const I_ = v => `<span class="num">${Math.round(v).toLocaleString('en-IN')}</span>`;
const bigOps = n =>
  n >= 1e9 ? (n/1e9).toFixed(1) + ' billion' :
  n >= 1e6 ? (n/1e6).toFixed(0) + ' million' :
  n >= 1e3 ? (n/1e3).toFixed(0) + ' thousand' : String(Math.round(n));
const S_ = s => `<span class="sym">${s}</span>`;
const R_ = v => `<span class="res">${nf(v)}</span>`;
const O_ = s => `<span class="op">${esc(s)}</span>`;
const LN = s => `<div class="ln">${s}</div>`;
const CM = s => `<div class="cm">${s}</div>`;
const H_ = s => `<h4>${esc(s)}</h4>`;

/* Which hour to narrate. The advisory day if there is one, otherwise a
   summer afternoon well outside the training window — the interesting case
   either way, never a row the model was fitted on. */
function traceHour(){
  const r = MB.result;
  if (r && r.alert && r.alert.firstDay != null) return Math.round(r.alert.firstDay * 24);
  if (r) return Math.min(MB.data.hours - 1, r.trainTo + 24 * 30 + 14);
  return 14;
}
function hourLabel(j){
  const d = Math.floor(j / 24), h = j % 24;
  return MB.data && MB.data.source === 'built-in'
    ? `day ${d} (${dayLabel(d)}), ${String(h).padStart(2, '0')}:00`
    : `row ${j.toLocaleString('en-IN')}`;
}

/* ------------------------------------------------- the one-line version
   Shown on the face of every block, whether or not it is open. Short enough
   to sit on a phone without scrolling sideways. */
function blockFormula(type, b){
  const M = MB.model, d = MB.data;
  switch (type){
    case 'dataset':
    case 'csv':      return d ? `rows = ${d.rows.toLocaleString('en-IN')} × ${d.tags.length} tags` : '';
    case 'window':   return `train = rows[${Math.round(b.f.from)*24} : ${Math.round(b.f.to)*24}]`;
    case 'inputs':   return `X ∈ ℝ<sup>n×${(b.f.tags||[]).length}</sup>`;
    case 'target':   return `y = ${esc(tagName(b.f.tag))}`;
    case 'normalise':return `x̃ = (x − μ) / σ`;
    case 'lag':      return `x′[t] = x[t − ${Math.round(b.f.h)}]`;
    case 'roll':     return `x′[t] = (1/${Math.round(b.f.h)}) Σ x[t−k]`;
    case 'dense':    return `a = ${b.f.act === 'linear' ? '' : b.f.act}(W·x + b),  ${Math.round(b.f.n)} neurons`;
    case 'train':    return `w ← w − ${b.f.lr} · ∂L/∂w,  ${Math.round(b.f.epochs)} epochs`;
    case 'residual': return `r = y − ŷ`;
    case 'alert':    return `|r| > ${b.f.k}σ for ${Math.round(b.f.hours)} h`;
  }
  return '';
}

/* --------------------------------------------------- the opened version */
function blockMaths(type, b){
  const M = MB.model, d = MB.data;
  const untrained = `<div class="mth">${CM('Press <b>Train the network</b> and this fills with the real numbers — these are the weights the model ends up with, not an illustration.')}</div>`;
  let body = '';

  switch (type){

  /* ------------------------------------------------------------- data */
  case 'dataset':
  case 'csv': {
    if (!d) return '';
    body = H_('what one row is') +
      LN(`${S_('row')} = ( ${d.tags.map(t => esc(t.id)).join(', ')} )`) +
      LN(`${S_('n')} = ${I_(d.rows)} ${O_('rows, one an hour')}`) +
      CM(d.source === 'built-in'
        ? `${d.rows.toLocaleString('en-IN')} hours is 365 × 24 — a full year, so the model meets every season it will be asked to judge. The fault begins on day ${d.onset} and takes ${d.ttf} days to run its course.`
        : 'Your own export. Nothing was uploaded — the file was read by this tab.');
    break;
  }

  case 'window': {
    const a = Math.round(b.f.from) * 24, e = Math.round(b.f.to) * 24;
    const tot = d ? d.rows : 8760;
    body = H_('which rows the fit may see') +
      LN(`${S_('train')} = rows[ ${I_(a)} : ${I_(e)} ]  ${O_('=')} <span class="res">${(e-a).toLocaleString('en-IN')}</span> ${O_('rows')}`) +
      LN(`${S_('judged')} = rows[ ${I_(e)} : ${I_(tot)} ]  ${O_('=')} <span class="res">${Math.max(0,tot-e).toLocaleString('en-IN')}</span> ${O_('rows')}`) +
      CM(`Every number the model learns — the weights, the scaler, and σ — comes only from the first set. The second set is never fitted on, which is the only reason the residual there means anything.` +
         (d && d.onset != null && b.f.to > d.onset
          ? ` <b>This window ends on day ${Math.round(b.f.to)}, past the fault onset on day ${d.onset}.</b> The degradation is inside the training data, so the model is being taught that it is normal.`
          : ''));
    break;
  }

  case 'inputs': {
    const t = b.f.tags || [];
    body = H_('the design matrix') +
      LN(`${S_('X')} ${O_('=')} [ ${t.map(x => esc(x)).join(' , ')} ]`) +
      LN(`${O_('shape')} ${I_(d ? d.rows : 0)} ${O_('×')} ${I_(t.length)}`) +
      CM('Choosing these matters more than choosing layers. A tag the fault moves is a trap: the model learns to expect the fault and stops reporting it — or worse, expects it on a tag the fault never touches and drives that residual negative.');
    break;
  }

  case 'target': {
    if (!d || !b.f.tag) return '';
    const v = d.tags.find(x => x.id === b.f.tag);
    if (!v) return '';
    let s = 0, n = v.v.length; for (let i = 0; i < n; i++) s += v.v[i];
    const m = s / n; let q = 0; for (let i = 0; i < n; i++) q += (v.v[i] - m) ** 2;
    body = H_('what is being predicted') +
      LN(`${S_('y')} ${O_('=')} ${esc(v.name)} ${O_('(' + (v.unit || '') + ')')}`) +
      LN(`${S_('ȳ')} ${O_('=')} ${N_(m)}   ${S_('s')}<sub>y</sub> ${O_('=')} ${N_(Math.sqrt(q / n))}`) +
      CM('Over the whole year. The scaler the network actually uses is fitted on the training window alone — open the Normalise block to see the difference.');
    break;
  }

  /* ---------------------------------------------------------- prepare */
  case 'normalise': {
    if (!M) return untrained;
    body = H_('the scaler, fitted on the training window only') +
      LN(`${S_('x̃')}<sub>i</sub> ${O_('=')} ( ${S_('x')}<sub>i</sub> ${O_('−')} ${S_('μ')}<sub>i</sub> ) ${O_('/')} ${S_('σ')}<sub>i</sub>`) +
      M.names.map((nm, i) =>
        LN(`${O_(nm.padEnd(0))} : ${S_('μ')}=${N_(M.mu[i])}  ${S_('σ')}=${N_(M.sg[i])}`)).join('') +
      H_('and the target') +
      LN(`${S_('ỹ')} ${O_('=')} ( ${S_('y')} ${O_('−')} ${N_(M.ym)} ) ${O_('/')} ${N_(M.ys)}`) +
      CM('These come from the training rows and nowhere else. Fit the scaler on the whole year and you have leaked the future into the model — the standard way a benchmark number becomes fiction.');
    break;
  }

  case 'lag':
    body = H_('a copy of each input, shifted back') +
      LN(`${S_('x′')}[t] ${O_('=')} ${S_('x')}[ t ${O_('−')} ${N_(Math.round(b.f.h))} ]`) +
      CM('Lets the network see a rate of change without being told about derivatives. Costs one extra column per input, and the first ' + Math.round(b.f.h) + ' rows have nothing to look back at.');
    break;

  case 'roll':
    body = H_('a smoothed copy of each input') +
      LN(`${S_('x′')}[t] ${O_('=')} (1/${N_(Math.round(b.f.h))}) ${O_('Σ')}<sub>k=0..${Math.round(b.f.h)-1}</sub> ${S_('x')}[t−k]`) +
      CM('Suppresses shift-to-shift noise. It also delays the model’s reaction by roughly half the window, which on a slow degradation is a fair trade and on a fast one is not.');
    break;

  /* ------------------------------------------------------------ layer */
  case 'dense': {
    if (!M) return untrained;
    const t = forwardTrace(traceHour());
    if (!t) return untrained;
    /* which dense layer is this one? */
    const denses = MB.spec.filter(x => x.type === 'dense');
    const L = Math.max(0, denses.indexOf(b));
    if (L >= M.W.length - 1) return untrained;
    const nOut = M.sizes[L+1], nIn = M.sizes[L];
    const q = 0;                                  // narrate the first neuron
    const act = M.layers[L] ? M.layers[L].act : 'tanh';
    const names = L === 0 ? M.names : Array.from({length:nIn}, (_, i) => `a${L}_${i+1}`);

    const terms = [];
    for (let i = 0; i < nIn; i++)
      terms.push(LN(`  ${O_(i ? '+' : ' ')} ${N_(M.W[L][i][q])} ${O_('×')} ${N_(t.A[L][i])}` +
                    `   ${O_('← ' + names[i])}`));

    body = H_(`layer ${L+1}: ${nIn} in → ${nOut} out, ${nIn*nOut + nOut} parameters`) +
      LN(`${S_('z')}<sub>j</sub> ${O_('=')} ${O_('Σ')}<sub>i</sub> ${S_('w')}<sub>ij</sub> ${S_('x̃')}<sub>i</sub> ${O_('+')} ${S_('b')}<sub>j</sub>`) +
      LN(`${S_('a')}<sub>j</sub> ${O_('=')} ${act}( ${S_('z')}<sub>j</sub> )`) +
      H_(`neuron 1, evaluated at ${hourLabel(t.hour)}`) +
      terms.join('') +
      LN(`  ${O_('+')} ${N_(M.B[L][q])}   ${O_('← bias')}`) +
      LN(`  ${O_('=')} ${S_('z')}<sub>1</sub> ${O_('=')} ${R_(t.Z[L][q])}`) +
      LN(`  ${S_('a')}<sub>1</sub> ${O_('=')} ${act}(${nf(t.Z[L][q])}) ${O_('=')} ${R_(t.A[L+1][q])}`) +
      CM(act === 'tanh'
        ? 'tanh squashes to (−1, 1). That bend is the whole reason a network can fit the cooler’s knee when a straight line cannot — remove every activation and the network collapses to one linear regression, however many layers you stack.'
        : act === 'relu'
        ? 'ReLU passes positives and zeroes the rest. Cheap, and it makes each neuron a hinge; enough hinges approximate any curve. A neuron whose z is negative for every row is dead and contributes nothing.'
        : 'A linear activation makes this layer redundant — stacked linear maps are one linear map. Useful only as the output layer.');
    break;
  }

  /* --------------------------------------------------------- training */
  case 'train': {
    if (!M || !MB.result) return untrained;
    const r = MB.result;
    const t = forwardTrace(traceHour());
    const err = t.yhatStd - t.yStd;
    body = H_('what is being minimised') +
      LN(`${S_('L')} ${O_('=')} (1/n) ${O_('Σ')} ( ${S_('ŷ̃')} ${O_('−')} ${S_('ỹ')} )²   ${O_('on the standardised target')}`) +
      LN(`${O_('epoch 1')} ${O_(':')} ${S_('L')} ${O_('=')} ${N_(r.loss[0])} ${O_('  →  epoch ' + r.loss.length + ' :')} ${S_('L')} ${O_('=')} ${R_(r.loss[r.loss.length-1])}`) +
      CM(`Predicting the mean scores exactly 1.0, so ${nf(r.loss[r.loss.length-1])} means the network explains ${((1 - r.loss[r.loss.length-1]) * 100).toFixed(0)}% of the variance a mean-predictor leaves.`) +
      H_('backpropagation, one weight') +
      LN(`${S_('δ')}<sub>out</sub> ${O_('=')} 2( ${S_('ŷ̃')} ${O_('−')} ${S_('ỹ')} ) ${O_('=')} 2( ${nf(t.yhatStd)} ${O_('−')} ${nf(t.yStd)} ) ${O_('=')} ${R_(2*err)}`) +
      LN(`${S_('δ')}<sub>j</sub> ${O_('=')} ( ${O_('Σ')}<sub>k</sub> ${S_('δ')}<sub>k</sub> ${S_('w')}<sub>jk</sub> ) ${O_('·')} ${S_('f′')}( ${S_('z')}<sub>j</sub> )   ${O_('tanh′ = 1 − a²')}`) +
      LN(`${O_('∂L/∂')}${S_('w')}<sub>ij</sub> ${O_('=')} ${S_('δ')}<sub>j</sub> ${O_('·')} ${S_('a')}<sub>i</sub>`) +
      LN(`${S_('w')}<sub>ij</sub> ${O_('←')} ${S_('w')}<sub>ij</sub> ${O_('−')} <span class="num">${b.f.lr}</span> ${O_('·')} ${O_('∂L/∂')}${S_('w')}<sub>ij</sub>`) +
      CM(`One row at a time, not a batch — δ<sub>out</sub> above is the gradient for this single hour. Applied to all ${M.params.toLocaleString('en-IN')} parameters, over ${(M.b - M.a).toLocaleString('en-IN')} rows, ${Math.round(b.f.epochs)} times: about ${bigOps(M.params * (M.b - M.a) * Math.round(b.f.epochs))} multiply-adds, which is why this takes about a second and needs no GPU. Raise the learning rate too far and the updates overshoot; the loss curve turns jagged and then climbs.`);
    break;
  }

  /* ----------------------------------------------------------- output */
  case 'residual': {
    if (!M || !MB.result) return untrained;
    const t = forwardTrace(traceHour());
    const u = M.yUnit ? ' ' + M.yUnit : '';
    body = H_(`one hour, all the way through — ${hourLabel(t.hour)}`) +
      LN(`${S_('ŷ̃')} ${O_('=')} ${N_(t.yhatStd)}   ${O_('the network’s output, standardised')}`) +
      LN(`${S_('ŷ')} ${O_('=')} ${N_(t.yhatStd)} ${O_('×')} ${N_(M.ys)} ${O_('+')} ${N_(M.ym)} ${O_('=')} ${R_(t.yhat)}${O_(u)}`) +
      LN(`${S_('y')} ${O_('=')} ${N_(t.y)}${O_(u)}   ${O_('what the sensor read')}`) +
      LN(`${S_('r')} ${O_('=')} ${S_('y')} ${O_('−')} ${S_('ŷ')} ${O_('=')} ${R_(t.resid)}${O_(u)}`) +
      CM(t.resid < 0
        ? 'Negative: the model expected <i>more</i> than the plant delivered. That is not the same as the reading falling — check whether an input is itself being moved by the fault.'
        : 'Un-standardising is what turns an abstract network output back into degrees the control room can act on. The residual is the only line that matters: it is flat when the machine behaves as it always did, whatever the weather is doing.');
    break;
  }

  case 'alert': {
    if (!M || !MB.result || !MB.result.alert) return untrained;
    const r = MB.result, al = r.alert, u = M.yUnit ? ' ' + M.yUnit : '';
    body = H_('the band, and where it comes from') +
      LN(`${S_('σ')} ${O_('=')} √( (1/n) ${O_('Σ')}<sub>train</sub> ${S_('r')}² ) ${O_('=')} ${R_(r.sigma)}${O_(u)}`) +
      LN(`${O_('band')} ${O_('=')} <span class="num">${al.k}</span>${S_('σ')} ${O_('=')} ${R_(al.thr)}${O_(u)}`) +
      LN(`${O_('fire when')} | ${S_('r')} | ${O_('>')} ${N_(al.thr)} ${O_('for')} ${I_(al.need)} ${O_('consecutive hours')}`) +
      CM(`σ is the model’s own error, not the instrument’s — hour to hour this signal only moves by ${nf(r.noise)}${u}. Every bit of the rest is width the model added by failing to explain its training window, and it is paid for in days of warning.`);
    break;
  }

  default: return '';
  }

  return `<div class="mth" role="region" aria-label="the mathematics of this block">${body}</div>`;
}
