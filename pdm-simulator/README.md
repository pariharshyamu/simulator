# Predictive Maintenance Simulator — source

Eight stages from raw sensor to signed work order, over five equipment cases
(ID fan, motor, mill, boiler feed pump, transformer), with a 3-D model of the machine
that vibrates and heats as the fault develops across 200 simulated days.

| File | What is in it |
|---|---|
| `pdm_core.js` | station economics, fault profiles, sensor generation, data pathologies, residualisation, and the five model families (threshold, CUSUM, k-NN, PCA, ridge) with an honest evaluation that counts false alarms on a healthy sister machine |
| `pdm_3d.js` | the three.js scene: rotor, mill and transformer builders, custom orbit, projected HTML labels |
| `pdm_stages.js` | chart helpers, feature engineering, and the shared compute |
| `pdm_stages2.js` | the eight stage renderers and the boot sequence |
| `pdm_shell.html` | layout and CSS |

Build with `node ../tools/build.js pdm`. Verify with `node qa-screenshots.js`.

The threshold sweep searches both the alarm level **and** the persistence requirement,
because sweeping only the level is how a detector gets reported as better than it is.
