# vendor/

Nothing in here is committed. Both pieces are third-party build output, fetched
once from a CDN:

`transformers.min.js` — Hugging Face transformers.js v4.2.0, the browser build,
558 KB. Kept out of git because GitHub's secret scanner false-positives on a
32-character literal inside the minified bundle, and because a vendored minified
dependency does not belong in source control anyway.

`ort/` — the ONNX Runtime WebAssembly binaries, about 50 MB, a build artefact of
`onnxruntime-web`.

Fetch both with:

```
python get-models.py vendor
```

or, if you already have Node:

```
npm i @huggingface/transformers@4.2.0
cp node_modules/@huggingface/transformers/dist/transformers.min.js      vendor/
cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.*  vendor/ort/
cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.*      vendor/ort/
```

`start-windows.bat` and `start-mac-linux.sh` run the fetch automatically on first
start, so in normal use you never have to think about this.
