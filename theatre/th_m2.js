/* =========================================================================
   MODULE 2 — PCA and reconstruction error: the plane you lift off
   ========================================================================= */
const M2 = (function(){
  const SC = 1.30;                 // world units per standard deviation
  const SEN = [
    {k:'flow', n:'Fan flow',        u:'m³/s'},
    {k:'brgT', n:'Bearing temp',    u:'°C'},
    {k:'amb',  n:'Ambient temp',    u:'°C'}
  ];
  const st = {day:96, comps:2, stdise:true, showBox:false, showPerp:true, act:0, ready:false};
  let cloud, gAx, planeM, lineM, arr=[], perps=[], specDot, specPerp, boxM, footDot;
  let labs={}, healthy=[], mu={}, sg={}, pcs=null, qHealthy=[], qLim=0, qSd=1, qMean=0;

  /* ---------- linear algebra ---------- */
  function jacobi3(A){
    let a=[[A[0][0],A[0][1],A[0][2]],[A[1][0],A[1][1],A[1][2]],[A[2][0],A[2][1],A[2][2]]];
    let v=[[1,0,0],[0,1,0],[0,0,1]];
    for(let sweep=0; sweep<24; sweep++){
      let off=0; for(let p=0;p<3;p++) for(let q=p+1;q<3;q++) off+=a[p][q]*a[p][q];
      if(off<1e-16) break;
      for(let p=0;p<3;p++) for(let q=p+1;q<3;q++){
        if(Math.abs(a[p][q])<1e-18) continue;
        const th=(a[q][q]-a[p][p])/(2*a[p][q]);
        const t=Math.sign(th||1)/(Math.abs(th)+Math.sqrt(th*th+1));
        const c=1/Math.sqrt(t*t+1), s=t*c;
        for(let i=0;i<3;i++){
          const aip=a[i][p], aiq=a[i][q];
          a[i][p]=c*aip-s*aiq; a[i][q]=s*aip+c*aiq;
        }
        for(let i=0;i<3;i++){
          const api=a[p][i], aqi=a[q][i];
          a[p][i]=c*api-s*aqi; a[q][i]=s*api+c*aqi;
        }
        for(let i=0;i<3;i++){
          const vip=v[i][p], viq=v[i][q];
          v[i][p]=c*vip-s*viq; v[i][q]=s*vip+c*viq;
        }
      }
    }
    const ev=[{l:a[0][0],v:[v[0][0],v[1][0],v[2][0]]},
              {l:a[1][1],v:[v[0][1],v[1][1],v[2][1]]},
              {l:a[2][2],v:[v[0][2],v[1][2],v[2][2]]}];
    ev.sort((x,y)=>y.l-x.l);
    return ev;
  }
  const dot3=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const nrm3=a=>{ const L=Math.sqrt(dot3(a,a))||1; return [a[0]/L,a[1]/L,a[2]/L]; };
  const V=a=>new THREE.Vector3(a[0]*SC, a[1]*SC, a[2]*SC);

  function zOf(r){ return SEN.map(s=>(r[s.k]-mu[s.k])/sg[s.k]); }

  function fit(){
    healthy=[]; for(let i=0;i<DATA.N;i+=3){ const r=DATA.rows[i]; if(r.day<DATA.FAULT_ON-4) healthy.push(r); }
    SEN.forEach(s=>{ const a=healthy.map(r=>r[s.k]); mu[s.k]=mean(a); sg[s.k]=sd(a)||1; });
    // covariance in the chosen space
    const Z = healthy.map(r=> st.stdise ? zOf(r) : SEN.map(s=>r[s.k]-mu[s.k]) );
    const C=[[0,0,0],[0,0,0],[0,0,0]];
    for(const z of Z) for(let i=0;i<3;i++) for(let j=0;j<3;j++) C[i][j]+=z[i]*z[j];
    for(let i=0;i<3;i++) for(let j=0;j<3;j++) C[i][j]/=(Z.length-1);
    const ev = jacobi3(C);
    // express eigenvectors as directions in the *drawing* (standardised) space
    const toZ = v => nrm3(st.stdise ? v : SEN.map((s,i)=>v[i]/sg[s.k]));
    let e=[toZ(ev[0].v), toZ(ev[1].v), toZ(ev[2].v)];
    // Gram–Schmidt so the plane basis is orthonormal in drawing space
    e[1] = nrm3(e[1].map((x,i)=>x - dot3(e[1],e[0])*e[0][i]));
    e[2] = nrm3([ e[0][1]*e[1][2]-e[0][2]*e[1][1],
                  e[0][2]*e[1][0]-e[0][0]*e[1][2],
                  e[0][0]*e[1][1]-e[0][1]*e[1][0] ]);
    const tot = ev[0].l+ev[1].l+ev[2].l;
    pcs = {e, lam:[ev[0].l,ev[1].l,ev[2].l], pct:[ev[0].l/tot,ev[1].l/tot,ev[2].l/tot]};
    // healthy Q distribution
    qHealthy = healthy.map(r=>Q(zOf(r)).q);
    qMean = mean(qHealthy); qSd = sd(qHealthy)||1e-6; qLim = qMean+3*qSd;
  }
  /* residual of a standardised vector against the retained components */
  function Q(z){
    const keep = st.comps;
    let rec=[0,0,0];
    for(let c=0;c<keep;c++){ const t=dot3(z,pcs.e[c]); for(let i=0;i<3;i++) rec[i]+=t*pcs.e[c][i]; }
    const res=[z[0]-rec[0], z[1]-rec[1], z[2]-rec[2]];
    return {rec, res, q:dot3(res,res), t:[dot3(z,pcs.e[0]), dot3(z,pcs.e[1]), dot3(z,pcs.e[2])]};
  }
  function specRow(){ const i=Math.round(st.day*DATA.HRS)+SPEC.hour; return DATA.rows[Math.min(i,DATA.N-1)]; }

  /* ---------- scene ---------- */
  function centeredAxes(){
    const g=new THREE.Group(), L=3.9*SC;
    const dirs=[[1,0,0],[0,1,0],[0,0,1]];
    dirs.forEach((d,i)=>{
      const a=new THREE.Vector3(-d[0]*L,-d[1]*L,-d[2]*L), b=new THREE.Vector3(d[0]*L,d[1]*L,d[2]*L);
      g.add(TH3.tube(a,b,0.014,0x5A6E82,{emis:0.25,rough:.6}));
      g.add(TH3.arrow(new THREE.Vector3().copy(b).multiplyScalar(0.93), b, 0x5A6E82,{r:0.014,headR:0.07,headL:0.2,emis:0.3}));
      TH3.label(SEN[i].n.toUpperCase(), b.clone().multiplyScalar(1.05),'ax').offset(i===1?-6:8, i===1?-13:0);
      for(let k=-3;k<=3;k++){ if(!k) continue;
        const p=new THREE.Vector3(d[0]*k*SC,d[1]*k*SC,d[2]*k*SC);
        const tk=TH3.sph(0.030,0x54687C,{emis:0.3}); tk.position.copy(p); g.add(tk); }
    });
    TH3.label('+3σ', new THREE.Vector3(3*SC,0,0),'ax').offset(6,10);
    return g;
  }

  function build(){
    fit();
    gAx = centeredAxes(); TH3.root.add(gAx);

    const pos=[], col=[];
    healthy.forEach(r=>{ const z=zOf(r); pos.push(z[0]*SC,z[1]*SC,z[2]*SC); col.push(0.34,0.46,0.58); });
    cloud = TH3.points(pos, col, 0.078); TH3.root.add(cloud);

    // PC arrows
    arr=[];
    const cols=[TH3.COL.ember, TH3.COL.teal, TH3.COL.vio];
    for(let c=0;c<3;c++){
      const a=TH3.arrow(new THREE.Vector3(0,0,0), V(pcs.e[c]).multiplyScalar(2.6), cols[c],
        {r:0.032, headR:0.11, headL:0.30, emis:0.55});
      a.visible=false; TH3.root.add(a); arr.push(a);
      labs['pc'+c]=TH3.label('PC'+(c+1), V(pcs.e[c]).multiplyScalar(2.8), c===0?'em':(c===1?'tl':'')).show(false);
    }
    // the plane
    planeM = TH3.plane(7.6,7.6, 0x2F7E8C, {op:0.20, side:2, rough:.9, metal:.0, emis:0.18});
    orientPlane(); planeM.visible=false; TH3.root.add(planeM);
    const grid = new THREE.GridHelper(7.6, 12, 0x3E8A97, 0x2C6470);
    grid.material.opacity=0.34; grid.material.transparent=true;
    grid.rotation.x = Math.PI/2; planeM.add(grid);
    // PC1 line (for comps=1)
    lineM = TH3.tube(V(pcs.e[0]).multiplyScalar(-3.4), V(pcs.e[0]).multiplyScalar(3.4), 0.026,
      0x2F7E8C, {emis:0.4, op:0.85}); lineM.visible=false; TH3.root.add(lineM);

    // specimen
    specDot = TH3.sph(0.17, TH3.COL.hot, {emis:0.9, rough:.3}); TH3.root.add(specDot);
    footDot = TH3.sph(0.10, TH3.COL.teal, {emis:0.7}); TH3.root.add(footDot);
    specPerp = TH3.tube(new THREE.Vector3(), new THREE.Vector3(0,1,0), 0.048, TH3.COL.hot, {emis:0.65});
    TH3.root.add(specPerp);
    labs.spec = TH3.label('', specDot, 'rd').offset(14,-14);
    labs.q    = TH3.label('', new THREE.Vector3(), 'rd').offset(14,2);
    labs.foot = TH3.label('reconstruction', footDot, 'tl').offset(13,13).show(false);

    // limit box
    const bmin=SEN.map(s=>(mn(healthy.map(r=>r[s.k]))-mu[s.k])/sg[s.k]);
    const bmax=SEN.map(s=>(mx(healthy.map(r=>r[s.k]))-mu[s.k])/sg[s.k]);
    const geo=new THREE.BoxGeometry((bmax[0]-bmin[0])*SC,(bmax[1]-bmin[1])*SC,(bmax[2]-bmin[2])*SC);
    boxM=new THREE.Mesh(geo, TH3.mat(0xE0A63A,{op:0.10, side:2, rough:.9, emis:0.1}));
    boxM.position.set((bmax[0]+bmin[0])/2*SC,(bmax[1]+bmin[1])/2*SC,(bmax[2]+bmin[2])/2*SC);
    const eg=new THREE.LineSegments(new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({color:0xE0A63A, transparent:true, opacity:0.75}));
    boxM.add(eg); boxM.visible=false; TH3.root.add(boxM);
    st.bmin=bmin; st.bmax=bmax;

    TH3.setCam(0.85, 0.34, 13.5, new THREE.Vector3(0,0,0), false);
    st.ready=true; refresh();
  }

  function orientPlane(){
    const m=new THREE.Matrix4();
    const e=pcs.e;
    m.makeBasis(new THREE.Vector3(e[0][0],e[0][1],e[0][2]),
                new THREE.Vector3(e[1][0],e[1][1],e[1][2]),
                new THREE.Vector3(e[2][0],e[2][1],e[2][2]));
    planeM.setRotationFromMatrix(m);
  }

  function clearPerps(){ perps.forEach(p=>TH3.root.remove(p)); perps=[]; }

  function refresh(){
    if(!st.ready) return;
    orientPlane();
    for(let c=0;c<3;c++){
      arr[c].userData.setEnds(new THREE.Vector3(0,0,0), V(pcs.e[c]).multiplyScalar(2.2+0.5*(2-c)));
      labs['pc'+c].at(V(pcs.e[c]).multiplyScalar(2.9));
    }
    lineM.userData.setEnds(V(pcs.e[0]).multiplyScalar(-3.4), V(pcs.e[0]).multiplyScalar(3.4), 0.026);
    planeM.visible = st.act>=2 && st.comps===2;
    lineM.visible  = st.act>=2 && st.comps===1;

    // colour cloud by Q
    const col=cloud.geometry.attributes.color;
    healthy.forEach((r,i)=>{
      const q=Q(zOf(r)).q, u=clamp((q-qMean)/(3*qSd),0,1);
      col.setXYZ(i, 0.30+0.62*u, 0.46-0.16*u, 0.58-0.40*u);
    });
    col.needsUpdate=true;

    // healthy perpendiculars — a readable subset
    clearPerps();
    if(st.showPerp && st.act>=2){
      for(let i=0;i<healthy.length;i+=26){
        const z=zOf(healthy[i]); const R=Q(z);
        const a=V(z), b=V(R.rec);
        if(a.distanceTo(b)<0.012) continue;
        const t=TH3.tube(b,a,0.014,0x3FA97A,{emis:0.5,op:0.8,seg:5});
        TH3.root.add(t); perps.push(t);
      }
    }

    // specimen
    const r=specRow(), z=zOf(r), R=Q(z);
    const pv=V(z), fv=V(R.rec);
    specDot.position.copy(pv); footDot.position.copy(fv);
    specPerp.userData.setEnds(fv, pv, 0.048);
    const sig=(R.q-qMean)/qSd;
    labs.spec.set('day '+f1(st.day)+' · <b>'+f1(r.brgT)+' °C</b>');
    const rat = R.q/(qLim||1e-9);
    labs.q.at(new THREE.Vector3().lerpVectors(fv,pv,0.55))
      .set('Q = <b>'+f2(R.q)+'</b> · '+f1(rat)+'× the limit');
    const vis = st.act>=3;
    specDot.visible=vis; footDot.visible=vis&&st.showPerp; specPerp.visible=vis;
    labs.spec.show(vis); labs.q.show(vis); labs.foot.show(vis&&st.showPerp);
    boxM.visible = st.showBox;
    st.R=R; st.sig=sig; st.rat=R.q/(qLim||1e-9); st.row=r;
    if(window.THEATRE) THEATRE.repanel();
  }

  function edgeOn(){
    const e=pcs.e[0];  // look along PC1 → the plane collapses to a line
    const d=new THREE.Vector3(e[0],e[1],e[2]).normalize();
    const yaw=Math.atan2(d.x,d.z), pitch=Math.asin(clamp(d.y,-1,1));
    TH3.setCam(yaw, pitch, 11.0, new THREE.Vector3(0,0,0), 1500);
  }

  function enter(a){
    st.act=a;
    arr.forEach((x,i)=>{ x.visible = a>=1 && i<Math.max(st.comps, a>=1?2:0)+ (a>=1?1:0); });
    for(let c=0;c<3;c++) labs['pc'+c].show(a>=1 && c<3);
    if(a===0){ arr.forEach(x=>x.visible=false); for(let c=0;c<3;c++) labs['pc'+c].show(false); }
    if(a===4) edgeOn();
    else if(a===0) TH3.setCam(0.85,0.34,13.5,new THREE.Vector3(0,0,0),900);
    else if(a===1) TH3.setCam(1.15,0.30,12.2,new THREE.Vector3(0,0,0),1000);
    else if(a===2) TH3.setCam(1.45,0.22,11.6,new THREE.Vector3(0,0,0),1000);
    else if(a===3) TH3.setCam(1.70,0.16,10.2,new THREE.Vector3(0,0,0),1000);
    else if(a===5){ st.showBox=true; TH3.setCam(0.60,0.40,13.8,new THREE.Vector3(0,0,0),1200); }
    if(a<5 && !st._userBox) st.showBox = false;
    refresh();
  }

  function tick(u,t){
    if(!st.ready) return;
    if(st.act===0){ const n=healthy.length; cloud.geometry.setDrawRange(0, Math.max(1,Math.floor(n*ease(u)))); }
    else cloud.geometry.setDrawRange(0, healthy.length);
    if(st.act===1){
      const g=easeIO(clamp(u*1.4,0,1));
      for(let c=0;c<3;c++){
        const show = u > c*0.28;
        arr[c].visible=show; labs['pc'+c].show(show);
        const L=(2.2+0.5*(2-c))*(show? Math.min(1,(g-c*0.24)*2.4+0.2):0.02);
        arr[c].userData.setEnds(new THREE.Vector3(0,0,0), V(pcs.e[c]).multiplyScalar(Math.max(0.05,L)));
      }
    }
    if(st.act===2 && planeM.visible){ planeM.material.opacity = 0.05+0.17*easeIO(clamp(u*1.6,0,1)); }
    else if(planeM.material) planeM.material.opacity=0.20;
    if(st.act===3){
      const g=easeIO(clamp(u*1.3,0,1));
      const fv=footDot.position, pv=specDot.position;
      specPerp.userData.setEnds(fv, new THREE.Vector3().lerpVectors(fv,pv,Math.max(0.03,g)), 0.048);
      specDot.scale.setScalar(0.4+0.6*g + 0.08*Math.sin(t*3));
    } else specDot.scale.setScalar(1+0.07*Math.sin(t*3));
    if(st.act===5 && boxM){ boxM.material.opacity = 0.06+0.07*Math.abs(Math.sin(t*1.4)); }
  }

  function num(){
    if(!st.R) return null;
    if(st.act<3) return {k:'Sensors on screen', v:'3', s:'of 40 in the real model'};
    return {k:'Q — reconstruction error', v:f1(st.rat)+'× limit', s:'Q = '+f2(st.R.q)+' · 3σ limit '+f2(qLim)};
  }

  function panel(){
    const r=st.row||specRow(), R=st.R||Q(zOf(r));
    const contrib = R.res.map((v,i)=>({n:SEN[i].n, p:v*v/(R.q||1e-9), v}));
    const hmax = mx(healthy.map(h=>h.brgT));
    const inBox = SEN.every((s,i)=>{ const z=(r[s.k]-mu[s.k])/sg[s.k]; return z>=st.bmin[i] && z<=st.bmax[i]; });
    const qt=[]; for(let d=20; d<=130; d+=1){ const i=Math.round(d*DATA.HRS)+SPEC.hour; if(i>=DATA.N)break;
      qt.push([d, Q(zOf(DATA.rows[i])).q]); }

    return `
<div class="hd2"><div class="k">Module 2 · principal components</div>
<h2>Normal operation is a plane. A fault lifts off it.</h2>
<p>Forty sensors do not move independently — they are chained together by the physics of the machine. PCA
finds the handful of directions in which the plant genuinely moves, and then measures how far each new
reading sits <b>off</b> that surface. That distance is the alarm.</p></div>

<div class="card"><h3>The specimen<span class="tag">follow this number</span></h3>
<div class="stats">
  <div class="stat"><div class="l">Bearing</div><div class="n em">${f1(r.brgT)} °C</div><div class="s">day ${f1(st.day)}</div></div>
  <div class="stat"><div class="l">Reconstructed</div><div class="n tl">${f1(R.rec[1]*sg.brgT+mu.brgT)} °C</div>
    <div class="s">what ${st.comps} component${st.comps>1?'s':''} can explain</div></div>
  <div class="stat"><div class="l">Q statistic</div><div class="n ${R.q>qLim?'rd':'gn'}">${f1(R.q/(qLim||1e-9))}×</div>
    <div class="s">Q = ${f2(R.q)} · 3σ limit ${f2(qLim)}</div></div>
</div>
<div class="${st.sig>3?'bad':'note'}">The reading itself is ordinary. Its <b>relationship to the other two
sensors</b> is not. Flow and ambient say the fan is doing a routine amount of work in this weather; the bearing is
${f1(r.brgT - (R.rec[1]*sg.brgT+mu.brgT))} °C hotter than that amount of work explains.</div></div>

<div class="card"><h3>What the components found</h3>
<table><thead><tr><th></th><th class="num">Variance</th><th class="num">Share</th>
<th>What it physically is</th></tr></thead><tbody>
<tr class="hi"><td><b>PC 1</b></td><td class="num">${f2(pcs.lam[0])}</td><td class="num">${(pcs.pct[0]*100).toFixed(1)}%</td>
  <td>Load. Fan flow and bearing temperature rise and fall together as the unit is dispatched.</td></tr>
<tr class="hi2"><td><b>PC 2</b></td><td class="num">${f2(pcs.lam[1])}</td><td class="num">${(pcs.pct[1]*100).toFixed(1)}%</td>
  <td>Ambient air. The bearing follows the weather even when the fan’s duty does not change.</td></tr>
<tr><td><b>PC 3</b></td><td class="num">${f2(pcs.lam[2])}</td><td class="num">${(pcs.pct[2]*100).toFixed(1)}%</td>
  <td>Nothing the plant does on purpose. Thermocouple noise — and bearings losing their oil film.</td></tr>
</tbody></table>
<div class="note" style="margin-top:8px"><b>Why this "reconstructed" figure is not the same as Module 1’s
"expected".</b> A regression asks "given the other tags, what should the bearing be?" and puts the whole error
on the bearing. PCA is symmetric — it has no target — so it spreads the mismatch across all three tags at
once. Both detect the same event; only the regression tells you how many °C of it belong to the bearing.</div>
<div class="small" style="margin-top:6px">Keep the first ${st.comps}. Whatever is left over is the residual
subspace, and the squared length of what is left over is <b>Q</b> — also written SPE, squared prediction error.</div></div>

<div class="card"><h3>Controls</h3>
<div class="ctl"><label>Day <span class="v" id="m2dayv">${f1(st.day)}</span></label>
  <input type="range" id="m2day" min="20" max="130" step="0.5" value="${st.day}"></div>
<div class="ctl"><label>Components retained <span class="v">${st.comps}</span></label>
  <select id="m2comps">
    <option value="1"${st.comps===1?' selected':''}>1 — a line. Under-fitted: ambient swings look like faults.</option>
    <option value="2"${st.comps===2?' selected':''}>2 — a plane. Right for these three sensors.</option>
  </select></div>
<label class="tog"><input type="checkbox" id="m2std"${st.stdise?' checked':''}>
  <span><b>Standardise before fitting</b> — divide each sensor by its own σ</span></label>
<label class="tog"><input type="checkbox" id="m2perp"${st.showPerp?' checked':''}>
  <span>Show the perpendiculars (the residuals themselves)</span></label>
<label class="tog"><input type="checkbox" id="m2box"${st.showBox?' checked':''}>
  <span>Show the box of individual sensor limits</span></label>
<div class="btnrow"><button class="btn" id="m2edge">Fly to edge-on view</button>
  <button class="btn gh" id="m2top">Look down on the plane</button></div>
${!st.stdise?`<div class="warn"><b>Unstandardised.</b> Fan flow moves by ${f0(sg.flow)} m³/s while the bearing
moves by ${f1(sg.brgT)} °C. Raw covariance is dominated by whichever tag happens to be measured in big
numbers, so the "principal" direction is really just the flow axis and the plane is meaningless. Almost every
failed PCA pilot begins here.</div>`:''}</div>

<div class="card"><h3>Why the individual alarms stayed silent</h3>
<div class="${inBox?'warn':'note'}">
${inBox
 ? `<b>The point is inside the box.</b> Fan flow, bearing temperature and motor current are each, individually,
    inside the range this fan has visited while perfectly healthy — the bearing reached ${f1(hmax)} °C at some
    point before day ${DATA.FAULT_ON} without anything being wrong. A limit checker on any one tag, or on all
    three at once, sees nothing. Only the <i>combination</i> is impossible, and only a model that knows the
    relationship between the tags can see it.`
 : `At this day the specimen has escaped the healthy box on at least one tag — conventional limits would
    eventually catch it too. Wind the day slider back to see the period when it was still hidden.`}
</div>
<table><thead><tr><th>Sensor</th><th class="num">Now</th><th class="num">Healthy range</th><th class="num">Inside?</th></tr></thead>
<tbody>${SEN.map((s,i)=>{
  const lo=st.bmin[i]*sg[s.k]+mu[s.k], hi=st.bmax[i]*sg[s.k]+mu[s.k];
  const z=(r[s.k]-mu[s.k])/sg[s.k], ok=z>=st.bmin[i]&&z<=st.bmax[i];
  return `<tr><td>${s.n}</td><td class="num">${f1(r[s.k])} ${s.u}</td>
    <td class="num">${f1(lo)} – ${f1(hi)}</td>
    <td class="num"><span class="pill ${ok?'ok':'er'}">${ok?'yes':'no'}</span></td></tr>`;}).join('')}
</tbody></table></div>

<div class="card"><h3>Which sensor is carrying the fault</h3>
<div class="small" style="margin-bottom:6px">Q is a squared length. Split it back into its three sensor
components and you have the contribution plot — the first thing to open when an alarm appears.</div>
${contrib.map(c=>`<div class="kv"><span class="k">${c.n}</span>
  <span class="v" style="color:${c.p>0.5?'#A8261E':'#2A3644'}">${(c.p*100).toFixed(0)}%</span></div>`).join('')}
<div class="small" style="margin-top:7px">Read it as a pointer, not a diagnosis. It tells the engineer which
tag to look at first; it does not tell them the bearing is failing.</div></div>

<div class="card"><h3>Q through the campaign</h3>
<canvas class="ch" id="m2ch"></canvas>
<div class="legend"><span><i style="background:#D96A16"></i>Q statistic</span>
<span><i style="background:#A8261E"></i>3σ control limit</span>
<span><i style="background:#11707F"></i>fault onset</span></div></div>

<div class="card"><h3>What is actually being computed</h3>
<div class="eq"><span class="c"># standardise, then covariance across all 40 tags</span>
z = (x − μ) / σ        C = Zᵀ Z / (n−1)

<span class="c"># eigenvectors of C, largest variance first</span>
C p<span class="o">ₖ</span> = λ<span class="o">ₖ</span> p<span class="o">ₖ</span>        keep the first r that explain ~95%

<span class="c"># project down and rebuild</span>
t = Pᵀ z        ẑ = P t        <span class="c">ẑ is the closest point on the plane</span>

<span class="c"># the two numbers a PCA monitor produces</span>
<span class="r">Q  = ‖z − ẑ‖²</span>    <span class="c">how far off the surface — new behaviour</span>
<span class="t">T² = Σ t<span class="o">ₖ</span>²/λ<span class="o">ₖ</span></span>   <span class="c">how far along it — extreme but familiar behaviour</span></div>
<div class="small"><b>Q and T² answer different questions.</b> A cold start at 40% load gives a big T² and a
small Q: unusual, but a kind of unusual the plant has seen. A bearing losing its oil film gives a small T² and
a big Q: perfectly ordinary load, impossible combination of readings. Alarm on Q. Use T² to decide whether the
model is being asked about an operating point it never learned.</div></div>`;
  }

  function wire(){
    const d=$('m2day'); if(d) d.oninput=e=>{ st.day=+e.target.value; $('m2dayv').textContent=f1(st.day); refresh(); };
    const c=$('m2comps'); if(c) c.onchange=e=>{ st.comps=+e.target.value; qHealthy=healthy.map(r=>Q(zOf(r)).q);
      qMean=mean(qHealthy); qSd=sd(qHealthy)||1e-6; qLim=qMean+3*qSd; refresh(); };
    const s=$('m2std'); if(s) s.onchange=e=>{ st.stdise=e.target.checked; fit(); refresh(); };
    const p=$('m2perp'); if(p) p.onchange=e=>{ st.showPerp=e.target.checked; refresh(); };
    const b=$('m2box'); if(b) b.onchange=e=>{ st.showBox=e.target.checked; st._userBox=true; refresh(); };
    const eb=$('m2edge'); if(eb) eb.onclick=edgeOn;
    const tb=$('m2top'); if(tb) tb.onclick=()=>{ const e=pcs.e[2];
      const dv=new THREE.Vector3(e[0],e[1],e[2]).normalize();
      TH3.setCam(Math.atan2(dv.x,dv.z), Math.asin(clamp(dv.y,-1,1)), 11.5, new THREE.Vector3(0,0,0), 1400); };
    const cv=$('m2ch'); if(cv){
      const qt=[]; for(let dd=20; dd<=130; dd+=1){ const i=Math.round(dd*DATA.HRS)+SPEC.hour; if(i>=DATA.N)break;
        qt.push([dd, Q(zOf(DATA.rows[i])).q]); }
      chart(cv,{h:158, series:[{pts:qt, c:'#D96A16', w:1.8}],
        marks:[{y:qLim, c:'#A8261E', t:'3σ limit'}, {x:DATA.FAULT_ON, c:'#11707F', t:'fault begins'},
               {x:st.day, c:'#1C2530', w:1.6, dash:[2,2], t:'now'}],
        xfmt:v=>'d'+v.toFixed(0), yfmt:v=>v.toFixed(1), nx:6, title:'Q (SPE)'});
    }
  }

  return {id:'pca', no:'MODULE 2', title:'Principal components — the plane you lift off',
    sub:'PCA · Q statistic · why a reading inside every limit can still be impossible',
    dimcap:'3 of 40 dimensions',
    acts:[
      {t:'1 · Three sensors, one cloud', d:4600, say:'Fan flow, bearing temperature, motor current — each standardised so no tag shouts louder than another. The cloud is not a ball. It is <b>flat</b>, because these three sensors are not free to move independently: the physics of the fan ties them together.'},
      {t:'2 · The directions the plant moves in', d:5000, say:'PC1 is load — everything rising and falling together as the unit is dispatched. PC2 is ambient temperature, which moves the bearing without moving the flow. PC3 has almost no variance at all. <b>Two directions describe nearly everything this machine does.</b>'},
      {t:'3 · The plane of normal operation', d:4600, say:'Span PC1 and PC2 and you get a surface. Every healthy hour sits on it, within a whisker. The green stubs are the whiskers — the part of each reading the model cannot explain. Squared and summed, that is <b>Q</b>.'},
      {t:'4 · The fault lifts off', d:4400, say:'Day 96. Flow is normal. Current is normal. Bearing temperature is inside every limit it has ever had. But the point has left the surface — the red column is the reconstruction error, and it is <span class="em">several σ</span> long.'},
      {t:'5 · Turn the plane edge-on', d:4200, say:'Rotate until you are looking along the plane. Now the healthy cloud is a line and the specimen is plainly above it. <b>This is the view a Q chart gives you every second, on all forty tags at once</b> — a picture no operator could hold in their head.'},
      {t:'6 · Why the limits stayed silent', d:5000, say:'The yellow box is every individual sensor’s healthy min and max. The faulty point sits <b>inside the box</b>. Any conventional limit checker — and every mimic on the DAS — passes it. The fault lives in the relationship between the sensors, not in any one of them.'}
    ],
    build, enter, tick, panel, wire, num, st};
})();
