/* =========================================================================
   MODULE 1 — Feature-space theatre: k-nearest neighbours and the residual
   ========================================================================= */
const M1 = (function(){
  const S = 5.2;                      // cube size in world units
  const AX = {
    x:{lo:230, hi:672, n:'UNIT LOAD  MW',  f:r=>r.load},
    y:{lo:52,  hi:90,  n:'BEARING  °C',    f:r=>r.brgT},
    z:{lo:21,  hi:42,  n:'AMBIENT  °C',    f:r=>r.amb}
  };
  const nx=r=>clamp((AX.x.f(r)-AX.x.lo)/(AX.x.hi-AX.x.lo),0,1)*S;
  const ny=r=>clamp((AX.y.f(r)-AX.y.lo)/(AX.y.hi-AX.y.lo),0,1)*S;
  const nz=r=>clamp((AX.z.f(r)-AX.z.lo)/(AX.z.hi-AX.z.lo),0,1)*S;
  const nyv=v=>clamp((v-AX.y.lo)/(AX.y.hi-AX.y.lo),0,1)*S;
  const P = r => new THREE.Vector3(nx(r), ny(r), nz(r));

  /* the drivers the distance may be computed on */
  const DRV2 = [{k:'load',n:'Unit load'},{k:'amb',n:'Ambient temp'}];
  const DRV12= [{k:'load',n:'Unit load'},{k:'amb',n:'Ambient temp'},{k:'flow',n:'Fan flow'},
                {k:'cw',n:'CW inlet temp'},{k:'dp',n:'Fan diff pressure'},{k:'curr',n:'Motor current'},
                {k:'msT',n:'Main steam temp'},{k:'o2',n:'Flue gas O₂'},{k:'mills',n:'Mills in service'},
                {k:'auxP',n:'Aux power %'},{k:'coalGCV',n:'As-fired GCV'},{k:'hod',n:'Hour of day'}];

  const st = {
    day:96, k:12, metric:'std', drivers:'d2', contam:false, win:21,
    memEnd:78, nb:[], pred:0, act:0, ready:false
  };
  let cloud, cloudRecent, qDot, pDot, resTube, links=[], gAxes, labQ, labP, labR, ringG;
  let basePos=[], baseCol=[], memRows=[], recentRows=[], stats={};

  /* ---------- memory sets ---------- */
  function inWindow(r, day){
    return st.contam ? (r.day < day && r.day >= day - st.win) : (r.day < st.memEnd);
  }
  function buildSets(){
    memRows=[]; recentRows=[];
    for(let i=0;i<DATA.N;i+=2){
      const r = DATA.rows[i];
      if(!inWindow(r, st.day)) continue;
      if(r.day < DATA.FAULT_ON) memRows.push(r); else recentRows.push(r);
    }
    const all = memRows.concat(recentRows);
    stats = {};
    DRV12.forEach(d=>{ const a=all.map(r=>r[d.k]); stats[d.k]={m:mean(a), s:sd(a)||1}; });
  }
  function poolRows(){ return memRows.concat(recentRows); }
  function drvList(){ return st.drivers==='d2' ? DRV2 : DRV12; }
  function dist(a,b){
    const L=drvList(); let s=0;
    for(const d of L){
      let u=a[d.k]-b[d.k];
      if(st.metric==='std') u/=stats[d.k].s;
      s+=u*u;
    }
    return Math.sqrt(s);
  }
  function knn(q, kk){
    const pool = poolRows();
    const arr = new Array(pool.length);
    for(let i=0;i<pool.length;i++) arr[i]={r:pool[i], d:dist(q,pool[i])};
    arr.sort((a,b)=>a.d-b.d);
    return arr.slice(0, kk);
  }
  function predict(nb){
    let sw=0, sv=0;
    for(const n of nb){ const w=1/(n.d+0.06); sw+=w; sv+=w*n.r.brgT; n.w=w; }
    for(const n of nb) n.wn = n.w/sw;
    return sv/sw;
  }
  function qRow(){ const i=Math.round(st.day*DATA.HRS)+SPEC.hour; return DATA.rows[Math.min(i,DATA.N-1)]; }

  /* residual trace over days, with current settings */
  function trace(){
    const out=[]; const kk=st.k;
    for(let d=Math.max(6,st.memEnd-46); d<=130; d+=1){
      const i=Math.round(d*DATA.HRS)+SPEC.hour; if(i>=DATA.N) break;
      const r=DATA.rows[i];
      const pool = [];
      for(let j=0;j<DATA.N;j+=2){ const x=DATA.rows[j];
        if(st.contam ? (x.day<d && x.day>=d-st.win) : (x.day<st.memEnd)) pool.push(x); }
      // cheap: reuse memRows-based search but bound by pool
      const arr=[]; for(let j=0;j<pool.length;j++){ const p=pool[j]; if(p.i===r.i) continue;
        arr.push({r:p,d:dist(r,p)}); }
      arr.sort((a,b)=>a.d-b.d);
      const nb=arr.slice(0,kk); const pr=predict(nb);
      out.push([d, r.brgT-pr]);
    }
    return out;
  }
  let traceCache=null, traceKey='';
  function traceGet(){ const key=[st.k,st.metric,st.drivers,st.contam,st.win,Math.round(st.day)].join('|');
    if(key!==traceKey){ traceKey=key; traceCache=trace(); } return traceCache; }

  /* ---------- scene ---------- */
  function build(){
    buildSets();
    gAxes = TH3.axisFrame({size:S, names:[AX.x.n, AX.y.n, AX.z.n],
      colors:[0x5E7488,0x5E7488,0x5E7488],
      ticks:[{axis:0,at:0.02,t:'230'},{axis:0,at:1.0,t:'670 MW'},
             {axis:1,at:1.0,t:'90 °C'},{axis:1,at:0.05,t:'52'},
             {axis:2,at:1.0,t:'42 °C'}]});
    TH3.root.add(gAxes);

    makeClouds();

    qDot = TH3.sph(0.155, TH3.COL.ember, {emis:0.85, rough:.3}); TH3.root.add(qDot);
    ringG = new THREE.Mesh(new THREE.TorusGeometry(0.30,0.016,8,36), TH3.basic(TH3.COL.ember,0.75));
    TH3.root.add(ringG);
    pDot = TH3.sph(0.135, TH3.COL.teal, {emis:0.8, rough:.3}); TH3.root.add(pDot);
    resTube = TH3.tube(new THREE.Vector3(0,0,0), new THREE.Vector3(0,1,0), 0.042, TH3.COL.hot, {emis:0.6});
    TH3.root.add(resTube);

    labQ = TH3.label('', qDot, 'em').offset(15,-17);
    labP = TH3.label('', pDot, 'tl').offset(15,15);
    labR = TH3.label('', new THREE.Vector3(), 'rd').offset(-14,0);

    TH3.setCam(0.86, 0.36, 12.6, new THREE.Vector3(S/2, S/2, S/2), false);
    st.ready=true;
    recompute();
  }

  function clearLinks(){ links.forEach(l=>TH3.root.remove(l)); links=[]; }

  function makeClouds(){
    if(cloud){ TH3.root.remove(cloud); cloud.geometry.dispose(); }
    if(cloudRecent){ TH3.root.remove(cloudRecent); cloudRecent.geometry.dispose(); }
    const bp=[], bc=[];
    memRows.forEach(r=>{ const p=P(r); bp.push(p.x,p.y,p.z); bc.push(0.30,0.40,0.50); });
    cloud = TH3.points(bp.length?bp:[0,0,0], bc.length?bc:[0.3,0.4,0.5], 0.085); TH3.root.add(cloud);
    const rp=[], rc=[];
    recentRows.forEach(r=>{ const p=P(r); rp.push(p.x,p.y,p.z); rc.push(0.72,0.45,0.16); });
    cloudRecent = TH3.points(rp.length?rp:[0,-99,0], rc.length?rc:[0.7,0.45,0.16], 0.105);
    cloudRecent.visible = st.contam && recentRows.length>0; TH3.root.add(cloudRecent);
  }
  function resetSets(){ buildSets(); makeClouds(); recompute(); }

  function recompute(){
    if(!st.ready) return;
    const q = qRow();
    st.nb = knn(q, st.k);
    st.pred = predict(st.nb);
    st.qRow = q;

    // recolour the cloud: neighbours ember, rest slate
    const col = cloud.geometry.attributes.color;
    for(let i=0;i<memRows.length;i++){ col.setXYZ(i, 0.30,0.40,0.50); }
    const idxOf = new Map(); memRows.forEach((r,i)=>idxOf.set(r.i,i));
    st.nb.forEach(n=>{ const k=idxOf.get(n.r.i); if(k!==undefined) col.setXYZ(k, 0.90,0.62,0.24); });
    col.needsUpdate = true;

    if(cloudRecent && recentRows.length){
      const rc = cloudRecent.geometry.attributes.color;
      const idx2 = new Map(); recentRows.forEach((r,i)=>idx2.set(r.i,i));
      for(let i=0;i<recentRows.length;i++) rc.setXYZ(i, 0.62,0.36,0.16);
      st.nb.forEach(n=>{ const k=idx2.get(n.r.i); if(k!==undefined) rc.setXYZ(k, 0.95,0.66,0.26); });
      rc.needsUpdate=true;
    }

    const qp = P(q);
    qDot.position.copy(qp); ringG.position.copy(qp);
    const pp = new THREE.Vector3(qp.x, nyv(st.pred), qp.z);
    pDot.position.copy(pp);
    resTube.userData.setEnds(pp, qp, 0.042);
    resTube.visible = st.act>=3;
    pDot.visible = st.act>=3;

    labQ.set('actual <b>'+f1(q.brgT)+' °C</b>');
    labP.set('expected '+f1(st.pred)+' °C').show(st.act>=3);
    const rr = q.brgT-st.pred;
    labR.el.style.transform='translate(-100%,-50%)';
    labR.at(new THREE.Vector3(qp.x, (qp.y+pp.y)/2, qp.z))
        .set('residual <b>'+(rr>=0?'+':'')+f1(rr)+' °C</b>').show(st.act>=3);

    // links
    clearLinks();
    if(st.act>=2){
      const wmax = Math.max(...st.nb.map(n=>n.wn));
      st.nb.forEach(n=>{
        const r = 0.012 + 0.055*(n.wn/wmax);
        const t = TH3.tube(P(n.r), qp, r, 0xE0A63A, {emis:0.45, rough:.55, op:0.88, seg:6});
        t.userData.growA = P(n.r); t.userData.growB = qp.clone(); t.userData.r = r;
        TH3.root.add(t); links.push(t);
      });
    }
    if(window.THEATRE) THEATRE.repanel();
  }

  function enter(a){
    st.act=a;
    if(a===4 && !st.contam){ st.contam=true; }
    if(a<4 && st.contam && !st._userContam){ st.contam=false; }
    resetSets();
    cloud.visible = true;
    cloudRecent.visible = (st.contam && recentRows.length>0);
    qDot.visible = a>=1; ringG.visible = a>=1;
    if(a===0) TH3.setCam(0.86, 0.36, 12.8, new THREE.Vector3(S/2,S/2,S/2), 900);
    if(a===2) TH3.setCam(1.32, 0.30, 10.4, new THREE.Vector3(P(qRow()).x*0.55+S*0.24, S*0.52, P(qRow()).z*0.55+S*0.24), 1100);
    if(a===3) TH3.setCam(1.55, 0.12, 8.4, P(qRow()).clone().lerp(new THREE.Vector3(S/2,S/2,S/2),0.35), 1100);
    if(a===4) TH3.setCam(1.10, 0.28, 11.6, new THREE.Vector3(S/2,S/2,S/2), 1100);
  }

  function tick(u, t){
    if(!st.ready) return;
    ringG.lookAt(TH3.cam.position);
    ringG.scale.setScalar(1 + 0.22*Math.sin(t*2.6));
    ringG.material.opacity = 0.30 + 0.35*Math.abs(Math.sin(t*2.6));
    qDot.scale.setScalar(1 + 0.06*Math.sin(t*3.1));

    if(st.act===0){
      // reveal the cloud
      const n = memRows.length, show = Math.floor(n*ease(u));
      cloud.geometry.setDrawRange(0, Math.max(1,show));
    } else {
      cloud.geometry.setDrawRange(0, memRows.length);
    }
    if(st.act===1){ qDot.position.y = lerp(nyv(AX.y.hi)+1.4, ny(st.qRow), easeIO(clamp(u*1.5,0,1)));
      ringG.position.y = qDot.position.y; }
    else if(st.qRow){ qDot.position.y = ny(st.qRow); ringG.position.y = qDot.position.y; }

    if(st.act===2){
      const g = easeIO(clamp(u*1.25,0,1));
      links.forEach(l=>{ const a=l.userData.growA, b=l.userData.growB;
        l.userData.setEnds(a, new THREE.Vector3().lerpVectors(a,b,Math.max(0.02,g)), l.userData.r); });
    } else links.forEach(l=>l.userData.setEnds(l.userData.growA, l.userData.growB, l.userData.r));

    if(st.act===3){
      const g = easeIO(clamp(u*1.3,0,1));
      const qp = qDot.position, pp = pDot.position;
      resTube.userData.setEnds(pp, new THREE.Vector3().lerpVectors(pp,qp,Math.max(0.02,g)), 0.042);
    }
    if(st.act===4){
      const g = easeIO(clamp(u*1.2,0,1));
      cloudRecent.visible = st.contam;
      if(cloudRecent.material) cloudRecent.material.opacity = 0.15+0.8*g;
    }
  }

  /* ---------- panel ---------- */
  function num(){
    if(!st.qRow) return null;
    const r = st.qRow.brgT-st.pred;
    if(st.act<3) return {k:'Reading on day '+f1(st.day), v:f1(st.qRow.brgT)+' °C', s:'alarm 85 · trip 90 · silent'};
    return {k:'Residual', v:(r>=0?'+':'')+f1(r)+' °C', s:'actual '+f1(st.qRow.brgT)+' − expected '+f1(st.pred)};
  }

  function panel(){
    const q=st.qRow||qRow(); const r=q.brgT-st.pred;
    const tr = traceGet();
    const pre = tr.filter(p=>p[0]<DATA.FAULT_ON-2).map(p=>p[1]);
    const rs = sd(pre), rm = mean(pre);
    const sig = rs>0 ? (r-rm)/rs : 0;
    const nb = st.nb;
    const dmax = nb.length? nb[nb.length-1].d : 0;

    let rows='';
    nb.slice(0,10).forEach((n,i)=>{
      rows += `<tr${i<3?' class="hi"':''}><td class="num">${f1(n.r.day)}</td>`+
        `<td class="num">${f0(n.r.load)}</td><td class="num">${f1(n.r.amb)}</td>`+
        `<td class="num">${f1(n.r.brgT)}</td><td class="num">${f2(n.d)}</td>`+
        `<td class="num">${(n.wn*100).toFixed(1)}%</td></tr>`;
    });

    return `
<div class="hd2"><div class="k">Module 1 · nearest neighbours</div>
<h2>The machine remembers every hour it has ever run</h2>
<p>k-nearest-neighbour regression — the family the industry sells as <b>MSET</b>. No equation of the fan is
written down. The model simply looks up the most similar hours in its memory and asks what the bearing
did then.</p></div>

<div class="card"><h3>The specimen<span class="tag">follow this number</span></h3>
<div class="stats">
  <div class="stat"><div class="l">Actual</div><div class="n em">${f1(q.brgT)} °C</div>
    <div class="s">day ${f1(st.day)}, ${SPEC.tag}</div></div>
  <div class="stat"><div class="l">Expected</div><div class="n tl">${f1(st.pred)} °C</div>
    <div class="s">weighted mean of ${st.k} neighbours</div></div>
  <div class="stat"><div class="l">Residual</div><div class="n ${Math.abs(sig)>3?'rd':'gn'}">${r>=0?'+':''}${f1(r)} °C</div>
    <div class="s">${f1(sig)}σ against healthy scatter</div></div>
  <div class="stat"><div class="l">Clean-period scatter</div><div class="n">± ${f2(rs)} °C</div>
    <div class="s">1σ of the residual before day ${DATA.FAULT_ON} — lower is a better model</div></div>
</div>
<div class="${Math.abs(sig)>3?'bad':'note'}">
${Math.abs(sig)>3
 ? `<b>85 °C alarm: silent. 90 °C trip: silent.</b> The absolute value is unremarkable. What is remarkable is
    that on ${st.k} previous occasions when this fan carried ${f0(q.load)} MW into ${f1(q.amb)} °C air, the
    bearing sat at about ${f1(st.pred)} °C. It is now ${f1(Math.abs(r))} °C hotter than its own history says
    it should be. That gap is the signal — not the temperature.`
 : (st.contam
    ? `<b>The residual has collapsed — and the machine is no better.</b> With a ${st.win}-day rolling window the
       model’s idea of normal is built largely from hours that are already degrading, so it now expects the
       bearing to be hot. Widen the window, or switch the baseline back to frozen, and the same reading is a
       ${f1(Math.abs(cleanResidual()/(rs||1)))}σ event again.`
    : `At these settings the residual is inside normal scatter. Move the day slider past ${DATA.FAULT_ON} and
       watch it open up — or switch to a rolling retrain window and watch it close again for the wrong reason.`)}
</div></div>

<div class="card"><h3>Controls</h3>
<div class="ctl"><label>Day of the campaign <span class="v" id="m1dayv">${f1(st.day)}</span></label>
  <input type="range" id="m1day" min="40" max="130" step="0.5" value="${st.day}">
  <div class="hint">Degradation begins on day ${DATA.FAULT_ON}. The reading crosses the 85 °C alarm only on day ${crossDay()}.</div></div>
<div class="ctl"><label>k — how many neighbours <span class="v" id="m1kv">${st.k}</span></label>
  <input type="range" id="m1k" min="1" max="40" step="1" value="${st.k}">
  <div class="hint">k = 1 copies one past hour and is jumpy. Large k averages over hours that are not really similar.</div></div>
<div class="ctl"><label>Distance metric</label>
  <select id="m1metric">
    <option value="std"${st.metric==='std'?' selected':''}>Standardised — each driver divided by its own σ</option>
    <option value="raw"${st.metric==='raw'?' selected':''}>Raw engineering units — MW, °C, m³/s as they come</option>
  </select>
  <div class="hint">${st.metric==='raw'
    ? '<b style="color:#A8261E">Raw units: load spans '+f0(stats.load.s)+' MW of σ against ambient’s '+f1(stats.amb.s)+' °C. Load is '+f0(stats.load.s/stats.amb.s)+'× louder, so ambient is effectively ignored</b> — the neighbour list matches load closely and lets ambient wander. Judge it on the clean-period scatter above, not on today’s residual: a model can look more dramatic and be less trustworthy.'
    : 'Every driver contributes on equal terms. Compare the clean-period scatter above against raw units.'}</div></div>
<div class="ctl"><label>Drivers used for the distance</label>
  <select id="m1drv">
    <option value="d2"${st.drivers==='d2'?' selected':''}>2 drivers — load and ambient (the two you can see)</option>
    <option value="d12"${st.drivers==='d12'?' selected':''}>12 drivers — the real model</option>
  </select>
  <div class="hint">${st.drivers==='d12'
    ? 'Some highlighted neighbours now look far away on screen. They are not — they are close in the ten dimensions this picture cannot draw. Note also that the clean-period scatter above does not necessarily improve: on this bearing, load and ambient carry nearly all the information, and the extra tags mostly add noise. <b>More inputs is not automatically a better model.</b>'
    : 'Distance is computed on exactly the two axes drawn, so every neighbour looks close.'}</div></div>
<label class="tog"><input type="checkbox" id="m1contam"${st.contam?' checked':''}>
  <span><b>Rolling retrain window</b> — instead of a frozen clean baseline, let the model re-learn from
  whatever the last few weeks looked like</span></label>
${st.contam?`<div class="ctl"><label>Retrain window <span class="v" id="m1winv">${st.win} days</span></label>
  <input type="range" id="m1win" min="7" max="70" step="1" value="${st.win}">
  <div class="hint">Memory now holds days ${f1(st.day-st.win)}–${f1(st.day)}: ${memRows.length} clean hours and
  <b>${recentRows.length} already-degrading hours</b>. Shorten the window and the degrading hours dominate.</div></div>`:''}
</div>

${st.contam?`<div class="bad"><b>This is the most common way a good model is quietly killed.</b>
A rolling retrain window sounds like good practice — the plant changes, so keep the model current. But the fan
is degrading, and ${(100*recentRows.length/Math.max(1,memRows.length+recentRows.length)).toFixed(0)}% of what
the model now calls "normal" is already faulty. The expected value climbs with the fault and the residual falls
to <b>${f1(r)} °C</b> against ${f1(cleanResidual())} °C on a frozen clean baseline. Nothing alarms. The machine
still fails.<br><br><b>What to insist on:</b> freeze the reference window at a documented healthy period; move
it only after a repair, an overhaul or a genuine plant change; and record in the model’s log the exact dates the
baseline covers. If a vendor cannot tell you which days their model calls normal, that is the finding.</div>`:''}

<div class="card"><h3>The ${Math.min(10,st.k)} nearest hours in memory</h3>
<div class="tw"><table><thead><tr><th class="num">Day</th><th class="num">Load MW</th>
<th class="num">Amb °C</th><th class="num">Bearing °C</th><th class="num">Distance</th><th class="num">Weight</th></tr></thead>
<tbody>${rows}</tbody></table></div>
<div class="small" style="margin-top:6px">Weight = 1 / (distance + 0.06), normalised. Furthest of the ${st.k}
neighbours sits at ${f2(dmax)} ${st.metric==='std'?'σ':'raw units'} away.</div></div>

<div class="card"><h3>Residual through the campaign</h3>
<canvas class="ch" id="m1ch"></canvas>
<div class="legend"><span><i style="background:#D96A16"></i>residual, °C</span>
<span><i style="background:#A8261E"></i>3σ detection line</span>
<span><i style="background:#11707F"></i>fault onset, day ${DATA.FAULT_ON}</span></div></div>

<div class="card"><h3>What is actually being computed</h3>
<div class="eq"><span class="c"># 1. put every driver on the same footing</span>
z<span class="o">ᵢ</span> = (xᵢ − mean<span class="o">ᵢ</span>) / σ<span class="o">ᵢ</span>            <span class="c">from the clean window only</span>

<span class="c"># 2. distance from the new hour to every remembered hour</span>
d(q, m) = √( Σᵢ (z<span class="o">ᵢ</span><span class="t">q</span> − z<span class="o">ᵢ</span><span class="t">m</span>)² )

<span class="c"># 3. keep the k smallest, weight them by closeness</span>
w<span class="t">m</span> = 1 / (d(q,m) + ε)      ŷ = Σ w<span class="t">m</span> y<span class="t">m</span> / Σ w<span class="t">m</span>

<span class="c"># 4. the number that matters</span>
<span class="r">residual = y − ŷ</span>      <span class="c">alarm when |residual| &gt; 3σ for h hours</span></div>
<div class="small">That is the whole algorithm. There is no training in the usual sense — the "model" is the
table of past hours. This is why vendors can install it in weeks and why it fails the moment the memory is
polluted or the plant genuinely changes.</div></div>

<div class="card"><h3>Where it breaks</h3>
<table><thead><tr><th>Failure</th><th>What you see</th><th>What to do</th></tr></thead><tbody>
<tr><td><b>Unseen operating point</b></td><td>Unit runs at a load it has never run at. Nearest neighbours are far away; the prediction is an extrapolation dressed as a lookup.</td><td>Publish the distance to the k-th neighbour with every alarm. Suppress alarms when it is large.</td></tr>
<tr><td><b>Contaminated memory</b></td><td>Residual quietly returns to zero while the machine gets worse.</td><td>Freeze the reference window. Re-baseline only after a documented repair.</td></tr>
<tr><td><b>Unscaled distance</b></td><td>One large-magnitude tag decides every neighbour.</td><td>Standardise. Check by asking the vendor to show you a neighbour list.</td></tr>
<tr><td><b>Step change after overhaul</b></td><td>Every residual jumps on the day the unit returns from an outage.</td><td>Treat the overhaul as a hard boundary; start a new memory.</td></tr>
<tr><td><b>Sensor drift</b></td><td>A slow residual on one tag with no corroborating tag.</td><td>Require two independent tags to move before a work order is raised.</td></tr>
</tbody></table></div>`;
  }

  function cleanResidual(){
    const saveC=st.contam; st.contam=false; buildSets();
    const q=qRow(); const nb=knn(q, st.k); const pr=predict(nb);
    st.contam=saveC; buildSets();
    return q.brgT-pr;
  }
  function crossDay(){
    for(let d=DATA.FAULT_ON; d<DATA.DAYS; d+=0.5){
      const i=Math.round(d*DATA.HRS)+SPEC.hour; if(i>=DATA.N) break;
      if(DATA.rows[i].brgT>=SPEC.alarm) return f1(d);
    }
    return '>'+DATA.DAYS;
  }

  function wire(){
    const dv=$('m1day'); if(dv) dv.oninput=e=>{ st.day=+e.target.value; $('m1dayv').textContent=f1(st.day); resetSets(); };
    const kv=$('m1k'); if(kv) kv.oninput=e=>{ st.k=+e.target.value; $('m1kv').textContent=st.k; recompute(); };
    const mm=$('m1metric'); if(mm) mm.onchange=e=>{ st.metric=e.target.value; recompute(); };
    const dd=$('m1drv'); if(dd) dd.onchange=e=>{ st.drivers=e.target.value; recompute(); };
    const cc=$('m1contam'); if(cc) cc.onchange=e=>{ st.contam=e.target.checked; st._userContam=true; resetSets(); };
    const wv=$('m1win'); if(wv) wv.oninput=e=>{ st.win=+e.target.value; resetSets(); };
    const cv=$('m1ch'); if(cv){
      const tr=traceGet(); const pre=tr.filter(p=>p[0]<DATA.FAULT_ON-2).map(p=>p[1]);
      const s3=3*(sd(pre)||0.4)+mean(pre);
      chart(cv,{h:158, series:[{pts:tr, c:'#D96A16', w:1.9}],
        marks:[{y:s3, c:'#A8261E', t:'3σ'}, {y:-s3, c:'#A8261E'},
               {x:DATA.FAULT_ON, c:'#11707F', t:'fault begins'},
               {x:st.day, c:'#1C2530', w:1.6, dash:[2,2], t:'now', ta:'left'}],
        xfmt:v=>'d'+v.toFixed(0), yfmt:v=>v.toFixed(1), nx:6, title:'Residual, °C'});
    }
  }

  return {id:'knn', no:'MODULE 1', title:'Nearest neighbours — the residual made geometric',
    sub:'k-NN / MSET · how a model decides a normal-looking number is abnormal',
    dimcap:'3 of 40 dimensions',
    acts:[
      {t:'1 · The memory', d:5200, say:'Every dot is one hour this fan has already survived. Left to right, unit load. Front to back, ambient air temperature. Up, the bearing temperature that resulted. <b>The cloud is the machine’s own definition of normal</b> — nobody wrote it, the plant did.'},
      {t:'2 · A new hour arrives', d:3400, say:'Day 96, 14:00. The bearing reads <span class="em">74.2 °C</span>. The alarm is set at 85 and the trip at 90, so the control room sees nothing. The question the algorithm asks is not "is this high?" but <b>"is this high for these conditions?"</b>'},
      {t:'3 · Who has been here before?', d:4200, say:'The k closest hours light up and reach across to the new point. Thickness is weight — closer hours count for more. Note what "closest" means: closest in <b>load and ambient</b>, not closest in bearing temperature. The answer is not allowed to influence the question.'},
      {t:'4 · What should it have been?', d:4200, say:'The teal marker is the weighted average of what those neighbours’ bearings actually did. The red column between the two is the <b>residual</b>. A number that is invisible to a fixed limit becomes a 3σ event the moment you compare it with its own history.'},
      {t:'5 · Poisoned memory', d:5200, say:'Now replace the frozen baseline with a <b>rolling retrain window</b> — a perfectly reasonable-sounding request. The orange points are already-degrading hours that have joined the memory. The neighbours are themselves hot, the expected value climbs with the fault, and the residual falls towards zero. <b>The model has learned the fault as normal, and nothing alarms.</b>'}
    ],
    build, enter, tick, panel, wire, num, st};
})();
