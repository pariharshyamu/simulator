/* Embedding worker — keeps the model and every matrix multiply off the main
   thread, which is the difference between a usable phone UI and a frozen one. */
import { vendorURL } from './vendor.js';

/* transformers.js is loaded on demand from wherever vendor.js says it lives —
   a self-hosted copy if one was installed, the pinned CDN build otherwise. */
let pipeline = null, env = null;

async function loadRuntime(){
  if (env) return;
  const mod = await import(/* @vite-ignore */ await vendorURL('transformers'));
  pipeline = mod.pipeline; env = mod.env;

  /* Weights normally stream from the Hugging Face CDN. If whoever deployed this
     dropped a copy into ./models/<org>/<name>/ we use that instead, which makes
     the very first load work with no internet at all. */
  env.allowRemoteModels = true;
  env.allowLocalModels  = false;

  /* Multi-threaded WebAssembly needs SharedArrayBuffer, and SharedArrayBuffer
     needs COOP+COEP headers, which GitHub Pages cannot send. Asking for threads
     we cannot have makes ONNX Runtime fail its own capability check instead of
     quietly falling back, so ask for exactly what the page is entitled to. */
  try {
    const isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
                     && typeof SharedArrayBuffer !== 'undefined';
    env.backends.onnx.wasm.numThreads = isolated
      ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1))
      : 1;
  } catch (e) {}
}

/* A transformers.js pipeline dispatches on `this`; it must live in a plain
   variable, never as a property of an object. */
let EXTRACTOR = null;
let DIM = 0;

/* Same idea for the ONNX Runtime WebAssembly: normally it streams from the CDN
   (and the service worker caches it), but a self-hosted copy wins if present. */
async function useLocalOrt(){
  try {
    const u = new URL('vendor/ort/ort-wasm-simd-threaded.asyncify.wasm', self.location.href);
    const r = await fetch(u, { method:'HEAD' });
    if (r.ok) { env.backends.onnx.wasm.wasmPaths = new URL('vendor/ort/', self.location.href).href; return true; }
  } catch (e) {}
  return false;
}

async function useLocalIfPresent(model){
  try {
    const r = await fetch(new URL('models/' + model + '/config.json', self.location.href), { cache:'no-store' });
    if (r.ok) { env.allowLocalModels = true; env.localModelPath = 'models/'; return true; }
  } catch (e) {}
  return false;
}

async function load(model, device){
  await loadRuntime();
  const [local, localOrt] = await Promise.all([useLocalIfPresent(model), useLocalOrt()]);
  self.postMessage({ type:'progress', source: (local ? 'local weights' : 'cdn weights') +
                                              (localOrt ? ' + local runtime' : ' + cdn runtime') });
  const opts = {
    dtype: 'q8',
    progress_callback: p => { if (p.status === 'progress' && p.total)
      self.postMessage({ type:'progress', loaded:p.loaded, total:p.total, file:p.file }); }
  };
  try {
    EXTRACTOR = await pipeline('feature-extraction', model, { ...opts, device });
  } catch (e) {
    if (device === 'webgpu') EXTRACTOR = await pipeline('feature-extraction', model, { ...opts, device:'wasm' });
    else throw e;
  }
}

async function embedBatch(texts){
  const out = await EXTRACTOR(texts, { pooling:'mean', normalize:true });
  DIM = out.dims[out.dims.length - 1];
  return out.data;
}

self.onmessage = async (e) => {
  const m = e.data, job = m.job;
  try {
    if (m.type === 'load') {
      await load(m.model, m.device);
      self.postMessage({ type:'done', job });
    }
    else if (m.type === 'query') {
      const d = await embedBatch([m.text]);
      const v = new Float32Array(d.slice(0, DIM));
      self.postMessage({ type:'done', job, dim:DIM, vector:v.buffer }, [v.buffer]);
    }
    else if (m.type === 'embed') {
      const texts = m.texts, B = 8, all = [];
      for (let i = 0; i < texts.length; i += B) {
        const d = await embedBatch(texts.slice(i, i + B));
        all.push(Float32Array.from(d));
        self.postMessage({ type:'progress', job, done: Math.min(i + B, texts.length), total: texts.length });
      }
      const V = new Float32Array(texts.length * DIM);
      let o = 0; for (const a of all) { V.set(a, o); o += a.length; }
      self.postMessage({ type:'done', job, dim:DIM, vectors:V.buffer }, [V.buffer]);
    }
  } catch (err) {
    self.postMessage({ type:'error', job, error: (err && err.message) || String(err) });
  }
};
