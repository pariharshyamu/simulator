/* =========================================================================
   MODULE 6 — k-means: finding the operating regimes nobody labelled
   ========================================================================= */
const M6 = (function(){
  const F = [{k:'load', n:'Unit load', u:'MW'}, {k:'amb', n:'Ambient temp', u:'°C'},
             {k:'auxP', n:'Aux power', u:'%'},  {k:'msT', n:'Main steam temp', u:'°C'}];
  const AXI=[0,1,2];                         // which three are drawn
  const st = {k:8, seed:3, init:'pp', act:0, ready:false, iter:0, running:false,
              phase:'assign', converged:false, speed:1, showLinks:true};
  let PTS=[], Z=[], mu={}, sg={}, cent=[], asg=[], cloud, cDots=[], cRings=[], links=[], labs={}, elbow=[];
  const SC=1.42;
  const PAL=[0xD96A16,0x11707F,0x5B4A85,0x256B45,0x9A6408,0xA8261E,0x2E93A6,0xC08A3E];
  const PALc=PAL.map(c=>new THREE.Color(c));

  function prep(){
    PTS=[]; for(let i=0;i<DATA.N;i+=3) PTS.push(DATA.rows[i]);
    F.forEach(f=>{ const a=PTS.map(r=>r[f.k]); mu[f.k]=mean(a); sg[f.k]=sd(a)||1; });
    Z=PTS.map(r=>F.map(f=>(r[f.k]-mu[f.k])/sg[f.k]));
    AMBM=mu.amb;
    // elbow curve — run a full k-means for each k once
    elbow=[];
    for(let kk=2;kk<=12;kk++){ const R=run(kk, 3, 'pp', 30); elbow.push([kk, R.inertia]); }
  }
  const world = z => new THREE.Vector3(z[AXI[0]]*SC, z[AXI[1]]*SC, z[AXI[2]]*SC);
  function d2(a,b){ let s=0; for(let i=0;i<a.length;i++){ const u=a[i]-b[i]; s+=u*u; } return s; }

  function seedCent(kk, seed, how){
    const r=rng(seed*977+13);
    if(how==='random'){ const c=[]; const used=new Set();
      while(c.length<kk){ const i=Math.floor(r()*Z.length); if(used.has(i))continue; used.add(i); c.push(Z[i].slice()); }
      return c; }
    // k-means++
    const c=[Z[Math.floor(r()*Z.length)].slice()];
    while(c.length<kk){
      const d=Z.map(z=>Math.min(...c.map(q=>d2(z,q))));
      const tot=d.reduce((a,b)=>a+b,0); let t=r()*tot, i=0;
      while(t>0 && i<d.length-1){ t-=d[i]; i++; }
      c.push(Z[i].slice());
    }
    return c;
  }
  function assign(c){ return Z.map(z=>{ let b=0,bv=Infinity;
    for(let j=0;j<c.length;j++){ const v=d2(z,c[j]); if(v<bv){bv=v;b=j;} } return b; }); }
  function move(c,a){
    const s=c.map(()=>new Array(F.length).fill(0)), n=c.map(()=>0);
    Z.forEach((z,i)=>{ n[a[i]]++; for(let d=0;d<F.length;d++) s[a[i]][d]+=z[d]; });
    return c.map((q,j)=> n[j]? s[j].map(v=>v/n[j]) : q.slice());
  }
  function inertiaOf(c,a){ let t=0; Z.forEach((z,i)=>t+=d2(z,c[a[i]])); return t/Z.length; }
  function run(kk, seed, how, iters){
    let c=seedCent(kk,seed,how), a=assign(c);
    for(let t=0;t<iters;t++){ const c2=move(c,a); const a2=assign(c2);
      const same=a2.every((v,i)=>v===a[i]); c=c2; a=a2; if(same) break; }
    return {c, a, inertia:inertiaOf(c,a)};
  }

  /* ---------- scene ---------- */
  function build(){
    prep();
    const g=new THREE.Group();
    [[1,0,0],[0,1,0],[0,0,1]].forEach((d,i)=>{
      const L=3.6;
      g.add(TH3.tube(new THREE.Vector3(-d[0]*L,-d[1]*L,-d[2]*L), new THREE.Vector3(d[0]*L,d[1]*L,d[2]*L),
        0.011,0x4E6274,{emis:0.22,op:0.8}));
      TH3.label(F[AXI[i]].n.toUpperCase()+'  '+F[AXI[i]].u, new THREE.Vector3(d[0]*L*1.06,d[1]*L*1.06,d[2]*L*1.06),'ax')
        .offset(i===1?-6:8, i===1?-12:0);
    });
    TH3.root.add(g);

    const pos=[], col=[];
    Z.forEach(z=>{ const p=world(z); pos.push(p.x,p.y,p.z); col.push(0.46,0.56,0.66); });
    cloud=TH3.points(pos,col,0.088); TH3.root.add(cloud);

    reset(true);
    TH3.setCam(0.62, 0.42, 12.6, new THREE.Vector3(0,0,0), false);
    st.ready=true;
  }

  function clearCent(){ cDots.forEach(d=>TH3.root.remove(d)); cRings.forEach(r=>TH3.root.remove(r));
    Object.keys(labs).forEach(k=>{ if(k.startsWith('c')){ labs[k].remove(); delete labs[k]; } });
    cDots=[]; cRings=[]; }
  function clearLinks(){ links.forEach(l=>TH3.root.remove(l)); links=[]; }

  function reset(quiet){
    clearCent(); clearLinks();
    cent=seedCent(st.k, st.seed, st.init);
    asg=new Array(Z.length).fill(-1);
    st.iter=0; st.phase='assign'; st.converged=false;
    cent.forEach((c,j)=>{
      const d=TH3.sph(0.20, PAL[j%PAL.length], {emis:0.95, rough:.3});
      d.position.copy(world(c)); TH3.root.add(d); cDots.push(d);
      const r=new THREE.Mesh(new THREE.TorusGeometry(0.36,0.017,8,34), TH3.basic(PAL[j%PAL.length],0.7));
      r.position.copy(d.position); TH3.root.add(r); cRings.push(r);
      labs['c'+j]=TH3.label('centroid '+(j+1), d, '').offset(13,-13);
    });
    paint();
    if(!quiet && window.THEATRE) THEATRE.repanel();
  }

  function paint(){
    const col=cloud.geometry.attributes.color;
    Z.forEach((z,i)=>{
      if(asg[i]<0 || st.act<2){ col.setXYZ(i,0.40,0.50,0.60); }
      else { const c=PALc[asg[i]%PALc.length]; col.setXYZ(i, c.r*0.92, c.g*0.92, c.b*0.92); }
    });
    col.needsUpdate=true;
    cDots.forEach((d,j)=>{ d.position.copy(world(cent[j])); cRings[j].position.copy(d.position); });
  }

  function stepAssign(){ asg=assign(cent); st.phase='move'; paint(); drawLinks(); }
  function stepMove(){
    const prev=cent.map(c=>c.slice());
    cent=move(cent,asg); st.iter++; st.phase='assign';
    const shift=Math.max(...cent.map((c,j)=>Math.sqrt(d2(c,prev[j]))));
    if(shift<1e-4){ st.converged=true; st.running=false; }
    paint(); clearLinks();
  }
  function drawLinks(){
    clearLinks();
    if(!st.showLinks || st.act<2) return;
    for(let i=0;i<Z.length;i+=29){
      if(asg[i]<0) continue;
      const t=TH3.tube(world(Z[i]), world(cent[asg[i]]), 0.008, PAL[asg[i]%PAL.length],
        {emis:0.45, op:0.55, seg:4});
      TH3.root.add(t); links.push(t);
    }
  }

  function enter(a){
    st.act=a;
    if(a===0){ reset(true); TH3.autospin(0.075); TH3.setCam(0.62,0.42,12.8,new THREE.Vector3(0,0,0),1000); }
    else TH3.autospin(0.018);
    if(a===1){ reset(true); TH3.setCam(0.55,0.40,11.8,new THREE.Vector3(0,0,0),1100); }
    if(a===2){ reset(true); stepAssign(); TH3.setCam(0.78,0.46,11.4,new THREE.Vector3(0,0,0),1100); }
    if(a===3){ reset(true); stepAssign(); stepMove(); stepAssign(); TH3.setCam(0.50,0.50,11.6,new THREE.Vector3(0,0,0),1100); }
    if(a===4){ reset(true); st.running=true; TH3.setCam(0.66,0.44,12.4,new THREE.Vector3(0,0,0),1100); }
    if(a===5){ const R=run(st.k, st.seed, st.init, 60); cent=R.c; asg=R.a; st.converged=true; st.running=false;
      clearCent();
      cent.forEach((c,j)=>{ const d=TH3.sph(0.20, PAL[j%PAL.length], {emis:0.95, rough:.3});
        d.position.copy(world(c)); TH3.root.add(d); cDots.push(d);
        const r=new THREE.Mesh(new THREE.TorusGeometry(0.36,0.017,8,34), TH3.basic(PAL[j%PAL.length],0.7));
        r.position.copy(d.position); TH3.root.add(r); cRings.push(r);
        labs['c'+j]=TH3.label(regime(j).n, d, '').offset(13,-13); });
      paint(); clearLinks();
      TH3.setCam(0.72,0.40,12.0,new THREE.Vector3(0,0,0),1200); }
    if(window.THEATRE) THEATRE.repanel();
  }

  let acc=0;
  function tick(u,t){
    if(!st.ready) return;
    if(st.act===0){ cloud.geometry.setDrawRange(0, Math.max(1,Math.floor(Z.length*ease(u)))); }
    else cloud.geometry.setDrawRange(0, Z.length);
    if(st.running && !st.converged){
      acc++;
      if(acc % Math.max(1,Math.round(34/st.speed))===0){
        if(st.phase==='assign') stepAssign(); else stepMove();
        if(window.THEATRE) THEATRE.repanel();
      }
    }
    cRings.forEach((r,j)=>{ r.lookAt(TH3.cam.position);
      r.scale.setScalar(1+0.20*Math.sin(t*2.4+j)); r.material.opacity=0.3+0.35*Math.abs(Math.sin(t*2.4+j)); });
    cDots.forEach(d=>d.scale.setScalar(1+0.07*Math.sin(t*3)));
    if(st.act===1){ const g=easeIO(clamp(u*1.6,0,1)); cDots.forEach(d=>d.scale.setScalar(0.25+0.85*g)); }
  }

  /* ---------- regimes and the payoff ---------- */
  function clusterStats(){
    const out=[];
    for(let j=0;j<cent.length;j++){
      const idx=[]; for(let i=0;i<Z.length;i++) if(asg[i]===j) idx.push(i);
      const rows=idx.map(i=>PTS[i]);
      const healthy=rows.filter(r=>r.day<DATA.FAULT_ON-4);
      out.push({j, n:rows.length,
        load:mean(rows.map(r=>r.load)), msT:mean(rows.map(r=>r.msT)),
        auxP:mean(rows.map(r=>r.auxP)), amb:mean(rows.map(r=>r.amb)),
        bm:mean(healthy.map(r=>r.brgT)), bs:sd(healthy.map(r=>r.brgT))||1, hn:healthy.length});
    }
    return out.sort((a,b)=>a.load-b.load);
  }
  function regime(j){
    const s=clusterStats().find(x=>x.j===j) || {load:0,msT:0};
    return {n: nameFor(s), s};
  }
  let AMBM=0;
  function nameFor(s){
    let base;
    if(s.msT<508) base='Start-up · low steam temperature';
    else if(s.load<300) base='Reserve shut-down approach';
    else if(s.load<420) base='Technical minimum · backing down';
    else if(s.load<500) base='Low part load';
    else if(s.load<562) base='Upper part load';
    else if(s.load<612) base='High load';
    else base='Near full load';
    if(base==='Start-up · low steam temperature'||base==='Reserve shut-down approach') return base;
    if(s.amb>AMBM+2.2) return base+' · hot ambient';
    if(s.amb<AMBM-2.2) return base+' · cool ambient';
    return base+' · mid ambient';
  }
  function crossings(){
    const CS=clusterStats(); const byJ={}; CS.forEach(x=>byJ[x.j]=x);
    const allH=PTS.filter(r=>r.day<DATA.FAULT_ON-4).map(r=>r.brgT);
    const gm=mean(allH), gs=sd(allH)||1, gLim=gm+3*gs;
    let dR=null,dG=null,dA=null, rR=0,rG=0,rA=0, specLim=gLim;
    for(let d=DATA.FAULT_ON-8; d<=DATA.DAYS-1; d+=0.5){
      const i=Math.round(d*DATA.HRS)+SPEC.hour; if(i>=DATA.N) break;
      const r=DATA.rows[i];
      const z=F.map(f=>(r[f.k]-mu[f.k])/sg[f.k]);
      let b=0,bv=Infinity; for(let j=0;j<cent.length;j++){ const v=d2(z,cent[j]); if(v<bv){bv=v;b=j;} }
      const S=byJ[b]; const rl = (S && S.hn>25)? S.bm+3*S.bs : gLim;
      if(Math.abs(d-SPEC.day)<0.26) specLim=rl;
      if(r.brgT>rl){ rR++; if(rR>=4 && dR===null) dR=d; } else rR=0;
      if(r.brgT>gLim){ rG++; if(rG>=4 && dG===null) dG=d; } else rG=0;
      if(r.brgT>SPEC.alarm){ rA++; if(rA>=4 && dA===null) dA=d; } else rA=0;
    }
    return {gm,gs,gLim,dR,dG,dA,specLim};
  }
  function specCluster(){
    const r=DATA.rows[SPEC.i];
    const z=F.map(f=>(r[f.k]-mu[f.k])/sg[f.k]);
    let b=0,bv=Infinity; for(let j=0;j<cent.length;j++){ const v=d2(z,cent[j]); if(v<bv){bv=v;b=j;} }
    return b;
  }

  function num(){
    if(st.act<5){
      return {k:'k-means', v:'iteration '+st.iter, s:st.converged?'converged':(st.phase==='assign'?'next: assign':'next: move')};
    }
    const j=specCluster(), S=clusterStats().find(x=>x.j===j);
    if(!S) return null;
    const z=(SPEC.value-S.bm)/S.bs;
    const X=crossings();
    return {k:'Warning gained over the plant alarm',
            v:(X.dR!==null&&X.dA!==null)?('+'+f1(X.dA-X.dR)+' days'):'—',
            s:'regime limit '+f1(X.specLim)+' °C · '+nameFor(S)};
  }

  function panel(){
    const CS=clusterStats();
    const j=specCluster(), S=CS.find(x=>x.j===j);
    const allHealthy=PTS.filter(r=>r.day<DATA.FAULT_ON-4).map(r=>r.brgT);
    const gm=mean(allHealthy), gs=sd(allHealthy)||1;
    const zg=(SPEC.value-gm)/gs, zc=S?(SPEC.value-S.bm)/S.bs:0;
    const X=crossings();

    return `
<div class="hd2"><div class="k">Module 6 · clustering</div>
<h2>Nobody labelled the operating regimes. The data already knows them.</h2>
<p>Everything so far has been supervised — a target to predict, a residual to measure. Clustering is the other
half of machine learning: no target at all, just "which of these hours belong together?". The answer turns out
to be the operating modes every operator already recognises, recovered without anyone naming them.</p></div>

<div class="card"><h3>Controls</h3>
<div class="ctl"><label>k — how many regimes to look for <span class="v" id="m6kv">${st.k}</span></label>
  <input type="range" id="m6k" min="2" max="12" step="1" value="${st.k}">
  <div class="hint">${st.k<=2?'<b>Too few.</b> Start-up and technical-minimum running are being forced into the same box as ordinary part load.'
    : st.k>=11?'<b>Getting too fine.</b> Normal high-load operation has been sliced into look-alike fragments that mean nothing to an operator.'
    : 'Look at the elbow chart below before trusting any particular k.'}</div></div>
<div class="ctl"><label>Random seed <span class="v" id="m6sv">${st.seed}</span></label>
  <input type="range" id="m6seed" min="1" max="12" step="1" value="${st.seed}">
  <div class="hint">k-means finds a <i>local</i> optimum. Change the seed and it can land somewhere different —
  which is why production code runs it ten times and keeps the best.</div></div>
<div class="ctl"><label>Initialisation</label>
  <select id="m6init">
    <option value="pp"${st.init==='pp'?' selected':''}>k-means++ — spread the first centroids out deliberately</option>
    <option value="random"${st.init==='random'?' selected':''}>Purely random starting points</option>
  </select></div>
<div class="ctl"><label>Speed <span class="v">${st.speed}×</span></label>
  <input type="range" id="m6sp" min="1" max="6" step="1" value="${st.speed}"></div>
<label class="tog"><input type="checkbox" id="m6lk"${st.showLinks?' checked':''}>
  <span>Draw the assignment lines (a readable sample of them)</span></label>
<div class="btnrow">
  <button class="btn" id="m6run">${st.running?'❚❚ Pause':'▶ Run to convergence'}</button>
  <button class="btn alt" id="m6step">${st.phase==='assign'?'Step: assign':'Step: move centroids'}</button>
  <button class="btn gh" id="m6reset">Reset</button>
</div>
<div class="kv"><span class="k">Iteration</span><span class="v">${st.iter}${st.converged?' — converged':''}</span></div>
<div class="kv"><span class="k">Inertia (mean squared distance to own centroid)</span>
  <span class="v">${asg[0]>=0?f2(inertiaOf(cent,asg)):'—'}</span></div>
</div>

<div class="card"><h3>What the algorithm found</h3>
<div class="tw"><table><thead><tr><th></th><th>Regime</th><th class="num">Hours</th><th class="num">Load MW</th>
<th class="num">Amb °C</th><th class="num">Aux %</th></tr></thead><tbody>
${CS.map(s=>`<tr${s.j===j?' class="hi"':''}>
  <td><span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:#${PAL[s.j%PAL.length].toString(16).padStart(6,'0')}"></span></td>
  <td>${nameFor(s)}</td><td class="num">${f0(s.n*3)}</td><td class="num">${f0(s.load)}</td>
  <td class="num">${f1(s.amb)}</td><td class="num">${f1(s.auxP)}</td></tr>`).join('')}
</tbody></table></div>
<div class="small" style="margin-top:6px">The names in the second column were written by a human looking at the
numbers. <b>The algorithm produced the groups; it cannot produce the names.</b> That is always the division of
labour with clustering — the machine finds structure, the engineer says what it is.</div></div>

<div class="card"><h3>The payoff for the specimen<span class="tag">follow this number</span></h3>
<div class="stats">
  <div class="stat"><div class="l">One limit for the whole year</div><div class="n">${f1(X.gLim)} °C</div>
    <div class="s">healthy mean ${f1(X.gm)} + 3σ (${f1(X.gs)})</div></div>
  <div class="stat"><div class="l">Limit for this regime</div><div class="n em">${f1(X.specLim)} °C</div>
    <div class="s">${S?nameFor(S):'—'}</div></div>
  <div class="stat"><div class="l">Plant alarm</div><div class="n">${SPEC.alarm} °C</div>
    <div class="s">fixed, set at commissioning</div></div>
</div>
<table><thead><tr><th>Detector</th><th class="num">Limit</th><th class="num">First sustained breach</th>
<th class="num">Warning gained</th></tr></thead><tbody>
<tr class="hi"><td><b>Regime-specific limit</b> (k = ${st.k})</td><td class="num">${f1(X.specLim)} °C</td>
  <td class="num">day ${X.dR!==null?f1(X.dR):'—'}</td>
  <td class="num">${(X.dR!==null&&X.dA!==null)?'+'+f1(X.dA-X.dR)+' days':'—'}</td></tr>
<tr><td>One statistical limit for all hours</td><td class="num">${f1(X.gLim)} °C</td>
  <td class="num">day ${X.dG!==null?f1(X.dG):'—'}</td>
  <td class="num">${(X.dG!==null&&X.dA!==null)?'+'+f1(X.dA-X.dG)+' days':'—'}</td></tr>
<tr><td>The plant alarm as configured</td><td class="num">${SPEC.alarm} °C</td>
  <td class="num">day ${X.dA!==null?f1(X.dA):'—'}</td><td class="num">—</td></tr>
</tbody></table>
<div class="good" style="margin-top:9px">Same instrument, same signal, no new hardware.
${(X.dR!==null&&X.dA!==null)?'<b>Segmenting the history into regimes buys '+f1(X.dA-X.dR)+' days of notice</b> over the alarm the fan already has, and '+((X.dG!==null)?f1(X.dG-X.dR):'—')+' days over a single statistical limit applied to the whole year.':'Move k until the regimes are meaningful and the warning appears.'}
On an ID fan, ${f1(Math.max(0,(X.dA!==null&&X.dR!==null)?X.dA-X.dR:0))} days is the difference between a planned shell change in a weekend opportunity outage and a forced outage at full load.</div>
<div class="row"><div class="col">
<div class="kv"><span class="k">74.2 °C judged against the whole year</span><span class="v">${f1(zg)}σ</span></div>
<div class="kv"><span class="k">74.2 °C judged inside its own regime</span>
  <span class="v" style="color:${zc>zg?'#A8261E':'#2A3644'}">${f1(zc)}σ</span></div>
<div class="kv"><span class="k">Scatter, all hours pooled</span><span class="v">± ${f1(gs)} °C</span></div>
<div class="kv"><span class="k">Scatter, inside this regime</span><span class="v">± ${S?f1(S.bs):'—'} °C</span></div>
</div></div>
<div class="small" style="margin-top:7px">The gain comes entirely from the second pair of rows: pooling every
hour of the year inflates the scatter, because the bearing legitimately runs cool at 300 MW on a January night
and hot at 650 MW in June. <b>Stop comparing a reading with the whole year and start comparing it with the
hours that resemble it.</b> It is also, quietly, what the k-NN model in Module 1 was doing all along —
clustering makes the same idea explicit, auditable, and cheap enough to run on every tag in the station.<br><br>
<b>And a residual model beats even this.</b> A regime limit still puts every hour in a bucket; the k-NN model
in Module 1 conditions continuously on load and ambient, which is why it flags day ${SPEC.day} while the
regime limit is still a few days away. The ladder runs: fixed limit → regime limit → residual → multivariate
residual on all forty tags.</div></div>

<div class="card"><h3>Choosing k — the elbow</h3>
<canvas class="ch" id="m6ch"></canvas>
<div class="small" style="margin-top:5px">Inertia always falls as k rises; at k = number of points it reaches
zero and means nothing. The useful k is where the curve stops falling steeply. <b>There is no correct answer
here</b> — the elbow is a judgement, and it should be argued out with operators, not settled by a script.</div></div>

<div class="card"><h3>What is actually being computed</h3>
<div class="eq"><span class="c"># repeat until nothing moves</span>
<span class="o">assign:</span>  every hour joins its nearest centroid
        c(i) = argmin<span class="o">ⱼ</span> ‖ z<span class="o">ᵢ</span> − μ<span class="o">ⱼ</span> ‖²

<span class="o">move:</span>    every centroid steps to the mean of its members
        μ<span class="o">ⱼ</span> = (1/|Cⱼ|) Σ<span class="o">ᵢ∈Cⱼ</span> z<span class="o">ᵢ</span>

<span class="c"># the quantity that is guaranteed to fall every round</span>
<span class="g">inertia = Σᵢ ‖ z<span class="o">ᵢ</span> − μ<span class="o">c(i)</span> ‖²</span></div>
<div class="small">Two lines, and it never increases the inertia — which is why it always converges, and why
converging tells you nothing about whether the answer is good.</div></div>

<div class="card"><h3>Where clustering earns its keep in a station</h3>
<table><thead><tr><th>Use</th><th>What it gives you</th></tr></thead><tbody>
<tr><td><b>Regime-specific alarm limits</b></td><td>Exactly the case above. One bearing limit for start-up and another for full load, derived rather than argued.</td></tr>
<tr><td><b>Coal blend families</b></td><td>Group deliveries by GCV, ash, moisture and volatile matter. Mill and combustion settings then become per-family, not per-rake.</td></tr>
<tr><td><b>Fleet comparison</b></td><td>Cluster hours across 210, 250, 500 and 660 MW units and compare each unit only with its true peers instead of a fleet average.</td></tr>
<tr><td><b>Alarm flood grouping</b></td><td>Cluster alarms that habitually arrive together; 1,840 configured alarms collapse into a few dozen recognisable events.</td></tr>
<tr><td><b>Finding the unlabelled fault</b></td><td>Hours that join no cluster comfortably — large distance to every centroid — are worth a human look. That is anomaly detection with no labels at all.</td></tr>
</tbody></table>
<div class="warn" style="margin-top:9px"><b>Do not cluster raw units.</b> Load in MW would dominate every
distance, exactly as in Module 1. Everything here is standardised first — and, as always, the sensitivity of
the answer to that one decision is larger than the sensitivity to the choice of algorithm.</div></div>`;
  }

  function wire(){
    const k=$('m6k'); if(k) k.oninput=e=>{ st.k=+e.target.value; $('m6kv').textContent=st.k; reset(); };
    const s=$('m6seed'); if(s) s.oninput=e=>{ st.seed=+e.target.value; $('m6sv').textContent=st.seed; reset(); };
    const ii=$('m6init'); if(ii) ii.onchange=e=>{ st.init=e.target.value; reset(); };
    const sp=$('m6sp'); if(sp) sp.oninput=e=>{ st.speed=+e.target.value; };
    const lk=$('m6lk'); if(lk) lk.onchange=e=>{ st.showLinks=e.target.checked; if(st.phase==='move') drawLinks(); else clearLinks(); };
    const rb=$('m6run'); if(rb) rb.onclick=()=>{ if(st.converged){ reset(); } st.running=!st.running;
      if(window.THEATRE) THEATRE.repanel(); };
    const sb=$('m6step'); if(sb) sb.onclick=()=>{ st.running=false;
      if(st.phase==='assign') stepAssign(); else stepMove(); if(window.THEATRE) THEATRE.repanel(); };
    const rs=$('m6reset'); if(rs) rs.onclick=()=>{ st.running=false; reset(); };
    const cv=$('m6ch'); if(cv) chart(cv,{h:150, series:[{pts:elbow, c:'#D96A16', w:2.1},
      {pts:elbow, c:'#D96A16', type:'dots', r:3.5}],
      marks:[{x:st.k, c:'#1C2530', dash:[3,3], t:'current k'}],
      xfmt:v=>'k='+v.toFixed(0), yfmt:v=>v.toFixed(2), nx:10, title:'Inertia'});
  }

  return {id:'kmeans', no:'MODULE 6', title:'k-means — the regimes nobody labelled',
    sub:'unsupervised learning · why a reading must be judged against its own regime',
    dimcap:'3 of 4 clustering axes',
    acts:[
      {t:'1 · Every hour of the campaign', d:4600, say:'Unit load, ambient temperature, auxiliary power — three of the four axes the algorithm actually uses. One dot for every three hours of the campaign. Your eye already sees the groups — the dense mass of normal running, the trail down to technical minimum, the outlier arm where the unit was starting up. <b>Nothing has been labelled.</b>'},
      {t:'2 · Drop k markers at random', d:3800, say:'Choose how many groups to look for, and place that many centroids. They begin in the wrong places, deliberately. The algorithm has no idea what a start-up is.'},
      {t:'3 · Assign', d:4400, say:'Every hour joins whichever centroid is nearest, and takes its colour. The boundaries you can see are exactly halfway between centroids — that is all a k-means boundary ever is.'},
      {t:'4 · Move', d:4400, say:'Each centroid steps to the average position of everything that joined it. Then assign again. Then move again. <b>Two lines of arithmetic, alternating.</b>'},
      {t:'5 · Convergence', d:6000, say:'Run it out. The centroids stop moving because no hour changes hands any more. The algorithm has finished — it has not, however, told you whether the answer is any good.'},
      {t:'6 · The payoff', d:6000, say:'Now name what it found: start-up, technical minimum, part load at various ambients, full load hot and cool. Give each regime its own 3σ limit instead of one limit for the whole year, and the fan’s degradation breaks the limit <b>about three weeks before the alarm it already has</b> — same sensor, same signal, no new hardware.'}
    ],
    build, enter, tick, panel, wire, num, st};
})();
