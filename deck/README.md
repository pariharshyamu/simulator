# The deck

`slides.json` holds all 117 slides as data — layout name plus content — and
`build_deck.js` renders them with pptxgenjs into a 13.33 × 7.5 inch deck with speaker
notes on every slide.

```
npm i pptxgenjs
node build_deck.js
```

The generator is a small layout engine rather than a template: about thirty layouts
(`flow`, `neuralnet`, `pfcurve`, `bignumber-compare`, `maturity`, `venn`, …), a table
renderer that sizes columns so no column ever splits a word, and height estimation so
a callout never lands on top of a table.

`SLIDE_PLAN.md` is the running order; `SLIDE_SCHEMA.md` documents every layout and the
fields it takes.
