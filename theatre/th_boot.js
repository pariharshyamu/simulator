/* =========================================================================
   MODULE 0 — the overview scene, and the thread that runs through all six
   ========================================================================= */
const M0 = (function(){
  const RING = [
    {n:'1 · Nearest neighbours', c:0xD96A16, s:'a residual no limit would see'},
    {n:'2 · Principal components', c:0x11707F, s:'lifts off the normal plane'},
    {n:'3 · Gradient descent', c:0x5B4A85, s:'how the model was fitted'},
    {n:'4 · Neural network', c:0x256B45, s:'163 parameters, same answer'},
    {n:'5 · Retrieval and agents', c:0x9A6408, s:'what was done last time'},
    {n:'6 · k-means regimes', c:0x2E93A6, s:'sharper inside its own regime'}
  ];
  const st={act:0, ready:false};
  let core, ringObjs=[], spokes=[], labs={}, halo;

  function build(){
    ringObjs=[]; spokes=[]; labs={};
    core = TH3.sph(0.72, 0xD96A16, {emis:0.95, rough:.25}); TH3.root.add(core);
    halo = new THREE.Mesh(new THREE.TorusGeometry(1.16,0.030,10,60), TH3.basic(0xD96A16,0.6));
    TH3.root.add(halo);
    labs.core = TH3.label('<b>74.2 °C</b>', core, 'em big').offset(0,-34).center();
    labs.core2= TH3.label('ID fan A · DE bearing · day 96 · 14:00', new THREE.Vector3(0,-1.35,0),'').center();
    labs.core3= TH3.label('alarm 85 · trip 90 · nothing rings', new THREE.Vector3(0,-1.95,0),'ax').center();

    const R=5.0;
    RING.forEach((m,i)=>{
      const a=i/RING.length*Math.PI*2 - Math.PI/2;
      const p=new THREE.Vector3(Math.cos(a)*R, Math.sin(i*1.7)*0.55, Math.sin(a)*R);
      const pil=TH3.cyl(0.44,0.44,0.30,26,m.c,{emis:0.55,rough:.35});
      pil.position.copy(p); TH3.root.add(pil); ringObjs.push(pil);
      const sp=TH3.tube(new THREE.Vector3(0,0,0), p, 0.026, m.c, {emis:0.45, op:0.8, seg:6});
      TH3.root.add(sp); spokes.push({o:sp, p});
      labs['m'+i]=TH3.label('<b>'+m.n+'</b>', p.clone().add(new THREE.Vector3(0,0.55,0)),'').center();
      labs['s'+i]=TH3.label(m.s, p.clone().add(new THREE.Vector3(0,0.14,0)),'ax').center();
    });
    TH3.setCam(0.7, 0.46, 18.0, new THREE.Vector3(0,0,0), false);
    TH3.autospin(0.10);
    st.ready=true;
  }
  function enter(a){ st.act=a;
    if(a===0){ TH3.setCam(0.7,0.30,7.0,new THREE.Vector3(0,0,0),1100); TH3.autospin(0.05); }
    if(a===1){ TH3.setCam(1.1,0.50,18.0,new THREE.Vector3(0,0,0),1400); TH3.autospin(0.10); }
    if(a===2){ TH3.setCam(0.4,0.86,19.5,new THREE.Vector3(0,0,0),1400); TH3.autospin(0.06); }
  }
  function tick(u,t){
    if(!st.ready) return;
    halo.lookAt(TH3.cam.position);
    halo.scale.setScalar(1+0.10*Math.sin(t*1.8));
    halo.material.opacity=0.35+0.30*Math.abs(Math.sin(t*1.8));
    core.scale.setScalar(1+0.05*Math.sin(t*2.2));
    const show = st.act===0 ? 0 : (st.act===1 ? clamp(u*1.3,0,1) : 1);
    ringObjs.forEach((o,i)=>{
      const g = clamp(show*RING.length - i, 0, 1);
      o.visible = g>0.02; o.scale.setScalar(0.15+0.85*g);
      o.rotation.y += 0.004;
      spokes[i].o.visible = g>0.02;
      spokes[i].o.userData.setEnds(new THREE.Vector3(0,0,0),
        new THREE.Vector3().lerpVectors(new THREE.Vector3(0,0,0), spokes[i].p, Math.max(0.02,g)), 0.026);
      labs['m'+i].show(g>0.6); labs['s'+i].show(g>0.9 && st.act>=2);
    });
    labs.core3.show(st.act===0);
  }
  function num(){ return {k:'The specimen', v:'74.2 °C', s:'one reading · six algorithms'}; }
  function panel(){
    return `
<div class="hd2"><div class="k">Algorithm Anatomy Theatre</div>
<h2>Six algorithms, opened up, on one real reading</h2>
<p>Every module in this theatre works on the same synthetic-but-realistic 140 days of ID fan data, and every
one of them is asked about the same single reading: <b>74.2 °C on the drive-end bearing of ID fan A, day 96 at
14:00</b>. Nothing about that number is alarming. The alarm is at 85 °C and the trip at 90 °C, and the control
room sees a perfectly ordinary afternoon.</p></div>

<div class="card"><h3>The specimen<span class="tag">follow this number</span></h3>
<div class="stats">
  <div class="stat"><div class="l">Tag</div><div class="n" style="font-size:13px">${SPEC.tag}</div>
    <div class="s">${SPEC.what}</div></div>
  <div class="stat"><div class="l">Reading</div><div class="n em">74.2 °C</div>
    <div class="s">day ${SPEC.day}, 14:00</div></div>
  <div class="stat"><div class="l">Conditions</div><div class="n" style="font-size:13px">${SPEC.ctx.load} MW</div>
    <div class="s">${SPEC.ctx.amb} °C ambient · ${f0(SPEC.ctx.flow)} m³/s · ${SPEC.ctx.curr} A</div></div>
</div>
<div class="note">${SPEC.unit}. The six modules do not agree because they were tuned to agree — they agree
because the reading really is anomalous, and six unrelated pieces of mathematics can each detect it. That
convergence is the argument for the whole discipline.</div></div>

<div class="card"><h3>What each module says about the same number</h3>
<table><thead><tr><th>Module</th><th>Machinery</th><th>What it concludes</th></tr></thead><tbody>
<tr><td><b>1 · Nearest neighbours</b></td><td>Look up the most similar past hours</td>
  <td>On previous hours at this load and ambient the bearing sat several °C cooler. The gap is the signal.</td></tr>
<tr><td><b>2 · Principal components</b></td><td>Fit a plane through normal operation</td>
  <td>The reading has left the plane. Every individual sensor is inside its own limits; the combination is not.</td></tr>
<tr><td><b>3 · Gradient descent</b></td><td>Roll downhill on a loss surface</td>
  <td>How the model that says "should be 70 °C" was fitted in the first place. No magic, just calculus.</td></tr>
<tr><td><b>4 · Neural network</b></td><td>163 weights, forward and backward</td>
  <td>A third, unrelated machine reaches the same conclusion — and shows which inputs it leaned on.</td></tr>
<tr><td><b>5 · Retrieval and agents</b></td><td>Embed the plant’s documents; retrieve by meaning</td>
  <td>The 2023 work order on this same bearing, the root-cause note on monsoon cooler fouling, and the spares position.</td></tr>
<tr><td><b>6 · k-means</b></td><td>Group the hours into operating regimes</td>
  <td>Give each regime its own limit and the degradation breaks it about three weeks before the fan’s own alarm.</td></tr>
</tbody></table></div>

<div class="card"><h3>How to use this</h3>
<ul>
<li><b>Play</b> runs the current act; the chips above the timeline are the acts. The narration in the dark strip
changes with each one.</li>
<li><b>Drag</b> in the 3-D view to orbit, <b>scroll</b> to zoom, <b>shift-drag</b> to pan. Reset view puts it back.</li>
<li>Everything on the right is live. Move a slider and the geometry changes with it — the pictures are not
recordings.</li>
<li>Every number shown is computed in your browser from the same 140-day dataset. Nothing is pre-rendered.</li>
</ul>
<div class="warn"><b>On the data.</b> The 140 days of fan data here are synthetic — generated from a physical
model of an ID fan with a genuine slow bearing degradation injected from day ${DATA.FAULT_ON}. They are used
because a teaching artefact needs a fault whose true onset date is known exactly. The plant economics, tags,
limits and documents are drawn from real MAHAGENCO practice; the June 2026 station figures used elsewhere in
this course come from the audited filing, not from here.</div></div>

<div class="card"><h3>Presented by</h3>
<div class="row"><div class="col">
<div style="font:700 16px Cambria,Georgia,serif">S. H. Parihar</div>
<div class="small" style="margin-top:2px">16 years in the power sector</div>
<div class="small" style="margin-top:7px"><b>Author of</b><br>Lean AI<br>Learn the English that AI Understands<br>AI for Busy Parents</div>
</div><div class="col">
<div class="small"><b>AI for Power Plants</b><br>MAHAGENCO Training Centre, Nashik<br>
Companion to the predictive-maintenance simulator and the AI simulation lab.<br><br>
Audience: Nashik 3×210 MW; Koradi 3×660 MW; Khaperkheda 2×500 and 4×210 MW;
Bhusawal 2×660 MW; Paras 2×250 MW.</div>
</div></div></div>`;
  }
  function wire(){}
  return {id:'overview', no:'START HERE', title:'One reading, six algorithms',
    sub:'the thread that runs through every module',
    dimcap:'',
    acts:[
      {t:'1 · The reading', d:4600, say:'<span class="em">74.2 °C</span> on the drive-end bearing of ID fan A, Koradi unit 8, day 96 at two in the afternoon. The alarm is at 85 and the trip at 90. <b>Nothing rings.</b> Six different pieces of mathematics are about to disagree with that silence.'},
      {t:'2 · The six machines', d:5200, say:'A lookup table. A plane. A ball rolling downhill. A network of 163 numbers. A library turned into directions. A handful of centroids. Each one is opened up in this theatre — <b>not the diagram of it, the working thing.</b>'},
      {t:'3 · Why they agree', d:5000, say:'They were not tuned to agree. They agree because the reading genuinely is out of place, and because every one of these methods is, underneath, asking the same question: <b>what did this machine do the last time it was in this situation?</b>'}
    ],
    build, enter, tick, panel, wire, num, st};
})();

/* =========================================================================
   THEATRE — the player, the rail, the panel
   ========================================================================= */
const THEATRE = (function(){
  const MODULES=[M0, M1, M2, M3, M4, M5, M6];
  const T={mi:0, ai:0, u:0, playing:false, chain:false};
  let mod=null, lock=false, dirty=false, lastPanel=0;

  function renderRail(){
    const r=$('rail'); r.innerHTML='';
    MODULES.forEach((m,i)=>{
      const d=document.createElement('div');
      d.className='st'+(i===T.mi?' on':''); d.dataset.m=i;
      d.innerHTML=`<div class="n">${m.no}</div><div class="t">${m.title.split('—')[0].trim()}</div>`;
      d.onclick=()=>setModule(i);
      r.appendChild(d);
    });
  }
  function renderActs(){
    const a=$('acts'); a.innerHTML='';
    mod.acts.forEach((ac,i)=>{
      const d=document.createElement('div');
      d.className='a'+(i===T.ai?' on':'')+(i<T.ai?' done':'');
      d.textContent=ac.t; d.onclick=()=>setAct(i,true,false);
      a.appendChild(d);
    });
  }
  function say(){ $('say').innerHTML = mod.acts[T.ai].say; }

  function setModule(i){
    T.mi=i; T.playing=false; $('play').textContent='▶ Play';
    TH3.clear();
    mod=MODULES[i];
    $('glTitle').textContent=mod.title;
    $('glSub').textContent=mod.sub;
    $('dimcap').textContent=mod.dimcap||'';
    $('dimcap').style.display=mod.dimcap?'block':'none';
    try{ mod.build(); }catch(e){ console.error('build '+mod.id, e); }
    TH3.onFrame(frame);
    renderRail(); setAct(0,true,false);
  }
  function setAct(a, play, chain){
    T.ai=clamp(a,0,mod.acts.length-1); T.u=0;
    T.chain = !!chain;
    T.playing = (play!==false);
    try{ mod.enter(T.ai); }catch(e){ console.error('enter', e); }
    renderActs(); say(); $('tl').value=0;
    $('play').textContent = T.playing ? '❚❚ Pause' : '▶ Play';
    repanel(true);
  }
  function frame(t, dt){
    if(T.playing){
      const dur=(mod.acts[T.ai].d||5000)/1000;
      T.u += dt/dur;
      if(T.u>=1){
        T.u=1;
        if(T.chain && T.ai<mod.acts.length-1){ setAct(T.ai+1, true, true); }
        else { T.playing=false; T.chain=false; $('play').textContent='▶ Replay'; }
      }
      $('tl').value=Math.round(T.u*1000);
    }
    try{ mod.tick(T.u, t); }catch(e){ console.error('tick', e); }
    const n = mod.num? mod.num() : null;
    if(n){ $('numK').textContent=n.k; $('numV').textContent=n.v; $('numS').textContent=n.s; $('glnum').style.display='block'; }
    else $('glnum').style.display='none';
    if(dirty && !lock && performance.now()-lastPanel>200) repanel(true);
  }
  function repanel(force){
    if(lock && !force){ dirty=true; return; }
    if(!force && performance.now()-lastPanel<220){ dirty=true; return; }
    lastPanel=performance.now(); dirty=false;
    const p=$('panel'), sc=p.scrollTop;
    try{ $('pw').innerHTML = mod.panel(); }catch(e){ console.error('panel', e); $('pw').innerHTML='<div class="bad">panel error</div>'; }
    try{ mod.wire(); }catch(e){ console.error('wire', e); }
    p.scrollTop=sc;
  }

  function boot(){
    TH3.init($('gl'), $('gl'));
    $('specV').textContent = SPEC.value+' °C';
    $('specS').textContent = 'ID fan A, DE bearing · day '+SPEC.day;
    $('play').onclick=()=>{ if(T.u>=1) T.u=0; T.playing=!T.playing; T.chain=T.playing;
      $('play').textContent = T.playing? '❚❚ Pause' : (T.u>=1?'▶ Replay':'▶ Play'); };
    $('tl').oninput=e=>{ T.playing=false; T.chain=false; $('play').textContent='▶ Play'; T.u=(+e.target.value)/1000; };
    $('resetCam').onclick=()=>{ mod.enter(T.ai); };
    $('specChip').onclick=()=>showModal();
    $('modal').onclick=e=>{ if(e.target.id==='modal') $('modal').classList.remove('on'); };
    const p=$('panel');
    p.addEventListener('pointerdown', ()=>{ lock=true; });
    window.addEventListener('pointerup', ()=>{ lock=false; });
    document.addEventListener('keydown', e=>{
      if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT') return;
      if(e.key===' '){ e.preventDefault(); $('play').click(); }
      if(e.key==='ArrowRight') setAct(T.ai+1,true,false);
      if(e.key==='ArrowLeft') setAct(T.ai-1,true,false);
      if(e.key>='1'&&e.key<='7') setModule(+e.key-1);
    });
    setModule(0);
    $('loading').style.display='none';
  }
  function showModal(){
    $('modalbox').innerHTML=`<h2>Follow this number</h2>
<p class="small">Every module in this theatre is asked about one reading.</p>
<div class="stats"><div class="stat"><div class="l">Tag</div><div class="n" style="font-size:13px">${SPEC.tag}</div>
<div class="s">${SPEC.what}</div></div>
<div class="stat"><div class="l">Value</div><div class="n em">${SPEC.value} °C</div>
<div class="s">day ${SPEC.day}, 14:00 · alarm ${SPEC.alarm} · trip ${SPEC.trip}</div></div></div>
<p>${SPEC.unit}. Conditions at that moment: ${SPEC.ctx.load} MW, ${SPEC.ctx.amb} °C ambient,
${f0(SPEC.ctx.flow)} m³/s fan flow, ${SPEC.ctx.curr} A motor current, ${SPEC.ctx.vib} mm/s vibration.</p>
<p>Nothing about it triggers anything. Module 1 shows why it should have. Modules 2, 4 and 6 reach the same
conclusion by entirely different routes. Module 3 shows how the model that judges it was built, and Module 5
shows how an assistant finds the four documents an engineer would need next.</p>
<p class="small"><b>Keyboard:</b> space to play or pause, ← → for acts, 1–7 for modules.</p>
<div class="btnrow" style="margin-top:12px"><button class="btn" onclick="document.getElementById('modal').classList.remove('on')">Close</button></div>`;
    $('modal').classList.add('on');
  }
  return {boot, repanel:()=>repanel(false), setModule, setAct, get mod(){return mod;}};
})();

window.THEATRE = THEATRE;   /* `const` does not attach to window in a classic script */

window.addEventListener('load', ()=>{ try{ THEATRE.boot(); }
  catch(e){ console.error(e); document.getElementById('loading').innerHTML=
    '<div style="color:#F09A92">Failed to start: '+e.message+'</div>'; } });
