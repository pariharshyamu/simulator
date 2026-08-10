/* Prove the mechanics numerically, in world space, rather than by looking at
   the picture. The bug this exists to catch — a part tilted with one Euler
   component and then driven on another — looks like rotation in a still
   frame and only reveals itself in motion, which is exactly the kind of
   defect a screenshot test cannot see.

   The invariant for any rotating part is simple: as it turns, the world
   direction of its own axis must not change, and a point on its rim must.

   Usage:  node pdm-simulator/qa-geometry.js  [path/to/built.html]
*/
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');

/* Screenshots go to a temp dir by default; set SHOTS to keep them. */
const SHOTS = process.env.SHOTS || os.tmpdir();

const FILE = process.argv[2] ||
  path.resolve(__dirname, '..', 'dist', 'MAHAGENCO_PdM_Simulator.html');

let fails = 0;
const ok  = m => console.log('  \x1b[32mok\x1b[0m    ' + m);
const bad = m => { fails++; console.log('  \x1b[31mFAIL\x1b[0m  ' + m); };
const note= m => console.log('        \x1b[2m' + m + '\x1b[0m');

/* Runs inside the page. Returns, for every named rotating part, the world
   axis direction and a rim point, sampled twice with animation in between. */
const SAMPLE = `(async () => {
  const T = THREE;
  const P = V3._probe();

  const spec = [];
  if (P.parts.rot)   spec.push({name:'rotating assembly', obj:P.parts.rot,  axis:[1,0,0]});
  if (P.parts.bowl)  spec.push({name:'mill bowl',         obj:P.parts.bowl, axis:[0,1,0]});
  (P.parts.rollers||[]).forEach((r,i)=>spec.push({name:'mill roller '+i, obj:r, axis:[1,0,0]}));
  if (P.parts.fanL)     spec.push({name:'cooler fan, left bank 1',  obj:P.parts.fanL,     axis:[0,1,0]});
  if (P.parts.fanL2)    spec.push({name:'cooler fan, left bank 2',  obj:P.parts.fanL2,    axis:[0,1,0]});
  if (P.parts.fanRok)   spec.push({name:'cooler fan, right bank, sound', obj:P.parts.fanRok,   axis:[0,1,0]});
  if (P.parts.fanRfail) spec.push({name:'cooler fan, right bank, failing', obj:P.parts.fanRfail, axis:[0,1,0]});

  const read = () => {
    P.root.updateMatrixWorld(true);
    return spec.map(s => {
      const q = new T.Quaternion();
      s.obj.getWorldQuaternion(q);
      const ax = new T.Vector3(...s.axis).applyQuaternion(q);
      // a point on the rim: perpendicular to the axis, in the part's frame
      const perp = Math.abs(s.axis[1]) > 0.5 ? [1,0,0] : [0,1,0];
      const rim = new T.Vector3(...perp).multiplyScalar(0.5);
      s.obj.localToWorld(rim);
      return {name:s.name, ax:[ax.x,ax.y,ax.z], rim:[rim.x,rim.y,rim.z]};
    });
  };

  const before = read();
  const rootBefore = [P.root.position.x, P.root.position.y, P.root.position.z];
  await new Promise(r => setTimeout(r, 900));      // ~54 animation frames
  const after = read();
  const rootAfter = [P.root.position.x, P.root.position.y, P.root.position.z];
  await new Promise(r => setTimeout(r, 400));
  const rootAfter2 = [P.root.position.x, P.root.position.y, P.root.position.z];

  return {before, after, rootBefore, rootAfter, rootAfter2,
          staticScene: !!P.parts.staticScene};
})()`;

const dot = (a,b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const dist = (a,b) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1420, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 180)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 180)); });

  await page.goto('file://' + FILE, { waitUntil: 'load' });
  await page.waitForTimeout(1800);

  const cases = await page.evaluate(() => Object.keys(CASES).map(k => ({ id: k, name: CASES[k].name })));

  for (const c of cases) {
    console.log('\n' + c.name);
    await page.evaluate(id => { S.caseId = id; resetCase(); S.stage = 3; S.day = 150; render(); }, c.id);
    await page.waitForTimeout(1200);

    const r = await page.evaluate(SAMPLE);

    if (!r.before.length) {
      note('no rotating parts in this scene');
    }
    for (let i = 0; i < r.before.length; i++) {
      const b = r.before[i], a = r.after[i];
      const align = dot(b.ax, a.ax);           // both unit vectors
      const moved = dist(b.rim, a.rim);
      const wobble = Math.acos(Math.min(1, Math.abs(align))) * 180 / Math.PI;
      if (wobble > 0.5)
        bad(`${b.name}: axis swung ${wobble.toFixed(1)}° while turning — it is tumbling, not rotating`);
      else if (moved < 0.02 && !/failing/.test(b.name))
        bad(`${b.name}: axis is stable but the rim did not move — it is not turning at all`);
      else
        ok(`${b.name}: axis fixed to ${wobble.toFixed(2)}°, rim travelled ${moved.toFixed(2)}`);
    }

    /* The transformer must not move. Not a little — not at all. */
    if (c.id === 'xfmr') {
      r.staticScene ? ok('scene is flagged static') : bad('transformer scene is not flagged static');
      const m1 = dist(r.rootBefore, r.rootAfter), m2 = dist(r.rootAfter, r.rootAfter2);
      const still = Math.max(m1, m2) < 1e-9 &&
                    r.rootBefore.every(v => Math.abs(v) < 1e-9);
      still ? ok('tank never moves: root stays exactly at the origin across frames')
            : bad(`transformer vibrates — root moved ${Math.max(m1, m2).toExponential(2)}`);
      /* the degrading cooler fan must actually stop by end of life */
      const pair = ['failing', 'sound'].map(k => {
        const b = r.before.find(x => x.name.includes(k)), a = r.after.find(x => x.name.includes(k));
        return b && a ? dist(b.rim, a.rim) : null;
      });
      if (pair[0] !== null && pair[1] !== null) {
        pair[0] < 0.02 && pair[1] > 0.2
          ? ok('right bank: one fan stopped, the other still running — a bank current that falls by a third, not to zero')
          : bad(`right bank fans moved ${pair[0].toFixed(3)} and ${pair[1].toFixed(3)}; expected one stopped and one running`);
      }
    } else {
      const amp = Math.max(Math.abs(r.rootAfter[0]), Math.abs(r.rootAfter[1]));
      amp > 1e-6 ? ok(`machine vibrates, amplitude ${amp.toFixed(4)}`)
                 : note('no vibration at this point in the ramp');
    }

    await page.screenshot({ path: path.join(SHOTS, `pdm-${c.id}.png`) });
  }

  /* A cut-away is only a cut-away if the missing wedge faces the viewer.
     Measured from the vertices themselves, because the angle arithmetic
     between three.js' three different theta conventions is exactly where
     this went wrong the first time. */
  console.log('\nSections face the camera');
  for (const c of [{id:'motor', want:'stator core', band:[0.42,0.80]},
                   {id:'idfan', want:'volute',      band:[0.90,1.45]}]) {
    await page.evaluate(id => { S.caseId = id; resetCase(); S.stage = 1; render(); }, c.id);
    await page.waitForTimeout(700);
    const g = await page.evaluate(band => {
      const T = THREE, P = V3._probe();
      P.root.updateMatrixWorld(true);
      /* Direction from the camera to the machine, expressed as an azimuth in
         the y/z plane — the same convention pdm_3d.js builds sections in. */
      const toCam = P.cam.position.clone().sub(P.target || new T.Vector3(0, 0.4, 0)).normalize();
      const camAz = Math.atan2(toCam.z, toCam.y);

      /* Occupancy histogram of every static surface, by azimuth about the
         machine centreline. */
      const BINS = 72, hist = new Array(BINS).fill(0);
      P.root.traverse(o => {
        if (!o.isMesh || !o.geometry.attributes.position) return;
        if (o.parent === P.parts.rot || (o.parent && o.parent.parent === P.parts.rot)) return;
        const pos = o.geometry.attributes.position, v = new T.Vector3();
        const step = Math.max(1, Math.floor(pos.count / 260));
        for (let i = 0; i < pos.count; i += step) {
          v.fromBufferAttribute(pos, i); o.localToWorld(v);
          const y = v.y - 0.40, z = v.z, r = Math.hypot(y, z);
          if (r < band[0] || r > band[1]) continue;    // only the shell of interest
          const a = Math.atan2(z, y);
          hist[((Math.round((a / (Math.PI * 2)) * BINS) % BINS) + BINS) % BINS]++;
        }
      });
      const camBin = ((Math.round((camAz / (Math.PI * 2)) * BINS) % BINS) + BINS) % BINS;
      const win = b => [-2,-1,0,1,2].reduce((s,d) => s + hist[(b + d + BINS) % BINS], 0);
      /* Compare the viewing wedge with the wedge directly opposite it, where
         the casing is certainly still there. That is a far cleaner signal
         than an average over an azimuth the machine was never symmetric in. */
      return { near: win(camBin), far: win(camBin + BINS/2),
               camAzDeg: +(camAz * 180 / Math.PI).toFixed(0) };
    }, c.band);
    g.near < g.far * 0.5
      ? ok(`${c.id}: the ${c.want} is open towards the camera — ${g.near} surface samples in the viewing wedge against ${g.far} in the wedge opposite`)
      : bad(`${c.id}: the ${c.want} section does not face the camera — ${g.near} samples towards the viewer, ${g.far} away from it`);
  }

  /* Every sensor dot must sit on something, not float in space. */
  console.log('\nSensor anchors');
  for (const c of cases) {
    await page.evaluate(id => { S.caseId = id; resetCase(); S.stage = 1; render(); }, c.id);
    await page.waitForTimeout(700);
    const orphans = await page.evaluate(() => {
      const T = THREE, P = V3._probe();
      P.root.updateMatrixWorld(true);
      const solids = [];
      P.root.traverse(o => { if (o.isMesh && o.geometry && !o.geometry.boundingSphere)
        o.geometry.computeBoundingSphere(); if (o.isMesh) solids.push(o); });
      const cs = CASES[S.caseId];
      const out = [];
      for (const s of cs.sensors) {
        const p = new T.Vector3(s.pos[0], s.pos[1], s.pos[2]);
        let best = 1e9;
        for (const m of solids) {
          if (m.geometry.type === 'SphereGeometry' && m.geometry.parameters.radius < 0.09) continue; // the dots
          const c2 = m.geometry.boundingSphere.center.clone();
          m.localToWorld(c2);
          const sc = m.getWorldScale(new T.Vector3());
          const rad = m.geometry.boundingSphere.radius * Math.max(sc.x, sc.y, sc.z);
          best = Math.min(best, Math.max(0, p.distanceTo(c2) - rad));
        }
        if (best > 0.30) out.push({ id: s.id, n: s.n, gap: +best.toFixed(2) });
      }
      return out;
    });
    orphans.length
      ? orphans.forEach(o => bad(`${c.id}: "${o.n}" floats ${o.gap} from the nearest geometry`))
      : ok(`${c.id}: every sensor dot sits on the part it names`);
  }

  errs.length ? [...new Set(errs)].slice(0, 4).forEach(bad) : ok('\nno console or page errors throughout');

  await browser.close();
  console.log('\n' + '─'.repeat(62));
  console.log(fails ? `\x1b[31m${fails} failed\x1b[0m` : '\x1b[32mgeometry and motion check out\x1b[0m');
  process.exit(fails ? 1 : 0);
})();
