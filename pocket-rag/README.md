# Pocket RAG

Ask questions about your own PDF or Word file **on your phone**, with the document,
the search and the answer all staying on the device. A static page: no server, no
account, no API key, nothing uploaded — there is nowhere to upload to.

Built as a companion to *AI for Power Plants*, MAHAGENCO Training Centre, Nashik.

---

## The demonstration that makes the point

1. Open the page.
2. **Turn on flight mode.**
3. Open a confidential document and ask it questions.

Everything still works. That is the whole argument for on-device AI in one gesture,
and it is the answer to *"we cannot send plant data to a cloud service."*

---

## Three tiers, each usable on its own

| | Download | Needs | What you get |
|---|---:|---|---|
| **Keyword search** | 0 | any browser | BM25 over the whole document, instantly. Tag numbers, part numbers, exact phrases. |
| **Meaning search** | 34 MB, once | any browser | A real 384-dimension embedding model. Finds the passage that answers the question even when it shares no words with it. Also re-ranks the sentences it quotes back. |
| **Answer writer** | 0.6–1.1 GB, once | WebGPU | A small language model writes the answer from the retrieved passages, with citations, and will refuse when the document does not contain the answer. |

A device that can only do the first tier still gets a working app. Nothing is
all-or-nothing.

---

## Running it

It is a static site. Any of these work:

```
# locally
python3 -m http.server 8000        # then http://localhost:8000

# GitHub Pages
push this folder, enable Pages, done — .nojekyll is already here

# Vercel
vercel deploy                      # vercel.json sets COOP/COEP for WASM threads
```

Your hosting bandwidth is about **60 KB** — the shell, and nothing else. The four
libraries come from jsDelivr at exactly pinned versions, and the model weights stream
from the Hugging Face CDN on first use. Both are cached by the browser afterwards.

`localhost` and `https://` both count as secure origins, which is what WebGPU
requires. A bare `http://192.168.x.x` does **not**, and on such an address the writer
tier silently disappears while the first two keep working.

### Where the libraries come from

`vendor.json` pins pdf.js, mammoth, transformers.js and WebLLM to exact versions and
records the SHA-256 of the bytes this app was tested against. By default they load
from jsDelivr at those URLs.

Nothing about your document is involved in that. A request for a library tells the CDN
your IP address; it does not tell it that you opened a file, let alone which one. The
document is read by JavaScript already running in your tab and never crosses the
network in any form.

If that is still too much — and in a plant that is a reasonable position — run:

```
python3 get-vendor.py            # 2.9 MB: the parsers and the embedding runtime
python3 get-vendor.py --all      # 9.5 MB: WebLLM too
python3 get-vendor.py --verify   # check what is already on disk
```

Every file is checksummed against `vendor.json` before it is written. The script
writes `vendor/manifest.json`; from then on the app resolves everything locally and
the device report says **libraries: self-hosted** instead of *jsdelivr*.

On a CDN deployment you will see exactly one `404` in the console, for
`vendor/manifest.json`. That is this check working — the file only exists if someone
ran the script.

### Fully offline first load, if you need it

Two more pieces, both gitignored, both probed for once and silently skipped if absent:

- the embedding model in `models/Xenova/bge-small-en-v1.5/`
- the ONNX Runtime WebAssembly in `vendor/ort/`

With those, `get-vendor.py --all`, and the app itself, nothing reaches the internet on
any load, including the first.

### After you edit the app

The service worker serves same-origin files cache-first, so bump `VERSION` in `sw.js`
when you change `app.js` or `index.html`. Otherwise returning visitors keep the old
copy until they clear storage.

---

## What is measured, on an emulated Pixel 7

- 378-page Word document (617,000 characters) → **1,018 passages in 1.8 s**
- 7-page financial PDF → 59 passages in 1.0 s
- Question embedded in **35–70 ms**, whole-document search in **under a millisecond**
- Offline reload restores the document from IndexedDB and answers with no network
- Zero external requests once the models are cached — verified by logging every
  request the page makes

---

## Honest limitations

- **Scanned PDFs give nothing.** No text layer, no answers. The app detects this and
  says so rather than returning silence. OCR is not included; on a phone it would be
  slower than the rest of the pipeline combined.
- **Dense tables read badly.** A financial PDF becomes a wall of numbers with no
  sentence structure. Retrieval still lands in the right region, but the quoted answer
  looks like what it is — a spreadsheet flattened into text.
- **Large documents take a minute.** A thousand passages must each be read by the
  embedding model. Once only, then it is cached.
- **The writer is a 0.3–1 B parameter model.** It reads a few retrieved passages and
  writes three sentences. It cannot reason, and it should not be asked to.
- **iPhones will not run the writer.** Safari caps tab memory below what the weights
  need. The first two tiers work.
- **English embeddings.** Hindi or Marathi questions will retrieve poorly.
- **The writer tier is untested by me end to end** — the sandbox this was built in has
  no GPU and blocks browser network access, so the WebLLM path is written carefully
  and fails visibly, but you should confirm it on the handset you plan to use.

---

## How it works

```
file → pdf.js / mammoth → heading-aware chunks → embeddings (worker)
                                                        ↓
        answer  ←  sentence re-ranking  ←  dense + BM25, fused by RRF
```

- **Chunking** follows headings, carries the heading trail into the vector, and never
  lets overlap cross a section boundary — otherwise a citation points at the wrong
  place. PDFs get headings inferred from font size, ignoring lines that are mostly
  digits, because in a table the biggest text on the page is often a row of figures.
- **Retrieval** fuses dense cosine and BM25 with reciprocal rank fusion, then caps how
  many passages may come from one section so a single verbose section cannot fill the
  context.
- **Answers** are rendered instantly from lexical scoring, then quietly re-ranked by
  the embedding model — so the phone never looks stuck, and the final quote is the one
  closest in meaning to the question.
- **Workers** keep every matrix multiply off the main thread. This is the difference
  between a usable phone UI and a frozen one.

## Files

```
index.html            shell and mobile-first CSS
app.js                parsing, chunking, search, answers, UI
vendor.json           the four libraries: pinned versions, CDN URLs, SHA-256
vendor.js             resolves each one — self-hosted copy if present, else CDN
get-vendor.py         downloads and checksums them into vendor/ for air-gapped use
worker-embed.js       transformers.js embedding model
worker-llm.js         WebLLM engine host
sw.js                 service worker: installable, offline after first load
qa-subpath.js         Playwright suite that drives the site as GitHub Pages serves it
vendor/               only if you ran get-vendor.py — gitignored
```

## Testing it the way it will be deployed

Pocket RAG is served from `/simulator/pocket-rag/`, not from an origin root, and a
root-absolute URL is invisible until it is deployed. So the suite serves the whole
repository under a path prefix and drives it there:

```
python3 ../tools/serve-subpath.py --quiet &
node qa-subpath.js
```

It runs the app twice — once with self-hosted libraries and once with them resolved
to jsDelivr — checks the service worker's scope, cuts the network and reloads to
confirm the document comes back from IndexedDB, and fails on any console error or any
request to an origin it did not expect.
