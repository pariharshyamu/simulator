/* =========================================================================
   MAHAGENCO — Local RAG Bench
   Real ONNX embedding model + real retrieval + optional local language model.
   Everything runs in this browser. Nothing is sent anywhere.
   ========================================================================= */
import { pipeline, env, AutoTokenizer, AutoModelForCausalLM, TextStreamer }
  from './vendor/transformers.min.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const f1 = x => (Math.round(x*10)/10).toFixed(1);
const f2 = x => (Math.round(x*100)/100).toFixed(2);
const f0 = x => Math.round(x).toLocaleString('en-IN');

/* ---------------- transformers.js environment: strictly local ------------- */
/* Absolute URLs: ONNX Runtime resolves wasmPaths relative to the *script* that
   loaded it, not to the document, so a relative path lands in vendor/vendor/. */
const BASE = new URL('.', location.href).href;
env.allowLocalModels  = true;
env.allowRemoteModels = false;                 // flipped only if the user opts in
env.localModelPath    = 'models/';   // relative: resolved against the document
env.backends.onnx.wasm.wasmPaths = BASE + 'vendor/ort/';
try {
  env.backends.onnx.wasm.numThreads =
    Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
} catch (e) {}

/* A transformers.js pipeline dispatches on `this`, so it must be held in a
   plain module variable — putting it on an object rebinds `this` and breaks it. */
let EXTRACTOR = null;

/* ---------------- state --------------------------------------------------- */
const S = {
  chunks: [], meta: null, V: null, dim: 0, n: 0,
  bm25: null, evalSet: [],
  device: 'wasm', adapter: '',
  llm: null, llmTok: null, llmId: null, llmBusy: false,
  mode: 'hybrid', k: 6, perSec: 2, srcOff: new Set(['Course material']), lastHits: [], lastQ: '', lastQVec: null,
  timing: {}, pca: null
};

const LLMS = [
  { id:'onnx-community/Qwen2.5-0.5B-Instruct',      dtype:'q4f16', mb:490,
    label:'Qwen2.5 0.5B Instruct — smallest, fastest', think:false },
  { id:'onnx-community/Qwen3-0.6B-ONNX',            dtype:'q4f16', mb:570,
    label:'Qwen3 0.6B — newer, better instruction following', think:true },
  { id:'onnx-community/Llama-3.2-1B-Instruct-q4f16', dtype:'q4f16', mb:1240,
    label:'Llama 3.2 1B Instruct — best answers, biggest download', think:false }
];

const SUGGESTED = [
  { q:'ID fan A drive-end bearing is running warm at Koradi 8 — what did we find last time and what should I check first?', pre:'ops' },
  { q:'What is the tightening torque for the ID fan bearing housing bolts, and what shell crush should I set?', pre:'ops' },
  { q:'0-FN-201-TE-03', pre:'ops' },
  { q:'Is it safe to open a bearing housing while the adjacent fan is running?', pre:'ops' },
  { q:'Why is Koradi 8-10 heat rate so far above norm in June 2026?', pre:'all' },
  { q:'Nashik aux power is 12.96% against a norm of 10.75% — is the boiler at fault?', pre:'all' },
  { q:'What did the course say about poisoning a model with a rolling retrain window?', pre:'all' },
  { q:'How do we stop an AI project from dying in the first six months?', pre:'all' }
];

/* ---------------- boot ---------------------------------------------------- */
const boot = (msg, pct) => { $('bootMsg').textContent = msg;
  if (pct !== undefined) $('bootBar').style.width = Math.round(pct*100) + '%'; };

async function detectDevice(){
  if (!navigator.gpu) return { device:'wasm', adapter:'WebGPU not available' };
  try {
    const a = await navigator.gpu.requestAdapter();
    if (!a) return { device:'wasm', adapter:'no WebGPU adapter' };
    let name = 'WebGPU';
    try { const info = a.info || (a.requestAdapterInfo ? await a.requestAdapterInfo() : null);
      if (info) name = [info.vendor, info.architecture || info.description].filter(Boolean).join(' ') || 'WebGPU'; }
    catch(e){}
    return { device:'webgpu', adapter:name };
  } catch(e){ return { device:'wasm', adapter:'WebGPU error' }; }
}

async function start(){
  try {
    boot('Checking the graphics adapter…', 0.04);
    const d = await detectDevice();
    S.device = d.device; S.adapter = d.adapter;
    $('devChip').textContent = d.device === 'webgpu' ? 'WebGPU' : 'CPU (WASM)';
    $('devChipBox').className = 'chip ' + (d.device === 'webgpu' ? 'ok' : 'warn');
    $('devChipBox').title = d.adapter;

    boot('Loading the corpus…', 0.12);
    const [chunks, meta, vi8, sc, ev] = await Promise.all([
      fetch('./data/chunks.json').then(r=>r.json()),
      fetch('./data/index.json').then(r=>r.json()),
      fetch('./data/vectors.i8').then(r=>r.arrayBuffer()),
      fetch('./data/scales.f32').then(r=>r.arrayBuffer()),
      fetch('./data/eval.json').then(r=>r.json()).catch(()=>[])
    ]);
    S.chunks = chunks; S.meta = meta; S.evalSet = ev;
    S.dim = meta.dim; S.n = meta.n;

    boot('Unpacking ' + f0(meta.n) + ' vectors…', 0.24);
    const q = new Int8Array(vi8), scales = new Float32Array(sc);
    const V = new Float32Array(S.n * S.dim);
    for (let i = 0; i < S.n; i++) {
      const s = scales[i]; let nn = 0;
      for (let j = 0; j < S.dim; j++) { const v = q[i*S.dim+j]*s; V[i*S.dim+j] = v; nn += v*v; }
      nn = Math.sqrt(nn) || 1;
      for (let j = 0; j < S.dim; j++) V[i*S.dim+j] /= nn;
    }
    S.V = V;

    boot('Building the keyword index…', 0.34);
    S.bm25 = buildBM25(S.chunks);

    boot('Loading the embedding model (' + meta.model + ')…', 0.42);
    EXTRACTOR = await loadEmbedder(d.device);

    boot('Warming up…', 0.9);
    const t = performance.now();
    await embed('warm up the shaders');
    S.timing.warm = performance.now() - t;

    $('embChip').textContent = meta.model.split('/')[1] + ' · ' + S.dim + 'd';
    $('embChipBox').className = 'chip ok';
    $('embChipBox').title = meta.model + ' (' + meta.dtype + ') on ' + S.device;

    buildUI();
    boot('Ready', 1);
    $('boot').style.display = 'none';
  } catch (e) {
    console.error(e);
    $('bootMsg').textContent = 'Could not start.';
    $('bootErr').textContent = (e && e.stack ? e.stack : String(e)) +
      '\n\nTwo things usually cause this:\n' +
      '  1. The page was opened straight from the file system. It must be served over http —\n' +
      '     run start-windows.bat (Windows) or start-mac-linux.sh in this folder.\n' +
      '  2. The embedding model has not been downloaded yet. Run:  python get-models.py embedder\n' +
      '     (34 MB, once, needs internet — after that the bench works with the network off).';
  }
}

async function loadEmbedder(device){
  const opts = { dtype: S.meta.dtype || 'q8', device,
    progress_callback: p => { if (p.status === 'progress' && p.total)
      boot('Loading the embedding model… ' + (p.file||'').split('/').pop(), 0.42 + 0.45*(p.loaded/p.total)); } };
  try {
    return await pipeline('feature-extraction', S.meta.model, opts);
  } catch (e) {
    if (device === 'webgpu') {
      console.warn('WebGPU embedder failed, falling back to CPU:', e);
      S.device = 'wasm';
      $('devChip').textContent = 'CPU (WASM)';
      $('devChipBox').className = 'chip warn';
      $('devChipBox').title = 'WebGPU load failed — using CPU. ' + (e.message||'');
      return await pipeline('feature-extraction', S.meta.model, { ...opts, device:'wasm' });
    }
    throw e;
  }
}

async function embed(text){
  const out = await EXTRACTOR(
    (S.meta.queryPrefix || '') + text, { pooling:'mean', normalize:true });
  return out.data instanceof Float32Array ? out.data : Float32Array.from(out.data);
}

/* ---------------- BM25 ---------------------------------------------------- */
const STOP = new Set(('the a an and or of to in for on at is are was were be been it its this that with '+
  'as by from not no but if then than we you they he she our your their i do does did have has had '+
  'will would can could should may might must about into over under').split(' '));
function tokenize(s){
  const raw = String(s).toLowerCase().replace(/[₂]/g,'2')
    .split(/[^a-z0-9\-]+/).filter(Boolean);
  const out = [];
  for (const t0 of raw) {
    const t = t0.replace(/^-+|-+$/g,'');
    if (!t || STOP.has(t)) continue;
    out.push(t);
    if (t.includes('-')) for (const p of t.split('-')) if (p.length > 1 && !STOP.has(p)) out.push(p);
  }
  return out;
}
function buildBM25(chunks){
  const df = new Map(), docs = [], k1 = 1.2, b = 0.75;
  chunks.forEach(c => {
    const toks = tokenize([c.title, c.crumb, c.text].filter(Boolean).join(' '));
    const tf = new Map();
    toks.forEach(t => tf.set(t, (tf.get(t)||0)+1));
    tf.forEach((_, t) => df.set(t, (df.get(t)||0)+1));
    docs.push({ tf, len: toks.length });
  });
  const avg = docs.reduce((s,d)=>s+d.len,0) / docs.length;
  const N = docs.length;
  return {
    score(qs){
      const qt = tokenize(qs), out = new Float32Array(N);
      const seen = new Set();
      for (const t of qt) {
        if (seen.has(t)) continue; seen.add(t);
        const n = df.get(t); if (!n) continue;
        const idf = Math.log(1 + (N - n + 0.5)/(n + 0.5));
        for (let i = 0; i < N; i++) {
          const f = docs[i].tf.get(t); if (!f) continue;
          out[i] += idf * (f*(k1+1)) / (f + k1*(1 - b + b*docs[i].len/avg));
        }
      }
      return out;
    },
    terms: qs => Array.from(new Set(tokenize(qs))).filter(t => df.has(t) && t.length > 2)
  };
}

/* ---------------- search -------------------------------------------------- */
function denseScores(qv){
  const out = new Float32Array(S.n), V = S.V, D = S.dim;
  for (let i = 0; i < S.n; i++) {
    let d = 0, o = i*D;
    for (let j = 0; j < D; j++) d += V[o+j]*qv[j];
    out[i] = d;
  }
  return out;
}
const rankOf = arr => {
  const idx = Array.from(arr.keys()).sort((a,b)=>arr[b]-arr[a]);
  const r = new Int32Array(arr.length);
  idx.forEach((id, pos) => r[id] = pos);
  return r;
};

async function search(qs){
  const t0 = performance.now();
  const qv = await embed(qs);
  const tEmb = performance.now() - t0;
  const t1 = performance.now();
  const dn = denseScores(qv);
  const kw = S.bm25.score(qs);
  const rd = rankOf(dn), rk = rankOf(kw);
  const RRF = 60;
  const hy = new Float32Array(S.n);
  for (let i = 0; i < S.n; i++) hy[i] = 1/(RRF + rd[i]) + (kw[i] > 0 ? 1/(RRF + rk[i]) : 0);
  const tSrch = performance.now() - t1;
  S.timing = { ...S.timing, emb: tEmb, srch: tSrch };
  S.lastQ = qs; S.lastQVec = qv;
  return { dn, kw, hy, rd, rk };
}
function topK(scores, k){
  return Array.from(scores.keys()).sort((a,b)=>scores[b]-scores[a]).slice(0,k)
    .filter(i => scores[i] > 0 || true);
}
/* Rank, then apply two things every production retriever applies and every demo
   forgets: a source filter, and a cap on how many chunks may come from the same
   section — otherwise one verbose section fills the whole context window. */
function pickHits(sc, k){
  const s = S.mode === 'dense' ? sc.dn : S.mode === 'kw' ? sc.kw : sc.hy;
  const order = Array.from(s.keys()).sort((a,b)=>s[b]-s[a]);
  const out = [], perSec = {};
  for (const i of order) {
    const c = S.chunks[i];
    if (S.srcOff.has(c.src)) continue;
    const key = c.src + '||' + String(c.crumb || '').split(' · ')[0];  // chapter, not sub-heading
    if ((perSec[key] || 0) >= S.perSec) continue;
    perSec[key] = (perSec[key] || 0) + 1;
    out.push({ i, c, dense: sc.dn[i], kw: sc.kw[i], hy: sc.hy[i], rd: sc.rd[i]+1, rk: sc.rk[i]+1 });
    if (out.length >= k) break;
  }
  return out;
}

/* ---------------- rendering ----------------------------------------------- */
function hitTitle(c){ return c.title || (c.crumb || c.src); }
function hitSub(c){ return c.title ? (c.src + ' · ' + c.crumb) : c.src; }
function hl(text, terms){
  let out = esc(text);
  if (!terms.length) return out;
  const re = new RegExp('(' + terms.map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|') + ')', 'gi');
  return out.replace(re, '<mark>$1</mark>');
}
function renderHits(hits, terms){
  $('ctxTag').textContent = hits.length + ' chunks · ' + S.mode;
  $('hits').innerHTML = hits.map((h, n) => `
    <div class="hit" id="hit${n}">
      <div class="hh" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
        <span class="n">${n+1}</span>
        <span class="ti">${esc(hitTitle(h.c))}<span>${esc(hitSub(h.c))}</span></span>
        <span class="sc">${f2(h.dense)}<br><span style="color:#9AA8B5;font-size:10px">cos</span></span>
      </div>
      <div class="hb">${hl(h.c.text.slice(0, 1400), terms)}</div>
    </div>`).join('');
}

/* best sentences from the top chunks — the answer when no LLM is loaded */
/* Pick the best two-sentence window from each of the top chunks. Windows rather
   than single sentences, because a lone clause ("Duplex Pt100, drive-end bearing")
   is a true quotation and a useless answer. */
function extractive(hits, qs){
  const qt = new Set(tokenize(qs));
  const picks = [];
  hits.slice(0, 4).forEach((h, n) => {
    const sents = h.c.text.split(/(?<=[.!?])\s+|\n+/)
      .map(x => x.trim()).filter(x => x.length > 18 && !/^\|/.test(x));
    if (!sents.length) return;
    let best = '', bs = -1;
    for (let i = 0; i < sents.length; i++) {
      for (let w = 1; w <= 2 && i + w <= sents.length; w++) {
        const txt = sents.slice(i, i+w).join(' ');
        if (txt.length < 55 && i + w < sents.length) continue;
        if (txt.length > 420) continue;
        const st = tokenize(txt);
        let ov = 0; st.forEach(t => { if (qt.has(t)) ov++; });
        if (!ov) continue;
        const sc = ov * (1 + 0.12*Math.min(ov, 5)) / Math.pow(st.length + 8, 0.42);
        if (sc > bs) { bs = sc; best = txt; }
      }
    }
    if (!best) best = sents.slice(0, 2).join(' ');
    picks.push({ n: n+1, s: best.replace(/\s+/g,' '), c: h.c, sc: bs });
  });
  picks.sort((a,b)=>b.sc-a.sc);
  return picks;
}

function renderAnswers(hits, qs){
  const terms = S.bm25.terms(qs);
  const picks = extractive(hits, qs);
  const T = S.timing;
  const cite = n => `<span class="cite" onclick="document.getElementById('hit${n-1}').scrollIntoView({block:'center'})">[${n}]</span>`;
  let html = `
  <div class="ansbox ext">
    <div class="h"><span>Retrieval only — no language model</span><span>${hits.length} chunks</span></div>
    <div class="b">${picks.length
      ? picks.map(p => `${esc(p.s)} ${cite(p.n)}`).join('<br><br>')
      : 'Nothing in the library matches this question closely.'}</div>
    <div class="f">query embedded in ${f1(T.emb)} ms on ${S.device === 'webgpu' ? 'WebGPU' : 'CPU'} ·
      ${f0(S.n)} chunks searched in ${f1(T.srch)} ms · no text was generated, these are sentences lifted verbatim</div>
  </div>`;

  if (S.llm) {
    html += `<div class="btnrow">
      <button class="btn" id="genG">Answer from the documents</button>
      <button class="btn gh" id="genR">Answer <b style="color:#A8261E">without</b> the documents</button>
      <span class="small">same model, same question — the only difference is the context</span></div>
      <div id="genOut"></div>`;
  } else {
    html += `<div class="warn" style="margin-top:2px"><b>No language model is loaded.</b> Everything above is
      real retrieval over real embeddings, which is the part that matters — but to show the grounded-versus-
      ungrounded comparison you need a generator. Load one from <b>Setup &amp; notes</b>.</div>`;
  }
  $('answers').innerHTML = html;
  if (S.llm) {
    $('genG').onclick = () => generate(true, hits, qs);
    $('genR').onclick = () => generate(false, hits, qs);
  }
  renderHits(hits, terms);
}

/* ---------------- the generator ------------------------------------------- */
function buildMessages(grounded, hits, qs){
  if (!grounded) return [
    { role:'system', content:'You are a maintenance and performance assistant for thermal power stations. Answer the engineer\'s question directly and concisely in under 100 words.' },
    { role:'user', content: qs }
  ];
  const ctx = hits.map((h,n) =>
    `[${n+1}] ${hitTitle(h.c)} (${hitSub(h.c)})\n${h.c.text}`).join('\n\n');
  return [
    { role:'system', content:
`You are a maintenance and performance assistant for MAHAGENCO thermal power stations.
Answer ONLY from the CONTEXT below. After every factual claim, cite the bracketed number of the chunk it came from, like [2].
If the CONTEXT does not contain the answer, say so plainly and say who should be asked instead.
Never invent a torque, a limit, a part number, a date or a figure.
Be brief: at most 120 words.

CONTEXT
${ctx}` },
    { role:'user', content: qs }
  ];
}

async function generate(grounded, hits, qs){
  if (S.llmBusy) return;
  S.llmBusy = true;
  const box = document.createElement('div');
  box.className = 'ansbox ' + (grounded ? 'gnd' : 'raw');
  box.innerHTML = `<div class="h"><span>${grounded
      ? 'Generated from the retrieved documents'
      : 'Generated with NO documents — a demonstration of what ungrounded models do'}</span>
    <span class="mono" id="gstat">…</span></div>
    <div class="b"><span id="gtxt"></span><span class="cursor"></span></div>
    <div class="f" id="gfoot">preparing…</div>`;
  $('genOut').prepend(box);
  const gtxt = box.querySelector('#gtxt'), gfoot = box.querySelector('#gfoot'),
        gstat = box.querySelector('#gstat');

  const msgs = buildMessages(grounded, hits, qs);
  const cfg = LLMS.find(m => m.id === S.llmId) || {};
  const tplOpts = { add_generation_prompt: true, return_dict: true };
  if (cfg.think) tplOpts.enable_thinking = false;

  let inputs;
  try { inputs = S.llmTok.apply_chat_template(msgs, tplOpts); }
  catch (e) { inputs = S.llmTok.apply_chat_template(msgs, { add_generation_prompt:true, return_dict:true }); }

  const nPrompt = inputs.input_ids.dims[inputs.input_ids.dims.length-1];
  let started = 0, nTok = 0, text = '';
  const t0 = performance.now();
  const streamer = new TextStreamer(S.llmTok, {
    skip_prompt: true, skip_special_tokens: true,
    callback_function: (t) => {
      if (!started) { started = performance.now(); gstat.textContent = 'generating'; }
      nTok++; text += t;
      gtxt.innerHTML = renderCitations(text);
      gfoot.textContent = `${nPrompt} prompt tokens · ${nTok} generated · ` +
        `${f0((performance.now()-started)/Math.max(1,nTok) ? nTok/((performance.now()-started)/1000) : 0)} tok/s`;
    }
  });
  try {
    await S.llm.generate({ ...inputs, max_new_tokens: 260, do_sample: false, streamer });
    const total = (performance.now()-t0)/1000;
    gstat.textContent = 'done';
    box.querySelector('.cursor').remove();
    gfoot.textContent = `${nPrompt} prompt tokens · ${nTok} generated · ` +
      `first token after ${f1((started-t0)/1000)} s · ` +
      `${f1(nTok/Math.max(0.001,(performance.now()-started)/1000))} tok/s · ` +
      `${f1(total)} s total · ${S.llmId.split('/')[1]} on ${S.device === 'webgpu' ? 'WebGPU' : 'CPU'}`;
  } catch (e) {
    console.error(e);
    gstat.textContent = 'failed';
    gtxt.innerHTML += `<br><span style="color:#A8261E">Generation failed: ${esc(e.message||e)}</span>`;
  }
  S.llmBusy = false;
}
function renderCitations(t){
  return esc(t).replace(/\[(\d{1,2})\]/g,
    (m, n) => `<span class="cite" onclick="document.getElementById('hit${(+n)-1}')?.scrollIntoView({block:'center'})">[${n}]</span>`);
}

async function loadLLM(entry, allowRemote){
  const st = $('llmLoadStatus'), bar = $('llmBar');
  env.allowRemoteModels = !!allowRemote;
  $('netChip').textContent = allowRemote ? 'HF download allowed' : 'local only';
  $('netChipBox')?.classList.toggle('air', !allowRemote);
  st.textContent = 'Loading ' + entry.id + ' …';
  $('llmChip').textContent = 'loading…';
  $('llmChipBox').className = 'chip warn';
  const files = {};
  const pc = p => {
    if (p.status === 'progress' && p.total) {
      files[p.file] = { l: p.loaded, t: p.total };
      const L = Object.values(files).reduce((s,f)=>s+f.l,0);
      const T = Object.values(files).reduce((s,f)=>s+f.t,0);
      bar.style.width = (100*L/T).toFixed(1) + '%';
      st.textContent = `${(L/1e6).toFixed(0)} of ${(T/1e6).toFixed(0)} MB — ${(p.file||'').split('/').pop()}`;
    } else if (p.status === 'ready') { st.textContent = 'ready'; }
  };
  try {
    S.llmTok = await AutoTokenizer.from_pretrained(entry.id, { progress_callback: pc });
    S.llm = await AutoModelForCausalLM.from_pretrained(entry.id,
      { dtype: entry.dtype, device: S.device === 'webgpu' ? 'webgpu' : 'wasm', progress_callback: pc });
    S.llmId = entry.id;
    bar.style.width = '100%';
    st.innerHTML = `<b style="color:#256B45">Loaded.</b> ${entry.id} · ${entry.dtype} · ` +
      `${S.device === 'webgpu' ? 'WebGPU' : 'CPU'}. Go back to <b>Ask</b> — the two generate buttons are now there.`;
    $('llmChip').textContent = entry.id.split('/')[1];
    $('llmChipBox').className = 'chip ok';
    if (S.lastHits.length) renderAnswers(S.lastHits, S.lastQ);
  } catch (e) {
    console.error(e);
    $('llmChip').textContent = 'failed';
    $('llmChipBox').className = 'chip er';
    st.innerHTML = `<b style="color:#A8261E">Could not load.</b> ${esc(e.message||e)}<br>` +
      (allowRemote ? 'Check the internet connection.' :
       'The weights are not in <code>models/' + entry.id + '/</code>. Run <code>get-models</code> first, ' +
       'or tick the box above to download from huggingface.co.');
  } finally { env.allowRemoteModels = false; }
}

/* ---------------- retrieval detail tab ------------------------------------ */
function renderRetr(sc, qs){
  const rows = topK(sc.hy, 15).map((i, n) => {
    const c = S.chunks[i];
    return `<tr><td class="num">${n+1}</td><td>${esc(hitTitle(c))}<br>
      <span class="small">${esc(hitSub(c))}</span></td>
      <td class="num">${f2(sc.dn[i])}<br><span class="small">#${sc.rd[i]+1}</span></td>
      <td class="num">${f2(sc.kw[i])}<br><span class="small">${sc.kw[i]>0?'#'+(sc.rk[i]+1):'—'}</span></td>
      <td class="num">${(sc.hy[i]*1000).toFixed(2)}</td></tr>`;
  }).join('');
  const dTop = topK(sc.dn, S.k), kTop = topK(sc.kw, S.k).filter(i=>sc.kw[i]>0);
  const overlap = dTop.filter(i => kTop.includes(i)).length;
  $('retrTable').innerHTML = `
    <div class="stats">
      <div class="stat"><div class="l">Question</div><div class="n sm">${esc(qs.slice(0,46))}${qs.length>46?'…':''}</div>
        <div class="s">${S.bm25.terms(qs).length} indexable terms</div></div>
      <div class="stat"><div class="l">Overlap of top ${S.k}</div><div class="n ${overlap<S.k/2?'rd':'gn'}">${overlap} / ${S.k}</div>
        <div class="s">dense vs keyword — how differently they see it</div></div>
      <div class="stat"><div class="l">Query embedding</div><div class="n tl">${f1(S.timing.emb)} ms</div>
        <div class="s">${S.dim} dimensions on ${S.device === 'webgpu' ? 'WebGPU' : 'CPU'}</div></div>
      <div class="stat"><div class="l">Search</div><div class="n">${f1(S.timing.srch)} ms</div>
        <div class="s">${f0(S.n)} chunks, brute force + BM25</div></div>
    </div>
    <div class="card"><h3>Ranked by hybrid fusion</h3>
    <div class="tw"><table><thead><tr><th class="num">#</th><th>Chunk</th>
      <th class="num">Dense cos</th><th class="num">BM25</th><th class="num">RRF ×1000</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <div class="small" style="margin-top:7px">Reciprocal rank fusion adds <code>1/(60 + rank)</code> from each
    ranker, so a chunk that both rankers place reasonably high beats one that a single ranker loves. It needs no
    score calibration between the two, which is why it is the default in production systems.</div></div>`;
}

/* ---------------- embedding map ------------------------------------------- */
function computePCA(){
  const n = S.n, d = S.dim, V = S.V;
  const mean = new Float32Array(d);
  for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) mean[j] += V[i*d+j]/n;
  const X = new Float32Array(n*d);
  for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) X[i*d+j] = V[i*d+j] - mean[j];
  let tot = 0; for (let i = 0; i < n*d; i++) tot += X[i]*X[i];
  const comps = [], vars = [];
  for (let c = 0; c < 2; c++) {
    let p = new Float32Array(d);
    for (let j = 0; j < d; j++) p[j] = Math.sin(j*7.31 + c*2.7) + 0.1;
    for (let it = 0; it < 40; it++) {
      const u = new Float32Array(d);
      for (let i = 0; i < n; i++) {
        let t = 0, o = i*d;
        for (let j = 0; j < d; j++) t += X[o+j]*p[j];
        for (let j = 0; j < d; j++) u[j] += X[o+j]*t;
      }
      let L = 0; for (let j = 0; j < d; j++) L += u[j]*u[j];
      L = Math.sqrt(L) || 1;
      for (let j = 0; j < d; j++) p[j] = u[j]/L;
    }
    let ev = 0;
    for (let i = 0; i < n; i++) { let t = 0, o = i*d;
      for (let j = 0; j < d; j++) t += X[o+j]*p[j]; ev += t*t; }
    vars.push(ev);
    for (let i = 0; i < n; i++) { let t = 0, o = i*d;
      for (let j = 0; j < d; j++) t += X[o+j]*p[j];
      for (let j = 0; j < d; j++) X[o+j] -= t*p[j]; }
    comps.push(p);
  }
  const pts = new Float32Array(n*2);
  for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) {
    let t = 0, o = i*d;
    for (let j = 0; j < d; j++) t += (V[o+j]-mean[j])*comps[c][j];
    pts[i*2+c] = t;
  }
  return { pts, mean, comps, varFrac: (vars[0]+vars[1])/tot };
}
const KINDC = { course:'#3E8FA8', data:'#9A6408', plantdoc:'#D96A16', station:'#5B4A85' };
const KINDN = { course:'Course material', data:'June 2026 data brief', plantdoc:'Plant document library', station:'Station figures' };
function drawMap(){
  if (!S.pca) { S.pca = computePCA(); $('pcaVar').textContent = (S.pca.varFrac*100).toFixed(1) + '%'; }
  const cv = $('mapC'), dpr = Math.min(2, devicePixelRatio||1);
  const W = cv.clientWidth || 900, H = Math.max(380, Math.round(W*0.46));
  cv.width = W*dpr; cv.height = H*dpr; cv.style.height = H+'px';
  const g = cv.getContext('2d'); g.setTransform(dpr,0,0,dpr,0,0);
  g.fillStyle = '#0E1620'; g.fillRect(0,0,W,H);
  const P = S.pca.pts;
  let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
  for (let i=0;i<S.n;i++){ x0=Math.min(x0,P[i*2]); x1=Math.max(x1,P[i*2]);
    y0=Math.min(y0,P[i*2+1]); y1=Math.max(y1,P[i*2+1]); }
  const pad=26, X=v=>pad+(v-x0)/(x1-x0)*(W-2*pad), Y=v=>H-pad-(v-y0)/(y1-y0)*(H-2*pad);
  const sel = new Set(S.lastHits.map(h=>h.i));
  for (let i=0;i<S.n;i++){
    const c = S.chunks[i];
    g.fillStyle = (KINDC[c.kind]||'#6E8496') + (sel.has(i) ? 'ff' : '77');
    g.beginPath(); g.arc(X(P[i*2]), Y(P[i*2+1]), sel.has(i)?4.6:2.0, 0, 6.2832); g.fill();
  }
  sel.forEach(i => { g.strokeStyle='#F0A45E'; g.lineWidth=1.6;
    g.beginPath(); g.arc(X(P[i*2]), Y(P[i*2+1]), 9, 0, 6.2832); g.stroke(); });
  if (S.lastQVec) {
    const m = S.pca.mean, cp = S.pca.comps;
    let a=0,b=0; for (let j=0;j<S.dim;j++){ const v=S.lastQVec[j]-m[j]; a+=v*cp[0][j]; b+=v*cp[1][j]; }
    const x=X(a), y=Y(b);
    g.strokeStyle='#D96A16'; g.lineWidth=2.4;
    g.beginPath(); g.moveTo(x-9,y); g.lineTo(x+9,y); g.moveTo(x,y-9); g.lineTo(x,y+9); g.stroke();
    g.fillStyle='#F0A45E'; g.font='700 11px Calibri,sans-serif'; g.textAlign='left';
    g.fillText('the question', x+13, y-6);
  }
  g.fillStyle='#7F94A8'; g.font='700 10px Calibri,sans-serif';
  g.fillText('PRINCIPAL COMPONENT 1', pad, H-8);
  g.save(); g.translate(11, H-pad); g.rotate(-Math.PI/2);
  g.fillText('PRINCIPAL COMPONENT 2', 0, 0); g.restore();
  $('mapLeg').innerHTML = Object.keys(KINDN).map(k =>
    `<span><i style="background:${KINDC[k]}"></i>${KINDN[k]}</span>`).join('') +
    `<span><i style="background:#F0A45E"></i>retrieved for the current question</span>`;
}

/* ---------------- acceptance bench ---------------------------------------- */
async function runBench(){
  const out = $('benchOut'); const K = [1,3,5,10];
  out.innerHTML = '<div class="card"><h3>Running…</h3><div class="bar"><i id="bb"></i></div></div>';
  const res = { dense:{}, kw:{}, hy:{} }, lat = [];
  K.forEach(k => { res.dense[k]=0; res.kw[k]=0; res.hy[k]=0; });
  const rows = [];
  for (let n = 0; n < S.evalSet.length; n++) {
    const e = S.evalSet[n];
    const t = performance.now();
    const sc = await search(e.q);
    lat.push(performance.now()-t);
    const gold = new Set(e.gold);
    const r = {};
    for (const [name, arr] of [['dense',sc.dn],['kw',sc.kw],['hy',sc.hy]]) {
      const order = topK(arr, 10);
      r[name] = order.findIndex(i => gold.has(i));
      K.forEach(k => { if (r[name] >= 0 && r[name] < k) res[name][k]++; });
    }
    rows.push({ q:e.q, must:e.must, gold:e.gold.length, d:r.dense, k:r.kw, h:r.hy });
    $('bb') && ($('bb').style.width = (100*(n+1)/S.evalSet.length).toFixed(0)+'%');
  }
  const N = S.evalSet.length;
  const pct = v => (100*v/N).toFixed(0) + '%';
  const rk = v => v < 0 ? '<span style="color:#A8261E">miss</span>' : (v+1);
  out.innerHTML = `
  <div class="stats">
    <div class="stat"><div class="l">Questions</div><div class="n">${N}</div><div class="s">gold chunks marked by hand</div></div>
    <div class="stat"><div class="l">Dense recall@5</div><div class="n tl">${pct(res.dense[5])}</div>
      <div class="s">embeddings only</div></div>
    <div class="stat"><div class="l">Keyword recall@5</div><div class="n">${pct(res.kw[5])}</div>
      <div class="s">BM25 only</div></div>
    <div class="stat"><div class="l">Hybrid recall@5</div><div class="n em">${pct(res.hy[5])}</div>
      <div class="s">reciprocal rank fusion</div></div>
    <div class="stat"><div class="l">Median query</div><div class="n">${f1(lat.sort((a,b)=>a-b)[Math.floor(lat.length/2)])} ms</div>
      <div class="s">embed + search, end to end</div></div>
  </div>
  <div class="card"><h3>Recall at k</h3>
  <table><thead><tr><th>Ranker</th>${K.map(k=>`<th class="num">recall@${k}</th>`).join('')}</tr></thead><tbody>
    <tr><td>Dense — embeddings</td>${K.map(k=>`<td class="num">${pct(res.dense[k])}</td>`).join('')}</tr>
    <tr><td>Keyword — BM25</td>${K.map(k=>`<td class="num">${pct(res.kw[k])}</td>`).join('')}</tr>
    <tr class="hi"><td><b>Hybrid — RRF</b></td>${K.map(k=>`<td class="num"><b>${pct(res.hy[k])}</b></td>`).join('')}</tr>
  </tbody></table>
  <div class="small" style="margin-top:7px">Neither ranker wins everywhere. Dense handles the paraphrase —
  "drive end bearing" finding a document that says "coupling end bearing". Keyword handles the exact string —
  a tag number, a part number, an SOP number. <b>That is the entire argument for hybrid retrieval</b>, and it is
  visible in the per-question table below rather than asserted.</div></div>
  <div class="card"><h3>Per question — rank at which the right chunk appeared</h3>
  <div class="tw"><table><thead><tr><th>Question</th><th>Gold contains</th>
    <th class="num">Dense</th><th class="num">Keyword</th><th class="num">Hybrid</th></tr></thead><tbody>
    ${rows.map(r=>`<tr${r.d<0||r.k<0?' class="hi"':''}><td>${esc(r.q)}</td>
      <td class="mono small">${esc(r.must)}</td>
      <td class="num">${rk(r.d)}</td><td class="num">${rk(r.k)}</td><td class="num">${rk(r.h)}</td></tr>`).join('')}
  </tbody></table></div></div>
  <div class="note"><b>How to use this on a real project.</b> Fifty questions from your own engineers, each with
  the page that answers it marked by someone who knows. Recall@5 above 90% is a system worth piloting; below 70%
  the chunking or the model is wrong and no amount of prompt work will save it. Ask any vendor for this table
  before you ask for a demonstration.</div>`;
}

/* ---------------- setup tab ----------------------------------------------- */
function renderSetup(){
  const m = S.meta;
  $('setupWrap').innerHTML = `
  <div class="hd"><div class="k">Setup &amp; notes</div>
    <h2>What is running, where it came from, and how to change it</h2>
    <p>This page is a working retrieval-augmented generation system, not a mock-up. Both the retrieval and the
    generation happen inside this browser tab.</p></div>

  <div class="split"><div class="lft">
    <div class="card"><h3>Load a language model <span class="tag">optional</span></h3>
      <div class="note" style="margin-bottom:10px">Retrieval already works without this. Loading a generator adds
      the part of the demonstration that convinces people: the <b>same model, same question, with and without the
      documents</b> — one answer cites the work order, the other invents a torque figure.</div>
      <div class="ctl"><label>Model</label>
        <select id="llmSel">${LLMS.map((l,i)=>`<option value="${i}">${esc(l.label)} · ~${l.mb} MB</option>`).join('')}</select>
        <div class="hint">Downloaded once, then cached by the browser. ${S.device==='webgpu'
          ? 'WebGPU is available, so generation will use the GPU.'
          : '<b style="color:#A8261E">No WebGPU on this machine</b> — generation will fall back to the CPU and will be slow. Use the smallest model.'}</div></div>
      <label class="tog"><input type="checkbox" id="llmRemote">
        <span>Allow downloading from huggingface.co (needs internet). Leave unticked to load only from the
        <code>models/</code> folder — the fully offline path.</span></label>
      <div class="btnrow"><button class="btn" id="llmGo">Load the model</button></div>
      <div class="bar"><i id="llmBar"></i></div>
      <div class="small" id="llmLoadStatus">Nothing loaded.</div>
    </div>

    <div class="card"><h3>The corpus</h3>
      <table><thead><tr><th>Source</th><th class="num">Chunks</th><th>What it is</th></tr></thead><tbody>
      ${Object.entries(S.chunks.reduce((a,c)=>{a[c.src]=(a[c.src]||0)+1;return a;},{}))
        .sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<tr><td>${esc(k)}</td><td class="num">${v}</td>
        <td class="small">${{
          'Course material':'The 308-page participant handout and delivery script for this session.',
          'Plant document library':'Work orders, OEM manual sections, SOPs, shift logs, lab reports, spares.',
          'June 2026 station data':'One fact sheet per station from the audited June 2026 filing.',
          'June 2026 data brief':'The verified data brief the whole course is built on.'
        }[k]||''}</td></tr>`).join('')}
      </tbody></table>
      <div class="small" style="margin-top:7px">Total ${f0(S.n)} chunks, mean ${f0(
        S.chunks.reduce((s,c)=>s+c.text.length,0)/S.n)} characters. Chunk boundaries follow the document
        headings, and each chunk carries its heading trail into the embedding — which is worth several points of
        recall on its own.</div></div>

    <div class="card"><h3>Adding your own documents</h3>
      <ol>
        <li>Put the text into <code>data/chunks.json</code> as
          <code>{"id":…, "src":…, "kind":…, "crumb":…, "title":…, "text":…}</code>.</li>
        <li>Re-run the embedding step (<code>tools/embed.js</code> in the source folder) to regenerate
          <code>vectors.i8</code> and <code>scales.f32</code>.</li>
        <li>Reload. Nothing else changes.</li>
      </ol>
      <div class="small">For a real deployment the same three steps run nightly against the document server, and
      the vector file is a build artefact. There is no database.</div></div>
  </div>

  <div class="rgt">
    <div class="card"><h3>What is running now</h3>
      <table><tbody>
        <tr><td>Embedding model</td><td class="mono">${esc(m.model)}</td></tr>
        <tr><td>Quantisation</td><td class="mono">${esc(m.dtype)}</td></tr>
        <tr><td>Dimensions</td><td class="mono">${m.dim}</td></tr>
        <tr><td>Backend</td><td class="mono">${S.device === 'webgpu' ? 'WebGPU' : 'WASM (CPU)'}</td></tr>
        <tr><td>Adapter</td><td class="mono">${esc(S.adapter)}</td></tr>
        <tr><td>WASM threads</td><td class="mono">${env.backends.onnx.wasm.numThreads}${
          self.crossOriginIsolated ? '' : ' (not isolated — single thread)'}</td></tr>
        <tr><td>Chunks indexed</td><td class="mono">${f0(S.n)}</td></tr>
        <tr><td>Vector file</td><td class="mono">${f0(S.n*S.dim/1e3)} KB int8</td></tr>
        <tr><td>Corpus embedded</td><td class="mono">offline, ${m.embedSeconds||'—'} s on CPU</td></tr>
        <tr><td>Warm-up inference</td><td class="mono">${f0(S.timing.warm||0)} ms</td></tr>
      </tbody></table></div>

    <div class="card"><h3>The point of doing it this way</h3>
      <div class="good"><b>Nothing left this machine.</b> The weights, the documents, the vectors and the answer
      are all local. You can unplug the network cable and everything on this page still works. For a state
      generation utility that is not a detail — it is the difference between a pilot that can be approved and one
      that cannot.</div>
      <div class="small">The browser is doing the work through WebGPU, the same interface a game uses for
      graphics. No Python, no server, no installation, no administrator rights.</div></div>

    <div class="card"><h3>Before the session — a checklist</h3>
      <ul>
        <li>Run this on the <b>venue laptop</b>, not yours, at least a day before.</li>
        <li>Load the language model once while the internet is available; it is then cached.</li>
        <li>Check the Compute chip at the top reads <b>WebGPU</b>. If it reads CPU, generation will be too slow
          to demonstrate — use retrieval only.</li>
        <li>Ask two or three questions to warm the shaders before the audience is in the room.</li>
        <li>Keep a screen recording of a good run as a fallback.</li>
        <li>Zoom the browser to about 125% for a projector.</li>
      </ul></div>

    <div class="card"><h3>Honest limitations</h3>
      <ul>
        <li>A 0.5–1 B model is a competent extractor and a poor reasoner. It is being used here to read four
          retrieved passages and write three sentences — which it can do. Do not ask it to design anything.</li>
        <li>The embedding model is English. Hindi or Marathi queries will retrieve badly.</li>
        <li>Recall on the acceptance bench is measured against gold chunks chosen by one person. Fifty questions
          from five engineers would be a fairer test.</li>
        <li>The plant document library here is a realistic sample written for teaching, not an export of the
          real EAM system.</li>
      </ul></div>
  </div></div>`;

  $('llmGo').onclick = () => loadLLM(LLMS[+$('llmSel').value], $('llmRemote').checked);
}

/* ---------------- UI wiring ----------------------------------------------- */
function buildUI(){
  $('sugg').innerHTML = SUGGESTED.map(s =>
    `<button data-q="${esc(s.q)}" data-pre="${s.pre}">${
      esc(s.q.length > 74 ? s.q.slice(0,72)+'…' : s.q)}</button>`).join('');
  $('sugg').querySelectorAll('button').forEach(b =>
    b.onclick = () => {
      S.srcOff = b.dataset.pre === 'ops' ? new Set(['Course material']) : new Set();
      $('filters').querySelectorAll('.fb[data-s]').forEach(x =>
        x.classList.toggle('on', !S.srcOff.has(x.dataset.s)));
      $('q').value = b.dataset.q; doSearch();
    });

  const SRCS = [...new Set(S.chunks.map(c=>c.src))];
  $('filters').innerHTML =
    SRCS.map(x=>`<button class="fb${S.srcOff.has(x)?'':' on'}" data-s="${esc(x)}">${esc(x)} <b>${
      S.chunks.filter(c=>c.src===x).length}</b></button>`).join('') +
    `<span class="fsep"></span>
     <button class="fb pre" data-pre="ops">Operational only</button>
     <button class="fb pre" data-pre="all">Everything</button>
     <span class="small" style="margin-left:6px" id="divNote">max ${S.perSec} chunks per section</span>
     <span class="small" style="flex-basis:100%;margin-top:2px">The 308-page course material is indexed too
     (${S.chunks.filter(c=>c.src==='Course material').length} chunks) but is switched off by default, so
     operational questions return operational documents. Switch it on to ask about the session itself.</span>`;
  const syncF = () => {
    $('filters').querySelectorAll('.fb[data-s]').forEach(b =>
      b.classList.toggle('on', !S.srcOff.has(b.dataset.s)));
    if (S.lastQ) doSearch();
  };
  $('filters').querySelectorAll('.fb[data-s]').forEach(b => b.onclick = () => {
    const x = b.dataset.s;
    if (S.srcOff.has(x)) S.srcOff.delete(x); else S.srcOff.add(x);
    syncF();
  });
  $('filters').querySelectorAll('.fb[data-pre]').forEach(b => b.onclick = () => {
    S.srcOff = b.dataset.pre === 'ops' ? new Set(['Course material']) : new Set();
    syncF();
  });

  $('go').onclick = doSearch;
  $('q').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

  $('retrCtl').innerHTML = `
    <div class="ctl"><label>Ranker used for the answer</label></div>
    <div class="seg" id="modeSeg">
      <button data-m="dense">Dense</button><button data-m="kw">Keyword</button>
      <button data-m="hybrid" class="on">Hybrid</button></div>
    <div class="ctl"><label>Chunks handed to the model <span class="v" id="kv">${S.k}</span></label>
      <input type="range" id="kSl" min="1" max="12" step="1" value="${S.k}">
      <div class="hint">Too few and the answer is thin; too many and the useful page is buried.</div></div>
    <div class="ctl"><label>Max chunks from one section <span class="v" id="psv">${S.perSec}</span></label>
      <input type="range" id="psSl" min="1" max="6" step="1" value="${S.perSec}">
      <div class="hint">Without this cap a single long section wins every slot and the context window says the
      same thing six times. Standard practice, routinely missing from demonstrations.</div></div>
    <div class="ctl" style="display:none"><label>x</label>
      <input type="range" id="unusedSl" min="1" max="12" step="1" value="${S.k}">
      <div class="hint">Too few and the answer is thin; too many and the useful page is buried among
      near-misses, and every chunk costs tokens and latency.</div></div>`;
  $('modeSeg').querySelectorAll('button').forEach(b => b.onclick = () => {
    S.mode = b.dataset.m;
    $('modeSeg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    if (S.lastQ) doSearch();
  });
  $('kSl').oninput = e => { S.k = +e.target.value; $('kv').textContent = S.k; if (S.lastQ) doSearch(); };
  $('psSl').oninput = e => { S.perSec = +e.target.value; $('psv').textContent = S.perSec;
    const d = $('divNote'); if (d) d.textContent = `max ${S.perSec} chunks per section`;
    if (S.lastQ) doSearch(); };

  document.querySelectorAll('#tabs .t').forEach(t => t.onclick = () => {
    document.querySelectorAll('#tabs .t').forEach(x => x.classList.toggle('on', x === t));
    document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.id === 'p-' + t.dataset.p));
    if (t.dataset.p === 'map') setTimeout(drawMap, 30);
  });
  $('runBench').onclick = runBench;
  addEventListener('resize', () => { if ($('p-map').classList.contains('on')) drawMap(); });
  renderSetup();
  $('q').focus();
}

async function doSearch(){
  const qs = $('q').value.trim();
  if (!qs) return;
  $('go').disabled = true; $('go').textContent = '…';
  try {
    const sc = await search(qs);
    S.lastHits = pickHits(sc, S.k);
    renderAnswers(S.lastHits, qs);
    renderRetr(sc, qs);
    if ($('p-map').classList.contains('on')) drawMap();
  } catch (e) {
    console.error(e);
    $('answers').innerHTML = `<div class="bad"><b>Search failed.</b> ${esc(e.message||e)}</div>`;
  }
  $('go').disabled = false; $('go').textContent = 'Search';
}

start();
