/* =========================================================================
   MODULE 4 — A neural network, forward and backward, with real weights
   ========================================================================= */
const M4 = (function(){
  const IN = [
    {k:'load', n:'Unit load',        u:'MW'},
    {k:'amb',  n:'Ambient temp',     u:'°C'},
    {k:'flow', n:'Fan flow',         u:'m³/s'},
    {k:'curr', n:'Motor current',    u:'A'},
    {k:'cw',   n:'CW inlet temp',    u:'°C'},
    {k:'dp',   n:'Fan diff press',   u:'mmWC'},
    {k:'mills',n:'Mills in service', u:''},
    {k:'hodS', n:'Hour of day (sin)',u:''}
  ];
  const NI=8, NH1=10, NH2=6;
  const st = {act:0, ready:false, actf:'tanh', showW:true, speed:1, epoch:0, training:false,
              inspect:0, day:96, phase:0, lossHist:[], trained:false};
  let W1,b1,W2,b2,W3,b3, mu={}, sg={}, TRX=[], TRY=[], my=0, sy=1;
  let nodes=[[],[],[],[]], edges=[], edgeLines, parts, partMeta=[], gLayerCards=[];
  let labs={}, curAct=null, curOut=0;

  /* ---------- data ---------- */
  function prep(){
    const rows=[]; for(let i=0;i<DATA.N;i+=2){ const r=DATA.rows[i]; if(r.day<DATA.FAULT_ON-4) rows.push(r); }
    rows.forEach(r=>{ r.hodS = Math.sin(r.hod/24*2*Math.PI); });
    DATA.rows.forEach(r=>{ r.hodS = Math.sin(r.hod/24*2*Math.PI); });
    IN.forEach(f=>{ const a=rows.map(r=>r[f.k]); mu[f.k]=mean(a); sg[f.k]=sd(a)||1; });
    my=mean(rows.map(r=>r.brgT)); sy=sd(rows.map(r=>r.brgT))||1;
    TRX = rows.map(r=>IN.map(f=>(r[f.k]-mu[f.k])/sg[f.k]));
    TRY = rows.map(r=>(r.brgT-my)/sy);
  }
  function xOf(r){ r.hodS = Math.sin(r.hod/24*2*Math.PI); return IN.map(f=>(r[f.k]-mu[f.k])/sg[f.k]); }

  /* ---------- network ---------- */
  function zeros(n){ return new Float64Array(n); }
  function matrix(a,b,r,scale){ const m=[]; for(let i=0;i<a;i++){ const row=new Float64Array(b);
    for(let j=0;j<b;j++) row[j]=gauss(r)*scale; m.push(row);} return m; }
  function initW(seed){
    const r=rng(seed||7);
    W1=matrix(NI,NH1,r,Math.sqrt(2/NI)); b1=zeros(NH1);
    W2=matrix(NH1,NH2,r,Math.sqrt(2/NH1)); b2=zeros(NH2);
    W3=matrix(NH2,1,r,Math.sqrt(2/NH2)); b3=zeros(1);
    st.epoch=0; st.lossHist=[]; st.trained=false;
  }
  const act = z => st.actf==='relu' ? Math.max(0,z) : Math.tanh(z);
  const dact = (z,a) => st.actf==='relu' ? (z>0?1:0) : (1-a*a);

  function forward(x){
    const z1=zeros(NH1), a1=zeros(NH1);
    for(let j=0;j<NH1;j++){ let s=b1[j]; for(let i=0;i<NI;i++) s+=x[i]*W1[i][j]; z1[j]=s; a1[j]=act(s); }
    const z2=zeros(NH2), a2=zeros(NH2);
    for(let j=0;j<NH2;j++){ let s=b2[j]; for(let i=0;i<NH1;i++) s+=a1[i]*W2[i][j]; z2[j]=s; a2[j]=act(s); }
    let y=b3[0]; for(let i=0;i<NH2;i++) y+=a2[i]*W3[i][0];
    return {x, z1, a1, z2, a2, y};
  }
  function trainEpoch(lr){
    const n=TRX.length, idx=[]; for(let i=0;i<n;i++) idx.push(i);
    const r=rng(1000+st.epoch);
    for(let i=n-1;i>0;i--){ const j=Math.floor(r()*(i+1)); const t=idx[i]; idx[i]=idx[j]; idx[j]=t; }
    const B=32; let tot=0;
    for(let s=0;s<n;s+=B){
      const gW1=[],gW2=[],gW3=[];
      for(let i=0;i<NI;i++) gW1.push(zeros(NH1));
      for(let i=0;i<NH1;i++) gW2.push(zeros(NH2));
      for(let i=0;i<NH2;i++) gW3.push(zeros(1));
      const gb1=zeros(NH1), gb2=zeros(NH2), gb3=zeros(1);
      const m=Math.min(B, n-s);
      for(let q=0;q<m;q++){
        const k=idx[s+q], x=TRX[k], yt=TRY[k];
        const F=forward(x);
        const e=F.y-yt; tot+=e*e;
        const dy=2*e/m;
        gb3[0]+=dy;
        const d2=zeros(NH2);
        for(let i=0;i<NH2;i++){ gW3[i][0]+=dy*F.a2[i]; d2[i]=dy*W3[i][0]*dact(F.z2[i],F.a2[i]); }
        const d1=zeros(NH1);
        for(let j=0;j<NH2;j++) gb2[j]+=d2[j];
        for(let i=0;i<NH1;i++){ let s2=0;
          for(let j=0;j<NH2;j++){ gW2[i][j]+=d2[j]*F.a1[i]; s2+=d2[j]*W2[i][j]; }
          d1[i]=s2*dact(F.z1[i],F.a1[i]); }
        for(let j=0;j<NH1;j++) gb1[j]+=d1[j];
        for(let i=0;i<NI;i++) for(let j=0;j<NH1;j++) gW1[i][j]+=d1[j]*x[i];
      }
      for(let i=0;i<NI;i++) for(let j=0;j<NH1;j++) W1[i][j]-=lr*gW1[i][j];
      for(let j=0;j<NH1;j++) b1[j]-=lr*gb1[j];
      for(let i=0;i<NH1;i++) for(let j=0;j<NH2;j++) W2[i][j]-=lr*gW2[i][j];
      for(let j=0;j<NH2;j++) b2[j]-=lr*gb2[j];
      for(let i=0;i<NH2;i++) W3[i][0]-=lr*gW3[i][0];
      b3[0]-=lr*gb3[0];
    }
    st.epoch++;
    const L=tot/n; st.lossHist.push([st.epoch, L]);
    return L;
  }
  function trainFully(){ initW(7); for(let e=0;e<220;e++) trainEpoch(0.045); st.trained=true; }

  function specRow(){ const i=Math.round(st.day*DATA.HRS)+SPEC.hour; return DATA.rows[Math.min(i,DATA.N-1)]; }
  function runSpec(){ const r=specRow(); curAct=forward(xOf(r)); curOut=curAct.y*sy+my; return curAct; }

  /* input sensitivity at the current point — ∂ŷ/∂xᵢ by backprop to the inputs */
  function sens(){
    const F=curAct||runSpec(); const out=[];
    const d2=new Float64Array(NH2);
    for(let i=0;i<NH2;i++) d2[i]=W3[i][0]*dact(F.z2[i],F.a2[i]);
    const d1=new Float64Array(NH1);
    for(let i=0;i<NH1;i++){ let s=0; for(let j=0;j<NH2;j++) s+=d2[j]*W2[i][j]; d1[i]=s*dact(F.z1[i],F.a1[i]); }
    for(let i=0;i<NI;i++){ let s=0; for(let j=0;j<NH1;j++) s+=d1[j]*W1[i][j]; out.push(Math.abs(s)*sy); }
    return out;
  }

  /* ---------- scene ---------- */
  const LX=[-4.3,-1.45,1.45,4.15];
  function ringPos(i,n,rad,x){
    if(n===1) return new THREE.Vector3(x,0,0);
    const a=i/n*Math.PI*2 - Math.PI/2;
    return new THREE.Vector3(x, Math.sin(a)*rad, Math.cos(a)*rad);
  }
  function build(){
    prep(); trainFully();
    nodes=[[],[],[],[]];
    const rads=[2.0,1.65,1.20,0];
    const counts=[NI,NH1,NH2,1];
    for(let l=0;l<4;l++){
      // layer backdrop ring
      const ring=new THREE.Mesh(new THREE.TorusGeometry(rads[l]||0.55,0.012,6,44),
        TH3.basic(0x3D5468,0.45));
      ring.rotation.y=Math.PI/2; ring.position.x=LX[l]; TH3.root.add(ring); gLayerCards.push(ring);
      for(let i=0;i<counts[l];i++){
        const s=TH3.sph(l===3?0.24:0.155, 0x5C7386, {emis:0.25, rough:.35});
        s.position.copy(ringPos(i,counts[l],rads[l],LX[l]));
        TH3.root.add(s); nodes[l].push(s);
      }
    }
    // layer captions
    labs.l0=TH3.label('INPUT · 8 of 40 tags', new THREE.Vector3(LX[0],2.55,0),'ax').center();
    labs.l1=TH3.label('HIDDEN 1 · 10', new THREE.Vector3(LX[1],2.15,0),'ax').center();
    labs.l2=TH3.label('HIDDEN 2 · 6', new THREE.Vector3(LX[2],1.75,0),'ax').center();
    labs.l3=TH3.label('OUTPUT', new THREE.Vector3(LX[3],1.0,0),'ax').center();
    // input names
    IN.forEach((f,i)=>{ labs['in'+i]=TH3.label(f.n, nodes[0][i], '').offset(-6,-16); });
    labs.out=TH3.label('', nodes[3][0], 'em').offset(-16,-20);
    labs.out.el.style.transform='translate(-100%,-50%)';
    labs.err=TH3.label('', new THREE.Vector3(LX[3],-1.35,0), 'rd').center().show(false);

    buildEdges();
    // particle system
    const P=new Float32Array(240*3), C=new Float32Array(240*3);
    const pg=new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(P,3));
    pg.setAttribute('color', new THREE.BufferAttribute(C,3));
    parts=new THREE.Points(pg, new THREE.PointsMaterial({size:0.115, vertexColors:true,
      transparent:true, opacity:0.0, sizeAttenuation:true}));
    TH3.root.add(parts);
    partMeta=[];
    for(let i=0;i<240;i++) partMeta.push({e:0, t:0});

    runSpec();
    TH3.setCam(0.42, 0.26, 12.6, new THREE.Vector3(0,0,0), false);
    st.ready=true; refresh();
  }

  function buildEdges(){
    if(edgeLines){ TH3.root.remove(edgeLines); edgeLines.geometry.dispose(); }
    edges=[];
    const add=(l,i,j,w)=>edges.push({l,i,j,w,a:nodes[l][i].position.clone(),b:nodes[l+1][j].position.clone()});
    for(let i=0;i<NI;i++) for(let j=0;j<NH1;j++) add(0,i,j,W1[i][j]);
    for(let i=0;i<NH1;i++) for(let j=0;j<NH2;j++) add(1,i,j,W2[i][j]);
    for(let i=0;i<NH2;i++) add(2,i,0,W3[i][0]);
    const pairs=[], cols=[];
    edges.forEach(e=>{ pairs.push(e.a, e.b);
      const c=colFor(e.w); cols.push(c,c); });
    edgeLines=TH3.lineSet(pairs, cols);
    edgeLines.material.opacity=0.5;
    TH3.root.add(edgeLines);
  }
  function colFor(w){
    const m=clamp(Math.abs(w)/1.1,0,1);
    return w>=0 ? new THREE.Color(0x11707F).lerp(new THREE.Color(0x63D2E0), m)
                : new THREE.Color(0xA8261E).lerp(new THREE.Color(0xF08A78), m);
  }
  function refreshEdgeColours(){
    if(!edgeLines) return;
    const col=edgeLines.geometry.attributes.color;
    let k=0;
    const upd=(l,i,j,w)=>{ const c=colFor(w); const m=clamp(Math.abs(w)/1.1,0.05,1);
      col.setXYZ(k, c.r*(0.25+0.75*m), c.g*(0.25+0.75*m), c.b*(0.25+0.75*m));
      col.setXYZ(k+1, c.r*(0.25+0.75*m), c.g*(0.25+0.75*m), c.b*(0.25+0.75*m)); k+=2; };
    for(let i=0;i<NI;i++) for(let j=0;j<NH1;j++) upd(0,i,j,W1[i][j]);
    for(let i=0;i<NH1;i++) for(let j=0;j<NH2;j++) upd(1,i,j,W2[i][j]);
    for(let i=0;i<NH2;i++) upd(2,i,0,W3[i][0]);
    col.needsUpdate=true;
    edges.forEach((e,n)=>{ e.w = n<NI*NH1 ? W1[Math.floor(n/NH1)][n%NH1]
      : (n<NI*NH1+NH1*NH2 ? W2[Math.floor((n-NI*NH1)/NH2)][(n-NI*NH1)%NH2] : W3[n-NI*NH1-NH1*NH2][0]); });
  }

  function refresh(){
    if(!st.ready) return;
    runSpec();
    edgeLines.visible = st.showW;
    labs.out.set('ŷ = <b>'+f1(curOut)+' °C</b>').show(st.act>=3);
    const r=specRow(), err=r.brgT-curOut;
    labs.err.set('actual '+f1(r.brgT)+' · error <b>'+(err>=0?'+':'')+f1(err)+' °C</b>').show(st.act>=3);
    if(window.THEATRE) THEATRE.repanel();
  }

  function enter(a){
    st.act=a; st.phase=0;
    st.training = (a===5);
    if(a===5){ initW(11+Math.floor(st.epoch)); refreshEdgeColours(); }
    if(a===0){ TH3.setCam(0.42,0.26,12.6,new THREE.Vector3(0,0,0),1000); TH3.autospin(0.05); }
    if(a===1){ TH3.autospin(0); TH3.setCam(0.62,0.20,9.4,new THREE.Vector3(-2.4,0,0),1200); }
    if(a===2){ TH3.autospin(0); TH3.setCam(0.30,0.22,11.4,new THREE.Vector3(0,0,0),1200); }
    if(a===3){ TH3.autospin(0); TH3.setCam(-0.34,0.18,9.2,new THREE.Vector3(2.3,0,0),1200); }
    if(a===4){ TH3.autospin(0); TH3.setCam(0.34,0.30,11.8,new THREE.Vector3(0,0,0),1200); }
    if(a===5){ TH3.autospin(0.03); TH3.setCam(0.50,0.40,12.6,new THREE.Vector3(0,0,0),1200); }
    refresh();
  }

  let trainAcc=0;
  function tick(u,t){
    if(!st.ready) return;
    const F=curAct||runSpec();

    /* live training */
    if(st.training){
      trainAcc++;
      if(trainAcc% Math.max(1,Math.round(3/st.speed))===0 && st.epoch<220){
        trainEpoch(0.045); refreshEdgeColours(); runSpec();
        if(st.epoch%6===0 && window.THEATRE) THEATRE.repanel();
      }
      if(st.epoch>=220){ st.training=false; st.trained=true; refresh(); }
    }

    /* neuron bloom driven by the actual activations */
    const wave = st.act===2 ? clamp(u*1.25,0,1) : (st.act>=3?1:(st.act===1?clamp(u*1.6,0,1)*0.34:0));
    const lit = [ wave>0.02?1:0, st.act>=2?clamp((wave-0.22)/0.26,0,1):0,
                  st.act>=2?clamp((wave-0.50)/0.26,0,1):0, st.act>=2?clamp((wave-0.76)/0.24,0,1):0 ];
    if(st.act>=3||st.act===4||st.act===5) lit.fill(1);
    const acts=[F.x, F.a1, F.a2, [F.y]];
    for(let l=0;l<4;l++) nodes[l].forEach((s,i)=>{
      const v=acts[l][i]||0, m=clamp(Math.abs(v)/(l===0?2.2:1.05),0,1)*lit[l];
      const c = v>=0 ? new THREE.Color(0x2E93A6) : new THREE.Color(0xC2603A);
      s.material.color.copy(new THREE.Color(0x44586C)).lerp(c, m);
      s.material.emissive.copy(c); s.material.emissiveIntensity = 0.12+0.85*m;
      s.scale.setScalar(1 + 0.55*m + (l===3?0.10*Math.sin(t*3):0));
    });

    /* particles */
    const pos=parts.geometry.attributes.position, pc=parts.geometry.attributes.color;
    let show=0;
    if(st.act===2 || st.act===4 || st.act===5){
      parts.material.opacity=0.95;
      const back = (st.act===4);
      const strong = edges.map((e,i)=>({i,m:Math.abs(e.w)})).sort((a,b)=>b.m-a.m).slice(0,80);
      strong.forEach((s,n)=>{
        const e=edges[s.i];
        const ph = ((t*(back?-0.55:0.75)*st.speed + n*0.137) % 1 + 1) % 1;
        // gate by the wave so the pass looks sequential
        const g = st.act===2 ? clamp((wave - e.l*0.26)/0.30, 0, 1) : 1;
        if(g<0.05) return;
        const p=new THREE.Vector3().lerpVectors(e.a, e.b, back?1-ph:ph);
        pos.setXYZ(show, p.x, p.y, p.z);
        const c = back ? new THREE.Color(0xE0603A) : colFor(e.w);
        pc.setXYZ(show, c.r, c.g, c.b);
        show++;
      });
    } else parts.material.opacity=0.0;
    for(let i=show;i<240;i++) pos.setXYZ(i, 0, -99, 0);
    pos.needsUpdate=true; pc.needsUpdate=true;

    if(st.act===4){ // backward pass — pulse the edges red
      edgeLines.material.opacity = 0.35+0.35*Math.abs(Math.sin(t*2.2));
    } else edgeLines.material.opacity = st.showW?0.5:0;

    if(st.act>=3){
      const rr=specRow();
      labs.out.set('ŷ = <b>'+f1(curOut)+' °C</b>');
      labs.err.set('actual '+f1(rr.brgT)+' · error <b>'+((rr.brgT-curOut)>=0?'+':'')+f1(rr.brgT-curOut)+' °C</b>');
    }
    labs.out.show(st.act>=3); labs.err.show(st.act>=3);
    for(let i=0;i<NI;i++) labs['in'+i].show(st.act<=2 || st.act>=3);
  }

  function num(){
    const r=specRow();
    if(st.act<3) return {k:'Parameters in this network', v:'163', s:'146 weights · 17 biases'};
    return {k:'Network output', v:f1(curOut)+' °C', s:'actual '+f1(r.brgT)+' · error '+
      ((r.brgT-curOut)>=0?'+':'')+f1(r.brgT-curOut)+' °C'};
  }

  /* ---------- panel ---------- */
  function panel(){
    const r=specRow(), F=curAct||runSpec(), err=r.brgT-curOut;
    const j=st.inspect;
    let sum=b1[j], rows='';
    IN.forEach((f,i)=>{
      const xz=F.x[i], w=W1[i][j], p=xz*w; sum+=0;
      rows+=`<tr><td>${f.n}</td><td class="num">${f1(r[f.k])}${f.u?' '+f.u:''}</td>
        <td class="num">${f2(xz)}</td><td class="num" style="color:${w>=0?'#11707F':'#A8261E'}">${f2(w)}</td>
        <td class="num">${f2(p)}</td></tr>`;
    });
    let dot=0; for(let i=0;i<NI;i++) dot+=F.x[i]*W1[i][j];
    const zj=dot+b1[j], aj=act(zj);
    const S=sens(), smax=Math.max(...S)||1;

    return `
<div class="hd2"><div class="k">Module 4 · neural network</div>
<h2>Eight numbers in, one number out, 163 dials in between</h2>
<p>Nothing in this network is mysterious. Each neuron multiplies its inputs by its own weights, adds a bias,
and squashes the result. Do that 17 times and you have a machine that can represent a curved relationship no
straight-line model can. <b>The weights below are real</b> — trained in your browser on ${f0(TRX.length)} healthy
hours from this fan.</p></div>

<div class="card"><h3>The specimen<span class="tag">follow this number</span></h3>
<div class="stats">
  <div class="stat"><div class="l">Network says</div><div class="n tl">${f1(curOut)} °C</div>
    <div class="s">from the 8 inputs on the left</div></div>
  <div class="stat"><div class="l">Bearing actually</div><div class="n em">${f1(r.brgT)} °C</div>
    <div class="s">day ${f1(st.day)}, ${SPEC.tag}</div></div>
  <div class="stat"><div class="l">Error</div><div class="n ${Math.abs(err)>2.5?'rd':'gn'}">${err>=0?'+':''}${f1(err)} °C</div>
    <div class="s">${st.epoch<40?'network barely trained':'this is the residual again'}</div></div>
</div>
<div class="note">Three different machines — a lookup table in Module 1, a plane in Module 2, this network here —
and all three land on the same conclusion about the same reading. <b>That agreement is the point.</b> The
algorithm is a means; the residual is the finding.</div></div>

<div class="card"><h3>One neuron, fully opened<span class="tag">given input → process → output</span></h3>
<div class="ctl"><label>Inspect hidden-layer-1 neuron</label>
  <select id="m4insp">${Array.from({length:NH1},(_,i)=>
    `<option value="${i}"${st.inspect===i?' selected':''}>Neuron ${i+1} of 10</option>`).join('')}</select></div>
<div class="tw"><table><thead><tr><th>Input tag</th><th class="num">Reading</th><th class="num">Standardised</th>
<th class="num">Weight</th><th class="num">Product</th></tr></thead><tbody>${rows}</tbody></table></div>
<div class="eq">sum of products            = <span class="o">${f2(dot)}</span>
bias                       = <span class="o">${f2(b1[j])}</span>
                             ─────────
z<span class="o">${j+1}</span>                         = <span class="o">${f2(zj)}</span>
a<span class="o">${j+1}</span> = ${st.actf}(z<span class="o">${j+1}</span>)            = <span class="g">${f2(aj)}</span>   <span class="c">← this neuron's output</span></div>
<div class="small">That is the entire operation of one neuron. Multiply, add, squash. The network's power comes
from doing it 17 times in three ranks, not from any single step being clever. The activation function is what
stops the whole stack collapsing back into one straight line — without it, ten layers of multiply-and-add are
mathematically identical to one.</div></div>

<div class="card"><h3>What the network leans on</h3>
<div class="small" style="margin-bottom:6px">Sensitivity of the output to each input at this operating point —
how many °C the prediction moves per σ of each tag. Computed by running the same backward pass one step
further, all the way to the inputs.</div>
${IN.map((f,i)=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
  <span style="flex:0 0 122px;font-size:11.5px">${f.n}</span>
  <span style="flex:1;height:11px;background:#EDF2F6;border-radius:6px;overflow:hidden">
    <span style="display:block;height:100%;width:${(S[i]/smax*100).toFixed(0)}%;background:${i<2?'#D96A16':'#11707F'}"></span></span>
  <span class="mono" style="flex:0 0 52px;text-align:right;font-size:11px">${f1(S[i])} °C</span></div>`).join('')}
<div class="small" style="margin-top:7px">Load and ambient dominate, exactly as the physics says they should.
<b>This is your first sanity check on any supplied model</b>: if the biggest sensitivity is a tag with no
physical route to the target, the model has learned a coincidence in the training window.</div></div>

<div class="card"><h3>Controls</h3>
<div class="ctl"><label>Day <span class="v" id="m4dayv">${f1(st.day)}</span></label>
  <input type="range" id="m4day" min="20" max="130" step="0.5" value="${st.day}"></div>
<div class="ctl"><label>Activation function</label>
  <select id="m4actf">
    <option value="tanh"${st.actf==='tanh'?' selected':''}>tanh — smooth, saturates at ±1</option>
    <option value="relu"${st.actf==='relu'?' selected':''}>ReLU — max(0, z), the modern default</option>
  </select>
  <div class="hint">Switch it and the trained weights no longer suit the network — the error jumps until you
  retrain. Activation choice is part of the model, not a display option.</div></div>
<div class="ctl"><label>Animation speed <span class="v">${st.speed}×</span></label>
  <input type="range" id="m4sp" min="1" max="5" step="1" value="${st.speed}"></div>
<label class="tog"><input type="checkbox" id="m4sw"${st.showW?' checked':''}>
  <span>Draw the 146 weights (teal positive, red negative, brightness = magnitude)</span></label>
<div class="btnrow">
  <button class="btn" id="m4train">${st.training?'❚❚ Pause training':'▶ Train from scratch'}</button>
  <button class="btn gh" id="m4full">Train fully (220 epochs)</button>
</div>
<div class="kv"><span class="k">Epochs completed</span><span class="v">${st.epoch} / 220</span></div>
<div class="kv"><span class="k">Training loss (standardised MSE)</span>
  <span class="v">${st.lossHist.length?f2(st.lossHist[st.lossHist.length-1][1]):'—'}</span></div>
</div>

<div class="card"><h3>Training loss</h3>
<canvas class="ch" id="m4ch"></canvas>
<div class="small" style="margin-top:5px">The same ball-rolling-downhill from Module 3, run over 163 axes
instead of 2. Each epoch is one pass through every training hour, in mini-batches of 32.</div></div>

<div class="card"><h3>Layer 1 weight matrix</h3>
<div class="small" style="margin-bottom:6px">Rows are input tags, columns are the ten hidden neurons. This
${NI}×${NH1} block of numbers is 80 of the network's 146 weights — the entire "knowledge" the first layer holds.</div>
<div class="tw"><table><thead><tr><th></th>${Array.from({length:NH1},(_,j)=>`<th class="num">n${j+1}</th>`).join('')}</tr></thead>
<tbody>${IN.map((f,i)=>`<tr><td style="font-size:10.6px">${f.n}</td>${Array.from({length:NH1},(_,j)=>{
  const w=W1[i][j], m=clamp(Math.abs(w)/1.1,0,1);
  const bg = w>=0 ? `rgba(17,112,127,${(m*0.55).toFixed(2)})` : `rgba(168,38,30,${(m*0.55).toFixed(2)})`;
  return `<td class="num" style="background:${bg};font-size:10.4px">${f2(w)}</td>`;}).join('')}</tr>`).join('')}
</tbody></table></div></div>

<div class="card"><h3>What a neural network is, and is not</h3>
<table><thead><tr><th>It is</th><th>It is not</th></tr></thead><tbody>
<tr><td>A flexible curve-fitter that can represent relationships no straight line can.</td>
    <td>A model of the machine. It contains no thermodynamics and no bearing physics.</td></tr>
<tr><td>Excellent when you have a lot of history and the relationship is genuinely non-linear.</td>
    <td>Reliable outside the range of the data it saw. Ask it about 700 MW and it will answer confidently and wrongly.</td></tr>
<tr><td>Inspectable — every weight and every activation is a number you can print, as above.</td>
    <td>Explainable in the sense a manager means. "Neuron 6 fired at 0.81" is not a cause.</td></tr>
<tr><td>Retrainable in minutes on a laptop at this size.</td>
    <td>Free of the contamination problem. Train it on degrading data and it learns the degradation.</td></tr>
</tbody></table>
<div class="warn" style="margin-top:9px"><b>For a single bearing on a single fan, a network this size is
usually the wrong tool.</b> k-NN and PCA are simpler, need less data, and fail more visibly. Neural networks
earn their place where the relationship is strongly non-linear and you have years of history — combustion
optimisation, mill throughput, NOₓ prediction, load-following steam temperature. Choosing the smallest model
that works is an engineering decision, not a fashion decision.</div></div>`;
  }

  function wire(){
    const ins=$('m4insp'); if(ins) ins.onchange=e=>{ st.inspect=+e.target.value; if(window.THEATRE) THEATRE.repanel(); };
    const d=$('m4day'); if(d) d.oninput=e=>{ st.day=+e.target.value; $('m4dayv').textContent=f1(st.day); refresh(); };
    const af=$('m4actf'); if(af) af.onchange=e=>{ st.actf=e.target.value; runSpec(); refresh(); };
    const sp=$('m4sp'); if(sp) sp.oninput=e=>{ st.speed=+e.target.value; };
    const sw=$('m4sw'); if(sw) sw.onchange=e=>{ st.showW=e.target.checked; edgeLines.visible=st.showW; };
    const tb=$('m4train'); if(tb) tb.onclick=()=>{ if(!st.training && st.epoch>=220){ initW(11+st.epoch); refreshEdgeColours(); }
      st.training=!st.training; if(window.THEATRE) THEATRE.repanel(); };
    const fb=$('m4full'); if(fb) fb.onclick=()=>{ st.training=false; trainFully(); refreshEdgeColours(); refresh(); };
    const cv=$('m4ch'); if(cv) chart(cv,{h:146,
      series:[{pts: st.lossHist.length?st.lossHist:[[0,1]], c:'#D96A16', w:1.9}],
      xfmt:v=>v.toFixed(0), yfmt:v=>v.toFixed(2), nx:5, title:'MSE (standardised)'});
  }

  return {id:'nn', no:'MODULE 4', title:'A neural network, opened up',
    sub:'forward pass · backward pass · 163 real parameters trained in your browser',
    dimcap:'8 inputs of 40 · 163 parameters',
    acts:[
      {t:'1 · The wiring', d:5000, say:'Four ranks of neurons. Every line is one weight — teal where it adds, red where it subtracts, bright where it is large. There are <b>146 of them</b>, plus 17 biases. Rotate the view: the connections are a solid volume, not a diagram.'},
      {t:'2 · Eight numbers arrive', d:4200, say:'Day 96, 14:00. Load, ambient, flow, current, cooling water, differential pressure, mills running, hour of day — each standardised, each lighting its input neuron in proportion to how far it sits from normal.'},
      {t:'3 · Forward pass', d:5600, say:'Each hidden neuron multiplies every incoming value by its own weight, adds them up, adds a bias and squashes the total. The panel on the right shows one neuron’s complete arithmetic. <b>That is all a "layer" is.</b>'},
      {t:'4 · The answer, and how wrong it is', d:4600, say:'The output neuron produces a number: what the bearing should read. Compare it with what the bearing does read. The gap is the error — and, once again, the residual we have been following since Module 1.'},
      {t:'5 · Backward pass', d:5600, say:'Now run the error backwards. Each weight is asked: <i>how much of this mistake is yours?</i> Calculus answers exactly, one chain rule at a time, and each weight moves a little against its own share of the blame. <b>That is backpropagation.</b>'},
      {t:'6 · Training', d:7000, say:'Wipe the weights and do it 220 times over every hour of clean history. Watch the weight picture go from random noise to structure, and the loss curve fall. Nothing new is happening here — it is Module 3’s ball, rolling in 163 dimensions.'}
    ],
    build, enter, tick, panel, wire, num, st};
})();
