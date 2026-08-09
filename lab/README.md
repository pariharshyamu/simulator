# AI Simulation Lab — source

Eight models built on the plant's own June 2026 figures. Unlike the Theatre and the
simulator, this one uses no synthetic data at all — every station number comes from
`course/june2026.json`, which the build injects at `__STATIONS__`.

`lab_part1.html` is the shell and navigation, `lab_mods_a/b.html` the module markup,
`lab_js_a/b.js` the model code.

Build with `node ../tools/build.js lab`.
