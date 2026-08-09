/* =========================================================================
   MODULE 3 — Gradient descent: how a model is actually fitted
   ========================================================================= */
const M3 = (function(){
  const HALF = 4.0;              // world half-width of the landscape
  const st = {land:'fan', lr:0.18, mom:0.0, act:0, ready:false,
              w:[0,0], v:[0,0], iter:0, hist:[], running:false, diverged:false,
              startI:0, speed:1};
  let surf, floorM, ball, trail, trailPos, trailN=0, gArrow, labB, labMin, labLR, minDot;
  let TR = {y:null, x1:null, x2:null, my:0, sy:1, m1:0, s1:1, m2:0, s2:1, best:[0,0], Lmin:0, Lmax:1};
  let HS = 1;                    // height scale
  const STARTS = [[-3.2,3.0],[3.4,2.6],[-3.4,-2.8],[0.2,3.6]];

  /* ---------- the two landscapes ---------- */
  function prepFan(){
    const rows=[]; for(let i=0;i<DATA.N;i+=2){ const r=DATA.rows[i]; if(r.day<DATA.FAULT_ON-4) rows.push(r); }
    const y=rows.map(r=>r.brgT), a=rows.map(r=>r.load), b=rows.map(r=>r.amb);
    TR.my=mean(y); TR.sy=sd(y); TR.m1=mean(a); TR.s1=sd(a); TR.m2=mean(b); TR.s2=sd(b);
    TR.y=y.map(v=>(v-TR.my)/TR.sy); TR.x1=a.map(v=>(v-TR.m1)/TR.s1); TR.x2=b.map(v=>(v-TR.m2)/TR.s2);
    // closed-form optimum (for the marker and for honesty about what descent is chasing)
    let s11=0,s22=0,s12=0,s1y=0,s2y=0; const n=TR.y.length;
    for(let i=0;i<n;i++){ s11+=TR.x1[i]*TR.x1[i]; s22+=TR.x2[i]*TR.x2[i]; s12+=TR.x1[i]*TR.x2[i];
      s1y+=TR.x1[i]*TR.y[i]; s2y+=TR.x2[i]*TR.y[i]; }
    const det=s11*s22-s12*s12;
    TR.best=[(s22*s1y-s12*s2y)/det, (s11*s2y-s12*s1y)/det];
  }
  function lossFan(w1,w2){
    const n=TR.y.length; let s=0;
    for(let i=0;i<n;i++){ const e=TR.y[i]-w1*TR.x1[i]-w2*TR.x2[i]; s+=e*e; }
    return s/n;
  }
  function gradFan(w1,w2){
    const n=TR.y.length; let g1=0,g2=0;
    for(let i=0;i<n;i++){ const e=TR.y[i]-w1*TR.x1[i]-w2*TR.x2[i]; g1+=-2*TR.x1[i]*e; g2+=-2*TR.x2[i]*e; }
    return [g1/n, g2/n];
  }
  function lossBumpy(a,b){
    return 0.135*(a*a+b*b)
      - 1.05*Math.exp(-(((a+2.25)*(a+2.25))+((b-1.55)*(b-1.55)))/1.15)
      - 2.05*Math.exp(-(((a-2.05)*(a-2.05))+((b+1.45)*(b+1.45)))/1.55)
      + 0.30*Math.sin(1.65*a)*Math.cos(1.45*b) + 1.9;
  }
  function gradBumpy(a,b){ const h=0.012;
    return [(lossBumpy(a+h,b)-lossBumpy(a-h,b))/(2*h), (lossBumpy(a,b+h)-lossBumpy(a,b-h))/(2*h)]; }

  /* map weight space → world. For the fan landscape the optimum is not at the
     origin, so the window is centred on it. */
  function win(){ return st.land==='fan' ? {cx:TR.best[0], cz:TR.best[1], r:1.35} : {cx:0, cz:0, r:4.2}; }
  const w2x = w => (w-win().cx)/win().r*HALF;
  const x2w = x => x/HALF*win().r + win().cx;
  const w2z = w => (w-win().cz)/win().r*HALF;
  const z2w = z => z/HALF*win().r + win().cz;
  function L(w1,w2){ return st.land==='fan' ? lossFan(w1,w2) : lossBumpy(w1,w2); }
  function G(w1,w2){ return st.land==='fan' ? gradFan(w1,w2) : gradBumpy(w1,w2); }
  function hAt(w1,w2){ return clamp((L(w1,w2)-TR.Lmin)*HS, 0, 4.6); }
  function ballPos(){ return new THREE.Vector3(w2x(st.w[0]), hAt(st.w[0],st.w[1])+0.13, w2z(st.w[1])); }

  /* ---------- surface ---------- */
  function buildSurface(){
    const NSEG=68;
    // scan for range
    let lo=Infinity, hi=-Infinity;
    for(let i=0;i<=NSEG;i++) for(let j=0;j<=NSEG;j++){
      const v=L(x2w(-HALF+2*HALF*i/NSEG), z2w(-HALF+2*HALF*j/NSEG));
      lo=Math.min(lo,v); hi=Math.max(hi,v); }
    TR.Lmin=lo; TR.Lmax=hi; HS = 3.5/Math.max(1e-9,(hi-lo));

    const geo=new THREE.PlaneGeometry(2*HALF, 2*HALF, NSEG, NSEG);
    geo.rotateX(-Math.PI/2);
    const p=geo.attributes.position, col=new Float32Array(p.count*3);
    const cLo=new THREE.Color(0x1E5A6B), cMid=new THREE.Color(0x3E7E7A), cHi=new THREE.Color(0xD08A3E);
    for(let i=0;i<p.count;i++){
      const x=p.getX(i), z=p.getZ(i);
      const h=hAt(x2w(x), z2w(z));
      p.setY(i,h);
      const u=clamp(h/3.5,0,1);
      const c = u<0.5 ? cLo.clone().lerp(cMid,u*2) : cMid.clone().lerp(cHi,(u-0.5)*2);
      col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col,3));
    geo.computeVertexNormals();
    const m=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.62, metalness:0.12,
      transparent:true, opacity:0.94, side:THREE.DoubleSide});
    surf=new THREE.Mesh(geo,m); TH3.root.add(surf);
    const wire=new THREE.Mesh(geo.clone(), new THREE.MeshBasicMaterial({color:0x9FC6D0, wireframe:true,
      transparent:true, opacity:0.13}));
    surf.add(wire);

    // contour floor
    const cv=document.createElement('canvas'); cv.width=cv.height=256;
    const g=cv.getContext('2d');
    for(let i=0;i<256;i++) for(let j=0;j<256;j++){
      const v=L(x2w(-HALF+2*HALF*i/255), z2w(-HALF+2*HALF*j/255));
      const u=clamp((v-lo)/(hi-lo||1),0,1);
      const band=Math.floor(u*17)%2;
      const sh=Math.floor(24+u*70);
      g.fillStyle=`rgb(${sh+(band?10:0)},${sh+14+(band?12:0)},${sh+26+(band?14:0)})`;
      g.fillRect(i,255-j,1,1);
    }
    const tex=new THREE.CanvasTexture(cv);
    floorM=new THREE.Mesh(new THREE.PlaneGeometry(2*HALF,2*HALF),
      new THREE.MeshBasicMaterial({map:tex, transparent:true, opacity:0.85}));
    floorM.rotation.x=-Math.PI/2; floorM.position.y=-0.9; TH3.root.add(floorM);
  }

  function build(){
    prepFan();
    buildSurface();
    ball = TH3.sph(0.155, TH3.COL.ember, {emis:0.9, rough:.25}); TH3.root.add(ball);
    minDot = TH3.sph(0.10, TH3.COL.grn, {emis:0.85}); TH3.root.add(minDot);
    trailPos = new Float32Array(3*4000);
    const tg=new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(trailPos,3));
    trail=new THREE.Line(tg, new THREE.LineBasicMaterial({color:0xF0A45E, transparent:true, opacity:0.95}));
    trail.geometry.setDrawRange(0,0); TH3.root.add(trail);
    gArrow = TH3.arrow(new THREE.Vector3(), new THREE.Vector3(0,0.5,0), 0xE04A2A,
      {r:0.032, headR:0.11, headL:0.26, emis:0.6}); TH3.root.add(gArrow);

    labB = TH3.label('', ball, 'em').offset(14,-14);
    labMin = TH3.label('best possible', minDot, 'gn').offset(12,12);
    labLR = TH3.label('', new THREE.Vector3(0,4.4,0), 'big').show(false);

    // axis captions
    TH3.label('WEIGHT ON LOAD  w₁', new THREE.Vector3(HALF*1.02,0.1,-HALF*1.02),'ax');
    TH3.label('WEIGHT ON AMBIENT  w₂', new THREE.Vector3(-HALF*1.02,0.1,HALF*1.02),'ax');
    TH3.label('LOSS  ↑', new THREE.Vector3(-HALF*1.05,3.5,-HALF*1.05),'ax');

    reset(false);
    TH3.setCam(0.95, 0.52, 13.4, new THREE.Vector3(0,1.1,0), false);
    st.ready=true;
  }

  function reset(keepStart){
    if(!keepStart) st.startI = st.startI||0;
    const s = st.land==='fan'
      ? [TR.best[0]+[-1.05,1.15,-1.1,0.15][st.startI]*win().r, TR.best[1]+[1.0,0.9,-0.95,1.2][st.startI]*win().r]
      : STARTS[st.startI];
    st.w=[s[0],s[1]]; st.v=[0,0]; st.iter=0; st.diverged=false;
    st.hist=[{i:0, w:[s[0],s[1]], L:L(s[0],s[1])}];
    trailN=0; pushTrail();
    if(ball){ ball.position.copy(ballPos()); ball.visible=true; }
    if(minDot){ const b = st.land==='fan'? TR.best : globalMin();
      minDot.position.set(w2x(b[0]), hAt(b[0],b[1])+0.09, w2z(b[1])); }
    if(window.THEATRE) THEATRE.repanel();
  }
  function globalMin(){
    let best=[0,0], bv=Infinity;
    for(let a=-4;a<=4;a+=0.05) for(let b=-4;b<=4;b+=0.05){ const v=lossBumpy(a,b); if(v<bv){bv=v;best=[a,b];} }
    return best;
  }
  function pushTrail(){
    if(trailN>=4000) return;
    const p=ballPos();
    trailPos[trailN*3]=p.x; trailPos[trailN*3+1]=p.y-0.10; trailPos[trailN*3+2]=p.z;
    trailN++; trail.geometry.attributes.position.needsUpdate=true; trail.geometry.setDrawRange(0,trailN);
  }
  function step(){
    if(st.diverged) return;
    const g=G(st.w[0], st.w[1]);
    for(let k=0;k<2;k++){
      st.v[k] = st.mom*st.v[k] - st.lr*g[k];
      st.w[k] += st.v[k];
    }
    st.iter++;
    const cur=L(st.w[0], st.w[1]);
    st.hist.push({i:st.iter, w:[st.w[0],st.w[1]], L:cur, g:Math.hypot(g[0],g[1])});
    if(st.hist.length>4000) st.hist.shift();
    const lim = st.land==='fan' ? win().r*3.2 : 9;
    if(!isFinite(cur) || Math.abs(st.w[0]-win().cx)>lim || Math.abs(st.w[1]-win().cz)>lim){
      st.diverged=true; st.running=false;
    }
    pushTrail();
  }

  function enter(a){
    st.act=a;
    if(a===0){ st.running=false; reset(true); TH3.setCam(0.95,0.52,13.4,new THREE.Vector3(0,1.1,0),1000); TH3.autospin(0.06); }
    if(a===1){ st.running=false; reset(true); TH3.autospin(0); TH3.setCam(1.55,0.30,9.2,ballPos().clone().setY(1.2),1200); }
    if(a===2){ st.land='fan'; st.lr=0.18; st.mom=0; reset(true); st.running=true;
      TH3.autospin(0); TH3.setCam(1.0,0.46,13.0,new THREE.Vector3(0,1.1,0),1200); }
    if(a===3){ st.land='fan'; st.lr=1.02; st.mom=0; reset(true); st.running=true;
      TH3.setCam(0.75,0.40,14.6,new THREE.Vector3(0,1.3,0),1200); }
    if(a===4){ st.land='bumpy'; rebuild(); st.lr=0.16; st.mom=0; st.startI=0; reset(false); st.running=true;
      TH3.setCam(1.25,0.44,13.8,new THREE.Vector3(0,1.1,0),1300); }
    if(a===5){ st.land='bumpy'; rebuild(); st.lr=0.16; st.mom=0.86; st.startI=0; reset(false); st.running=true;
      TH3.setCam(1.25,0.44,13.8,new THREE.Vector3(0,1.1,0),1000); }
    gArrow.visible = (a===1);
    if(window.THEATRE) THEATRE.repanel();
  }
  function rebuild(){
    TH3.root.remove(surf); TH3.root.remove(floorM);
    if(surf){ surf.geometry.dispose(); }
    buildSurface();
    TH3.root.remove(surf); TH3.root.add(surf);      // keep draw order tidy
  }

  let acc=0;
  function tick(u,t){
    if(!st.ready) return;
    // run the optimiser on a fixed cadence so the maths is visible
    if(st.running && !st.diverged){
      acc += 1;
      const every = Math.max(1, Math.round(7/st.speed));
      if(acc%every===0){
        const done = st.land==='fan'
          ? (st.hist.length>2 && Math.abs(st.hist[st.hist.length-1].L-st.hist[st.hist.length-2].L)<1e-9)
          : (st.hist.length>2 && Math.abs(st.hist[st.hist.length-1].L-st.hist[st.hist.length-2].L)<1e-7);
        if(!done && st.iter<1200){ step(); if(st.iter%3===0 && window.THEATRE) THEATRE.repanel(); }
        else st.running=false;
      }
    }
    const bp=ballPos();
    ball.position.lerp(bp, 0.35);
    ball.scale.setScalar(1+0.07*Math.sin(t*4));
    if(st.diverged){ ball.position.y += 0.06; ball.material.color.set(0xA8261E); }
    else ball.material.color.set(TH3.COL.ember);

    if(st.act===1 || gArrow.visible){
      const g=G(st.w[0], st.w[1]);
      const gm=Math.hypot(g[0],g[1])||1e-9;
      const sxz=new THREE.Vector3(-g[0]/gm, 0, -g[1]/gm).multiplyScalar(1.55);
      const from=ball.position.clone();
      const toW=[x2w(from.x+sxz.x), z2w(from.z+sxz.z)];
      const to=new THREE.Vector3(from.x+sxz.x, hAt(toW[0],toW[1])+0.13, from.z+sxz.z);
      gArrow.userData.setEnds(from, to);
    }
    const cur=L(st.w[0], st.w[1]);
    labB.set('iteration <b>'+st.iter+'</b> · loss '+f2(cur));
    if(st.diverged) labB.set('<b>diverged</b> — loss '+ (isFinite(cur)?f0(cur):'∞'));
    labB.cls(st.diverged?'rd':'em');
    labMin.show(st.act>=1);
    if(st.land==='bumpy'){
      labMin.set(st.act>=4?'global minimum':'best possible');
    } else labMin.set('best possible fit');
  }

  function num(){
    const cur = L(st.w[0], st.w[1]);
    if(st.land!=='fan') return {k:'Loss', v:isFinite(cur)?f2(cur):'∞', s:'iteration '+st.iter+(st.diverged?' · diverged':'')};
    const pred = predSpec();
    return {k:'Model says the bearing should be', v:f1(pred)+' °C',
      s:'actual '+f1(SPEC.value)+' · residual '+(SPEC.value-pred>=0?'+':'')+f1(SPEC.value-pred)};
  }
  function predSpec(){
    const r=DATA.rows[SPEC.i];
    const z1=(r.load-TR.m1)/TR.s1, z2=(r.amb-TR.m2)/TR.s2;
    return TR.my + (st.w[0]*z1 + st.w[1]*z2)*TR.sy;
  }

  function panel(){
    const cur=L(st.w[0],st.w[1]);
    const best = st.land==='fan' ? lossFan(TR.best[0],TR.best[1]) : null;
    const lc = st.hist.map(h=>[h.i, isFinite(h.L)?h.L:null]).filter(p=>p[1]!==null);
    const pred = predSpec();

    return `
<div class="hd2"><div class="k">Module 3 · optimisation</div>
<h2>Training is a ball rolling downhill</h2>
<p>Every model with adjustable numbers inside it — regression, neural network, gradient boosting — is fitted the
same way. Define how wrong the model is, treat that as a height, and walk downhill. Nothing more mystical than
that is happening inside the words "the model is training".</p></div>

<div class="card"><h3>What the two horizontal axes are</h3>
${st.land==='fan'
 ? `<div class="note">This is a <b>real loss surface from real fan data</b>. The model is
    <code>bearing °C = w₁ × load + w₂ × ambient</code> on ${f0(TR.y.length)} healthy hours, everything
    standardised. Height is mean squared error. The bowl is tilted and stretched because load and ambient are
    themselves correlated — high load happens on hot afternoons.</div>`
 : `<div class="vio">This landscape is synthetic, and deliberately nasty: two separate valleys and a ridge
    between them. Real deep networks have millions of weight axes and a landscape no one can draw — but they
    do have this problem, and this is what engineers mean by "it got stuck".</div>`}
<div class="stats">
  <div class="stat"><div class="l">Iteration</div><div class="n">${st.iter}</div>
    <div class="s">${st.running?'running':(st.diverged?'stopped — diverged':'paused')}</div></div>
  <div class="stat"><div class="l">Loss now</div><div class="n ${st.diverged?'rd':'em'}">${isFinite(cur)?f2(cur):'∞'}</div>
    <div class="s">${best!==null?'best possible '+f2(best):'lower is better'}</div></div>
  <div class="stat"><div class="l">w₁ · w₂</div><div class="n" style="font-size:14px">${f2(st.w[0])} · ${f2(st.w[1])}</div>
    <div class="s">${st.land==='fan'?'optimum '+f2(TR.best[0])+' · '+f2(TR.best[1]):'position on the ridge'}</div></div>
</div></div>

${st.land==='fan'?`<div class="card"><h3>The specimen<span class="tag">follow this number</span></h3>
<div class="note">This is the model that produced "expected 69–70 °C" in Module 1 — only fitted, rather than
looked up. At the current weights it predicts <b>${f1(pred)} °C</b> for day 96 conditions
(${f0(DATA.rows[SPEC.i].load)} MW, ${f1(DATA.rows[SPEC.i].amb)} °C ambient) against an actual
<b>${f1(SPEC.value)} °C</b>. Watch the prediction settle as the ball rolls: the residual is only meaningful
once the descent has converged.</div>
<div class="kv"><span class="k">Predicted bearing temperature</span><span class="v">${f1(pred)} °C</span></div>
<div class="kv"><span class="k">Actual</span><span class="v">${f1(SPEC.value)} °C</span></div>
<div class="kv"><span class="k">Residual</span><span class="v" style="color:${SPEC.value-pred>2.5?'#A8261E':'#256B45'}">${SPEC.value-pred>=0?'+':''}${f1(SPEC.value-pred)} °C</span></div>
</div>`:''}

<div class="card"><h3>Controls</h3>
<div class="ctl"><label>Learning rate — the size of each step <span class="v" id="m3lrv">${f2(st.lr)}</span></label>
  <input type="range" id="m3lr" min="0.01" max="1.60" step="0.01" value="${st.lr}">
  <div class="hint">${st.lr<0.05?'<b>Too small.</b> It will get there, eventually, and burn a week of GPU time doing it.'
    : st.lr>0.95?'<b style="color:#A8261E">Too large.</b> Each step overshoots the bottom and lands higher up the far wall. The loss grows instead of shrinking.'
    : 'A reasonable step. There is no formula for this number — it is found by trying.'}</div></div>
<div class="ctl"><label>Momentum <span class="v" id="m3mv">${f2(st.mom)}</span></label>
  <input type="range" id="m3m" min="0" max="0.95" step="0.01" value="${st.mom}">
  <div class="hint">Keeps a fraction of the previous step. Rolls through small bumps and along narrow valleys
  instead of zig-zagging across them.</div></div>
<div class="ctl"><label>Landscape</label>
  <select id="m3land">
    <option value="fan"${st.land==='fan'?' selected':''}>Real: ridge regression on the ID fan (one bowl)</option>
    <option value="bumpy"${st.land==='bumpy'?' selected':''}>Hard: two valleys and a ridge (what deep models feel like)</option>
  </select></div>
<div class="ctl"><label>Starting point</label>
  <select id="m3start">${STARTS.map((s,i)=>`<option value="${i}"${st.startI===i?' selected':''}>Corner ${i+1}</option>`).join('')}</select>
  <div class="hint">${st.land==='bumpy'?'Change the start and the same algorithm with the same settings finds a different answer. That is the whole problem with non-convex training.':'A single bowl has one bottom, so the start does not change the answer — only how long it takes.'}</div></div>
<div class="ctl"><label>Animation speed <span class="v">${st.speed}×</span></label>
  <input type="range" id="m3sp" min="1" max="8" step="1" value="${st.speed}"></div>
<div class="btnrow">
  <button class="btn" id="m3run">${st.running?'❚❚ Pause':'▶ Run descent'}</button>
  <button class="btn alt" id="m3step">Single step</button>
  <button class="btn gh" id="m3reset">Reset ball</button>
</div>
${st.diverged?`<div class="bad"><b>Diverged.</b> The step size was larger than the curvature of the bowl could
absorb, so every step landed further up the opposite wall. In a real training run you see this as a loss that
climbs to infinity or prints as NaN within the first few hundred iterations. The fix is almost always: reduce
the learning rate by 10×.</div>`:''}</div>

<div class="card"><h3>Loss against iteration</h3>
<canvas class="ch" id="m3ch"></canvas>
<div class="small" style="margin-top:5px">This is the only chart most people ever see of a training run. Everything
in the 3-D view — the shape of the valley, the overshoot, the ridge — is compressed into this one line. When a
vendor shows you a training curve, they are showing you the shadow of a landscape you never get to look at.</div></div>

<div class="card"><h3>What is actually being computed</h3>
<div class="eq"><span class="c"># 1. how wrong is the model, over the whole training set</span>
L(w) = (1/n) Σ ( y<span class="o">ᵢ</span> − ŷ<span class="o">ᵢ</span>(w) )²

<span class="c"># 2. which way is downhill — one partial derivative per weight</span>
g = ∂L/∂w = −(2/n) Σ x<span class="o">ᵢ</span> ( y<span class="o">ᵢ</span> − ŷ<span class="o">ᵢ</span> )

<span class="c"># 3. take a step, with a little of the last step carried over</span>
v ← μ·v − η·g          <span class="c">η = learning rate, μ = momentum</span>
<span class="g">w ← w + v</span>

<span class="c"># 4. repeat until the loss stops falling</span></div>
<div class="small">For this two-weight regression the answer can be written down exactly with linear algebra —
descent is unnecessary. It becomes necessary the moment the model has enough weights that inverting a matrix
is impossible, which is every neural network ever built. <b>Module 4 runs this same loop over 146 weights.</b></div></div>

<div class="card"><h3>What this means when you are buying a model</h3>
<table><thead><tr><th>Phrase in the proposal</th><th>What it means here</th></tr></thead><tbody>
<tr><td>"The model converged"</td><td>The ball stopped moving. It says nothing about whether the bottom it found is any good.</td></tr>
<tr><td>"We tuned the hyper-parameters"</td><td>They tried several learning rates and picked whichever curve looked best.</td></tr>
<tr><td>"Training loss 0.02"</td><td>Loss on data the model already saw. Ask for the number on data it has never seen — and on a different unit.</td></tr>
<tr><td>"Retrained on your data"</td><td>The ball was placed on a new landscape built from your plant. Ask which period, and whether any faulty hours were in it.</td></tr>
<tr><td>"Deep learning"</td><td>The same loop, with a landscape in millions of dimensions and no guarantee the bottom found is the best one.</td></tr>
</tbody></table></div>`;
  }

  function wire(){
    const lr=$('m3lr'); if(lr) lr.oninput=e=>{ st.lr=+e.target.value; $('m3lrv').textContent=f2(st.lr);
      st.diverged=false; if(window.THEATRE) THEATRE.repanel(); };
    const m=$('m3m'); if(m) m.oninput=e=>{ st.mom=+e.target.value; $('m3mv').textContent=f2(st.mom); };
    const sp=$('m3sp'); if(sp) sp.oninput=e=>{ st.speed=+e.target.value; };
    const ld=$('m3land'); if(ld) ld.onchange=e=>{ st.land=e.target.value; rebuild(); reset(false);
      if(window.THEATRE) THEATRE.repanel(); };
    const s0=$('m3start'); if(s0) s0.onchange=e=>{ st.startI=+e.target.value; reset(false); };
    const rb=$('m3run'); if(rb) rb.onclick=()=>{ if(st.diverged) reset(true); st.running=!st.running;
      if(window.THEATRE) THEATRE.repanel(); };
    const sb=$('m3step'); if(sb) sb.onclick=()=>{ st.running=false; step(); if(window.THEATRE) THEATRE.repanel(); };
    const rs=$('m3reset'); if(rs) rs.onclick=()=>{ st.running=false; reset(true); };
    const cv=$('m3ch'); if(cv){
      const lcv=st.hist.map(h=>[h.i, isFinite(h.L)?Math.min(h.L, TR.Lmax*3):TR.Lmax*3]);
      chart(cv,{h:150, series:[{pts:lcv.length>1?lcv:[[0,L(st.w[0],st.w[1])]], c:'#D96A16', w:1.9}],
        marks: st.land==='fan'?[{y:lossFan(TR.best[0],TR.best[1]), c:'#256B45', t:'best possible'}]:[],
        xfmt:v=>v.toFixed(0), yfmt:v=>v.toFixed(2), nx:5, title:'Loss'});
    }
  }

  return {id:'gd', no:'MODULE 3', title:'Gradient descent — how a model is actually fitted',
    sub:'the loss surface · learning rate · momentum · local minima',
    dimcap:'2 weights of 146',
    acts:[
      {t:'1 · The landscape', d:5000, say:'Two adjustable numbers, side to side. Height is <b>how wrong the model is</b> at that setting. Every point on this surface is a complete, working model — most of them bad. Training means finding the lowest point without being able to see the surface.'},
      {t:'2 · Which way is downhill', d:4200, say:'At the ball’s position, calculus gives the slope in each direction. The red arrow is the negative gradient — the steepest way down from exactly here. <b>The algorithm cannot see the bottom.</b> It can only feel the ground under its feet.'},
      {t:'3 · Rolling to the bottom', d:6000, say:'Take a small step downhill. Measure again. Step again. That is the entire training loop, and it is all that "the model is learning" ever means. Watch the loss curve on the right fall as the ball descends.'},
      {t:'4 · Too big a step', d:5600, say:'Now make each step larger than the valley is wide. The ball lands higher up the far wall each time and the loss <span class="em">grows</span>. This is the NaN in someone’s training log at 2 a.m. The cure is not a better model — it is a smaller learning rate.'},
      {t:'5 · More than one bottom', d:6000, say:'A harder landscape: two valleys, one deeper than the other. The ball settles into whichever one it happened to start above and reports success. <b>Nothing in the algorithm knows the better valley exists.</b>'},
      {t:'6 · Momentum', d:5600, say:'Carry a fraction of the previous step into the next one. The ball now has inertia — it rolls through the shallow trap and into the deeper valley. Real optimisers (Adam, RMSProp) are elaborations of exactly this trick.'}
    ],
    build, enter, tick, panel, wire, num, st};
})();
