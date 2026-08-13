# The Koradi deck

`AI in Power Plant: From Data to Decisions` — the one-day internal faculty
programme at Koradi TPS (3×660 MW). 82 slides, 7 blocks, 6 labs, full timed
speaker notes.

The deck is authored as data: `make_slides.py` writes `slides.json`, and
`build_deck.js` (a patched copy of `../deck/build_deck.js` — different output
name, presenter and close-slide footer; per-slide chart axes instead of the
Nashik deck's baked-in bearing axis) renders the .pptx.

    python3 make_slides.py
    npm i pptxgenjs        # or reuse ../deck/node_modules
    node build_deck.js

The participant document is `../course/koradi_course_material.md`, built into
dist/ by `../tools/build_docs.py` alongside nothing else — it replaced the
Nashik-era downloads in August 2026.

Every plant number is from the June 2026 energy bill (`../course/june2026.json`);
the machine data in the labs is the simulators' synthetic year, presented as
such. The SafetyNet figures are from github.com/pariharshyamu/Safetynet.
