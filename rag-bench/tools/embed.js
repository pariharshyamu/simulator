/* Embed every chunk with the real bge-small-en-v1.5 ONNX model.
   Uses exactly the model files that ship in the deliverable, so the
   vectors computed here and the query vectors computed in the browser
   come from the same weights. */
const fs = require('fs');
const path = require('path');
const ROOT = '..';

(async () => {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.localModelPath = path.join(ROOT, 'models');
  env.allowRemoteModels = false;
  env.allowLocalModels = true;

  const t0 = Date.now();
  const extractor = await pipeline('feature-extraction', 'Xenova/bge-small-en-v1.5',
    { dtype: 'q8', device: 'cpu' });
  console.log('model loaded in', ((Date.now()-t0)/1000).toFixed(1), 's');

  const chunks = JSON.parse(fs.readFileSync(path.join(ROOT,'data','chunks.json'),'utf8'));
  const texts = chunks.map(c => {
    const head = [c.title, c.crumb].filter(Boolean).join(' · ');
    return (head ? head + '\n' : '') + c.text;
  });

  const B = 16;
  let dim = 0;
  const vecs = [];
  const tStart = Date.now();
  for (let i = 0; i < texts.length; i += B) {
    const batch = texts.slice(i, i + B);
    const out = await extractor(batch, { pooling: 'mean', normalize: true });
    dim = out.dims[out.dims.length - 1];
    const data = out.data;
    for (let k = 0; k < batch.length; k++) vecs.push(data.slice(k*dim, (k+1)*dim));
    if ((i / B) % 10 === 0) {
      const done = Math.min(i + B, texts.length);
      const rate = done / ((Date.now()-tStart)/1000);
      process.stdout.write(`\r  ${done}/${texts.length}  ${rate.toFixed(1)}/s  eta ${
        ((texts.length-done)/rate).toFixed(0)}s   `);
    }
  }
  const secs = (Date.now()-tStart)/1000;
  console.log(`\nembedded ${vecs.length} chunks, dim ${dim}, in ${secs.toFixed(1)} s (${
    (vecs.length/secs).toFixed(1)}/s on CPU)`);

  // int8 quantisation with a per-vector scale
  const q = new Int8Array(vecs.length * dim);
  const scales = new Float32Array(vecs.length);
  let maxErr = 0;
  vecs.forEach((v, i) => {
    let m = 0; for (let d = 0; d < dim; d++) m = Math.max(m, Math.abs(v[d]));
    scales[i] = m / 127;
    for (let d = 0; d < dim; d++) q[i*dim + d] = Math.max(-127, Math.min(127, Math.round(v[d]/scales[i])));
    // measure the cosine error introduced by quantisation
    let dot = 0, na = 0, nb = 0;
    for (let d = 0; d < dim; d++) { const b = q[i*dim+d]*scales[i];
      dot += v[d]*b; na += v[d]*v[d]; nb += b*b; }
    maxErr = Math.max(maxErr, 1 - dot/Math.sqrt(na*nb));
  });
  console.log('worst cosine error from int8 quantisation:', maxErr.toExponential(2));

  fs.writeFileSync(path.join(ROOT,'data','vectors.i8'), Buffer.from(q.buffer));
  fs.writeFileSync(path.join(ROOT,'data','scales.f32'), Buffer.from(scales.buffer));
  fs.writeFileSync(path.join(ROOT,'data','index.json'), JSON.stringify({
    model: 'Xenova/bge-small-en-v1.5',
    dtype: 'q8',
    dim, n: vecs.length,
    queryPrefix: 'Represent this sentence for searching relevant passages: ',
    built: '2026-08-09',
    embedSeconds: Math.round(secs)
  }));
  console.log('written:', (q.length/1e6).toFixed(2), 'MB int8 +', (scales.length*4/1e3).toFixed(0), 'KB scales');
})();
