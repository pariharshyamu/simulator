# AI for Power Plants — simulators, teaching artefacts and a local RAG bench

### → **[pariharshyamu.github.io/simulator](https://pariharshyamu.github.io/simulator/)**

Working software written for a one-day session at the **MAHAGENCO Training Centre,
Nashik**, for engineers from Nashik (3×210 MW), Koradi (3×660 MW), Khaperkheda
(2×500 and 4×210 MW), Bhusawal (2×660 MW) and Paras (2×250 MW).

Everything here runs in a browser. Nothing calls an API. Every number on every screen
is computed on the machine in front of you, from data that is in this repository.

Presenter and author: **S. H. Parihar** — 16 years in the power sector; author of
*Lean AI*, *Learn the English that AI Understands*, and *AI for Busy Parents*.

---

## The artefacts

| | What it is | Open it |
|---|---|---|
| **Algorithm Anatomy Theatre** | Six 3-D animated modules that open up the machinery of k-NN, PCA, gradient descent, a neural network, retrieval and k-means. One real reading — an ID fan bearing at 74.2 °C — is followed through all six. | `dist/MAHAGENCO_Algorithm_Theatre.html` |
| **Predictive Maintenance Simulator** | The full pipeline from sensor to signed work order, in eight stages across five equipment cases, with a 3-D model of the machine that degrades as you scrub through a full year. | `dist/MAHAGENCO_PdM_Simulator.html` |
| **AI Simulation Lab** | Eight self-contained models built on the plant's own June 2026 figures — heat rate decomposition, auxiliary power, mill scheduling, anomaly detection and more. | `dist/MAHAGENCO_AI_Simulation_Lab.html` |
| **Local RAG Bench** | A retrieval-augmented generation system with a **real** ONNX embedding model and an optional local language model, running entirely in the browser on WebGPU. Air-gapped after the first fetch. | `rag-bench/` — see its own README |
| **Model Builder** | Drag-and-drop blocks that build and train a real neural network, in the browser, in about a second — on the same year of synthetic data the simulator uses, or on a historian export you drop in. A live panel writes the same model out as pandas and Keras. | `dist/MAHAGENCO_Model_Builder.html` |
| **Pocket RAG** | The same idea with no curated corpus and no server at all: **you** open a PDF or Word file on your phone, and it is parsed, chunked, embedded, searched and answered on the device. A static site for GitHub Pages or Vercel; installs as a PWA and works in flight mode. | `pocket-rag/` — see its own README |

The first three are single HTML files. Double-click and they run — no server, no
install, no network. The RAG bench is the exception: it loads WebAssembly and ES
modules, so it has to be served over http, and it ships with a launcher that does that.

Everything except the RAG bench is live at
**[pariharshyamu.github.io/simulator](https://pariharshyamu.github.io/simulator/)**.
The bench needs several hundred megabytes of model weights that are not in this
repository, so it stays a clone-and-run affair.

**On Android phones:** run the bench with `python serve.py --lan` and the retrieval
side works over the local Wi-Fi — measured on 412 px and 320 px screens. Generation
does not, and cannot: browsers only grant WebGPU on a secure origin, and a bare
`http://` LAN address is not one. See `rag-bench/README.md` for the measurements.

---

## Layout

```
index.html            the landing page GitHub Pages serves
dist/                 the built artefacts — open these
theatre/              source for the Algorithm Anatomy Theatre  (9 files)
pdm-simulator/        source for the predictive-maintenance simulator
lab/                  source for the simulation lab
rag-bench/            the local WebGPU RAG bench (its own README inside)
pocket-rag/           the on-device PWA: open your own document on a phone
deck/                 slides.json and the pptxgenjs generator for the 118-slide deck
course/               the 378-page course material, the handouts, and the June 2026 data
docs/                 screenshots
vendor/               three.js, bundled as a global for inlining
tools/build.js        assembles dist/ from source
tools/prepublish.js   the gate — nothing is published until this exits 0
tools/serve-subpath.py serves the repo under /simulator/, the way Pages does
THIRD-PARTY.md        every library, version and licence
```

## Building

```
node tools/build.js              # all four HTML artefacts
node tools/build.js builder      # just the Model Builder
node tools/build.js theatre      # just one
```

The build is a concatenation: each shell HTML has `__THREE__`, `__APP__` (or
`__MODULES__` / `__SCRIPTS__` / `__STATIONS__`) placeholders, and the script fills
them and writes a single self-contained file. Two of the three reproduce the shipped
artefacts byte for byte.

For the deck: `node deck/build_deck.js` (needs `npm i pptxgenjs`).

QA scripts live beside each artefact — `node theatre/qa-screenshots.js` and friends
drive the built file through Playwright, capture every state, and fail on any console
error. They expect the built file in the working directory.

`node builder/qa-builder.js` checks that the Model Builder still teaches what the
handout says. It trains three models and asserts the behaviour, not the pixels: a
season-spanning window must stay honest before the fault, a winter-only window must
run several times its own alert band wrong in summer, and a window containing the
fault must detect it far later than a clean one. It also drives a semicolon-separated
export with decimal commas and `I/O Timeout` strings through the CSV reader.

`node pdm-simulator/qa-geometry.js` is a different kind of test: it checks the
**mechanics**, in world space, rather than the picture. For every rotating part it
measures the world direction of the part's own axis before and after animating, and
fails if that direction moves — a part that is tumbling rather than turning looks
perfectly correct in a screenshot and is obvious only in motion. It also asserts that
the transformer never moves at all, that each machine's cut-away actually faces the
camera (measured from the vertices, not from the angle arithmetic), and that every
sensor dot sits on the geometry it names.

## Before publishing

```
node tools/prepublish.js            # ~2 s
node tools/prepublish.js --full     # ...and drive the deployed site in a browser
```

The gate is made of checks that have each already caught something real in this
repository, so none of them is theatre:

| | What it stops |
|---|---|
| **secrets** | GitHub push protection once rejected a push of this repo over a 32-character alphanumeric literal *inside a minified bundle*. A false positive still blocks a push, so the gate looks for what the scanner looks for — and that is why Pocket RAG's libraries are pinned in `vendor.json` and fetched, rather than committed. |
| **weight** | model weights, logs, `node_modules`, anything over 25 MB, anything both gitignored and tracked. |
| **subpath** | the site is served from `/simulator/`, not `/`. One root-absolute `src="/…"` works perfectly on localhost and 404s only once deployed. Also checks the web app manifest's `start_url` and `scope`. |
| **assets** | every relative reference resolves to a file that exists. |
| **worker** | the service worker's precache list must be true, or install fails silently and the PWA is quietly not offline-capable. |
| **libraries** | every CDN URL pinned to an exact version, with a SHA-256 and a byte count. |
| **privacy** | no container paths, no unreviewed addresses. Findings a human has looked at and accepted live in an allowlist that has to state *why*. |
| **attribution** | `THIRD-PARTY.md` must name every library, and every version pinned in `vendor.json` must appear in it. |
| **Pages** | `.nojekyll`, a root `index.html`, no filenames a static host will mangle, and nothing depending on cross-origin isolation — which Pages cannot provide. |
| **reproducibility** | the three shipped artefacts must rebuild byte-identically from source. |

`--full` additionally serves the repository under `/simulator/` and drives the landing
page, all three artefacts and Pocket RAG — twice, once with self-hosted libraries and
once resolved to the CDN — through Playwright.

---

## About the data

`course/june2026.json` and `course/JUNE2026_DATA_BRIEF.md` hold station-by-station
figures for June 2026 — availability, PLF, net and gross heat rate against MERC norms,
auxiliary power, secondary fuel oil, as-fired GCV, transit loss and variable cost.
They come from the MAHAGENCO June-2026 energy bill, the provisional Part-I FSA bill
including the F10 ECR calculation, and the MERC merit-order dispatch stack for
July 2026. The source document is `course/fuel_june2026.pdf`.

One finding from that data runs through the whole course, and it is worth stating here
because it is easy to get wrong:

> **Net heat rate already contains auxiliary power.** Decompose it and Nashik's boiler
> and turbine are *beating* the norm — 2,440 against 2,458 kcal/kWh gross — while the
> entire 50 kcal/kWh penalty comes from auxiliary consumption at 12.96% against a norm
> of 10.75%. Koradi 8-10 is the mirror image: a genuine 176 kcal/kWh thermodynamic gap.
> The two effects overlap by construction, so **the ₹56.35 crore heat-rate gap and the
> ₹32.91 crore auxiliary excess must never be added together.**

The fan data inside the Theatre and the PdM simulator is **synthetic** — generated from
a physical model of an ID fan with a bearing degradation injected on a known day,
because a teaching artefact needs a fault whose true onset date is known exactly. It is
labelled as synthetic wherever it appears. The plant economics, tag numbers, limits and
documents around it are drawn from real practice.

---

## Honest notes

- The 41 "plant documents" in the RAG corpus are a realistic sample written for
  teaching, not an export of a real EAM system.
- The industry references in the course material are graded by evidence, and say so
  plainly where a published claim omits thermal generation or where no quantified
  public result exists.
- Retrieval quality in the RAG bench is measured, not asserted: 31 questions with gold
  chunks marked by hand, recall@5 of 84% dense, 84% keyword, 90% hybrid.
- WebGPU code paths in the RAG bench were written with a CPU fallback but tested only
  on the CPU path — rehearse on the machine you will present from.
