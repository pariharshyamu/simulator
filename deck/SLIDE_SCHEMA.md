# SLIDE JSON SCHEMA — you must emit valid JSON matching one of these layouts exactly

Emit a JSON **array** of slide objects. Every object has:
`{"layout":"<one of below>", "block":"<block name>", "time":"<H:MM>", "title":"...", "subtitle":"...", "notes":"..."}`
plus the layout-specific fields. `subtitle` is optional but strongly recommended.
Do NOT include an `n` field — numbering is assigned at assembly.

`notes` is the speaker script for that slide: 90–220 words, written as instructions to the presenter.
Start it with `[H:MM–H:MM] `. Include a line to say aloud, a question to ask the room where useful,
and the point the slide must land. Use `[LAB]` at the start of a note when the slide hands over to the
simulation lab. Never use emojis.

## Layouts

**cards** — 4, 6 or 8 tiles. `"cards": [["Card title","Card body 15–35 words"], ...]`, optional `"punch":"one bold line"`.

**bullets-icon** — 4 numbered rows. `"items": [["1","Bold heading","Description 15–30 words"], ...]` (exactly 4).

**process** — 4 sequential steps. `"steps": [["1","Step name","Body 20–40 words"], ...]` (exactly 4), optional `"punch"`.

**two-col-list** — two lists side by side. `"leftTitle","left":[...5-6 strings...],"rightTitle","right":[...5-6 strings...]`, optional `"punch"`.

**compare** — paired rows. `"compare":{"leftTitle":"...","rightTitle":"...","rows":[["left cell","right cell"], ...6 rows]}`, `"punch"` required. The LAST row is highlighted, so put the strongest contrast there.

**bignumber-compare** — two big panels. `"left":{"label":"...","value":"short punchy phrase","detail":"35–60 words"}, "right":{...same...}, "punch":"..."`.

**table** — one 4-column table. `"table":{"head":["a","b","c","d"],"rows":[[...],[...],[...]]}` (3–4 rows only, cells short), optional `"punch"`.

**table-stat** — table plus a dark statistic card. `"table":{"head":[4 or 5 headers],"rows":[up to 8 rows]}, "stat":"₹56 cr", "statLabel":"12–20 words"`.

**econ** — 5-column money table plus stat. `"econ":{"head":[5 headers],"rows":[3-4 rows]}, "stat":"...", "statLabel":"...", "punch":"..."`.

**case** — equipment case study. `"case":{"detects":[6-7 strings],"signals":[5-6 strings],"lead":"...","maturity":"Proven|Emerging|Experimental (+short qualifier)","caution":"25–45 words"}`.

**maturity** — honesty table. `"maturity":[["Application","How it works, 10–18 words","Proven|Emerging|Experimental — short qualifier"], ...6-7 rows]`, `"punch"` required.

**warn** — risk list. `"warnings":[["Short label ≤22 chars","20–40 word explanation"], ...5 rows]`, `"never":"Never use ... for: a · b · c · d"`.

**fails** — failure/countermeasure pairs. `"fails":[["What went wrong ≤45 chars","What prevents it ≤60 chars"], ...8 rows]`, `"punch"` required.

**boundary** — safety layers plus cyber cards. `"layers":[["Never","text","no"],["Only with controls","text","care"],["Freely","text","yes"]], "cyber":[[ "Short title","30–45 words"], ...5 cards]`.

**loop** — 5-stage cycle. `"loop":[["Stage name","20–35 word body"], ...5]`, `"punch"` required.

**mockup** — a screen. `"mockup":{"header":"Unit 4 · … · 14:20","rows":[["Label","Value / message","warn|info|action|value"], ...6]}, "punch"`.

**pfcurve** — descending detection ladder. `"points":[["Technique","What it sees","Warning time"], ...8 rows]`.

**chart-text** — line chart plus 4 notes. `"chart":{"type":"line","title":"...","categories":[8 short labels],"series":[{"name":"...","values":[8 numbers]},{"name":"...","values":[8 numbers]}]}, "items":[4 strings], "punch"`.

**pilot** — pilot chooser. `"criteria":[7 short strings], "candidates":[["Pilot","High|Medium","Low|High","Verdict"], ...6], "plan":[["Days 1–30","what happens","who owns it"], ...3]`.

**venn** — AI/ML/DL. `"rings":[["Artificial Intelligence","body"],["Machine Learning","body"],["Deep Learning","body"]], "aside":["Generative AI","body"]`. Use once only.

**lab** — hands-on handover slide. `"lab":{"id":"SIM-3","name":"Auxiliary power optimiser","mins":10,"do":[4-6 numbered instruction strings],"see":[3-4 strings — what they should observe],"why":"25–45 words on the teaching point"}`.

**agenda** — day plan. `"agenda":[["1","Session name","10:00–11:10"], ...], "stat":"...", "statLabel":"..."` — NO `fleet` field, that layout element has been removed.

**title** / **close** — assembly handles these; do not emit them.

## Hard rules
- British/Indian English. No emojis. Plant vocabulary. kcal/kWh, MU, ₹ lakh/crore, mmWC, mg/Nm³.
- Every plant number must come from `JUNE2026_DATA_BRIEF.md`. Nothing invented.
- Do NOT write a "why now" motivational slide and do NOT write a "who is in the room" slide — the host has removed both.
- Never imply AI replaces the engineer or belongs in protection systems.
- Keep card and table cell text SHORT — this is a projected slide, not a document. Long prose belongs in `notes`.
- Output ONLY the JSON array. No markdown fence, no commentary.
