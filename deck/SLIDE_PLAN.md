# SLIDE PLAN — "AI in Power Plants: From Data to Decisions"
MAHAGENCO Training Centre, Nashik · One hour · 37 slides
**Delivery: hybrid — in-person at Nashik TC, plus online participants from Koradi, Paras, Khaperkheda and Bhusawal.**

## The audience and their units (authoritative — supplied by the host)
| Station | Units | Capacity represented | Technology |
|---|---|---|---|
| Nashik TPS (Eklahare) | 3 × 210 MW (Units 3–5) | 630 MW | Subcritical, ageing (1979–81 vintage) |
| Koradi TPS | 3 × 660 MW | 1,980 MW | Supercritical |
| Khaperkheda TPS | 4 × 210 MW + 2 × 500 MW | 1,840 MW | Subcritical |
| Bhusawal TPS | 2 × 660 MW | 1,320 MW | Supercritical |
| Paras TPS | 2 × 250 MW | 500 MW | Subcritical |
| **Total in the room** | **13 units** | **≈ 6,270 MW** | Mixed |

**Consequence for the material:** every example must be scaled across the fleet, not pinned to 210 MW.
Use a **four-column economics** device throughout (210 / 250 / 500 / 660 MW) so every participant sees
their own unit. Where a topic differs between subcritical and supercritical, say so explicitly:

| Topic | Subcritical 210/250/500 (Nashik, Paras, Khaperkheda) | Supercritical 660 (Koradi, Bhusawal) |
|---|---|---|
| Drum / separator | Drum level, swell and shrink, carryover | Once-through, separator, wet-to-dry transition, minimum flow |
| Steam conditions | ~540 °C / ~150 bar | ~565–600 °C / ~250 bar — creep and oxide scale matter far more |
| Load following | Constant/modified sliding pressure | Full sliding pressure, faster ramps, tighter thermal-stress limits |
| Cycling damage | Drum and header fatigue | Thick-section header and turbine rotor fatigue, spiral/vertical waterwall |
| Chemistry | AVT / phosphate regimes | Very tight — cation conductivity limits are unforgiving; OT common |
| Heat rate band | 2,450–2,700 kcal/kWh | 2,150–2,350 kcal/kWh |

## Verified plant facts (use these, do not invent others)
- Nashik TPS (Eklahare): Units 3, 4 and 5, each 210 MW, commissioned 1979–1981. Units 1 and 2
  (140 MW each) were retired in 2011. A proposed 660 MW Unit 6 was cancelled.
- Do NOT quote a MAHAGENCO fleet-wide MW total — published sources disagree. Refer only to the
  stations named above and to the ≈ 6,270 MW represented by the audience.

## Standard worked economics (use consistently everywhere)
Basis: **PLF 65 %, as-fired GCV 3,400 kcal/kg, landed coal ₹4,000/tonne → cost of heat ₹0.001176/kcal.**

| Unit size | Annual generation @65 % PLF | Value of **1 kcal/kWh** | Value of **10 kcal/kWh** | Coal saved @10 kcal/kWh |
|---|---|---|---|---|
| 210 MW | 1.196 million MWh | ₹14.1 lakh/yr | **₹1.41 crore/yr** | 3,517 t/yr |
| 250 MW | 1.424 million MWh | ₹16.7 lakh/yr | **₹1.67 crore/yr** | 4,187 t/yr |
| 500 MW | 2.847 million MWh | ₹33.5 lakh/yr | **₹3.35 crore/yr** | 8,373 t/yr |
| 660 MW | 3.758 million MWh | ₹44.2 lakh/yr | **₹4.42 crore/yr** | 11,053 t/yr |

Aggregate for the 13 units represented: **10 kcal/kWh ≈ ₹28 crore per year.**

Other standard figures:
- 0.5 percentage point cut in auxiliary power consumption ≈ ₹1.8 crore/yr on a 210 MW unit,
  ₹5.7 crore/yr on a 660 MW unit (valued at variable cost ≈ ₹3.06/kWh).
- One avoided 3-day forced outage: 15,120 MWh (210 MW) · 47,520 MWh (660 MW) not generated.
- Always label these **indicative** — each station must substitute its own PLF, heat rate, GCV and coal cost.

## Indicative heat-rate sensitivities (state as typical, not exact)
| Parameter | Subcritical 210–500 MW | Supercritical 660 MW |
|---|---|---|
| Boiler efficiency, 1 % drop | ≈ 30 kcal/kWh | ≈ 25 kcal/kWh |
| Main steam temperature, 10 °C below design | 5–8 kcal/kWh | 4–6 kcal/kWh |
| Reheat steam temperature, 10 °C below design | 4–6 kcal/kWh | 4–5 kcal/kWh |
| Condenser back pressure, 10 mmHg rise | 8–12 kcal/kWh | 7–10 kcal/kWh |
| Excess O₂, 1 % above optimum | 10–15 kcal/kWh | 8–12 kcal/kWh |
| Unburnt carbon in ash, 1 % increase | 10–15 kcal/kWh | 10–15 kcal/kWh |
| Final feedwater temperature, 5 °C below design | 4–6 kcal/kWh | 4–6 kcal/kWh |
| APH air leakage, 5 % increase | 3–5 kcal/kWh + ID fan power | 3–5 kcal/kWh + ID fan power |

## Session time map
| Block | Slides | Minutes |
|---|---|---|
| Opening | 1–3 | 3 |
| 1. Why AI + AI fundamentals | 4–10 | 11 |
| 2. Intelligent monitoring + predictive maintenance | 11–19 | 15 |
| 3. Operation & performance optimisation | 20–25 | 10 |
| 4. Generative AI as engineering assistant | 26–30 | 8 |
| 5. Computer vision & emerging applications | 31–32 | 5 |
| 6. Responsible implementation | 33–36 | 8 |
| Close & Q&A | 37 | remainder |

## Slide-by-slide
| # | Title | Purpose |
|---|---|---|
| 1 | Title slide | Speaker, venue, date, core theme |
| 2 | Session objective | What you will be able to do after 60 minutes |
| 3 | Agenda, time map and who is in the room | Roadmap + the 6,270 MW fleet table + PREDICT · DIAGNOSE · OPTIMISE · ASSIST |
| 4 | Why now — the pressure on our units | Cycling, ageing, emission norms, coal variability, retiring experience |
| 5 | You are already sitting on the asset | Data inventory, scaled 210 → 660 MW |
| 6 | What AI actually is | AI ⊃ ML ⊃ DL, and GenAI alongside — plain language |
| 7 | The one idea that matters | Expected vs actual — the residual |
| 8 | How a machine learns from your plant | Train on healthy history → predict expected → residual → alert |
| 9 | Three ways machines learn | Supervised / unsupervised / reinforcement, with plant examples |
| 10 | AI versus the alarm you already have | Comparison table |
| 11 | From fixed threshold to intelligent monitoring | The P–F curve |
| 12 | Why a fixed alarm arrives late | ID fan bearing worked example |
| 13 | Anomaly detection without the mathematics | Similarity model explained in plant language |
| 14 | Case — boiler feed pump | Bearing and seal degradation; note TDBFP on 500/660 vs MDBFP |
| 15 | Case — coal mills | Bowl mills on 210/250, larger mills on 500/660; wear, choking, fineness |
| 16 | Case — ID / FD / PA fans | Erosion, imbalance, bearing wear; axial fans on supercritical units |
| 17 | Case — transformers and switchyard | DGA, hot spot, OLTC — identical across all five stations |
| 18 | Case — HT motors | Motor current signature analysis |
| 19 | What predictive maintenance needs from you | The alert-to-work-order loop |
| 20 | Where the money is — heat rate | Controllable loss table, subcritical vs supercritical |
| 21 | Combustion optimisation | How it works, gains, closed-loop caveats |
| 22 | Condenser and vacuum | Cleanliness factor, back pressure economics |
| 23 | Auxiliary power | The second-largest controllable loss |
| 24 | Operator decision support | What an advisory looks like on screen |
| 25 | Putting a number on it | The four-column ₹ arithmetic across all five stations |
| 26 | What generative AI is — and is not | LLM in one slide |
| 27 | The plant knowledge problem | Manuals, SOPs, RCA and trip reports, retiring experts |
| 28 | RAG — grounding AI in YOUR documents | Diagram |
| 29 | Practical uses in our workflow | Shift handover, trip report, work order text, troubleshooting |
| 30 | Where it will let you down | Hallucination, and what never to trust it with |
| 31 | Computer vision in the plant | Thermal, CCTV, drones, conveyor, safety |
| 32 | Emerging applications | Acoustic, digital twin, agents, RL — with maturity ratings |
| 33 | Rule one — data quality and validation | Garbage in, confident garbage out |
| 34 | Rule two — the safety and cyber boundary | Never in protection logic; IEC 62443; read-only |
| 35 | Rule three — human in the loop | Limitations, trust calibration, why programmes fail |
| 36 | Choosing your first pilot | Scoring checklist and a 90-day plan; one pilot per station |
| 37 | Close and Q&A | PREDICT · DIAGNOSE · OPTIMISE · ASSIST + Monday action |

## Hybrid delivery rules (online participants at four stations)
- Minimum 18 pt body text on slides; 14 pt is unreadable on a laptop over a video link.
- High contrast, no thin light-grey text, no dense multi-column layouts.
- Every slide must stand alone — online attendees cannot see a laser pointer.
- Build in three explicit "over to the stations" checkpoints (after slide 10, 19 and 30) so remote
  participants are not passive for a full hour.
- Circulate the handout **before** the session so remote attendees can follow without straining.

## Tone and style rules
- Audience: MAHAGENCO O&M engineers, mixed mechanical / electrical / C&I / chemistry / operations,
  across five stations and four unit sizes. Introductory but not condescending — they know the plant
  far better than they know AI.
- British/Indian English. Rupees in lakh and crore. kcal/kWh for heat rate. No emojis.
- Every AI claim must be tied to equipment they touch daily.
- Be honest about limitations. This audience has seen technology oversold before.
- Never imply AI replaces the engineer or the protection system.
