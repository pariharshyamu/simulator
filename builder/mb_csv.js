/* =========================================================================
   Reading a real historian export.

   The network in this artefact is 150 lines. This file is here because the
   part that actually decides whether an engineer gets anywhere with their
   own data is not the network — it is this. A PI or DCS export arrives wide
   or long, with timestamps in whichever format the exporting machine's
   locale produced, decimal commas, thousands separators, and the words
   Bad, Shutdown, I/O Timeout, Pt Created, Over Range and Arc Off-line
   sitting in columns that are otherwise numeric.

   Nothing here leaves the browser. The file is read by FileReader and the
   text never crosses the network — same rule as Pocket RAG, and for the
   same reason: this is plant data.
   ========================================================================= */
'use strict';

/* Strings a historian writes into a numeric column when it has no number.
   They are not missing data in the "sensor was offline" sense — each one
   means something different, and a model that silently coerces them to zero
   will learn that a shutdown is a very cold bearing. */
const BAD_VALUES = /^(bad|bad ?input|no ?data|shutdown|shut ?down|off|offline|off-line|arc ?off-?line|i\/?o ?timeout|timeout|comm ?fail|failed|pt ?created|configure|over ?range|under ?range|calc ?failed|scan ?off|manual|nan|null|n\/?a|-{1,3}|\?+)$/i;

function splitCSV(line, sep){
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++){
    const ch = line[i];
    if (q){
      if (ch === '"'){ if (line[i+1] === '"'){ cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep){ out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function sniffSep(head){
  const cands = [',', ';', '\t', '|'];
  let best = ',', bestN = 0;
  for (const s of cands){
    const counts = head.slice(0, 5).map(l => splitCSV(l, s).length);
    const n = Math.min(...counts);
    if (n > bestN && counts.every(c => c === counts[0])) { bestN = n; best = s; }
  }
  return { sep: best, cols: bestN };
}

/* Numbers, allowing 1 234,56 and 1,234.56 and 1.234,56 */
function toNum(raw){
  if (raw == null) return NaN;
  let s = String(raw).trim();
  if (!s || BAD_VALUES.test(s)) return NaN;
  s = s.replace(/\s|'/g, '');
  const lastC = s.lastIndexOf(','), lastD = s.lastIndexOf('.');
  if (lastC > -1 && lastD > -1){
    if (lastC > lastD) s = s.replace(/\./g, '').replace(',', '.');   // 1.234,56
    else s = s.replace(/,/g, '');                                     // 1,234.56
  } else if (lastC > -1){
    s = (s.length - lastC - 1) === 3 && /^\d{1,3}(,\d{3})+$/.test(s)
        ? s.replace(/,/g, '') : s.replace(',', '.');
  }
  const v = parseFloat(s);
  return isFinite(v) ? v : NaN;
}

/* Timestamps: ISO, dd/mm/yyyy, mm/dd/yyyy, dd-mmm-yy, with or without seconds.
   Ambiguous day/month is resolved by looking at the whole column — if any
   first field exceeds 12 the format is day-first. */
function parseTimeColumn(vals){
  const iso = v => { const t = Date.parse(v); return isFinite(t) ? t : NaN; };
  let dayFirst = false;
  for (const v of vals){
    const m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/.exec(v || '');
    if (m && +m[1] > 12){ dayFirst = true; break; }
  }
  const out = new Float64Array(vals.length);
  let ok = 0;
  for (let i = 0; i < vals.length; i++){
    const v = (vals[i] || '').trim();
    let t = NaN;
    const m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})[ T]?(\d{1,2})?:?(\d{2})?:?(\d{2})?/.exec(v);
    if (m){
      let dd = +m[1], mm = +m[2];
      if (!dayFirst){ const s = dd; dd = mm; mm = s; }
      let yy = +m[3]; if (yy < 100) yy += yy < 70 ? 2000 : 1900;
      t = Date.UTC(yy, mm - 1, dd, +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    } else t = iso(v);
    out[i] = t; if (isFinite(t)) ok++;
  }
  return { t: out, ok: ok / Math.max(1, vals.length), dayFirst };
}

function parseHistorianCSV(text){
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if (lines.length < 3) throw new Error('That file has fewer than three lines.');
  const { sep } = sniffSep(lines);
  let rows = lines.map(l => splitCSV(l, sep));

  /* Some exports put a title line or a units line above the header. Take the
     first row whose cells are mostly non-numeric and mostly distinct. */
  let hdrIx = 0;
  for (let i = 0; i < Math.min(6, rows.length); i++){
    const r = rows[i], nonNum = r.filter(c => c && isNaN(toNum(c))).length;
    if (nonNum >= Math.max(2, r.length * 0.6) && new Set(r).size === r.length){ hdrIx = i; break; }
  }
  const header = rows[hdrIx].map((h, i) => h || `column ${i+1}`);
  rows = rows.slice(hdrIx + 1).filter(r => r.length === header.length);
  if (!rows.length) throw new Error('No data rows under the header.');

  /* which column is time? the one that parses best */
  let tCol = -1, tBest = 0, tInfo = null;
  for (let c = 0; c < header.length; c++){
    const info = parseTimeColumn(rows.slice(0, Math.min(300, rows.length)).map(r => r[c]));
    if (info.ok > tBest && info.ok > 0.8){ tBest = info.ok; tCol = c; tInfo = info; }
  }

  /* long format: timestamp, tagname, value */
  const nameCol = header.findIndex(h => /^(tag|tagname|point|pointname|name|descriptor)$/i.test(h));
  const valCol  = header.findIndex(h => /^(value|val|reading|data)$/i.test(h));
  let tags = [], stamps = null, layout = 'wide';

  if (tCol > -1 && nameCol > -1 && valCol > -1){
    layout = 'long';
    const byTag = new Map();
    for (const r of rows){
      const nm = r[nameCol]; if (!nm) continue;
      if (!byTag.has(nm)) byTag.set(nm, []);
      byTag.get(nm).push(toNum(r[valCol]));
    }
    const len = Math.max(...[...byTag.values()].map(a => a.length));
    tags = [...byTag.entries()].map(([nm, a]) => ({
      id: nm, name: nm, unit: '', have: true,
      v: Float64Array.from({length: len}, (_, i) => a[i] ?? NaN)
    }));
    stamps = null;
  } else {
    const info = tCol > -1 ? parseTimeColumn(rows.map(r => r[tCol])) : null;
    stamps = info ? info.t : null;
    for (let c = 0; c < header.length; c++){
      if (c === tCol) continue;
      const v = new Float64Array(rows.length);
      let numeric = 0, bad = 0;
      for (let i = 0; i < rows.length; i++){
        const raw = rows[i][c];
        const n = toNum(raw);
        v[i] = n;
        if (isFinite(n)) numeric++; else if (raw && BAD_VALUES.test(raw.trim())) bad++;
      }
      /* a column that is under half numbers is a comment or a status column */
      if (numeric < rows.length * 0.5) continue;
      const um = /[\(\[]\s*([^\)\]]{1,12})\s*[\)\]]\s*$/.exec(header[c]);
      tags.push({ id:`c${c}`, name: header[c].replace(/[\(\[][^\)\]]*[\)\]]\s*$/, '').trim() || header[c],
                  unit: um ? um[1] : '', have:true, v, badCount:bad });
    }
  }
  if (!tags.length) throw new Error('No column in that file is mostly numeric.');
  return { tags, stamps, layout, sep, rows: rows.length, tCol, header };
}

/* Profile before offering to train. This is the screen most people will get
   the most out of, and often the answer is "your data cannot support a
   model yet" — which is a finding, not a failure. */
function profileTags(parsed){
  const out = [];
  for (const t of parsed.tags){
    const v = t.v, n = v.length;
    let miss = 0, run = 0, maxRun = 0, prev = NaN, lo = Infinity, hi = -Infinity, s = 0, c = 0;
    for (let i = 0; i < n; i++){
      const x = v[i];
      if (!isFinite(x)){ miss++; run = 0; prev = NaN; continue; }
      if (x === prev) { run++; if (run > maxRun) maxRun = run; } else run = 0;
      prev = x;
      if (x < lo) lo = x; if (x > hi) hi = x; s += x; c++;
    }
    const m = c ? s / c : 0; let vv = 0;
    for (let i = 0; i < n; i++) if (isFinite(v[i])) vv += (v[i] - m) ** 2;
    const sd = c ? Math.sqrt(vv / c) : 0;
    let verdict = 'usable', why = '';
    if (miss / n > 0.25){ verdict = 'unusable'; why = 'more than a quarter of it is missing'; }
    else if (sd === 0){ verdict = 'unusable'; why = 'the value never changes'; }
    else if (maxRun > n * 0.1){ verdict = 'suspect'; why = `frozen for ${maxRun} readings in a row`; }
    else if (miss / n > 0.05){ verdict = 'suspect'; why = `${(100*miss/n).toFixed(0)} per cent missing`; }
    else if ((t.badCount || 0) > n * 0.02){ verdict = 'suspect'; why = `${t.badCount} status strings such as Bad or Shutdown`; }
    out.push({ ...t, n, miss, maxRun, lo, hi, mean:m, sd, verdict, why });
  }
  return out;
}

function adoptCSV(parsed, prof, fileName){
  const good = prof.filter(p => p.verdict !== 'unusable');
  MB.data = {
    name: fileName, short: fileName, station: 'your own export',
    rows: parsed.rows, hours: parsed.rows, source:'csv',
    tags: good.map(p => ({ id:p.id, name:p.name, unit:p.unit, have:true, v:p.v })),
    onset: null, alarm: null, health: null, healthName: null,
    layout: parsed.layout, profile: prof,
    blurb: `${parsed.rows.toLocaleString('en-IN')} rows, ${parsed.tags.length} numeric columns, read as a ${parsed.layout} export.`,
    mode: null
  };
  MB.csvProfile = prof;
  return MB.data;
}
