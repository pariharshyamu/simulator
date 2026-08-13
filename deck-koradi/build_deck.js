const pptxgen = require('pptxgenjs');
const fs = require('fs');
const D = JSON.parse(fs.readFileSync('slides.json', 'utf8'));

// ---------- palette: "Ember & Graphite" ----------
const INK = '1C2530', INK2 = '2A3644', INK3 = '3B4A5A';
const PAPER = 'FFFFFF', SOFT = 'F1F4F7', SOFT2 = 'E7ECF1';
const EMBER = 'D96A16', EMBER_BG = 'FCEDE0';
const TEAL = '11707F', TEAL_BG = 'E1EFF1';
const TXT = '1C2530', MUTED = '5C6B7A';
const RED = 'A8261E', RED_BG = 'F9E7E5';
const GRN = '256B45', GRN_BG = 'E4F0EA';
const AMB = '9A6408', AMB_BG = 'FBF0DC';

const HEAD = 'Cambria', BODY = 'Calibri';
const W = 13.333, H = 7.5;
const MX = 0.62, CW = W - 2 * MX;         // content width 12.093
const CY = 1.78, CH = 6.88 - CY;          // content top / height 5.2

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';
pres.author = 'S. H. Parihar · Koradi TPS';
pres.title = D.meta.title;

const sh = () => ({ type: 'outer', color: '9AA9B6', blur: 8, offset: 2, angle: 90, opacity: 0.22 });

function card(s, x, y, w, h, fill) {
  s.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.06, fill: { color: fill || SOFT },
    line: { color: SOFT2, width: 0.75 }, shadow: sh()
  });
}

function head(s, t) {
  const tl = (t.title || '').length;
  const tfs = tl > 74 ? 22 : (tl > 56 ? 25 : 29);
  s.addText(t.title, { x: MX, y: 0.40, w: CW, h: 0.66, fontFace: HEAD, fontSize: tfs, bold: true, color: INK, margin: 0, valign: 'middle' });
  if (t.subtitle) s.addText(t.subtitle, { x: MX, y: 1.08, w: CW, h: 0.42, fontFace: BODY, fontSize: 14.5, italic: true, color: MUTED, margin: 0, valign: 'middle' });
  s.addShape(pres.ShapeType.rect, { x: MX, y: 1.62, w: 0.9, h: 0.05, fill: { color: EMBER } });
}

function foot(s, n, block) {
  s.addText(block || '', { x: MX, y: 7.06, w: 8, h: 0.3, fontFace: BODY, fontSize: 9.5, color: 'A6B2BD', margin: 0 });
  s.addText(String(n), { x: W - 1.15, y: 7.06, w: 0.55, h: 0.3, fontFace: BODY, fontSize: 9.5, color: 'A6B2BD', align: 'right', margin: 0 });
}

function punch(s, text, y, color) {
  const yy = y === undefined ? 6.30 : y;
  s.addShape(pres.ShapeType.roundRect, { x: MX, y: yy, w: CW, h: 0.60, rectRadius: 0.05, fill: { color: color === 'red' ? RED_BG : EMBER_BG }, line: { color: color === 'red' ? RED : EMBER, width: 1 } });
  s.addText(text, { x: MX + 0.22, y: yy, w: CW - 0.44, h: 0.60, fontFace: BODY, fontSize: 13.5, bold: true, color: color === 'red' ? RED : '8A4310', valign: 'middle', margin: 0 });
}

function chip(s, x, y, w, h, label, kind, fs) {
  const map = { Proven: [GRN, GRN_BG], Emerging: [AMB, AMB_BG], Experimental: [RED, RED_BG] };
  let key = 'Proven';
  if (/Experimental/i.test(label)) key = 'Experimental';
  else if (/Emerging/i.test(label)) key = 'Emerging';
  const [c, bg] = map[kind || key];
  s.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.25, fill: { color: bg }, line: { color: c, width: 0.75 } });
  s.addText(label, { x: x + 0.08, y, w: w - 0.16, h, fontFace: BODY, fontSize: fs || 10, bold: true, color: c, align: 'center', valign: 'middle', margin: 0 });
}

function longestWord(s) { return String(s).split(/[\s\u2013\u2014/]+/).reduce((a, b) => Math.max(a, b.length), 0); }
function colWeights(head_, rows, w) {
  const n = head_.length;
  const minW = [], wt = [];
  for (let j = 0; j < n; j++) {
    let L = 0, c = 0, lw = longestWord(head_[j]);
    rows.forEach(r => { if (r[j] !== undefined) { L += String(r[j]).length; c++; lw = Math.max(lw, longestWord(r[j])); } });
    minW.push(Math.min(w / n, lw * 0.098 + 0.24));      // widest single word must fit unbroken
    wt.push(Math.max(String(head_[j]).length * 0.80, c ? L / c : 6, 8));
  }
  const floor = minW.reduce((a, b) => a + b, 0);
  const spare = Math.max(0, w - floor);
  const tot = wt.reduce((a, b) => a + b, 0);
  return minW.map((m, j) => m + spare * wt[j] / tot);
}
/* estimated rendered height of a table, so a callout can never land on top of it */
function tblHeight(head_, rows, colW, fs) {
  const cpi = 13.6 * (12.5 / fs);                    // characters per inch at this size
  const lineH = fs * 1.26 / 72, pad = 0.16;
  const rowLines = r => Math.max(...r.map((c, j) => Math.ceil(String(c).length / Math.max(4, (colW[j] - 0.18) * cpi))));
  let h = Math.max(1, rowLines(head_)) * lineH + pad;
  rows.forEach(r => { h += Math.max(1, rowLines(r)) * lineH + pad; });
  return h;
}
function tbl(s, x, y, w, head_, rows, colW, fs, rowH) {
  const size = fs || 11.5;
  const body = [[...head_.map(t => ({ text: t, options: { bold: true, color: PAPER, fill: { color: INK2 }, fontSize: size, fontFace: BODY, align: 'left' } }))]];
  rows.forEach((r, i) => body.push(r.map((c, j) => ({
    text: c, options: {
      fontSize: size, fontFace: BODY, color: TXT, fill: { color: i % 2 ? PAPER : SOFT },
      bold: j === 0, align: 'left'
    }
  }))));
  s.addTable(body, { x, y, w, colW, ...(rowH ? { rowH } : {}), border: { type: 'solid', color: 'D6DEE6', pt: 0.5 }, autoPage: false, valign: 'middle', margin: [7, 8, 7, 8] });
}

function bullets(s, x, y, w, h, items, size, color) {
  let fs = size || 13;
  const chars = items.reduce((a, b) => a + String(b).length, 0);
  const cpl = w * 8.4;                                    // characters per line at ~13 pt
  let lines = items.reduce((a, b) => a + Math.max(1, Math.ceil(String(b).length / cpl)), 0);
  let need = lines * (fs * 1.30 / 72) + items.length * 0.10;
  while (need > h && fs > 9.5) {
    fs -= 0.5;
    const c2 = w * 8.4 * (13 / fs);
    lines = items.reduce((a, b) => a + Math.max(1, Math.ceil(String(b).length / c2)), 0);
    need = lines * (fs * 1.30 / 72) + items.length * 0.09;
  }
  s.addText(items.map((t, i) => ({ text: t, options: { bullet: { characterCode: '25AA' }, breakLine: i < items.length - 1 } })),
    { x, y, w, h, fontFace: BODY, fontSize: fs, color: color || TXT, paraSpaceAfter: fs > 12 ? 7 : 5, margin: 0, valign: 'top' });
}

// ================= layouts =================
const L = {};

L.title = (s, t) => {
  s.background = { color: INK };
  s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 0.30, h: H, fill: { color: EMBER } });
  s.addText(t.title, { x: 1.15, y: 1.70, w: 7.0, h: 1.18, fontFace: HEAD, fontSize: 48, bold: true, color: PAPER, margin: 0 });
  s.addText(t.subtitle, { x: 1.15, y: 2.88, w: 7.0, h: 0.62, fontFace: HEAD, fontSize: 27, color: EMBER, margin: 0 });
  s.addText(t.kicker, { x: 1.15, y: 3.62, w: 6.9, h: 0.84, fontFace: BODY, fontSize: 13.5, color: 'B9C6D2', margin: 0 });
  s.addShape(pres.ShapeType.roundRect, { x: 1.15, y: 4.86, w: 6.9, h: 0.62, rectRadius: 0.06, fill: { color: INK2 }, line: { color: EMBER, width: 1 } });
  s.addText(t.theme, { x: 1.15, y: 4.86, w: 6.9, h: 0.62, fontFace: BODY, fontSize: 13.5, bold: true, color: EMBER, align: 'center', valign: 'middle', margin: 0, charSpacing: 1 });
  s.addText(t.footer, { x: 1.15, y: 6.30, w: 7.0, h: 0.32, fontFace: BODY, fontSize: 11.5, color: '8C9BA8', margin: 0 });
  s.addText(D.meta.mode, { x: 1.15, y: 6.62, w: 7.0, h: 0.62, fontFace: BODY, fontSize: 10, color: '65757F', margin: 0 });
  const P = D.meta.presenter;
  if (P) {
    s.addShape(pres.ShapeType.roundRect, { x: 8.42, y: 1.66, w: 3.76, h: 4.72, rectRadius: 0.08,
      fill: { color: INK2 }, line: { color: '3C4C5C', width: 1 } });
    s.addText('PRESENTER', { x: 8.74, y: 1.92, w: 3.15, h: 0.28, fontFace: BODY, fontSize: 10, bold: true, color: EMBER, charSpacing: 2, margin: 0 });
    s.addText(P.name, { x: 8.74, y: 2.24, w: 3.15, h: 0.46, fontFace: HEAD, fontSize: 26, bold: true, color: PAPER, margin: 0 });
    s.addText(P.role, { x: 8.74, y: 2.74, w: 3.15, h: 0.56, fontFace: BODY, fontSize: 11.5, color: 'A9B8C6', margin: 0 });
    s.addShape(pres.ShapeType.rect, { x: 8.74, y: 3.40, w: 3.15, h: 0.02, fill: { color: '46586A' } });
    s.addText('AUTHOR OF', { x: 8.74, y: 3.54, w: 3.15, h: 0.26, fontFace: BODY, fontSize: 9.5, bold: true, color: EMBER, charSpacing: 1.8, margin: 0 });
    P.books.forEach((b, i) => {
      const y = 3.84 + i * 0.48;
      s.addShape(pres.ShapeType.ellipse, { x: 8.76, y: y + 0.10, w: 0.11, h: 0.11, fill: { color: EMBER } });
      s.addText(b, { x: 9.02, y, w: 2.90, h: 0.44, fontFace: BODY, fontSize: 11, italic: true, color: 'DCE4EB', valign: 'middle', margin: 0 });
    });
    s.addShape(pres.ShapeType.roundRect, { x: 8.74, y: 5.44, w: 3.15, h: 0.74, rectRadius: 0.06, fill: { color: INK } });
    s.addText(P.years, { x: 8.74, y: 5.52, w: 3.15, h: 0.36, fontFace: HEAD, fontSize: 20, bold: true, color: EMBER, align: 'center', margin: 0 });
    s.addText(P.yearsLabel, { x: 8.74, y: 5.86, w: 3.15, h: 0.26, fontFace: BODY, fontSize: 9.5, color: '9BAAB8', align: 'center', margin: 0 });
  }
};

L['bullets-icon'] = (s, t) => {
  head(s, t); foot(s, t.n, t.block);
  const n = t.items.length, gap = 0.22, hh = (CH - (n - 1) * gap) / n;
  t.items.forEach((it, i) => {
    const y = CY + i * (hh + gap);
    card(s, MX, y, CW, hh, PAPER);
    s.addShape(pres.ShapeType.ellipse, { x: MX + 0.26, y: y + (hh - 0.62) / 2, w: 0.62, h: 0.62, fill: { color: EMBER } });
    s.addText(it[0], { x: MX + 0.26, y: y + (hh - 0.62) / 2, w: 0.62, h: 0.62, fontFace: HEAD, fontSize: 22, bold: true, color: PAPER, align: 'center', valign: 'middle', margin: 0 });
    s.addText(it[1], { x: MX + 1.10, y: y + 0.16, w: CW - 1.5, h: 0.42, fontFace: BODY, fontSize: 17, bold: true, color: INK, margin: 0, valign: 'middle' });
    s.addText(it[2], { x: MX + 1.10, y: y + 0.58, w: CW - 1.5, h: hh - 0.72, fontFace: BODY, fontSize: 13.5, color: MUTED, margin: 0, valign: 'top' });
  });
};

L.agenda = (s, t) => {
  head(s, t); foot(s, t.n, t.block);
  const lw = 8.25, n = t.agenda.length, g = 0.14;
  const rh = Math.min(0.62, (CH - (n - 1) * g) / n);
  t.agenda.forEach((a, i) => {
    const y = CY + i * (rh + g);
    card(s, MX, y, lw, rh, i % 2 ? PAPER : SOFT);
    s.addShape(pres.ShapeType.ellipse, { x: MX + 0.18, y: y + (rh - 0.36) / 2, w: 0.36, h: 0.36, fill: { color: TEAL } });
    s.addText(a[0], { x: MX + 0.18, y: y + (rh - 0.36) / 2, w: 0.36, h: 0.36, fontFace: BODY, fontSize: 12.5, bold: true, color: PAPER, align: 'center', valign: 'middle', margin: 0 });
    s.addText(a[1], { x: MX + 0.68, y, w: lw - 2.55, h: rh, fontFace: BODY, fontSize: 13.5, color: INK, valign: 'middle', margin: 0 });
    s.addText(a[2], { x: MX + lw - 1.80, y, w: 1.62, h: rh, fontFace: BODY, fontSize: 12.5, bold: true, color: EMBER, align: 'right', valign: 'middle', margin: 0 });
  });
  const rx = MX + lw + 0.32, rw = CW - lw - 0.32;
  card(s, rx, CY, rw, 1.85, INK);
  s.addText(t.stat, { x: rx, y: CY + 0.24, w: rw, h: 0.78, fontFace: HEAD, fontSize: 34, bold: true, color: EMBER, align: 'center', margin: 0 });
  s.addText(t.statLabel, { x: rx + 0.20, y: CY + 1.00, w: rw - 0.40, h: 0.75, fontFace: BODY, fontSize: 11.5, color: 'C3CFDA', align: 'center', margin: 0 });
  const by = CY + 2.10;
  card(s, rx, by, rw, CH - 2.10, PAPER);
  s.addText('Breaks', { x: rx + 0.22, y: by + 0.14, w: rw - 0.44, h: 0.32, fontFace: BODY, fontSize: 14, bold: true, color: INK, margin: 0 });
  const brk = [['Morning tea', '11:10 – 11:25'], ['Lunch', '13:00 – 14:30'], ['Afternoon tea', '15:45 – 15:55']];
  brk.forEach((b, i) => {
    const y = by + 0.56 + i * 0.52;
    s.addShape(pres.ShapeType.roundRect, { x: rx + 0.18, y, w: rw - 0.36, h: 0.44, rectRadius: 0.05, fill: { color: SOFT } });
    s.addText(b[0], { x: rx + 0.32, y, w: rw - 1.55, h: 0.44, fontFace: BODY, fontSize: 12, color: INK, valign: 'middle', margin: 0 });
    s.addText(b[1], { x: rx + rw - 1.40, y, w: 1.22, h: 0.44, fontFace: BODY, fontSize: 11.5, bold: true, color: TEAL, align: 'right', valign: 'middle', margin: 0 });
  });
};


/* ---- section divider ---- */
L.section = (s, t) => {
  s.background = { color: INK };
  s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 0.30, h: H, fill: { color: EMBER } });
  s.addText(t.num, { x: 9.9, y: 0.9, w: 2.6, h: 2.2, fontFace: HEAD, fontSize: 132, bold: true, color: '2C3B4B', align: 'right', margin: 0, valign: 'middle' });
  s.addText(t.kicker || 'SESSION', { x: 1.15, y: 2.10, w: 10.5, h: 0.34, fontFace: BODY, fontSize: 12.5, bold: true, color: EMBER, charSpacing: 2.2, margin: 0 });
  s.addText(t.title, { x: 1.15, y: 2.42, w: 8.8, h: 1.30, fontFace: HEAD, fontSize: (t.title.length > 42 ? 34 : 40), bold: true, color: PAPER, margin: 0, valign: 'middle' });
  s.addText(t.subtitle || '', { x: 1.15, y: 3.86, w: 9.6, h: 0.66, fontFace: BODY, fontSize: 15, color: 'A9B8C6', margin: 0, valign: 'top' });
  (t.covers || []).forEach((c, i) => {
    const y = 4.62 + i * 0.44;
    s.addShape(pres.ShapeType.ellipse, { x: 1.18, y: y + 0.10, w: 0.13, h: 0.13, fill: { color: EMBER } });
    s.addText(c, { x: 1.52, y, w: 8.4, h: 0.38, fontFace: BODY, fontSize: 12.5, color: 'C9D5DF', valign: 'middle', margin: 0 });
  });
  if (t.clock) {
    s.addShape(pres.ShapeType.roundRect, { x: 10.15, y: 4.62, w: 2.15, h: 0.94, rectRadius: 0.06, fill: { color: INK2 }, line: { color: EMBER, width: 1 } });
    s.addText(t.clock, { x: 10.15, y: 4.74, w: 2.15, h: 0.42, fontFace: HEAD, fontSize: 16, bold: true, color: EMBER, align: 'center', margin: 0 });
    s.addText(t.mins || '', { x: 10.15, y: 5.14, w: 2.15, h: 0.34, fontFace: BODY, fontSize: 11, color: '9BAAB8', align: 'center', margin: 0 });
  }
  if (t.lab) s.addText('Hands-on: ' + t.lab, { x: 1.15, y: 6.34, w: 10.5, h: 0.36, fontFace: BODY, fontSize: 12, italic: true, color: '86C0C9', margin: 0 });
  s.addText(String(t.n), { x: W - 1.15, y: 7.02, w: 0.55, h: 0.3, fontFace: BODY, fontSize: 9.5, color: '5E6E7C', align: 'right', margin: 0 });
};

/* ---- process flow diagram ---- */
const FK = { data: [TEAL, TEAL_BG, '14555F'], model: [EMBER, EMBER_BG, '8A4310'],
             out: [INK3, SOFT, INK], human: [GRN, GRN_BG, '1B4E32'] };
L.flow = (s, t) => {
  head(s, t); foot(s, t.n, t.block);
  const F = t.flow, nRows = F.rows.length;
  const hasP = !!t.punch, hasFb = !!F.feedback;
  const availH = CH - (hasP ? 0.76 : 0) - (hasFb ? 0.52 : 0);
  const perRow = availH / nRows;
  const labH = F.lanes ? 0.22 : 0, gapRow = 0.30, boxH = perRow - labH - gapRow;
  F.rows.forEach((row, ri) => {
    const yTop = CY + ri * perRow;
    if (F.lanes && F.lanes[ri]) {
      s.addText(F.lanes[ri], { x: MX, y: yTop, w: CW, h: labH, fontFace: BODY, fontSize: 10, bold: true,
        color: MUTED, margin: 0, valign: 'middle' });
    }
    const y = yTop + labH;
    const n = row.length, g = 0.30, w = (CW - (n - 1) * g) / n;
    row.forEach((b, i) => {
      const x = MX + i * (w + g);
      const K = FK[b.k] || FK.out;
      s.addShape(pres.ShapeType.roundRect, { x, y, w, h: boxH, rectRadius: 0.06,
        fill: { color: K[1] }, line: { color: K[0], width: 1.1 } });
      s.addText(b.t, { x: x + 0.10, y: y + 0.06, w: w - 0.20, h: boxH * 0.44,
        fontFace: BODY, fontSize: n >= 6 ? 10.5 : 11.5, bold: true, color: K[2], align: 'center', valign: 'middle', margin: 0 });
      s.addText(b.s || '', { x: x + 0.09, y: y + boxH * 0.46, w: w - 0.18, h: boxH * 0.50,
        fontFace: BODY, fontSize: n >= 6 ? 8.6 : 9.4, color: MUTED, align: 'center', valign: 'top', margin: 0 });
      if (i < n - 1) s.addShape(pres.ShapeType.triangle, { x: x + w + 0.055, y: y + boxH / 2 - 0.11,
        w: 0.17, h: 0.22, fill: { color: '9AA9B6' }, rotate: 90 });
    });
    if (ri < nRows - 1) {
      const nx = F.rows[ri + 1].length, wn = (CW - (nx - 1) * g) / nx;
      const fromX = MX + (n - 1) * (w + g) + w / 2;     // centre of this row's last box
      const toX = MX + wn / 2;                           // centre of next row's first box
      const yb = y + boxH, ym = yb + gapRow * 0.52;
      const LN = { color: '9AA9B6', width: 1.2 };
      s.addShape(pres.ShapeType.line, { x: fromX, y: yb, w: 0, h: ym - yb, line: LN });
      s.addShape(pres.ShapeType.line, { x: toX, y: ym, w: fromX - toX, h: 0, line: LN });
      s.addShape(pres.ShapeType.line, { x: toX, y: ym, w: 0, h: gapRow * 0.28, line: LN });
      s.addShape(pres.ShapeType.triangle, { x: toX - 0.10, y: ym + gapRow * 0.26, w: 0.20, h: 0.13,
        fill: { color: '9AA9B6' }, rotate: 180 });
    }
  });
  if (hasFb) {
    const y = CY + availH + 0.02;
    s.addShape(pres.ShapeType.roundRect, { x: MX, y, w: CW, h: 0.46, rectRadius: 0.05,
      fill: { color: 'F4F1FA' }, line: { color: '8B77B8', width: 1, dashType: 'dash' } });
    s.addText([{ text: 'Feedback:  ', options: { bold: true, color: '5B4A85' } },
               { text: F.feedback, options: { color: '5B4A85' } }],
      { x: MX + 0.20, y, w: CW - 0.40, h: 0.46, fontFace: BODY, fontSize: 11.5, valign: 'middle', margin: 0 });
  }
  if (hasP) punch(s, t.punch, CY + availH + (hasFb ? 0.56 : 0.06));
};

/* ---- neural network diagram ---- */
L.neuralnet = (s, t) => {
  head(s, t); foot(s, t.n, t.block);
  const N = t.nn, dw = 7.05, hh = CH - 0.78;
  const x0 = MX + 0.55, dx = (dw - 1.2) / (N.layers.length - 1);
  const cy = CY + hh / 2 - 0.30, R = 0.115;
  const pos = N.layers.map((Ly, li) => {
    const sp = Math.min(0.40, (hh - 1.5) / Math.max(1, Ly.n - 1));
    return Array.from({ length: Ly.n }, (_, k) => ({ x: x0 + li * dx, y: cy - (Ly.n - 1) * sp / 2 + k * sp }));
  });
  for (let li = 0; li < pos.length - 1; li++) {
    pos[li].forEach(a => pos[li + 1].forEach(b => {
      const up = b.y < a.y;
      s.addShape(pres.ShapeType.line, { x: a.x, y: up ? b.y : a.y, w: b.x - a.x, h: Math.max(0.004, Math.abs(b.y - a.y)),
        line: { color: 'DFE7ED', width: 0.6 }, flipV: up });
    }));
  }
  const cols = [TEAL, EMBER, EMBER, INK2];
  pos.forEach((layer, li) => {
    layer.forEach(p => s.addShape(pres.ShapeType.ellipse, { x: p.x - R, y: p.y - R, w: R * 2, h: R * 2,
      fill: { color: cols[Math.min(li, cols.length - 1)] }, line: { color: PAPER, width: 1 } }));
    s.addText(N.layers[li].label, { x: Math.max(MX, pos[li][0].x - dx / 2), y: CY + hh - 0.80, w: dx, h: 0.26,
      fontFace: BODY, fontSize: 10.5, bold: true, color: INK, align: 'center', margin: 0 });
    s.addText(N.layers[li].note || '', { x: Math.max(MX, pos[li][0].x - dx / 2 + 0.19), y: CY + hh - 0.54, w: dx - 0.38, h: 0.58,
      fontFace: BODY, fontSize: 7.8, color: MUTED, align: 'center', valign: 'top', margin: 0 });
  });
  const rx = MX + dw + 0.30, rw = CW - dw - 0.30;
  card(s, rx, CY, rw, hh, PAPER);
  s.addShape(pres.ShapeType.roundRect, { x: rx, y: CY, w: rw, h: 0.50, rectRadius: 0.05, fill: { color: INK2 } });
  s.addText('What is actually happening', { x: rx + 0.22, y: CY, w: rw - 0.44, h: 0.50,
    fontFace: BODY, fontSize: 13.5, bold: true, color: PAPER, valign: 'middle', margin: 0 });
  bullets(s, rx + 0.26, CY + 0.66, rw - 0.52, hh - 0.82, N.notes, 11.5);
  if (t.punch) punch(s, t.punch, CY + hh + 0.14);
};

/* ---- hands-on handover to the simulation lab ---- */
L.lab = (s, t) => {
  head(s, t); foot(s, t.n, t.block);
  const L1 = t.lab;
  s.addShape(pres.ShapeType.roundRect, { x: MX, y: CY, w: CW, h: 0.86, rectRadius: 0.06, fill: { color: INK } });
  s.addShape(pres.ShapeType.roundRect, { x: MX + 0.22, y: CY + 0.19, w: 1.30, h: 0.48, rectRadius: 0.24, fill: { color: EMBER } });
  s.addText(L1.id, { x: MX + 0.22, y: CY + 0.19, w: 1.30, h: 0.48, fontFace: BODY, fontSize: 14, bold: true, color: PAPER, align: 'center', valign: 'middle', margin: 0 });
  s.addText(L1.name, { x: MX + 1.72, y: CY, w: CW - 4.2, h: 0.86, fontFace: HEAD, fontSize: 20, bold: true, color: PAPER, valign: 'middle', margin: 0 });
  s.addText(L1.mins + ' minutes at your laptop', { x: MX + CW - 3.0, y: CY, w: 2.78, h: 0.86, fontFace: BODY, fontSize: 13, bold: true, color: EMBER, align: 'right', valign: 'middle', margin: 0 });
  const y0 = CY + 1.04, hh = CH - 1.04 - 0.88, g = 0.30, w = (CW - g) * 0.56;
  card(s, MX, y0, w, hh, PAPER);
  s.addShape(pres.ShapeType.roundRect, { x: MX, y: y0, w, h: 0.50, rectRadius: 0.05, fill: { color: INK2 } });
  s.addText('Do this', { x: MX + 0.24, y: y0, w: w - 0.45, h: 0.50, fontFace: BODY, fontSize: 14, bold: true, color: PAPER, valign: 'middle', margin: 0 });
  const dn = L1.do.length, dch = L1.do.reduce((a, b) => a + b.length, 0);
  const dfs = dn >= 6 || dch > 400 ? 11 : (dn === 5 ? 11.8 : 12.5);
  s.addText(L1.do.map((d, i) => ({ text: d, options: { bullet: { type: 'number' }, breakLine: i < dn - 1 } })),
    { x: MX + 0.30, y: y0 + 0.64, w: w - 0.58, h: hh - 0.78, fontFace: BODY, fontSize: dfs, color: TXT, paraSpaceAfter: dfs > 11.5 ? 6 : 4, margin: 0, valign: 'top' });
  const x2 = MX + w + g, w2 = CW - w - g;
  card(s, x2, y0, w2, hh, PAPER);
  s.addShape(pres.ShapeType.roundRect, { x: x2, y: y0, w: w2, h: 0.50, rectRadius: 0.05, fill: { color: TEAL } });
  s.addText('Watch for', { x: x2 + 0.24, y: y0, w: w2 - 0.45, h: 0.50, fontFace: BODY, fontSize: 14, bold: true, color: PAPER, valign: 'middle', margin: 0 });
  bullets(s, x2 + 0.28, y0 + 0.64, w2 - 0.56, hh - 0.78, L1.see, 12.5);
  punch(s, L1.why, y0 + hh + 0.20);
};

L.cards = (s, t) => {
  head(s, t); foot(s, t.n, t.block);
  const hasP = !!t.punch;
  const areaH = CH - (hasP ? 0.78 : 0);
  const n = t.cards.length;
  const cols = n <= 4 ? 2 : (n <= 6 ? 3 : 4);
  const rows = Math.ceil(n / cols);
  const g = 0.24;
  const cw = (CW - (cols - 1) * g) / cols;
  const chh = Math.min((areaH - (rows - 1) * g) / rows, cols === 4 ? 2.20 : (cols === 3 ? 2.35 : 1.95));
  const TOP = CY + Math.max(0, (areaH - (rows * chh + (rows - 1) * g)) / 2);
  t.cards.forEach((c, i) => {
    const x = MX + (i % cols) * (cw + g), y = TOP + Math.floor(i / cols) * (chh + g);
    card(s, x, y, cw, chh, PAPER);
    s.addShape(pres.ShapeType.ellipse, { x: x + 0.20, y: y + 0.20, w: 0.15, h: 0.15, fill: { color: EMBER } });
    const twoLine = String(c[0]).length > (cols === 4 ? 24 : 30);
    const hT = twoLine ? 0.60 : 0.38;
    s.addText(c[0], { x: x + 0.44, y: y + 0.09, w: cw - 0.62, h: hT, fontFace: BODY, fontSize: cols === 4 ? 12.5 : 14.5, bold: true, color: INK, margin: 0, valign: 'top' });
    s.addText(c[1], { x: x + 0.22, y: y + hT + 0.16, w: cw - 0.44, h: chh - hT - 0.30, fontFace: BODY, fontSize: cols === 4 ? 10.5 : 12, color: MUTED, margin: 0, valign: 'top' });
  });
  if (hasP) punch(s, t.punch, CY + areaH + 0.18);
};

L.venn = (s, t) => {
  head(s, t); foot(s, t.n, t.block);
  const lw = 7.5;
  const sizes = [[0, 0, 4.6], [0.55, 0.55, 3.5], [1.10, 1.10, 2.4]];
  const cols = [INK, TEAL, EMBER];
  const cx = MX + 0.35, cy = CY + 0.20;
  sizes.forEach((z, i) => {
    s.addShape(pres.ShapeType.ellipse, { x: cx + z[0], y: cy + z[1], w: z[2], h: z[2], fill: { color: cols[i] }, line: { color: PAPER, width: 2 } });
  });
  s.addText('AI', { x: cx + 1.75, y: cy + 0.09, w: 1.1, h: 0.38, fontFace: HEAD, fontSize: 18, bold: true, color: PAPER, align: 'center', valign: 'middle', margin: 0 });
  s.addText('ML', { x: cx + 1.75, y: cy + 0.62, w: 1.1, h: 0.38, fontFace: HEAD, fontSize: 16, bold: true, color: PAPER, align: 'center', valign: 'middle', margin: 0 });
  s.addText('DL', { x: cx + 1.75, y: cy + 2.11, w: 1.1, h: 0.38, fontFace: HEAD, fontSize: 16, bold: true, color: PAPER, align: 'center', valign: 'middle', margin: 0 });
  t.rings.forEach((r, i) => {
    const y = CY + 0.05 + i * 1.15;
    s.addText(r[0], { x: MX + lw - 2.2, y, w: 7.0, h: 0.34, fontFace: BODY, fontSize: 14.5, bold: true, color: cols[i], margin: 0 });
    s.addText(r[1], { x: MX + lw - 2.2, y: y + 0.34, w: 6.9, h: 0.78, fontFace: BODY, fontSize: 12, color: MUTED, margin: 0 });
  });
  const ay = CY + 3.62;
  card(s, MX + lw - 2.2, ay, 6.9, 1.34, TEAL_BG);
  s.addText(t.aside[0], { x: MX + lw - 2.0, y: ay + 0.10, w: 6.5, h: 0.32, fontFace: BODY, fontSize: 14.5, bold: true, color: TEAL, margin: 0 });
  s.addText(t.aside[1], { x: MX + lw - 2.0, y: ay + 0.44, w: 6.5, h: 0.82, fontFace: BODY, fontSize: 12, color: '2E5C63', margin: 0 });
};

L['bignumber-compare'] = (s, t) => {
  head(s, t); foot(s, t.n, t.block);
  const g = 0.32, w = (CW - g) / 2, hh = CH - 0.85;
  [[t.left, MX, SOFT, INK3], [t.right, MX + w + g, EMBER_BG, EMBER]].forEach(([o, x, bg, ac]) => {
    card(s, x, CY, w, hh, bg);
    s.addText(o.label.toUpperCase(), { x: x + 0.30, y: CY + 0.24, w: w - 0.6, h: 0.32, fontFace: BODY, fontSize: 11.5, bold: true, color: ac, charSpacing: 1.2, margin: 0 });
    const two = String(o.value).length > 22;
    const fsV = two ? 27 : 33, hV = two ? 1.28 : 0.86;
    s.addText(o.value, { x: x + 0.30, y: CY + 0.60, w: w - 0.6, h: hV, fontFace: HEAD, fontSize: fsV, bold: true, color: INK, margin: 0, valign: 'top' });
    s.addText(o.detail, { x: x + 0.30, y: CY + 0.60 + hV + 0.22, w: w - 0.6, h: hh - (0.60 + hV + 0.34), fontFace: BODY, fontSize: 13.5, color: MUTED, margin: 0, valign: 'top' });
  });
  punch(s, t.punch, CY + hh + 0.20);
};

L.process = (s, t) => {
  head(s, t); foot(s, t.n, t.block);
  const n = t.steps.length, g = 0.26, w = (CW - (n - 1) * g) / n, hh = Math.min(CH - (t.punch ? 0.85 : 0), 3.55);
  t.steps.forEach((st, i) => {
    const x = MX + i * (w + g);
    card(s, x, CY, w, hh, PAPER);
    s.addShape(pres.ShapeType.roundRect, { x, y: CY, w, h: 0.62, rectRadius: 0.06, fill: { color: INK2 } });
    s.addShape(pres.ShapeType.ellipse, { x: x + 0.22, y: CY + 0.13, w: 0.36, h: 0.36, fill: { color: EMBER } });
    s.addText(st[0], { x: x + 0.22, y: CY + 0.13, w: 0.36, h: 0.36, fontFace: BODY, fontSize: 13, bold: true, color: PAPER, align: 'center', valign: 'middle', margin: 0 });
    s.addText(st[1], { x: x + 0.68, y: CY, w: w - 0.85, h: 0.62, fontFace: BODY, fontSize: 14, bold: true, color: PAPER, valign: 'middle', margin: 0 });
    s.addText(st[2], { x: x + 0.24, y: CY + 0.78, w: w - 0.48, h: hh - 0.95, fontFace: BODY, fontSize: 12.5, color: MUTED, margin: 0, valign: 'top' });
    if (i < n - 1) s.addShape(pres.ShapeType.triangle, { x: x + w + 0.045, y: CY + 0.20, w: 0.17, h: 0.24, fill: { color: EMBER }, rotate: 90 });
  });
  if (t.punch) punch(s, t.punch, CY + hh + 0.22);
};

L.table = (s, t) => {
  head(s, t); foot(s, t.n, t.block);
  const cw = colWeights(t.table.head, t.table.rows, CW);
  const nR = t.table.rows.length;
  const top = CY + 0.22;
  const avail = (t.punch ? 6.06 : 6.82) - top;
  let fs = nR <= 3 ? 13.5 : 12.5;
  let th = tblHeight(t.table.head, t.table.rows, cw, fs);
  while (th > avail && fs > 9.5) { fs -= 0.5; th = tblHeight(t.table.head, t.table.rows, cw, fs); }
  const rowH = Math.max(0.34, Math.min(0.80, (avail - 0.05) / (nR + 1)));
  tbl(s, MX, top, CW, t.table.head, t.table.rows, cw, fs, rowH);
  const used = Math.min(avail, Math.max(th, rowH * (nR + 1)));
  if (t.punch) punch(s, t.punch, Math.min(6.22, top + used + 0.18));
};

L['table-stat'] = (s, t) => {
  head(s, t); foot(s, t.n, t.block);
  const tw = 9.05;
  const rows = t.table.rows;
  const cols = t.table.head.length;
  const cw = colWeights(t.table.head, rows, tw);
  tbl(s, MX, CY, tw, t.table.head, rows, cw, rows.length > 7 ? 11.5 : 13);
  const rx = MX + tw + 0.30, rw = CW - tw - 0.30;
  card(s, rx, CY, rw, 2.55, INK);
  s.addText(t.stat, { x: rx + 0.12, y: CY + 0.42, w: rw - 0.24, h: 0.9, fontFace: HEAD, fontSize: 36, bold: true, color: EMBER, align: 'center', margin: 0 });
  s.addText(t.statLabel, { x: rx + 0.22, y: CY + 1.34, w: rw - 0.44, h: 1.1, fontFace: BODY, fontSize: 12, color: 'C3CFDA', align: 'center', margin: 0 });
};

L.compare = (s, t) => {
  head(s, t); foot(s, t.n, t.block);
  const g = 0.28, w = (CW - g) / 2;
  const hh = CH - 0.85;
  s.addShape(pres.ShapeType.roundRect, { x: MX, y: CY, w, h: 0.56, rectRadius: 0.05, fill: { color: INK3 } });
  s.addText(t.compare.leftTitle, { x: MX, y: CY, w, h: 0.56, fontFace: BODY, fontSize: 15, bold: true, color: PAPER, align: 'center', valign: 'middle', margin: 0 });
  s.addShape(pres.ShapeType.roundRect, { x: MX + w + g, y: CY, w, h: 0.56, rectRadius: 0.05, fill: { color: TEAL } });
  s.addText(t.compare.rightTitle, { x: MX + w + g, y: CY, w, h: 0.56, fontFace: BODY, fontSize: 15, bold: true, color: PAPER, align: 'center', valign: 'middle', margin: 0 });
  const rn = t.compare.rows.length, rh = (hh - 0.70) / rn;
  t.compare.rows.forEach((r, i) => {
    const y = CY + 0.66 + i * rh;
    const last = i === rn - 1;
    card(s, MX, y, w, rh - 0.08, last ? EMBER_BG : (i % 2 ? PAPER : SOFT));
    card(s, MX + w + g, y, w, rh - 0.08, last ? EMBER_BG : (i % 2 ? PAPER : SOFT));
    s.addText(r[0], { x: MX + 0.20, y, w: w - 0.4, h: rh - 0.08, fontFace: BODY, fontSize: 12.5, bold: last, color: last ? '8A4310' : TXT, valign: 'middle', margin: 0 });
    s.addText(r[1], { x: MX + w + g + 0.20, y, w: w - 0.4, h: rh - 0.08, fontFace: BODY, fontSize: 12.5, bold: last, color: last ? '8A4310' : TXT, valign: 'middle', margin: 0 });
  });
  punch(s, t.punch, CY + hh + 0.18);
};

L.pfcurve = (s, t) => {
  head(s, t); foot(s, t.n, t.block);
  const n = t.points.length, rh = CH / n;
  t.points.forEach((p, i) => {
    const y = CY + i * rh;
    const indent = (i / (n - 1)) * 1.55;
    const isAI = i === 3, isEnd = i === n - 1;
    const bg = isEnd ? RED_BG : (isAI ? EMBER_BG : (i % 2 ? PAPER : SOFT));
    card(s, MX + indent, y, CW - indent, rh - 0.08, bg);
    s.addShape(pres.ShapeType.ellipse, { x: MX + indent + 0.16, y: y + (rh - 0.20) / 2, w: 0.16, h: 0.16, fill: { color: isEnd ? RED : (isAI ? EMBER : INK3) } });
    s.addText(p[0], { x: MX + indent + 0.44, y, w: 4.15, h: rh - 0.08, fontFace: BODY, fontSize: 12.5, bold: isAI || isEnd, color: isEnd ? RED : INK, valign: 'middle', margin: 0 });
    s.addText(p[1], { x: MX + indent + 4.62, y, w: CW - indent - 6.3, h: rh - 0.08, fontFace: BODY, fontSize: 12, color: MUTED, valign: 'middle', margin: 0 });
    s.addText(p[2], { x: MX + CW - 1.55, y, w: 1.45, h: rh - 0.08, fontFace: BODY, fontSize: 12, bold: true, color: isEnd ? RED : EMBER, align: 'right', valign: 'middle', margin: 0 });
  });
};

L['chart-text'] = (s, t) => {
  head(s, t); foot(s, t.n, t.block);
  const cwid = 6.95, hh = CH - 0.85;
  card(s, MX, CY, cwid, hh, PAPER);
  s.addChart(pres.ChartType.line, t.chart.series.map(se => ({ name: se.name, labels: t.chart.categories, values: se.values })), {
    x: MX + 0.12, y: CY + 0.12, w: cwid - 0.24, h: hh - 0.24,
    showTitle: true, title: t.chart.title, titleFontSize: 13, titleColor: INK, titleFontFace: BODY,
    chartColors: [EMBER, TEAL], lineDataSymbol: 'circle', lineDataSymbolSize: 6, lineSize: 3,
    showLegend: true, legendPos: 'b', legendFontSize: 11, legendColor: MUTED,
    catAxisLabelColor: MUTED, valAxisLabelColor: MUTED, catAxisLabelFontSize: 11, valAxisLabelFontSize: 11,
    /* Axis bounds and title come from the slide, not the layout — the Nashik
       deck had one chart and baked its bearing axis in; this deck has three
       charts on three different quantities. */
    ...(t.chart.min != null ? { valAxisMinVal: t.chart.min } : {}),
    ...(t.chart.max != null ? { valAxisMaxVal: t.chart.max } : {}),
    valGridLine: { color: 'E4EAF0', size: 1 }, catGridLine: { style: 'none' },
    ...(t.chart.yTitle ? { valAxisTitle: t.chart.yTitle, showValAxisTitle: true,
                           valAxisTitleFontSize: 11, valAxisTitleColor: MUTED } : {})
  });
  const rx = MX + cwid + 0.30, rw = CW - cwid - 0.30;
  t.items.forEach((it, i) => {
    const y = CY + i * ((hh) / t.items.length);
    const h2 = (hh) / t.items.length - 0.12;
    card(s, rx, y, rw, h2, i === t.items.length - 1 ? EMBER_BG : SOFT);
    s.addText(it, { x: rx + 0.20, y, w: rw - 0.40, h: h2, fontFace: BODY, fontSize: 12.5, color: i === t.items.length - 1 ? '8A4310' : TXT, bold: i === t.items.length - 1, valign: 'middle', margin: 0 });
  });
  punch(s, t.punch, CY + hh + 0.18);
};

L.case = (s, t) => {
  head(s, t); foot(s, t.n, t.block);
  const g = 0.28, w = (CW - g) / 2, listH = 3.20;
  card(s, MX, CY, w, listH, PAPER);
  s.addShape(pres.ShapeType.roundRect, { x: MX, y: CY, w, h: 0.50, rectRadius: 0.05, fill: { color: INK2 } });
  s.addText('What the model detects', { x: MX + 0.22, y: CY, w: w - 0.4, h: 0.50, fontFace: BODY, fontSize: 13.5, bold: true, color: PAPER, valign: 'middle', margin: 0 });
  bullets(s, MX + 0.24, CY + 0.62, w - 0.48, listH - 0.75, t.case.detects, 12.2);
  const x2 = MX + w + g;
  card(s, x2, CY, w, listH, PAPER);
  s.addShape(pres.ShapeType.roundRect, { x: x2, y: CY, w, h: 0.50, rectRadius: 0.05, fill: { color: TEAL } });
  s.addText('Signals it uses', { x: x2 + 0.22, y: CY, w: w - 0.4, h: 0.50, fontFace: BODY, fontSize: 13.5, bold: true, color: PAPER, valign: 'middle', margin: 0 });
  bullets(s, x2 + 0.24, CY + 0.62, w - 0.48, listH - 0.75, t.case.signals, 12.2);
  const y2 = CY + listH + 0.22;
  card(s, MX, y2, 7.9, 0.70, SOFT);
  s.addText('Typical lead time', { x: MX + 0.22, y: y2, w: 1.85, h: 0.70, fontFace: BODY, fontSize: 11, bold: true, color: MUTED, valign: 'middle', margin: 0 });
  s.addText(t.case.lead, { x: MX + 2.05, y: y2, w: 5.7, h: 0.70, fontFace: BODY, fontSize: 12.5, color: INK, valign: 'middle', margin: 0 });
  chip(s, MX + 8.15, y2, CW - 8.15, 0.70, t.case.maturity, null, 9.5);
  const y3 = y2 + 0.86;
  card(s, MX, y3, CW, 0.72, AMB_BG);
  s.addText([{ text: 'Watch out:  ', options: { bold: true, color: AMB } }, { text: t.case.caution, options: { color: '6E4A0C' } }],
    { x: MX + 0.22, y: y3, w: CW - 0.44, h: 0.72, fontFace: BODY, fontSize: 12.5, valign: 'middle', margin: 0 });
};

L.loop = (s, t) => {
  head(s, t); foot(s, t.n, t.block);
  const n = t.loop.length, g = 0.20, w = (CW - (n - 1) * g) / n, hh = 3.42;
  t.loop.forEach((st, i) => {
    const x = MX + i * (w + g);
    const isKey = i === 3;
    card(s, x, CY, w, hh, isKey ? EMBER_BG : PAPER);
    s.addShape(pres.ShapeType.ellipse, { x: x + (w - 0.56) / 2, y: CY + 0.26, w: 0.56, h: 0.56, fill: { color: isKey ? EMBER : INK2 } });
    s.addText(String(i + 1), { x: x + (w - 0.56) / 2, y: CY + 0.26, w: 0.56, h: 0.56, fontFace: BODY, fontSize: 17, bold: true, color: PAPER, align: 'center', valign: 'middle', margin: 0 });
    s.addText(st[0], { x: x + 0.16, y: CY + 0.96, w: w - 0.32, h: 0.72, fontFace: BODY, fontSize: 13.5, bold: true, color: INK, align: 'center', valign: 'top', margin: 0 });
    s.addText(st[1], { x: x + 0.16, y: CY + 1.72, w: w - 0.32, h: hh - 1.9, fontFace: BODY, fontSize: 11.8, color: MUTED, align: 'center', valign: 'top', margin: 0 });
    if (i < n - 1) s.addShape(pres.ShapeType.triangle, { x: x + w + 0.02, y: CY + 0.40, w: 0.15, h: 0.28, fill: { color: EMBER }, rotate: 90 });
  });
  s.addText('↺  findings return to the model', { x: MX, y: CY + hh + 0.06, w: CW, h: 0.32, fontFace: BODY, fontSize: 11.5, italic: true, color: TEAL, align: 'center', margin: 0 });
  punch(s, t.punch, CY + hh + 0.50, 'red');
};

L.mockup = (s, t) => {
  head(s, t); foot(s, t.n, t.block);
  const hh = CH - 0.85, w = 10.4, x0 = MX + (CW - w) / 2;
  card(s, x0, CY, w, hh, PAPER);
  s.addShape(pres.ShapeType.roundRect, { x: x0, y: CY, w, h: 0.56, rectRadius: 0.05, fill: { color: INK } });
  s.addText(t.mockup.header, { x: x0 + 0.26, y: CY, w: w - 0.5, h: 0.56, fontFace: 'Courier New', fontSize: 13, bold: true, color: EMBER, valign: 'middle', margin: 0 });
  const rows = t.mockup.rows, rh = (hh - 0.72) / rows.length;
  const kindCol = { warn: [AMB, AMB_BG], info: [TEAL, TEAL_BG], action: [INK, SOFT2], value: [GRN, GRN_BG] };
  rows.forEach((r, i) => {
    const y = CY + 0.66 + i * rh;
    const [c, bg] = kindCol[r[2]] || [MUTED, SOFT];
    s.addShape(pres.ShapeType.rect, { x: x0 + 0.16, y, w: w - 0.32, h: rh - 0.06, fill: { color: bg }, line: { color: 'FFFFFF', width: 0 } });
    s.addShape(pres.ShapeType.ellipse, { x: x0 + 0.32, y: y + (rh - 0.20) / 2, w: 0.15, h: 0.15, fill: { color: c } });
    s.addText(r[0], { x: x0 + 0.60, y, w: 2.85, h: rh - 0.06, fontFace: BODY, fontSize: 12.5, bold: true, color: c, valign: 'middle', margin: 0 });
    s.addText(r[1], { x: x0 + 3.50, y, w: w - 3.75, h: rh - 0.06, fontFace: BODY, fontSize: 12.5, color: TXT, valign: 'middle', margin: 0 });
  });
  punch(s, t.punch, CY + hh + 0.18);
};

L.econ = (s, t) => {
  head(s, t); foot(s, t.n, t.block);
  const eRowH = 0.46, eHeadH = 0.72;
  tbl(s, MX, CY, CW, t.econ.head, t.econ.rows, colWeights(t.econ.head, t.econ.rows, CW), 12.5, eRowH);
  const y2 = CY + eHeadH + eRowH * t.econ.rows.length + 0.26;
  card(s, MX, y2, 6.2, 1.35, INK);
  s.addText(t.stat, { x: MX + 0.2, y: y2 + 0.14, w: 5.8, h: 0.68, fontFace: HEAD, fontSize: 34, bold: true, color: EMBER, align: 'center', margin: 0 });
  s.addText(t.statLabel, { x: MX + 0.3, y: y2 + 0.82, w: 5.6, h: 0.45, fontFace: BODY, fontSize: 11, color: 'C3CFDA', align: 'center', margin: 0 });
  card(s, MX + 6.5, y2, CW - 6.5, 1.35, TEAL_BG);
  s.addText('Indicative basis', { x: MX + 6.72, y: y2 + 0.12, w: CW - 6.95, h: 0.30, fontFace: BODY, fontSize: 12.5, bold: true, color: TEAL, margin: 0 });
  s.addText(t.basis || 'Substitute your own station figures — every number moves.',
    { x: MX + 6.72, y: y2 + 0.44, w: CW - 6.95, h: 0.86, fontFace: BODY, fontSize: 11, color: '2E5C63', margin: 0 });
  punch(s, t.punch, Math.min(6.20, y2 + 1.52));
};

L.warn = (s, t) => {
  head(s, t); foot(s, t.n, t.block);
  const n = t.warnings.length, hh = CH - 1.05, rh = hh / n;
  t.warnings.forEach((wn, i) => {
    const y = CY + i * rh;
    card(s, MX, y, CW, rh - 0.10, PAPER);
    s.addShape(pres.ShapeType.roundRect, { x: MX + 0.18, y: y + (rh - 0.52) / 2, w: 2.55, h: 0.44, rectRadius: 0.06, fill: { color: RED_BG }, line: { color: RED, width: 0.75 } });
    s.addText(wn[0], { x: MX + 0.18, y: y + (rh - 0.52) / 2, w: 2.55, h: 0.44, fontFace: BODY, fontSize: 12, bold: true, color: RED, align: 'center', valign: 'middle', margin: 0 });
    s.addText(wn[1], { x: MX + 2.95, y, w: CW - 3.15, h: rh - 0.10, fontFace: BODY, fontSize: 12.5, color: TXT, valign: 'middle', margin: 0 });
  });
  const y2 = CY + hh + 0.08;
  s.addShape(pres.ShapeType.roundRect, { x: MX, y: y2, w: CW, h: 0.86, rectRadius: 0.05, fill: { color: RED }, line: { color: RED, width: 1 } });
  s.addText(t.never, { x: MX + 0.26, y: y2, w: CW - 0.52, h: 0.86, fontFace: BODY, fontSize: 12.5, bold: true, color: PAPER, valign: 'middle', margin: 0 });
};

L.maturity = (s, t) => {
  head(s, t); foot(s, t.n, t.block);
  const n = t.maturity.length, hh = CH - 0.85, rh = hh / n;
  t.maturity.forEach((m, i) => {
    const y = CY + i * rh;
    card(s, MX, y, CW, rh - 0.09, i % 2 ? PAPER : SOFT);
    s.addText(m[0], { x: MX + 0.24, y, w: 3.9, h: rh - 0.09, fontFace: BODY, fontSize: 12.8, bold: true, color: INK, valign: 'middle', margin: 0 });
    s.addText(m[1], { x: MX + 4.25, y, w: CW - 7.95, h: rh - 0.09, fontFace: BODY, fontSize: 12, color: MUTED, valign: 'middle', margin: 0 });
    chip(s, MX + CW - 3.45, y + (rh - 0.09 - 0.50) / 2, 3.35, 0.50, m[2], null, 9);
  });
  punch(s, t.punch, CY + hh + 0.16);
};

L['two-col-list'] = (s, t) => {
  head(s, t); foot(s, t.n, t.block);
  const g = 0.30, w = (CW - g) / 2, hh = Math.min(CH - (t.punch ? 0.85 : 0), 3.75);
  [[t.leftTitle, t.left, MX, INK2], [t.rightTitle, t.right, MX + w + g, TEAL]].forEach(([title, items, x, c]) => {
    card(s, x, CY, w, hh, PAPER);
    s.addShape(pres.ShapeType.roundRect, { x, y: CY, w, h: 0.54, rectRadius: 0.05, fill: { color: c } });
    s.addText(title, { x: x + 0.24, y: CY, w: w - 0.45, h: 0.54, fontFace: BODY, fontSize: 14, bold: true, color: PAPER, valign: 'middle', margin: 0 });
    bullets(s, x + 0.26, CY + 0.70, w - 0.52, hh - 0.85, items, 13);
  });
  if (t.punch) punch(s, t.punch, CY + hh + 0.20);
};

L.boundary = (s, t) => {
  head(s, t); foot(s, t.n, t.block);
  const cols = { no: [RED, RED_BG, 'NEVER'], care: [AMB, AMB_BG, 'WITH CONTROLS'], yes: [GRN, GRN_BG, 'FREELY'] };
  const lh = 0.86;
  t.layers.forEach((ly, i) => {
    const y = CY + i * (lh + 0.13);
    const [c, bg, tag] = cols[ly[2]];
    s.addShape(pres.ShapeType.roundRect, { x: MX, y, w: CW, h: lh, rectRadius: 0.05, fill: { color: bg }, line: { color: c, width: 1.25 } });
    s.addShape(pres.ShapeType.roundRect, { x: MX + 0.18, y: y + 0.19, w: 2.35, h: 0.48, rectRadius: 0.24, fill: { color: c } });
    s.addText(tag, { x: MX + 0.18, y: y + 0.19, w: 2.35, h: 0.48, fontFace: BODY, fontSize: 11.5, bold: true, color: PAPER, align: 'center', valign: 'middle', margin: 0 });
    s.addText(ly[1], { x: MX + 2.75, y, w: CW - 3.0, h: lh, fontFace: BODY, fontSize: 13, color: TXT, valign: 'middle', margin: 0 });
  });
  const y2 = CY + 3 * (lh + 0.13) + 0.12;
  const n = t.cyber.length, g = 0.18, w = (CW - (n - 1) * g) / n, hh = 6.88 - y2;
  t.cyber.forEach((c, i) => {
    const x = MX + i * (w + g);
    card(s, x, y2, w, hh, SOFT);
    s.addText(c[0], { x: x + 0.16, y: y2 + 0.12, w: w - 0.32, h: 0.36, fontFace: BODY, fontSize: 12.5, bold: true, color: TEAL, margin: 0, valign: 'middle' });
    s.addText(c[1], { x: x + 0.16, y: y2 + 0.50, w: w - 0.32, h: hh - 0.62, fontFace: BODY, fontSize: 10.8, color: MUTED, margin: 0, valign: 'top' });
  });
};

L.fails = (s, t) => {
  head(s, t); foot(s, t.n, t.block);
  const n = t.fails.length, TOP = CY + 0.36, hh = CH - 0.85 - 0.36, rh = hh / n;
  s.addText('WHY IT FAILED', { x: MX + 0.24, y: CY, w: 5.0, h: 0.30, fontFace: BODY, fontSize: 10.5, bold: true, color: RED, charSpacing: 1.2, margin: 0 });
  s.addText('WHAT PREVENTS IT', { x: MX + 6.07, y: CY, w: 6.0, h: 0.30, fontFace: BODY, fontSize: 10.5, bold: true, color: GRN, charSpacing: 1.2, margin: 0 });
  t.fails.forEach((f, i) => {
    const y = TOP + i * rh;
    card(s, MX, y, 5.55, rh - 0.08, RED_BG);
    s.addText(f[0], { x: MX + 0.22, y, w: 5.15, h: rh - 0.08, fontFace: BODY, fontSize: 12.3, color: '7A1C16', valign: 'middle', margin: 0 });
    s.addShape(pres.ShapeType.triangle, { x: MX + 5.63, y: y + (rh - 0.30) / 2, w: 0.15, h: 0.24, fill: { color: MUTED }, rotate: 90 });
    card(s, MX + 5.85, y, CW - 5.85, rh - 0.08, GRN_BG);
    s.addText(f[1], { x: MX + 6.07, y, w: CW - 6.30, h: rh - 0.08, fontFace: BODY, fontSize: 12.3, color: '1B4E32', valign: 'middle', margin: 0 });
  });
  punch(s, t.punch, TOP + hh + 0.16);
};

L.pilot = (s, t) => {
  head(s, t); foot(s, t.n, t.block);
  const cn = t.criteria.length, g = 0.14, cwid = (CW - (cn - 1) * g) / cn;
  t.criteria.forEach((c, i) => {
    const x = MX + i * (cwid + g);
    s.addShape(pres.ShapeType.roundRect, { x, y: CY - 0.08, w: cwid, h: 0.50, rectRadius: 0.06, fill: { color: TEAL_BG }, line: { color: TEAL, width: 0.75 } });
    s.addText(c, { x: x + 0.05, y: CY - 0.08, w: cwid - 0.10, h: 0.50, fontFace: BODY, fontSize: 9, color: '15606B', align: 'center', valign: 'middle', margin: 0 });
  });
  tbl(s, MX, CY + 0.56, CW, ['Candidate pilot', 'Value', 'Risk', 'Verdict'], t.candidates, [4.05, 0.95, 0.95, 6.143], 11, 0.375);
  const y2 = CY + 0.56 + 0.375 * 7 + 0.20;
  s.addText('A 90-day starter plan', { x: MX, y: y2, w: 6, h: 0.28, fontFace: BODY, fontSize: 12.5, bold: true, color: INK, margin: 0 });
  const pn = t.plan.length, pg = 0.22, pw = (CW - (pn - 1) * pg) / pn;
  const ptop = y2 + 0.32, ph = 6.88 - ptop;
  t.plan.forEach((p, i) => {
    const x = MX + i * (pw + pg);
    card(s, x, ptop, pw, ph, PAPER);
    s.addShape(pres.ShapeType.roundRect, { x, y: ptop, w: pw, h: 0.40, rectRadius: 0.05, fill: { color: EMBER } });
    s.addText(p[0], { x: x + 0.20, y: ptop, w: pw - 0.4, h: 0.40, fontFace: BODY, fontSize: 12, bold: true, color: PAPER, valign: 'middle', margin: 0 });
    s.addText(p[1], { x: x + 0.20, y: ptop + 0.46, w: pw - 0.4, h: ph - 0.80, fontFace: BODY, fontSize: 11, color: TXT, margin: 0, valign: 'top' });
    s.addText(p[2], { x: x + 0.20, y: ptop + ph - 0.34, w: pw - 0.4, h: 0.30, fontFace: BODY, fontSize: 10, italic: true, color: TEAL, margin: 0 });
  });
};

L.close = (s, t) => {
  s.background = { color: INK };
  s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 0.30, h: H, fill: { color: EMBER } });
  s.addText(t.title, { x: 1.05, y: 0.72, w: 11.6, h: 0.95, fontFace: HEAD, fontSize: 38, bold: true, color: EMBER, margin: 0, charSpacing: 1.5 });
  s.addText(t.subtitle, { x: 1.05, y: 1.66, w: 11.6, h: 0.42, fontFace: BODY, fontSize: 16, color: 'B9C6D2', margin: 0 });
  s.addText('What you can do on Monday morning', { x: 1.05, y: 2.32, w: 11.6, h: 0.38, fontFace: BODY, fontSize: 15, bold: true, color: PAPER, margin: 0 });
  const mn = t.monday.length, mstep = mn >= 6 ? 0.53 : 0.62, mh = mn >= 6 ? 0.45 : 0.52;
  t.monday.forEach((m, i) => {
    const y = 2.72 + i * mstep;
    s.addShape(pres.ShapeType.roundRect, { x: 1.05, y, w: 11.3, h: mh, rectRadius: 0.05, fill: { color: INK2 } });
    s.addShape(pres.ShapeType.ellipse, { x: 1.22, y: y + (mh - 0.27) / 2, w: 0.27, h: 0.27, fill: { color: EMBER } });
    s.addText(String(i + 1), { x: 1.22, y: y + (mh - 0.27) / 2, w: 0.27, h: 0.27, fontFace: BODY, fontSize: 10, bold: true, color: PAPER, align: 'center', valign: 'middle', margin: 0 });
    s.addText(m, { x: 1.62, y, w: 10.5, h: mh, fontFace: BODY, fontSize: 12, color: 'DCE4EB', valign: 'middle', margin: 0 });
  });
  s.addText(t.closing, { x: 1.05, y: 2.72 + mn * mstep + 0.14, w: 11.3, h: 0.5, fontFace: HEAD, fontSize: 18, italic: true, bold: true, color: PAPER, margin: 0 });
  s.addText('Questions — and the cards: which candidate becomes the pilot?', { x: 1.05, y: 6.78, w: 11.3, h: 0.4, fontFace: BODY, fontSize: 12, color: '8C9BA8', margin: 0 });
};

// ---------- build ----------
D.slides.forEach(t => {
  const s = pres.addSlide();
  if (!['title', 'close'].includes(t.layout)) s.background = { color: 'FBFCFD' };
  const fn = L[t.layout];
  if (!fn) throw new Error('no layout: ' + t.layout + ' (slide ' + t.n + ')');
  fn(s, t);
  s.addNotes(`[Slide ${t.n} · ${t.block} · target ${t.time}]\n\n${t.notes}`);
});

pres.writeFile({ fileName: 'AI_in_Power_Plant_From_Data_to_Decisions_Koradi.pptx' }).then(f => console.log('written', f));
