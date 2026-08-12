/* SVG figures -> PNG at 2x, for the Word and PDF build. Word cannot place SVG
   without a rasteriser installed on the machine opening it, so both forms are
   generated here and both are committed. */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', 'course', 'figures');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ deviceScaleFactor: 2 });
  for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.svg'))) {
    const svg = fs.readFileSync(path.join(DIR, f), 'utf8');
    const m = svg.match(/width="(\d+)" height="(\d+)"/);
    await p.setViewportSize({ width: +m[1], height: +m[2] });
    await p.setContent(`<body style="margin:0">${svg}</body>`);
    const out = path.join(DIR, f.replace('.svg', '.png'));
    await p.screenshot({ path: out });
    console.log(`  ${f.replace('.svg', '.png').padEnd(34)} ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
  }
  await b.close();
})();
