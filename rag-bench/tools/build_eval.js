/* Build a verified evaluation set: each question is paired with a distinctive
   string; the gold chunks are exactly those that contain it.  Questions whose
   string matches nothing, or matches too much, are dropped and reported. */
const fs = require('fs');
const ROOT = '..';
const chunks = JSON.parse(fs.readFileSync(ROOT + '/data/chunks.json', 'utf8'));

const CAND = [
  ['What is the tightening torque for the ID fan bearing housing bolts?', '320 Nm'],
  ['What shell crush should be set when replacing ID fan bearing shells?', '0.03–0.05 mm'],
  ['How much water was found in the ID fan A bearing oil when it was opened?', '1,240 ppm'],
  ['Which oil was the ID fan A bearing recharged with?', 'Servoprime 46'],
  ['What is the part number for the ID fan DE bearing shells and where are they held?', '3-FN-BRG-118'],
  ['What is the journal spring assembly torque on a bowl mill 803XRP?', '640 Nm'],
  ['At what metal temperature does the ID fan bearing alarm and trip?', 'Alarm at 85 °C metal temperature'],
  ['When was the ID fan A drive-end bearing thermocouple last calibrated?', '11-Feb-2026'],
  ['What water content in bearing oil must be reported to the Superintending Engineer?', '500 ppm'],
  ['Why did the ID fan A bearing keep failing between 2021 and 2023?', 'oil cooler fouling on the CW side'],
  ['What did the April 2026 thermography survey find on the unit 8 draught plant?', 'cold spot consistent with partial tube blockage'],
  ['How many alarms are configured on the unit 8 DAS and how many stand at any time?', '1,840 configured alarms'],
  ['What is the net heat rate gap at Koradi units 8 to 10 against the MERC norm?', 'Koradi Units 8-10'],
  ['What is the auxiliary power consumption at Nashik and what is the norm?', 'Nashik Units 3-5'],
  ['Which station has the worst net heat rate gap in June 2026?', 'Paras Units 3-4'],
  ['What is the monthly cost of the fleet heat rate gap against norm?', '56.35'],
  ['How many million units of auxiliary power were consumed above norm?', '81.5'],
  ['What is the difference between gross and net heat rate?', 'auxiliary'],
  ['What is the P–F curve and why does it matter for maintenance planning?', 'P–F'],
  ['What is MSET and how does it relate to nearest neighbours?', 'MSET'],
  ['Which standard covers reliability data collection for equipment?', 'ISO 14224'],
  ['Which standard covers alarm management?', 'EEMUA 191'],
  ['Which standard covers industrial cyber security for control systems?', 'IEC 62443'],
  ['What framework should we use to govern AI risk?', 'NIST AI RMF'],
  ['What does the DPDP Act mean for plant data?', 'DPDP'],
  ['What has NTPC actually implemented and what results were published?', 'NTPC'],
  ['How should we handle a rolling retrain window on a degrading machine?', 'baseline'],
  ['What is the mill outlet temperature limit and why?', 'mill fire'],
  ['What were Koradi units 8 to 10 heat rate and auxiliary figures in June 2026?', 'Koradi Units 8-10 — June 2026 performance'],
  ['What were the Nashik units 3 to 5 figures for June 2026?', 'Nashik Units 3-5 — June 2026 performance'],
  ['What were the Paras units 3 to 4 figures for June 2026?', 'Paras Units 3-4 — June 2026 performance'],
  ['What is the total fleet heat rate and auxiliary gap for June 2026?', 'thermal fleet — June 2026 totals'],
  ['Why must the heat rate gap and the auxiliary excess not be added together?', 'double-count'],
  ['What is a data diode and why would we need one?', 'data diode'],
  ['What is shadow mode and why run a model in it first?', 'shadow mode'],
  ['Which standard covers vibration measurement on rotating machines?', 'ISO 20816'],
  ['Which standard covers substation communication?', 'IEC 61850'],
  ['What has JSW Energy published about AI in its thermal plants?', 'JSW'],
  ['What is the false alarm rate and why does it decide whether a system survives?', 'false alarm rate'],
  ['What is required before opening a bearing housing?', 'zero energy'],
  ['What happened in the 2024 near miss during a fan bearing inspection?', 'barring gear key'],
];

const out = [], dropped = [];
for (const [q, must] of CAND) {
  const gold = chunks.filter(c =>
    (c.text + ' ' + (c.title || '') + ' ' + (c.crumb || '')).includes(must)).map(c => c.id);
  if (gold.length === 0) { dropped.push([q, must, 0]); continue; }
  if (gold.length > 12) { dropped.push([q, must, gold.length]); continue; }
  out.push({ q, must, gold });
}
fs.writeFileSync(ROOT + '/data/eval.json', JSON.stringify(out, null, 1));
console.log('kept', out.length, 'of', CAND.length);
out.forEach(e => console.log(String(e.gold.length).padStart(3), '|', e.must.slice(0, 34).padEnd(36), '|', e.q.slice(0, 58)));
if (dropped.length) { console.log('\nDROPPED:'); dropped.forEach(d => console.log('  ', d[2], '|', d[1], '|', d[0])); }
