# MAHAGENCO — Local RAG Bench

A working retrieval-augmented generation system that runs entirely inside a browser
on one laptop. Real embedding model, real vector search, real answers. No cloud, no
server, no installation, no administrator rights, and — once the models are in the
`models/` folder — **no network at all**.

Built as a companion to *AI for Power Plants*, MAHAGENCO Training Centre, Nashik.
Presenter: S. H. Parihar.

---

## Start it

**Windows** — double-click `start-windows.bat`
**macOS / Linux** — `./start-mac-linux.sh`

The first run fetches the 34 MB embedding model automatically — that needs internet, and
happens once. Everything after that works with the network off. A console window opens
and the browser goes to `http://localhost:8181/`. Leave the console open; closing it
stops the server.

If the venue laptop has no internet at all, run this on a machine that does and copy the
whole folder across:

```
python get-models.py embedder     # 34 MB — required
python get-models.py small        # 490 MB — optional, unlocks generated answers
```

It has to be served over HTTP. Opening `index.html` by double-clicking will not work —
browsers refuse to load ES modules and WebAssembly from a `file://` page. The launcher
scripts use Python's built-in web server, which is on most machines already. If Python
is missing, any static web server pointed at this folder will do.

---

## On a phone

Engineers will ask. The short answer: **retrieval works on Android, generation does not.**

Start the server with `--lan` and it prints the address to type into the phone:

```
python serve.py --lan          # or  start-windows.bat --lan
```

Both devices must be on the same Wi-Fi. Without `--lan` the server listens on the
loopback interface only and a phone cannot reach it at all.

What works on the phone: the full retrieval side — real 384-dimension query
embedding, hybrid dense + BM25 over all 1,302 chunks, the retrieved passages with
citations, the retrieval-detail table, the embedding map and the acceptance bench.
Tested on 412 px and 320 px viewports; the layout reflows and nothing overflows.

What does not work, and why it is not the phone's fault:

> A browser grants WebGPU, SharedArrayBuffer and the Cache API only on a **secure
> origin**. `http://localhost` counts as secure. `http://192.168.1.42:8181` does
> **not**. Measured at a bare LAN IP: `isSecureContext` false, `navigator.gpu`
> undefined, `SharedArrayBuffer` undefined, `caches` undefined.

So over plain HTTP on the LAN the phone gets single-threaded WASM, no GPU, and
re-fetches the 34 MB embedding model on every page load. Retrieval still runs
because the code falls back cleanly; generation is simply unavailable.

Three further reasons not to plan on generation from a phone even with HTTPS:

- All three offered models are `q4f16`, which needs the WebGPU `shader-f16` feature.
  It depends on a Vulkan capability that Qualcomm/Adreno drivers do not expose — and
  most Android handsets are Snapdragon.
- 0.5 to 1.2 GB of weights in a mobile browser tab is beyond what Chrome on Android
  will reliably hold, and mobile `maxStorageBufferBindingSize` is often 128–256 MB.
- Even where it loads, decode is slow and the handset throttles within a minute.

**Use the phone as a second screen for retrieval, and drive generation from the
laptop.** That is a good split for a training room anyway: the projector shows the
grounded-versus-ungrounded comparison while engineers search the library themselves.

---

## Two tiers

| | What it needs | What you get |
|---|---|---|
| **Tier A — retrieval** *(the default)* | a one-off 34 MB download on first run | Real 384-dimension embeddings of 1,302 chunks, hybrid dense + BM25 search, sentences lifted verbatim from the sources with citations. Loads in a few seconds. |
| **Tier B — generation** *(one download)* | `python get-models.py small` | A small language model runs in the browser and writes the answer. Unlocks the grounded-versus-ungrounded comparison, which is the part that convinces people. |

```
python get-models.py            # show the choices
python get-models.py small      # ~490 MB  Qwen2.5 0.5B Instruct
python get-models.py medium     # ~570 MB  Qwen3 0.6B
python get-models.py large      # ~1.24 GB Llama 3.2 1B Instruct — best answers
```

Run that once on a machine with internet. After that the folder is self-contained.
Then open **Setup & notes** in the bench, pick the model and press **Load the model**.

Generation needs **WebGPU**. The chip at the top right of the bench tells you whether
this machine has it. Without WebGPU, retrieval still works perfectly; generation will
fall back to the CPU and be too slow to demonstrate.

---

## What is indexed

| Source | Chunks | What it is |
|---|---:|---|
| Course material | 1,230 | The 378-page participant handout and delivery script for the session |
| Plant document library | 41 | Work orders, OEM manual sections, SOPs, shift logs, lab reports, spares register |
| June 2026 station data | 14 | One fact sheet per station from the audited June 2026 filing |
| June 2026 data brief | 17 | The verified brief the whole course is built on |

**1,302 chunks, 384 dimensions, 500 KB of int8 vectors.** The corpus was embedded once,
offline, with the same model file that ships in `models/` — so the vectors in
`data/vectors.i8` and the query vector computed live in the browser come from identical
weights. There is no vector database; 1,302 × 384 brute-force cosine takes under a
millisecond, and any database would only add a dependency to explain.

The course material is **switched off by default** in the filter row, so operational
questions return operational documents. Switch it on to ask about the session itself.

---

## Running the demonstration

A sequence that works in front of a room, in about eight minutes.

1. **Show the top bar.** Compute: WebGPU. Network: local only. Then unplug the ethernet
   cable, or turn off Wi-Fi, and leave it off for the rest of the demonstration.

2. **Ask the flagship question** — click the first suggested chip:
   *"ID fan A drive-end bearing is running warm at Koradi 8 — what did we find last time?"*
   Point at the timing line: the question was turned into 384 numbers in tens of
   milliseconds and 1,302 chunks were searched in about the same. Then point at what came
   back — the 2023 work order on that same bearing, the calibration record for the
   thermocouple, the spares position.

3. **Show that it is not word matching.** The work order says *coupling end bearing* on an
   *induced draught fan*. The question said *drive end bearing* of the *ID fan*. Not one
   word in common. Open the **Retrieval detail** tab and show the keyword column ranking
   it nowhere while the dense column has it near the top.

4. **Then show the reverse.** Type the tag number `0-FN-201-TE-03`. Now keyword wins and
   the embedding is mediocre. This is why production systems run both.

5. **Load the language model** (do this before the session, so it is cached) and press
   both buttons on the same question. The grounded answer cites chunk numbers you can
   click. The ungrounded answer is fluent, confident and invents a figure. Do not
   editorialise — let the room read both.

6. **Ask the safety question**: *"Is it safe to open a bearing housing while the adjacent
   fan is running?"* The library does not answer it. A properly prompted grounded model
   says so and names who to ask. An ungrounded one gives advice.

7. **Finish on the Acceptance bench.** Thirty-one questions with the right answer marked
   by hand. Recall@5: dense 84%, keyword 84%, hybrid 90%. Tell them plainly: *this table,
   on your own questions, is what you should ask any vendor for before you ask for a demo.*

---

## Before the session

- Run it on the **venue laptop**, not yours, at least a day ahead.
- Download the language model while internet is available; it is then cached by the browser.
- Confirm the Compute chip reads **WebGPU**.
- Ask two or three questions to warm the shaders before anyone is in the room.
- Zoom the browser to ~125% for a projector.
- Keep a screen recording of a good run as a fallback.

---

## Changing the documents

```
tools/build_corpus.js   →  data/chunks.json      chunk the sources
tools/embed.js          →  data/vectors.i8       embed them with the real model
tools/build_eval.js     →  data/eval.json        rebuild the acceptance questions
```

Needs Node and `npm i @huggingface/transformers`. Point `SRC` at the folder holding your
markdown, run the three scripts in order, reload the page. There is nothing else — the
"index" is a flat binary file.

---

## What is in the folder

```
index.html            the bench
app.js                retrieval, fusion, generation, evaluation, the map
serve.py              a static server with the two headers ONNX Runtime wants
vendor/               transformers.js v4 and the ONNX Runtime WebAssembly binaries
models/Xenova/bge-small-en-v1.5/     the embedding model — tokenizer ships here,
                      the 34 MB weights arrive on first run
models/onnx-community/…              language models, added by get-models.py
data/                 chunks.json, vectors.i8, scales.f32, index.json, eval.json
tools/                the three scripts that regenerate data/
```

---

## Honest limitations

- A 0.5–1 B parameter model is a competent extractor and a poor reasoner. It is being
  asked to read six retrieved passages and write three sentences, which it can do. It
  cannot design anything, and it should not be asked to.
- The embedding model is English-only. Hindi or Marathi queries will retrieve badly.
- The 41 plant documents are a realistic sample written for teaching, not an export of a
  real EAM system. The June 2026 figures are real and come from the audited filing.
- Gold chunks in the acceptance bench were marked by one person. Fifty questions from
  five engineers would be a fairer test — which is exactly the recommendation the bench
  makes.
- Safari is not supported; the ONNX Runtime build shipped here is the one Chrome and
  Edge use. Chrome or Edge on Windows is the tested path.
