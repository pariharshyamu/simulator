# Third-party code

Everything in this repository that was not written for it, what it is used for,
and where the exact bytes came from.

Nothing here is bundled with its own licence text stripped: each project's
licence travels inside its distributed file, and the links below go to the
canonical copy.

---

## Committed to this repository

| Library | Version | Licence | Where | Why |
|---|---|---|---|---|
| [three.js](https://github.com/mrdoob/three.js) | bundled from npm `three` | MIT | `vendor/three.global.min.js` | The 3-D scenes in the Algorithm Anatomy Theatre and the PdM simulator. Rebuilt with esbuild into a single IIFE global so the artefacts can be inlined into one HTML file that opens by double-clicking. |
| [pptxgenjs](https://github.com/gitbrent/PptxGenJS) | dev dependency, not committed | MIT | used by `deck/build_deck.js` | Generates the 117-slide deck. Installed with `npm i pptxgenjs` at build time only. |

## Loaded at runtime, pinned by checksum

Pocket RAG does not commit its libraries. `pocket-rag/vendor.json` pins each one
to an exact version on jsDelivr and records the SHA-256 of the bytes the app was
tested against; `pocket-rag/get-vendor.py` will download and verify them into
`pocket-rag/vendor/` for an air-gapped deployment.

| Library | Version | Licence | Why |
|---|---|---|---|
| [pdf.js](https://github.com/mozilla/pdf.js) | 6.2.108 | Apache-2.0 | Reads PDFs. Used for its per-text-item font sizes, which is how section headings are inferred without any layout model. |
| [mammoth](https://github.com/mwilliamson/mammoth.js) | 1.12.0 | BSD-2-Clause | Converts `.docx` to HTML, preserving real heading levels so breadcrumbs are accurate rather than guessed. |
| [transformers.js](https://github.com/huggingface/transformers.js) | 4.2.0 | Apache-2.0 | Runs the ONNX embedding model in the browser, on WebGPU where available and WebAssembly otherwise. |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) | as shipped inside transformers.js 4.2.0 | MIT | The actual inference engine underneath transformers.js. The RAG bench can self-host its WebAssembly builds; `rag-bench/get-models.py vendor` fetches them. |
| [WebLLM](https://github.com/mlc-ai/web-llm) | 0.2.84 | Apache-2.0 | The optional on-device answer writer. Only downloaded if someone turns that tier on. |

`rag-bench/` uses transformers.js 4.2.0 and ONNX Runtime Web on the same terms;
`rag-bench/get-models.py vendor` fetches them from the same pinned CDN paths.

## Models

Not code, and not in this repository — downloaded by the browser and cached there.

| Model | Licence | Used by |
|---|---|---|
| [`Xenova/bge-small-en-v1.5`](https://huggingface.co/Xenova/bge-small-en-v1.5) (ONNX, int8) | MIT | Pocket RAG and the RAG bench, for 384-dimension sentence embeddings. Derived from BAAI/bge-small-en-v1.5. |
| WebLLM prebuilt models (Llama 3.2, Qwen 2.5, SmolLM2, TinyLlama and others) | each under its own upstream licence — Llama 3.2 Community Licence, Apache-2.0, and so on | The optional writer tier. The model list is whatever `prebuiltAppConfig` offers that fits the device; the licence is the upstream model's, not this project's. |

## Everything else

All original code in this repository — the simulators, the Theatre, the lab, the
retrieval and chunking, the course material, the build and QA scripts — is by
S. H. Parihar.

The plant figures in `course/` come from MAHAGENCO's own June 2026 energy bill,
the provisional Part-I FSA bill, and the MERC merit-order dispatch stack for
July 2026. The ID fan sensor data in the Theatre and the PdM simulator is
synthetic, generated from a physical model with a fault injected on a known day,
and is labelled as such wherever it appears.
