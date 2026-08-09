# Algorithm Anatomy Theatre — source

Six 3-D modules, each opening up one algorithm between input and output. One reading —
ID fan A drive-end bearing, `0-FN-201-TE-03`, **74.2 °C on day 96** — is followed
through all six, and each module's headline number is what that algorithm makes of it.

| File | Module |
|---|---|
| `th_core.js` | utilities, the specimen, the 140-day synthetic dataset, the `TH3` three.js engine, the 2-D chart helper |
| `th_m1.js` | k-nearest neighbours — the residual made geometric, and a rolling retrain window that destroys it |
| `th_m2.js` | PCA — the plane of normal operation, the Q statistic, and why a reading inside every limit can still be impossible |
| `th_m3.js` | gradient descent on a real loss surface from the fan data, plus a non-convex one |
| `th_m4.js` | a neural network with 163 parameters, trained in the browser, opened one neuron at a time |
| `th_m5.js` | retrieval — documents as directions, cosine as angle, and where agents stop |
| `th_m6.js` | k-means over operating regimes, and the days of warning that regime-specific limits buy |
| `th_boot.js` | the overview scene and the player: module rail, acts, timeline, panel |
| `th_shell.html` | layout and CSS |

Build with `node ../tools/build.js theatre`. Verify with `node qa-screenshots.js`,
which needs `dist/MAHAGENCO_Algorithm_Theatre.html` in the working directory.

Keyboard: space plays or pauses, ← → step through acts, 1–7 select modules.
