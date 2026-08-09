/* =========================================================================
   Pocket RAG — ask your own document, entirely on the device.
   Static page. No server, no upload, no API key. Parsing, chunking,
   embedding, search and generation all happen in this browser.
   ========================================================================= */

import { vendor, vendorURL } from './vendor.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const f1 = x => (Math.round(x*10)/10).toFixed(1);
const f2 = x => (Math.round(x*100)/100).toFixed(2);
const f0 = x => Math.round(x).toLocaleString();
const sleep = ms => new Promise(r => setTimeout(r, ms));

const S = {
  doc: null,              // {name, kind, blocks, chunks, pages, chars}
  V: null, dim: 0,        // Float32Array of normalised vectors
  bm25: null,
  device: {webgpu:false, f16:false, adapter:'', maxStorage:0, maxBuffer:0},
  embedReady: false, embedBusy: false,
  llm: null, llmId: null, llmBusy: false,
  lastHits: [], lastQ: '', lastQVec: null,
  timing: {}
};

const EMBED_MODEL = 'Xenova/bge-small-en-v1.5';
const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';
const K = 5, PER_SECTION = 2;

/* =======================================================================
   1. Device capability — the numbers that decide what this phone can do
   ======================================================================= */
async function probeDevice(){
  const d = {webgpu:false, f16:false, adapter:'WebGPU not available', maxStorage:0, maxBuffer:0};
  if (!navigator.gpu) { if (!self.isSecureContext) d.adapter = 'needs https (this page is not a secure context)'; return d; }
  try {
    const a = await navigator.gpu.requestAdapter();
    if (!a) { d.adapter = 'no WebGPU adapter'; return d; }
    d.webgpu = true;
    d.f16 = a.features.has('shader-f16');
    d.maxStorage = a.limits.maxStorageBufferBindingSize || 0;
    d.maxBuffer  = a.limits.maxBufferSize || 0;
    try {
      const info = a.info || (a.requestAdapterInfo ? await a.requestAdapterInfo() : null);
      d.adapter = info ? ([info.vendor, info.architecture || info.description].filter(Boolean).join(' ') || 'WebGPU') : 'WebGPU';
    } catch(e){ d.adapter = 'WebGPU'; }
  } catch(e){ d.adapter = 'WebGPU error: ' + (e.message||e); }
  return d;
}

/* =======================================================================
   2. Reading the file — PDF, DOCX, text. Everything stays in memory.
   ======================================================================= */
async function readFile(file, onProg){
  const name = file.name, lower = name.toLowerCase();
  const buf = await file.arrayBuffer();
  if (lower.endsWith('.pdf'))  return await readPDF(buf, name, onProg);
  if (lower.endsWith('.docx')) return await readDOCX(buf, name, onProg);
  if (lower.endsWith('.doc'))  throw new Error(
    'Old .doc files are a binary format this cannot read. Open it in Word and “Save As” .docx.');
  const text = new TextDecoder().decode(buf);
  return readPlain(text, name, /\.(md|markdown)$/.test(lower));
}

/* ---- PDF: text with page numbers, and headings inferred from font size ---- */
async function readPDF(buf, name, onProg){
  const pdfjs = await import(/* @vite-ignore */ await vendorURL('pdf'));
  pdfjs.GlobalWorkerOptions.workerSrc = await vendorURL('pdfWorker');
  const pdf = await pdfjs.getDocument({ data: buf, isEvalSupported:false }).promise;
  const pages = [];
  const allHeights = [];

  for (let n = 1; n <= pdf.numPages; n++) {
    onProg && onProg(n / pdf.numPages, `Reading page ${n} of ${pdf.numPages}`);
    const page = await pdf.getPage(n);
    const tc = await page.getTextContent();
    // group items into visual lines by their y position
    const lines = [];
    let cur = null;
    for (const it of tc.items) {
      if (!it.str) continue;
      const y = Math.round(it.transform[5]);
      const h = Math.abs(it.transform[3]) || it.height || 0;
      if (h) allHeights.push(h);
      if (!cur || Math.abs(cur.y - y) > 2.5) { cur = { y, h, parts: [] }; lines.push(cur); }
      cur.h = Math.max(cur.h, h);
      cur.parts.push(it.str);
    }
    pages.push({ n, lines: lines.map(l => ({ h: l.h, y: l.y, t: l.parts.join('').replace(/\s+/g,' ').trim() }))
                                 .filter(l => l.t.length) });
    if (n % 12 === 0) await sleep(0);       // let the UI breathe on a phone
  }
  await pdf.destroy?.();

  allHeights.sort((a,b)=>a-b);
  const median = allHeights.length ? allHeights[Math.floor(allHeights.length/2)] : 10;
  const headingH = median * 1.18;

  const blocks = [];
  let chars = 0, para = null;
  for (const p of pages) {
    for (const l of p.lines) {
      chars += l.t.length;
      /* Big type alone is not a heading: in tables and financial statements the
         largest text on the page is often a row of figures. */
      const digits = (l.t.match(/[0-9]/g) || []).length / Math.max(1, l.t.length);
      const looksHeading = l.h >= headingH && l.t.length < 120 && !/[.;,]$/.test(l.t)
                           && digits < 0.35 && /[a-z]{3}/i.test(l.t);
      if (looksHeading) {
        para = null;
        blocks.push({ type:'h', level: l.h >= median*1.45 ? 2 : 3, text: l.t, page: p.n });
      } else if (para && !/^[•\-–—*\d]/.test(l.t) && !/[.:;!?]$/.test(para.text)) {
        para.text += ' ' + l.t;            // continuation of the same sentence
      } else {
        para = { type:'p', text: l.t, page: p.n };
        blocks.push(para);
      }
    }
    para = null;                            // never run a paragraph across a page
  }
  const perPage = chars / Math.max(1, pdf.numPages);
  return { name, kind:'PDF', pages: pdf.numPages, chars, blocks,
           scanned: perPage < 80,
           note: perPage < 80
             ? 'This PDF has almost no text layer — it is very likely a scan. Nothing useful can be extracted from it without OCR.'
             : '' };
}

/* mammoth is a UMD bundle, not an ES module, so it goes in through a script
   tag and lands on `self`. Loaded on demand: someone who only ever opens PDFs
   should never pay for it. */
let mammothP = null;
function loadMammoth(){
  if (!mammothP) mammothP = (async () => {
    if (self.mammoth) return self.mammoth;
    const url = await vendorURL('mammoth');
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = url; s.onload = res;
      s.onerror = () => rej(new Error('The Word reader could not be loaded from ' + url));
      document.head.appendChild(s);
    });
    if (!self.mammoth) throw new Error('The Word reader did not load.');
    return self.mammoth;
  })().catch(e => { mammothP = null; throw e; });
  return mammothP;
}

/* ---- DOCX: mammoth gives real headings, which make far better breadcrumbs ---- */
async function readDOCX(buf, name, onProg){
  onProg && onProg(0.3, 'Unpacking the Word file');
  const mammoth = await loadMammoth();
  const res = await mammoth.convertToHtml({ arrayBuffer: buf });
  onProg && onProg(0.75, 'Reading the structure');
  const doc = new DOMParser().parseFromString('<div>' + res.value + '</div>', 'text/html');
  const blocks = [];
  let chars = 0;
  const push = b => { if (b.text && b.text.trim().length > 1) { blocks.push(b); chars += b.text.length; } };
  for (const el of doc.body.firstChild.children) {
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent || '').replace(/\s+/g,' ').trim();
    if (/^h[1-6]$/.test(tag)) push({ type:'h', level: Math.min(3, +tag[1]), text });
    else if (tag === 'table') {
      const rows = [...el.querySelectorAll('tr')].map(tr =>
        '| ' + [...tr.children].map(td => (td.textContent||'').replace(/\s+/g,' ').trim()).join(' | ') + ' |');
      push({ type:'table', text: rows.join('\n') });
    }
    else if (tag === 'ul' || tag === 'ol') {
      [...el.querySelectorAll('li')].forEach(li =>
        push({ type:'p', text: '• ' + (li.textContent||'').replace(/\s+/g,' ').trim() }));
    }
    else push({ type:'p', text });
  }
  return { name, kind:'Word', pages: 0, chars, blocks, scanned:false,
           note: res.messages && res.messages.length > 12
             ? 'Word reported some formatting it could not convert; the text itself is fine.' : '' };
}

function readPlain(text, name, isMd){
  const blocks = []; let chars = 0, para = [], table = [];
  const flushPara = () => { const t = para.join(' ').replace(/\s+/g,' ').trim();
    if (t) { blocks.push({ type:'p', text:t }); chars += t.length; } para = []; };
  const flushTable = () => { const t = table.join('\n').trim();
    if (t) { blocks.push({ type:'table', text:t }); chars += t.length; } table = []; };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/,'');
    const h = isMd && /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { flushPara(); flushTable();
      blocks.push({ type:'h', level: Math.min(3, h[1].length), text: h[2].trim() }); continue; }
    if (/^\s*\|/.test(line)) { flushPara(); table.push(line.trim()); continue; }
    if (table.length) flushTable();
    if (!line.trim()) { flushPara(); continue; }
    para.push(line.trim());
  }
  flushPara(); flushTable();
  return { name, kind: isMd ? 'Markdown' : 'Text', pages:0, chars, blocks, scanned:false, note:'' };
}

/* =======================================================================
   3. Chunking — heading-aware, with the breadcrumb carried into the vector
   ======================================================================= */
const MAXC = 900, MINC = 220;
function chunk(doc){
  const out = [];
  let h2 = '', h3 = '', cur = [], curLen = 0, page0 = null;
  const crumb = () => [h2, h3].filter(Boolean).join(' › ');
  /* Overlap is only ever carried WITHIN a section. Carrying it across a heading
     would file the previous section's text under the next section's name, and
     then a citation would point at the wrong place. */
  const flush = (keepOverlap) => {
    const text = cur.map(b => b.text).join('\n\n').trim();
    if (text.length >= 40) out.push({ id: out.length, text, crumb: crumb(), page: page0 });
    const keep = keepOverlap ? cur.slice(-1) : [];
    cur = keep; curLen = keep.reduce((s,b)=>s+b.text.length,0); page0 = keep[0]?.page ?? null;
  };
  for (const b of doc.blocks) {
    if (b.type === 'h') {
      /* Always emit what the previous section had. Discarding short sections
         (the old behaviour) silently loses spares registers, limits tables and
         anything else written tersely — exactly the passages people ask about. */
      if (curLen > 0) flush(false);
      if (b.level <= 2) { h2 = b.text; h3 = ''; } else h3 = b.text;
      page0 = b.page ?? page0;
      continue;
    }
    let parts = [b];
    if (b.type !== 'table' && b.text.length > MAXC * 1.6) {
      parts = []; let acc = '';
      for (const sn of b.text.split(/(?<=[.!?])\s+/)) {
        if (acc.length + sn.length > MAXC && acc.length > MINC) { parts.push({ ...b, text: acc.trim() }); acc = ''; }
        acc += (acc ? ' ' : '') + sn;
      }
      if (acc.trim()) parts.push({ ...b, text: acc.trim() });
    }
    else if (b.type === 'table' && b.text.length > 1400) {   // split a long table by rows, repeating the header
      const rows = b.text.split('\n'), head = rows.slice(0,1);
      parts = []; let grp = [];
      for (const r of rows.slice(1)) {
        grp.push(r);
        if (grp.join('\n').length > 900) { parts.push({ type:'table', text: head.concat(grp).join('\n'), page:b.page }); grp = []; }
      }
      if (grp.length) parts.push({ type:'table', text: head.concat(grp).join('\n'), page:b.page });
    }
    for (const p of parts) {
      if (curLen + p.text.length > MAXC && curLen > MINC) flush(true);
      if (page0 === null) page0 = p.page ?? null;
      cur.push(p); curLen += p.text.length + 2;
    }
  }
  if (curLen > 40) { const text = cur.map(b=>b.text).join('\n\n').trim();
    if (text.length >= 40) out.push({ id: out.length, text, crumb: crumb(), page: page0 }); }
  return out;
}

/* =======================================================================
   4. BM25 — instant, no model, works on any device
   ======================================================================= */
const STOP = new Set(('the a an and or of to in for on at is are was were be been it its this that with as by '+
 'from not no but if then than we you they he she our your their i do does did have has had will would can '+
 'could should may might must about into over under').split(' '));
function tokenize(s){
  const out = [];
  for (const t0 of String(s).toLowerCase().split(/[^a-z0-9\-]+/)) {
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
    const toks = tokenize((c.crumb ? c.crumb + ' ' : '') + c.text);
    const tf = new Map(); toks.forEach(t => tf.set(t, (tf.get(t)||0)+1));
    tf.forEach((_,t) => df.set(t, (df.get(t)||0)+1));
    docs.push({ tf, len: toks.length });
  });
  const avg = docs.reduce((s,d)=>s+d.len,0) / Math.max(1,docs.length), N = docs.length;
  return {
    score(qs){
      const out = new Float32Array(N), seen = new Set();
      for (const t of tokenize(qs)) {
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
    terms: qs => [...new Set(tokenize(qs))].filter(t => df.has(t) && t.length > 2)
  };
}

/* =======================================================================
   5. The embedding worker
   ======================================================================= */
let embedWorker = null, embedSeq = 0;
const embedJobs = new Map();
function startEmbedWorker(){
  if (embedWorker) return embedWorker;
  embedWorker = new Worker(new URL('./worker-embed.js', import.meta.url), { type:'module' });
  embedWorker.onmessage = e => {
    const m = e.data;
    if (m.type === 'progress' && m.job === undefined) { onEmbedLoadProgress(m); return; }
    const job = embedJobs.get(m.job);
    if (!job) return;
    if (m.type === 'progress') job.onProg && job.onProg(m);
    else if (m.type === 'done')  { embedJobs.delete(m.job); job.resolve(m); }
    else if (m.type === 'error') { embedJobs.delete(m.job); job.reject(new Error(m.error)); }
  };
  embedWorker.onerror = e => { console.error('embed worker', e); };
  return embedWorker;
}
function embedCall(payload, onProg){
  const w = startEmbedWorker(), job = ++embedSeq;
  return new Promise((resolve, reject) => {
    embedJobs.set(job, { resolve, reject, onProg });
    w.postMessage({ ...payload, job });
  });
}
let onEmbedLoadProgress = () => {};

async function ensureEmbedder(onProg){
  if (S.embedReady) return;
  onEmbedLoadProgress = onProg || (()=>{});
  await embedCall({ type:'load', model: EMBED_MODEL, device: S.device.webgpu ? 'webgpu' : 'wasm' });
  S.embedReady = true;
  onEmbedLoadProgress = () => {};
  setChips();
}

/* =======================================================================
   6. Search
   ======================================================================= */
function denseScores(qv){
  const n = S.doc.chunks.length, D = S.dim, V = S.V, out = new Float32Array(n);
  for (let i = 0; i < n; i++) { let d = 0, o = i*D;
    for (let j = 0; j < D; j++) d += V[o+j]*qv[j];
    out[i] = d; }
  return out;
}
const rankOf = arr => { const idx = Array.from(arr.keys()).sort((a,b)=>arr[b]-arr[a]);
  const r = new Int32Array(arr.length); idx.forEach((id,pos)=>r[id]=pos); return r; };

async function search(qs){
  const t0 = performance.now();
  let dn = null, tEmb = 0;
  if (S.V && S.embedReady) {
    const r = await embedCall({ type:'query', text: QUERY_PREFIX + qs });
    tEmb = performance.now() - t0;
    S.lastQVec = new Float32Array(r.vector);
    dn = denseScores(S.lastQVec);
  }
  const t1 = performance.now();
  const kw = S.bm25.score(qs);
  const n = S.doc.chunks.length;
  let fused;
  if (dn) {
    const rd = rankOf(dn), rk = rankOf(kw);
    fused = new Float32Array(n);
    for (let i = 0; i < n; i++) fused[i] = 1/(60+rd[i]) + (kw[i] > 0 ? 1/(60+rk[i]) : 0);
  } else fused = kw;
  S.timing = { emb: tEmb, srch: performance.now() - t1, dense: !!dn, pick: 0 };

  const order = Array.from(fused.keys()).sort((a,b)=>fused[b]-fused[a]);
  const hits = [], perSec = {};
  for (const i of order) {
    const c = S.doc.chunks[i];
    const key = c.crumb || ('p' + c.page);
    if ((perSec[key]||0) >= PER_SECTION) continue;
    if (fused[i] <= 0) break;
    perSec[key] = (perSec[key]||0) + 1;
    hits.push({ i, c, dense: dn ? dn[i] : null, kw: kw[i] });
    if (hits.length >= K) break;
  }
  return hits;
}

/* =======================================================================
   7. Answers
   ======================================================================= */
/* Candidate sentence windows from the top passages. */
function windows(hits, maxPerHit){
  const out = [];
  hits.slice(0,4).forEach((h,n) => {
    const sents = h.c.text.split(/(?<=[.!?])\s+|\n+/).map(x=>x.trim())
      .filter(x => x.length > 18 && !/^\|/.test(x));
    const seen = new Set(); let taken = 0;
    for (let i = 0; i < sents.length && taken < maxPerHit; i++)
      for (let w = 1; w <= 2 && i+w <= sents.length; w++) {
        const t = sents.slice(i,i+w).join(' ');
        if (t.length < 55 && i+w < sents.length) continue;
        if (t.length > 420 || seen.has(t)) continue;
        seen.add(t); out.push({ n: n+1, s: t.replace(/\s+/g,' ') }); taken++;
      }
  });
  return out;
}

/* Overlapping passages repeat sentences; drop anything already said. */
function dedupe(picks, limit){
  const lim = limit || 3;
  const kept = [], usedChunk = new Set(), toks = p => new Set(tokenize(p.s));
  const overlapsKept = p => {
    const a = toks(p);
    return kept.some(k => { const b = toks(k); let hit = 0;
      a.forEach(t => { if (b.has(t)) hit++; });
      return hit / Math.max(1, a.size) > 0.6; });
  };
  for (const pass of [1, 2]) {                 // first one sentence per passage
    for (const p of picks) {
      if (kept.length >= lim) break;
      if (pass === 1 && usedChunk.has(p.n)) continue;
      if (kept.includes(p) || overlapsKept(p)) continue;
      kept.push(p); usedChunk.add(p.n);
    }
    if (kept.length >= Math.min(lim, 2)) break;
  }
  return kept;
}

/* Lexical fallback when there are no embeddings. */
function extractiveLexical(hits, qs){
  const qt = new Set(tokenize(qs));
  const scored = windows(hits, 8).map(c => {
    const st = tokenize(c.s); let ov = 0; st.forEach(t => { if (qt.has(t)) ov++; });
    return { ...c, sc: ov ? ov * (1 + 0.12*Math.min(ov,5)) / Math.pow(st.length + 8, 0.42) : -1 };
  }).filter(c => c.sc > 0).sort((a,b)=>b.sc-a.sc);
  if (!scored.length) return hits.slice(0,2).map((h,n) => ({ n:n+1, s: h.c.text.slice(0,220) }));
  return dedupe(scored, 3);
}

/* With embeddings loaded, the model that found the passage also picks the
   sentence — so a question phrased in different words still lands correctly. */
async function extractiveSemantic(hits, qs){
  const cands = windows(hits, 5).slice(0, 16);
  if (!cands.length || !S.lastQVec) return extractiveLexical(hits, qs);
  const t0 = performance.now();
  const r = await embedCall({ type:'embed', texts: cands.map(c => c.s) });
  const V = new Float32Array(r.vectors), D = r.dim, q = S.lastQVec;
  cands.forEach((c,i) => { let d = 0; for (let j = 0; j < D; j++) d += V[i*D+j]*q[j]; c.sc = d; });
  S.timing.pick = performance.now() - t0;
  cands.sort((a,b)=>b.sc-a.sc);
  return dedupe(cands, 3);
}

function buildMessages(grounded, hits, qs){
  if (!grounded) return [
    { role:'system', content:'You are a helpful assistant. Answer the question directly in under 90 words.' },
    { role:'user', content: qs }];
  const ctx = hits.map((h,n) =>
    `[${n+1}] ${h.c.crumb || (h.c.page ? 'Page ' + h.c.page : 'Extract')}\n${h.c.text}`).join('\n\n');
  return [
    { role:'system', content:
`Answer ONLY from the CONTEXT below, which comes from a document the user supplied.
Cite the bracketed number after every factual claim, like [2].
If the CONTEXT does not answer the question, say so plainly instead of guessing.
Never invent a number, a name or a date. At most 90 words.

CONTEXT
${ctx}` },
    { role:'user', content: qs }];
}
const renderCites = t => esc(t).replace(/\[(\d{1,2})\]/g,
  (m,n) => `<span class="cite" data-hit="${(+n)-1}">[${n}]</span>`);

/* =======================================================================
   8. WebLLM
   ======================================================================= */
let webllmMod = null;
async function llmModels(){
  if (!webllmMod) webllmMod = await import(/* @vite-ignore */ await vendorURL('webllm'));
  const list = webllmMod.prebuiltAppConfig.model_list;
  return list
    .filter(m => (m.vram_required_MB || 1e9) < 2700 && /Instruct|Chat|-it-/i.test(m.model_id))
    .filter(m => S.device.f16 ? true : !/f16/.test(m.model_id))
    .sort((a,b) => (a.vram_required_MB||0) - (b.vram_required_MB||0));
}
async function loadLLM(modelId, onProg){
  if (!webllmMod) webllmMod = await import(/* @vite-ignore */ await vendorURL('webllm'));
  const worker = new Worker(new URL('./worker-llm.js', import.meta.url), { type:'module' });
  S.llm = await webllmMod.CreateWebWorkerMLCEngine(worker, modelId, {
    initProgressCallback: r => onProg && onProg(r.progress ?? 0, r.text || '')
  });
  S.llmId = modelId;
  setChips();
}

/* =======================================================================
   9. Persistence — the parsed document survives a reload, still locally
   ======================================================================= */
const DB = 'pocketrag', STORE = 'docs';
function idb(){ return new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function saveDoc(){
  try {
    const db = await idb();
    const q = new Int8Array(S.V ? S.V.length : 0), scales = new Float32Array(S.doc.chunks.length);
    if (S.V) for (let i = 0; i < S.doc.chunks.length; i++) {
      let m = 0; for (let j = 0; j < S.dim; j++) m = Math.max(m, Math.abs(S.V[i*S.dim+j]));
      scales[i] = m/127 || 1;
      for (let j = 0; j < S.dim; j++) q[i*S.dim+j] = Math.round(S.V[i*S.dim+j]/scales[i]);
    }
    const rec = { name:S.doc.name, kind:S.doc.kind, pages:S.doc.pages, chars:S.doc.chars,
                  note:S.doc.note, chunks:S.doc.chunks, dim:S.dim,
                  vec: S.V ? q.buffer : null, scales: scales.buffer, saved: new Date().toISOString() };
    await new Promise((res,rej) => { const tx = db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put(rec,'current'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  } catch(e){ console.warn('could not save locally:', e); }
}
async function loadDoc(){
  try {
    const db = await idb();
    const rec = await new Promise((res,rej) => { const tx = db.transaction(STORE,'readonly');
      const g = tx.objectStore(STORE).get('current'); g.onsuccess = () => res(g.result); g.onerror = () => rej(g.error); });
    if (!rec) return false;
    S.doc = { name:rec.name, kind:rec.kind, pages:rec.pages, chars:rec.chars, note:rec.note,
              blocks:[], chunks:rec.chunks, scanned:false };
    S.dim = rec.dim || 0;
    if (rec.vec && S.dim) {
      const q = new Int8Array(rec.vec), sc = new Float32Array(rec.scales);
      const V = new Float32Array(rec.chunks.length * S.dim);
      for (let i = 0; i < rec.chunks.length; i++) { let nn = 0;
        for (let j = 0; j < S.dim; j++) { const v = q[i*S.dim+j]*sc[i]; V[i*S.dim+j] = v; nn += v*v; }
        nn = Math.sqrt(nn)||1;
        for (let j = 0; j < S.dim; j++) V[i*S.dim+j] /= nn; }
      S.V = V;
    }
    S.bm25 = buildBM25(S.doc.chunks);
    return true;
  } catch(e){ return false; }
}
async function clearDoc(){
  try { const db = await idb();
    await new Promise(res => { const tx = db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).delete('current'); tx.oncomplete = res; }); } catch(e){}
  S.doc = null; S.V = null; S.bm25 = null; S.lastHits = [];
  $('workspace').style.display='none'; $('askWrap').style.display='none'; $('empty').style.display='';
  $('answers').innerHTML=''; $('hitsWrap').style.display='none'; setChips();
}

/* =======================================================================
   10. UI
   ======================================================================= */
function setChips(){
  const g = $('chGPU');
  g.textContent = S.device.webgpu ? ('GPU ' + (S.device.f16 ? '· f16' : '· f32 only')) : 'CPU only';
  g.className = 'chip ' + (S.device.webgpu ? 'ok' : 'warn');
  const e = $('chEmb');
  e.textContent = S.embedReady ? (S.V ? 'meaning search on' : 'search model ready') : 'keyword search';
  e.className = 'chip ' + (S.V ? 'ok' : '');
  const l = $('chLLM');
  l.textContent = S.llm ? ('writer · ' + S.llmId.replace(/-MLC.*$/,'').slice(0,18)) : 'writer off';
  l.className = 'chip ' + (S.llm ? 'ok' : '');
}
function showLoading(title, msg, pct){
  $('empty').style.display='none'; $('loading').style.display='';
  $('loadTitle').textContent = title; $('loadMsg').textContent = msg || '';
  $('loadBar').style.width = Math.round((pct||0)*100) + '%';
}
function hideLoading(){ $('loading').style.display='none'; }

function renderDoc(){
  const d = S.doc;
  $('docCard').innerHTML = `
    <div class="fname">${esc(d.name)}</div>
    <div class="small" style="margin:2px 0 10px">${esc(d.kind)}${d.pages?` · ${d.pages} pages`:''} ·
      ${f0(d.chars)} characters · ${f0(d.chunks.length)} passages</div>
    ${d.note ? `<div class="warn">${esc(d.note)}</div>` : ''}
    ${S.V ? '' : `<div class="note" style="margin-bottom:10px"><b>Keyword search is live now.</b>
      Turn on meaning-based search to find passages that answer the question without sharing its words —
      it downloads a 34 MB model once, then works offline.${
        d.chunks.length > 400 ? ` This document has ${f0(d.chunks.length)} passages, so reading them all
        will take a minute or two on a phone. It only happens once.` : ''}</div>`}
    <div class="btnrow">
      ${S.V ? '' : `<button class="btn sm" id="btnEmbed">Turn on meaning search${
        d.chunks.length > 200 ? ` · ${f0(d.chunks.length)} passages` : ''}</button>`}
      ${S.llm ? '' : `<button class="btn sm ${S.V?'':'gh'}" id="btnLLM">Add the answer writer</button>`}
      <button class="btn sm gh" id="btnNew">Open another file</button>
    </div>`;
  $('btnNew').onclick = () => clearDoc();
  const be = $('btnEmbed'); if (be) be.onclick = doEmbed;
  const bl = $('btnLLM');   if (bl) bl.onclick = () => { openSheet(); setTimeout(()=>$('modelSel')?.scrollIntoView({block:'center'}),80); };
}

function renderHits(hits, terms){
  $('hitsWrap').style.display = hits.length ? '' : 'none';
  const hl = t => { let o = esc(t); if (!terms.length) return o;
    const re = new RegExp('(' + terms.map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|') + ')','gi');
    return o.replace(re, '<mark>$1</mark>'); };
  $('hits').innerHTML = hits.map((h,n) => `
    <div class="hit" id="hit${n}">
      <div class="hh"><span class="n">${n+1}</span>
        <span class="ti">${esc(h.c.crumb || (h.c.page ? 'Page ' + h.c.page : 'Extract ' + (h.c.id+1)))}
          <span>${h.c.page ? 'page ' + h.c.page + ' · ' : ''}${h.c.text.length} characters</span></span>
        <span class="sc">${h.dense !== null ? f2(h.dense) : '—'}</span></div>
      <div class="hb" style="display:none">${hl(h.c.text.slice(0,2200))}</div>
    </div>`).join('');
  $('hits').querySelectorAll('.hh').forEach(el => el.onclick = () => {
    const b = el.nextElementSibling; b.style.display = b.style.display === 'none' ? 'block' : 'none'; });
}

function answerShell(cls, title, right){
  const box = document.createElement('div');
  box.className = 'ans ' + cls;
  box.innerHTML = `<div class="h"><span>${title}</span><span class="mono" data-stat>${right||''}</span></div>
    <div class="b"><span data-txt></span><span class="cursor"></span></div><div class="f" data-foot></div>`;
  $('answers').prepend(box);
  return { box, txt: box.querySelector('[data-txt]'), foot: box.querySelector('[data-foot]'),
           stat: box.querySelector('[data-stat]'), cursor: box.querySelector('.cursor') };
}
function wireCites(){
  $('answers').querySelectorAll('.cite').forEach(c => c.onclick = () => {
    const el = $('hit' + c.dataset.hit); if (!el) return;
    el.querySelector('.hb').style.display = 'block';
    el.scrollIntoView({ block:'center', behavior:'smooth' });
  });
}

async function onAsk(){
  const qs = $('q').value.trim();
  if (!qs || !S.doc) return;
  $('ask').disabled = true;
  try {
    const hits = await search(qs);
    S.lastHits = hits; S.lastQ = qs;
    renderHits(hits, S.bm25.terms(qs));
    $('answers').innerHTML = '';

    if (!hits.length) {
      const a = answerShell('ext', 'Nothing matched');
      a.cursor.remove();
      a.txt.textContent = 'No passage in this document matches that question. Try different words, or turn on meaning search if it is off.';
      return;
    }
    const render = picks => {
      a.txt.innerHTML = picks.map(p =>
        `${esc(p.s)} <span class="cite" data-hit="${p.n-1}">[${p.n}]</span>`).join('<br><br>')
        || 'See the passages below.';
      wireCites();
    };
    const a = answerShell('ext', S.llm ? 'Straight from the document' : 'Straight from the document — no writer loaded',
                          hits.length + ' passages');
    a.cursor.remove();
    render(extractiveLexical(hits, qs));       // instant, so the phone never looks stuck
    a.foot.textContent = (S.timing.dense
      ? `question embedded in ${f1(S.timing.emb)} ms · `
      : 'keyword search only · ') +
      `${f0(S.doc.chunks.length)} passages searched in ${f1(S.timing.srch)} ms` +
      (S.timing.pick ? ` · sentences ranked in ${f1(S.timing.pick)} ms` : '') +
      ' · nothing left this device';
    wireCites();

    if (S.timing.dense) {                      // then let the model re-rank the sentences
      a.stat.textContent = 'refining';
      try { render(await extractiveSemantic(hits, qs)); } catch(e){ console.warn(e); }
      a.stat.textContent = hits.length + ' passages';
      a.foot.textContent = `question embedded in ${f1(S.timing.emb)} ms · ` +
        `${f0(S.doc.chunks.length)} passages searched in ${f1(S.timing.srch)} ms` +
        (S.timing.pick ? ` · sentences ranked in ${f1(S.timing.pick)} ms` : '') +
        ' · nothing left this device';
    }

    if (S.llm) await generate(true, hits, qs);
  } catch(e) {
    console.error(e);
    const a = answerShell('raw', 'Something went wrong'); a.cursor.remove();
    a.txt.textContent = e.message || String(e);
  }
  $('ask').disabled = false;
}

async function generate(grounded, hits, qs){
  if (S.llmBusy) return;
  S.llmBusy = true;
  const a = answerShell(grounded ? 'gen' : 'raw',
    grounded ? 'Written by the on-device model, from those passages'
             : 'Written with NO document — what an ungrounded model does', 'starting');
  const t0 = performance.now(); let started = 0, n = 0, text = '';
  try {
    const stream = await S.llm.chat.completions.create({
      messages: buildMessages(grounded, hits, qs), stream: true, temperature: 0, max_tokens: 280
    });
    for await (const part of stream) {
      const d = part.choices?.[0]?.delta?.content; if (!d) continue;
      if (!started) { started = performance.now(); a.stat.textContent = 'writing'; }
      n++; text += d;
      a.txt.innerHTML = renderCites(text);
    }
    a.cursor.remove(); a.stat.textContent = 'done';
    const dur = (performance.now() - started)/1000;
    a.foot.textContent = `${n} tokens · first after ${f1((started-t0)/1000)} s · ` +
      `${f1(n/Math.max(0.001,dur))} tok/s · ${S.llmId} · on this device`;
    wireCites();
    if (grounded) {
      const row = document.createElement('div');
      row.className = 'btnrow'; row.style.margin = '0 0 12px';
      row.innerHTML = `<button class="btn gh sm" id="btnRaw">Now answer it <b style="color:#A8261E">without</b> the document</button>`;
      a.box.after(row);
      $('btnRaw').onclick = () => { row.remove(); generate(false, hits, qs); };
    }
  } catch(e) {
    console.error(e);
    a.cursor.remove(); a.stat.textContent = 'failed';
    a.txt.innerHTML += `<br><span style="color:#A8261E">${esc(e.message||e)}</span>`;
  }
  S.llmBusy = false;
}

/* ---------------- pipeline ---------------- */
async function handleFile(file){
  try {
    showLoading('Reading ' + file.name, 'Opening the file', 0.05);
    const doc = await readFile(file, (p,msg) => showLoading('Reading ' + file.name, msg, 0.05 + 0.65*p));
    showLoading('Reading ' + file.name, 'Splitting into passages', 0.8);
    doc.chunks = chunk(doc);
    if (!doc.chunks.length) throw new Error(
      doc.scanned ? 'No text could be extracted — this looks like a scanned document.'
                  : 'No readable text was found in that file.');
    S.doc = doc; S.V = null; S.dim = 0;
    S.bm25 = buildBM25(doc.chunks);
    hideLoading();
    $('workspace').style.display=''; $('askWrap').style.display='';
    renderDoc(); setChips(); await saveDoc();
    $('answers').innerHTML=''; $('hitsWrap').style.display='none';
    suggestions();
    if (S.embedReady || localStorage.getItem('pr_autoembed') === '1') doEmbed();
  } catch(e) {
    console.error(e);
    hideLoading(); $('empty').style.display='';
    $('drop').insertAdjacentHTML('afterend', `<div class="bad" style="margin-top:12px">${esc(e.message||e)}</div>`);
  }
}

async function doEmbed(){
  if (S.embedBusy || !S.doc) return;
  S.embedBusy = true;
  localStorage.setItem('pr_autoembed','1');
  try {
    showLoading('Turning on meaning search', 'Fetching the embedding model (34 MB, once)', 0.02);
    await ensureEmbedder((m) => {
      if (m.total) showLoading('Turning on meaning search',
        `Model ${(m.loaded/1e6).toFixed(0)} of ${(m.total/1e6).toFixed(0)} MB`, 0.02 + 0.35*(m.loaded/m.total));
    });
    const texts = S.doc.chunks.map(c => (c.crumb ? c.crumb + '\n' : '') + c.text);
    const t0 = performance.now();
    const res = await embedCall({ type:'embed', texts }, m => {
      showLoading('Reading the document', `Understanding passage ${m.done} of ${m.total}`,
        0.4 + 0.6*(m.done/m.total));
    });
    S.dim = res.dim;
    S.V = new Float32Array(res.vectors);
    S.timing.embedAll = performance.now() - t0;
    hideLoading(); renderDoc(); setChips(); await saveDoc();
    if (S.lastQ) { $('q').value = S.lastQ; await onAsk(); }
  } catch(e) {
    console.error(e); hideLoading(); renderDoc();
    $('docCard').insertAdjacentHTML('beforeend',
      `<div class="bad" style="margin-top:10px">Meaning search could not start: ${esc(e.message||e)}<br>
       Keyword search still works.</div>`);
  }
  S.embedBusy = false;
}

function suggestions(){
  const qs = ['What is this document about?','Summarise the main points','What actions are required?',
              'What limits or numbers are given?','Who is responsible?','What is the date?'];
  $('sugg').innerHTML = qs.map(q => `<button data-q="${esc(q)}">${esc(q)}</button>`).join('');
  $('sugg').querySelectorAll('button').forEach(b => b.onclick = () => { $('q').value = b.dataset.q; onAsk(); });
}

/* ---------------- settings sheet ---------------- */
async function openSheet(){
  const d = S.device;
  const mb = v => v ? (v/1048576).toFixed(0) + ' MiB' : '—';
  let models = [];
  try { models = await llmModels(); } catch(e){}
  let vsrc = 'unknown';
  try { vsrc = (await vendor()).__source; } catch(e){}
  $('sheetBody').innerHTML = `
  <h2>What this device can do</h2>
  <div class="tier"><span class="dot on"></span><b>Keyword search</b>
    <span>Always available. No download, no model, works on anything.</span></div>
  <div class="tier"><span class="dot ${S.V?'on':''}"></span><b>Meaning search — 34 MB</b>
    <span>Finds the right passage when the question and the document use different words.
    ${S.V ? 'Active.' : 'Not on yet.'}</span></div>
  <div class="tier"><span class="dot ${S.llm?'on':(d.webgpu?'':'off')}"></span><b>Answer writer — 0.6 to 1.1 GB</b>
    <span>${d.webgpu ? (S.llm ? 'Loaded.' : 'Your device can run one.')
      : 'Needs WebGPU, which this browser is not offering. Everything else still works.'}</span></div>

  <label class="fld">Answer writer</label>
  ${d.webgpu ? `
    <select id="modelSel">${models.map(m =>
      `<option value="${esc(m.model_id)}">${esc(m.model_id.replace(/-MLC.*$/,''))} · ${
        Math.round(m.vram_required_MB)} MB</option>`).join('')}</select>
    <div class="small" style="margin:6px 0 10px">Downloaded once from the Hugging Face CDN and cached in this
    browser. ${d.f16 ? 'Your GPU supports f16, so both build types are listed.'
      : '<b>Your GPU has no f16 support</b>, so only f32 builds are listed — that is the normal situation on Qualcomm Android hardware.'}</div>
    <button class="btn wide" id="btnLoadLLM">${S.llm ? 'Load a different model' : 'Load the model'}</button>
    <div class="bar tl" style="margin-top:10px"><i id="llmBar"></i></div>
    <div class="small" id="llmMsg">${S.llm ? 'Loaded: ' + esc(S.llmId) : 'Not loaded.'}</div>`
   : `<div class="warn">No WebGPU on this browser, so no on-device writer. On Android use Chrome or Edge;
      the page must also be on https — which it is if you loaded it from a real URL.</div>`}

  <h2 style="margin-top:18px">Device report</h2>
  <table><tbody>
    <tr><td>Secure context</td><td class="num">${self.isSecureContext ? 'yes' : 'NO'}</td></tr>
    <tr><td>WebGPU</td><td class="num">${d.webgpu ? 'yes' : 'no'}</td></tr>
    <tr><td>Adapter</td><td class="num" style="font-size:11px">${esc(d.adapter)}</td></tr>
    <tr><td>shader-f16</td><td class="num">${d.webgpu ? (d.f16 ? 'yes' : 'no') : '—'}</td></tr>
    <tr><td>max storage buffer</td><td class="num">${mb(d.maxStorage)}</td></tr>
    <tr><td>max buffer</td><td class="num">${mb(d.maxBuffer)}</td></tr>
    <tr><td>CPU threads</td><td class="num">${navigator.hardwareConcurrency || '?'}</td></tr>
    <tr><td>cross-origin isolated</td><td class="num">${self.crossOriginIsolated ? 'yes' : 'no'}</td></tr>
    <tr><td>offline ready</td><td class="num">${navigator.serviceWorker?.controller ? 'yes' : 'not yet'}</td></tr>
    <tr><td>libraries</td><td class="num">${esc(vsrc)}</td></tr>
  </tbody></table>
  <div class="small" style="margin-top:8px">A model whose weights are larger than the max storage buffer will
  not load. That is the single most useful number on this page when someone asks why a bigger model failed.</div>

  <h2 style="margin-top:18px">Your data</h2>
  <div class="note">The file you opened was read by JavaScript in this tab. The parsed text and its vectors are
  kept in this browser's own storage so the document survives a reload. <b>No part of your document is ever
  transmitted.</b> This page makes exactly three kinds of network request: its own code, the libraries it is
  built on${vsrc === 'self-hosted' ? ' (served from this same site)' : ' (jsDelivr, pinned versions with checksums in vendor.json)'},
  and model weights from the Hugging Face CDN. A request for a library reveals your IP address to whoever serves
  it and nothing more. To remove even that, run <code>get-vendor.py</code> on the machine hosting this page.</div>
  <button class="btn gh wide" id="btnClear">Forget the document and clear storage</button>
  <div style="height:10px"></div>
  <button class="btn alt wide" id="btnClose">Close</button>`;

  $('sheet').classList.add('on');
  $('btnClose').onclick = closeSheet;
  $('btnClear').onclick = async () => { await clearDoc(); closeSheet(); };
  const bl = $('btnLoadLLM');
  if (bl) bl.onclick = async () => {
    const id = $('modelSel').value;
    bl.disabled = true;
    try {
      await loadLLM(id, (p, txt) => { $('llmBar').style.width = Math.round(p*100) + '%';
        $('llmMsg').textContent = txt || `${Math.round(p*100)}%`; });
      $('llmMsg').innerHTML = '<b style="color:#256B45">Ready.</b> Close this and ask a question.';
      renderDoc();
    } catch(e) {
      console.error(e);
      $('llmMsg').innerHTML = `<b style="color:#A8261E">Could not load.</b> ${esc(e.message||e)}`;
    }
    bl.disabled = false;
  };
}
function closeSheet(){ $('sheet').classList.remove('on'); }

/* ---------------- sample ---------------- */
const SAMPLE = `# Maintenance file — ID fan A, Unit 8

## WO 2023-04117 — coupling-end bearing high metal temperature
Induced draught fan A, coupling end bearing, metal temperature trending upward over three weeks. On opening, the oil was found dark with a burnt smell; sampling showed water ingress 1,240 ppm. Bearing shells scored on the lower half. Shells replaced, oil flushed and recharged with Servoprime 46, breather element renewed.

## OEM manual 7.4 — bearing temperature limits
Alarm at 85 °C metal temperature, trip at 90 °C. Sustained operation above 80 °C requires investigation of oil supply temperature and cooler performance. Design oil supply 42 to 46 °C at bearing inlet.

## Root cause note — repeat bearing failures 2021 to 2023
Three shell replacements in 26 months. Common thread: oil cooler fouling on the cooling water side during the monsoon, raising supply temperature by 6 to 9 °C. Cooler chemical cleaning added to the monsoon preparedness checklist.

## SOP-MECH-034 — bearing shell replacement
Barring gear key surrendered, coupling bolts marked and removed, top half of the housing lifted with the 2 t chain block. Shell crush 0.03 to 0.05 mm. Torque housing bolts to 320 Nm in three passes.

## Spares register
Two sets of drive-end shells held at central store, part 3-FN-BRG-118. Lead time on reorder from the OEM is 14 weeks. Non-drive-end shells nil stock.

## Shift log 12 June
ID fan A drive-end bearing 71 °C at 14:00, ambient 36. Fan A oil cooler cooling-water outlet valve found throttled 40 per cent; opened fully, temperature settled 2 °C lower over the next four hours.

## Permit to work — rotating equipment isolation
Electrical isolation, mechanical locking of the coupling, and a hot-work clearance where grinding is involved. Two-person verification of zero energy before any bearing housing is opened.`;

/* ---------------- boot ---------------- */
async function boot(){
  S.device = await probeDevice();
  setChips();

  $('btnPick').onclick = () => $('file').click();
  $('file').onchange = e => { const f = e.target.files[0]; if (f) handleFile(f); e.target.value=''; };
  $('btnSample').onclick = () => handleFile(
    new File([SAMPLE], 'Sample — ID fan A maintenance file.md', { type:'text/markdown' }));
  $('btnSheet').onclick = openSheet;
  $('sheet').onclick = e => { if (e.target.id === 'sheet') closeSheet(); };
  $('ask').onclick = onAsk;
  $('q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('q').blur(); onAsk(); } });

  const dz = $('drop');
  ['dragenter','dragover'].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave','drop'].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) handleFile(f); });

  if (await loadDoc()) {
    $('empty').style.display='none';
    $('workspace').style.display=''; $('askWrap').style.display='';
    S.embedReady = false;               // the model itself still has to load before a query
    renderDoc(); setChips(); suggestions();
    if (S.V) ensureEmbedder().catch(()=>{});
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:')
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
boot();
