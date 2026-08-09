# AI SIMULATION LAB — module specification
Single self-contained HTML file, opens offline in any browser on a training-centre laptop.
File name: `MAHAGENCO_AI_Simulation_Lab.html`. No internet, no install, no login.
All models run in the browser in plain JavaScript — these are real algorithms on realistic data,
not animations.

| ID | Module | Pain point it addresses | Algorithm actually running |
|---|---|---|---|
| SIM-1 | Residual Anomaly Detection — ID fan bearing | Forced outages, late alarms | k-nearest-neighbour similarity model (MSET family) on a healthy-history memory matrix; residual + persistence logic |
| SIM-2 | Heat Rate Loss Attribution | Rs 56 crore/month net heat-rate gap | Gross/net decomposition, sensitivity-weighted loss allocation, live rupee arithmetic on real June 2026 data |
| SIM-3 | Auxiliary Power Optimiser | 81.5 MU/month above norm, Rs 33 crore | Exhaustive/greedy combinatorial search over mill, fan, CW pump and ESP field configurations with constraint checking |
| SIM-4 | Coal GCV Soft Sensor | GCV loss 619–941 kcal/kg, as-fired spread 2,733–3,270 | Ridge regression trained live by gradient descent, with train/test split and honest error reporting |
| SIM-5 | Predictive Maintenance and RUL | Rs 100.87 crore AFC disallowance | Exponential degradation model with Bayesian-style parameter update; P–F interval and availability economics |
| SIM-6 | Combustion Multi-Objective Optimiser | Koradi 8-10 gross HR gap 176 kcal/kWh | Response-surface model plus weighted-sum optimiser with hard clamps and rate limits |
| SIM-7 | RAG over plant documents | Knowledge loss, slow precedent search | Real TF-IDF retrieval with cosine similarity over an indexed plant-document corpus, citation rendering, grounded-vs-ungrounded toggle |
| SIM-8 | Agentic AI work-order assistant | Manual triage, slow response | Multi-step planner with simulated tool calls (historian, CMMS, performance model), visible trace, human approval gate |

## Teaching intent per module
- SIM-1 — prove that a residual sees a fault weeks before a fixed threshold, and that the model must be trained on genuinely healthy history. Includes a "train on faulty data" toggle that visibly destroys detection.
- SIM-2 — show that the net heat-rate gap decomposes into auxiliary power and boiler/turbine, and that the answer differs by station. Nashik's whole penalty is auxiliary; Koradi 8-10's is boiler/turbine.
- SIM-3 — show that auxiliary power is a combinatorial scheduling problem a computer solves better than habit.
- SIM-4 — show what a soft sensor is, that it is trained on lab results, and that its error must be reported honestly.
- SIM-5 — connect a degradation curve to the AFC disallowance the company actually paid.
- SIM-6 — show that combustion optimisation is a trade-off surface, not a single best answer, and that clamps and rate limits are the engineering that makes it safe.
- SIM-7 — show the difference between an ungrounded chatbot answer and a retrieval-grounded answer with citations.
- SIM-8 — show what an agent is: a planner that calls tools, and why the human approval gate is not optional.

## Design rules
- Palette matches the deck: graphite `#1C2530`, ember `#D96A16`, teal `#11707F`, paper `#FFFFFF`, soft `#F1F4F7`.
- Every module has: a one-line problem statement, live controls, a chart or table that updates, and a rupee figure.
- Every module has a "What just happened" explainer panel written for an engineer, not a data scientist.
- Every module states its own limitations.
- Works at 1366x768 (typical training-centre projector and laptop).
