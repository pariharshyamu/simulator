/* =========================================================================
   MODULE 5 — RAG: how a question finds the right page in the plant library
   ========================================================================= */
const M5 = (function(){
  /* concept axes — a hand-labelled stand-in for the ~1024 learned axes of a
     real embedding model, so the geometry can be read rather than trusted */
  const CN = ['bearing','lube oil','vibration','draught fan','mill & coal','pressure parts',
              'turbine','electrical','permit & safety','chemistry','overhaul & spares',
              'thermal / temperature','procedure','event history'];
  const K = CN.length;
  function v(o){ const a=new Array(K).fill(0); for(const k in o) a[CN.indexOf(k)]=o[k]; return a; }

  const DOCS = [
    {t:'WO 2023-04117 · ID fan A coupling-end bearing high metal temperature', s:'Work order',
     x:'Induced draught fan A, coupling end bearing, metal temperature trending upward over three weeks. On opening, the oil was found dark with a burnt smell; sampling showed water ingress 1,240 ppm. Bearing shells scored on the lower half. Shells replaced, oil flushed and recharged with Servoprime 46, breather element renewed.',
     c:v({'bearing':1,'lube oil':0.9,'draught fan':0.9,'thermal / temperature':0.8,'event history':1,'overhaul & spares':0.4})},
    {t:'WO 2024-01988 · ID fan B DE bearing oil leak from labyrinth seal', s:'Work order',
     x:'Oil weeping past the drive-end labyrinth. Seal renewed during the unit-8 opportunity outage; level restored. No temperature excursion recorded.',
     c:v({'bearing':0.9,'lube oil':1,'draught fan':0.9,'event history':0.8})},
    {t:'OEM manual §7.4 · Bearing temperature limits, ID fan (BHEL/TLT axial)', s:'OEM manual',
     x:'Alarm at 85 °C metal temperature, trip at 90 °C. Sustained operation above 80 °C requires investigation of oil supply temperature and cooler performance. Design oil supply 42–46 °C at bearing inlet.',
     c:v({'bearing':1,'thermal / temperature':1,'draught fan':0.8,'procedure':0.5,'lube oil':0.5})},
    {t:'OEM manual §7.9 · Lubrication schedule and oil specification', s:'OEM manual',
     x:'Forced lubrication, ISO VG 46 turbine oil. Oil change interval 8,000 running hours or on condition. Cooler differential to be logged each shift.',
     c:v({'lube oil':1,'procedure':0.7,'bearing':0.6,'draught fan':0.5})},
    {t:'Shift log 12-Jun-2026 · B shift, unit 8', s:'Shift log',
     x:'ID fan A DE bearing 71 °C at 14:00, ambient 36. Fan A oil cooler CW outlet valve found throttled 40%; opened fully, temperature settled 2 °C lower over the next four hours.',
     c:v({'bearing':0.9,'lube oil':0.7,'thermal / temperature':0.9,'draught fan':0.8,'event history':0.9})},
    {t:'Vibration survey report Q1-2026 · ID fans, unit 8', s:'Condition report',
     x:'ID fan A: 2.8 mm/s RMS DE horizontal, 1×N dominant, no bearing defect frequencies. ID fan B: 3.4 mm/s with a 2×N component consistent with mild misalignment. Recommended alignment check at next opportunity.',
     c:v({'vibration':1,'bearing':0.7,'draught fan':0.9,'event history':0.6})},
    {t:'Technical circular MG/O&M/2024-11 · Bearing oil sampling frequency', s:'Circular',
     x:'All ID and FD fan bearings to be sampled quarterly for water content and particle count. Samples above 500 ppm water to be reported to the Superintending Engineer within 48 hours.',
     c:v({'lube oil':1,'bearing':0.8,'procedure':0.9,'chemistry':0.4})},
    {t:'Root cause note · Repeat bearing failures, ID fan A, 2021–2023', s:'RCA',
     x:'Three shell replacements in 26 months. Common thread: oil cooler fouling on the CW side during the monsoon, raising supply temperature by 6–9 °C. Cooler chemical cleaning added to the monsoon preparedness checklist.',
     c:v({'bearing':1,'lube oil':0.9,'thermal / temperature':0.9,'event history':1,'draught fan':0.7,'chemistry':0.4})},
    {t:'SOP-MECH-021 · Hot bearing — immediate actions', s:'SOP',
     x:'On bearing metal temperature exceeding alarm: verify with the second element, check oil supply pressure and temperature, confirm cooler CW flow, reduce fan loading if permissible, and raise a defect. Do not reset the alarm without a written entry.',
     c:v({'bearing':1,'procedure':1,'thermal / temperature':0.8,'permit & safety':0.4})},
    {t:'Spares register · ID fan bearing shells, unit 8', s:'Spares',
     x:'Two sets of DE shells held at Koradi central store, part 3-FN-BRG-118. Lead time on reorder from OEM 14 weeks. NDE shells nil stock.',
     c:v({'overhaul & spares':1,'bearing':0.9,'draught fan':0.7})},
    {t:'Overhaul report · Unit 8 capital overhaul, Mar-2025, draught plant', s:'Overhaul',
     x:'Both ID fans opened. Fan A DE bearing clearances within limits; NDE shells replaced. Impellers cleaned, 4.2 kg deposit removed from fan B. Alignment restored to 0.04 mm.',
     c:v({'overhaul & spares':1,'bearing':0.8,'draught fan':1,'event history':0.7,'vibration':0.4})},

    {t:'WO 2025-00742 · Mill 6C roller journal bearing high temperature', s:'Work order',
     x:'Bowl mill 6C, roller journal running 12 °C above its sisters. Grease line found partially blocked. Line cleared, journal repacked.',
     c:v({'mill & coal':1,'bearing':0.8,'lube oil':0.6,'thermal / temperature':0.7,'event history':0.8})},
    {t:'OEM manual · Bowl mill 803XRP, roller assembly maintenance', s:'OEM manual',
     x:'Roller clearance setting 3.5 mm cold. Journal spring assembly torque 640 Nm in a diagonal sequence, in three passes.',
     c:v({'mill & coal':1,'procedure':0.8,'overhaul & spares':0.6})},
    {t:'Mill outlet temperature control philosophy', s:'Design note',
     x:'Mill outlet maintained at 75–80 °C by hot and cold PA damper modulation. High moisture Indian coal may require the upper limit; mill outlet above 90 °C risks a mill fire.',
     c:v({'mill & coal':1,'thermal / temperature':0.9,'procedure':0.6})},
    {t:'Coal quality report June 2026 · as-fired GCV by source', s:'Fuel report',
     x:'Weighted as-fired GCV 3,478 kcal/kg against 3,900 in the FSA. Transit loss 1.4%. Two rakes from WCL rejected on ash.',
     c:v({'mill & coal':1,'chemistry':0.4,'event history':0.5})},
    {t:'WO 2024-03310 · Mill 8D rejects gate jammed', s:'Work order',
     x:'Pyrite hopper gate seized with clinker. Cleared, gate seat re-faced, actuator stroke reset.',
     c:v({'mill & coal':1,'event history':0.7})},

    {t:'Boiler tube leak history · Unit 8, 2019–2026', s:'Reliability record',
     x:'Eleven forced outages attributable to tube leaks. Seven in the second-pass economiser at the same bank. Erosion from flue gas channelling after screen removal identified as the cause; baffles reinstated 2024.',
     c:v({'pressure parts':1,'event history':1,'overhaul & spares':0.4})},
    {t:'SOP-BLR-008 · Tube leak detection and unit removal', s:'SOP',
     x:'On suspicion of a tube leak — falling drum level make-up, rising furnace pressure noise, acoustic leak detection alarm — inform the load despatch centre and prepare for a controlled shutdown.',
     c:v({'pressure parts':1,'procedure':1,'permit & safety':0.5})},
    {t:'Metallurgical report · SH platen tube, unit 8, Jan-2025', s:'Lab report',
     x:'Long-term overheating. Steamside oxide 0.42 mm, indicating a metal temperature 30 °C above design for a sustained period. Recommend a thermocouple survey of the platen outlet legs.',
     c:v({'pressure parts':1,'thermal / temperature':1,'chemistry':0.5,'event history':0.6})},
    {t:'Reheater spray water usage trend, unit 8', s:'Performance note',
     x:'RH spray averaging 11 t/h against a design of nil, costing approximately 14 kcal/kWh in heat rate. Attributed to burner tilt limitation and high excess air.',
     c:v({'pressure parts':0.7,'turbine':0.4,'thermal / temperature':0.7,'chemistry':0.2})},

    {t:'HP-LP bypass valve passing, unit 8', s:'Work order',
     x:'Downstream temperature elevated with the valve shut. Seat lapped during the mini-outage; passing eliminated.',
     c:v({'turbine':1,'thermal / temperature':0.6,'event history':0.7})},
    {t:'Turbine supervisory instrumentation limits', s:'OEM manual',
     x:'Thrust bearing metal temperature alarm 105 °C, trip 115 °C. Journal bearing drain oil alarm 75 °C. Differential expansion limits ±6 mm.',
     c:v({'turbine':1,'bearing':0.8,'thermal / temperature':0.9,'procedure':0.4})},
    {t:'Condenser vacuum deterioration investigation', s:'Performance note',
     x:'Back pressure 128 mbar against a design 89. Air ingress located at the LP turbine gland and the atmospheric drain tank vent. Heat rate penalty about 38 kcal/kWh.',
     c:v({'turbine':1,'chemistry':0.3,'thermal / temperature':0.5,'event history':0.5})},

    {t:'Motor winding temperature trend · ID fan A drive motor', s:'Condition report',
     x:'All three phases within 4 °C of each other, peak 118 °C at full load in May. No thermal imbalance. Space heaters healthy.',
     c:v({'electrical':1,'thermal / temperature':0.9,'draught fan':0.7})},
    {t:'Motor current signature analysis · unit 8 ID fans, Feb-2026', s:'Condition report',
     x:'No sidebands at twice slip frequency; rotor bars intact on both fans. Stator current unbalance 1.2%.',
     c:v({'electrical':1,'vibration':0.5,'draught fan':0.8})},
    {t:'11 kV breaker maintenance schedule, unit 8 board', s:'Schedule',
     x:'Contact resistance measurement and spring charging check due every 24 months or 2,000 operations.',
     c:v({'electrical':1,'procedure':0.7,'overhaul & spares':0.4})},
    {t:'Transformer oil DGA · Station transformer 2, June 2026', s:'Lab report',
     x:'Acetylene nil, ethylene 34 ppm, hydrogen 68 ppm. Trending upward slowly; repeat in three months.',
     c:v({'electrical':1,'chemistry':0.9,'lube oil':0.5,'event history':0.4})},

    {t:'Permit to work · Rotating equipment isolation standard', s:'Safety',
     x:'Electrical isolation, mechanical locking of the coupling, and a hot-work clearance where grinding is involved. Two-person verification of zero energy before any bearing housing is opened.',
     c:v({'permit & safety':1,'procedure':0.9,'bearing':0.4,'electrical':0.4})},
    {t:'Confined space entry procedure · ESP hoppers and ducts', s:'Safety',
     x:'Gas test before entry and every two hours. Standby person at the manhole with a rescue harness. No entry within four hours of a soot blow.',
     c:v({'permit & safety':1,'procedure':0.9})},
    {t:'Incident report · Near miss during fan bearing inspection, 2024', s:'Safety',
     x:'Fan barred over while a fitter had his hand inside the housing. Isolation was in place but the barring gear key was not surrendered. Procedure amended to include key custody.',
     c:v({'permit & safety':1,'bearing':0.7,'draught fan':0.6,'event history':0.8,'procedure':0.6})},

    {t:'Boiler water chemistry limits · AVT(O) regime', s:'Chemistry',
     x:'Feed water pH 9.2–9.6, conductivity below 0.2 µS/cm, dissolved oxygen 10–20 ppb, silica below 20 ppb at the drum.',
     c:v({'chemistry':1,'pressure parts':0.5,'procedure':0.6})},
    {t:'Cooling water treatment · monsoon fouling control', s:'Chemistry',
     x:'Cycles of concentration limited to 4.5. Chlorination shock dosing twice daily during monsoon. Heat exchanger cleaning frequency doubled June to September.',
     c:v({'chemistry':1,'thermal / temperature':0.6,'procedure':0.6,'lube oil':0.3})},

    {t:'Annual overhaul planning note · unit 8, 2026-27', s:'Planning',
     x:'Forty-day capital overhaul proposed for February. Draught plant, both APHs, and the HP turbine module. Long-lead spares to be indented by August.',
     c:v({'overhaul & spares':1,'procedure':0.5,'event history':0.4})},
    {t:'Availability and outage record · unit 8, FY 2025-26', s:'Record',
     x:'Two forced outages totalling 214 hours: one boiler tube leak, one ID fan A bearing. Planned outage 31 days.',
     c:v({'event history':1,'bearing':0.6,'pressure parts':0.6,'draught fan':0.5})},
    {t:'Heat rate deviation analysis · unit 8, June 2026', s:'Performance note',
     x:'Gross heat rate 2,516 against a norm of 2,398. Main contributors: condenser back pressure, RH spray, and high excess air.',
     c:v({'turbine':0.7,'pressure parts':0.5,'thermal / temperature':0.6,'event history':0.5})},
    {t:'Auxiliary power consumption review · Koradi units 8–10', s:'Performance note',
     x:'Auxiliary consumption 8.14% against a norm of 8.50%. ID fan power the single largest mover with load.',
     c:v({'electrical':0.8,'draught fan':0.8,'event history':0.5})},
    {t:'SOP-MECH-034 · Bearing shell replacement, ID fan', s:'SOP',
     x:'Barring gear key surrendered, coupling bolts marked and removed, top half of the housing lifted with the 2 t chain block. Shell crush 0.03–0.05 mm. Torque housing bolts to 320 Nm in three passes.',
     c:v({'bearing':1,'procedure':1,'draught fan':0.9,'overhaul & spares':0.7,'permit & safety':0.4})},
    {t:'Thermography survey · unit 8 draught plant, Apr-2026', s:'Condition report',
     x:'Fan A DE housing 6 °C warmer than fan B under matched load. Oil cooler shell showing a cold spot consistent with partial tube blockage.',
     c:v({'thermal / temperature':1,'bearing':0.8,'draught fan':0.9,'lube oil':0.6,'event history':0.6})},
    {t:'Instrument calibration record · 0-FN-201-TE-03', s:'Calibration',
     x:'Duplex Pt100, drive-end bearing, ID fan A. Last calibrated 11-Feb-2026 against a dry block; error +0.3 °C at 80 °C. Next due Feb-2027.',
     c:v({'bearing':0.8,'thermal / temperature':0.9,'electrical':0.3,'procedure':0.5})},
    {t:'Alarm rationalisation study · unit 8 DAS', s:'Study',
     x:'1,840 configured alarms; 214 standing at any time. Ninety per cent of operator acknowledgements occur within two seconds, indicating the alarms are not being read.',
     c:v({'procedure':0.9,'electrical':0.4,'event history':0.5})},
    {t:'Digital twin pilot scope · Koradi units 8–10', s:'Project note',
     x:'Phase 1 covers draught plant and mills. Data historian tags exported at one-minute resolution for 36 months. Model vendor to deliver residual-based anomaly detection.',
     c:v({'procedure':0.5,'event history':0.5,'draught fan':0.5,'mill & coal':0.4})}
  ];

  const QUERIES = [
    {q:'ID fan A drive-end bearing is running warm at Koradi 8 — what did we find last time and what should I check first?',
     c:v({'bearing':1,'draught fan':0.9,'thermal / temperature':0.9,'event history':0.9,'lube oil':0.6,'procedure':0.5}),
     g:[0,7,4,37], kw:'id fan a drive end bearing warm check',
     a:`Three things, in this order.\n\n**1. Check the oil cooler cooling-water side.** The 2021–2023 root cause note [8] found that every one of three shell replacements on this bearing traced back to cooler fouling during the monsoon, raising oil supply temperature by 6–9 °C. The April 2026 thermography [38] already shows the fan A cooler shell with a cold spot consistent with partial tube blockage, and fan A running 6 °C warmer than fan B at matched load. It is June.\n\n**2. Check the CW outlet valve position.** On 12 June the B shift found this exact valve throttled to 40% and gained 2 °C by opening it [5].\n\n**3. Sample the oil for water.** WO 2023-04117 [1] on this same bearing found 1,240 ppm water and scored lower shells. Circular MG/O&M/2024-11 [7] requires anything above 500 ppm to be reported to the SE within 48 hours.\n\nLimits for reference: alarm 85 °C, trip 90 °C, and the manual asks for investigation above 80 °C [3]. Two sets of DE shells are at Koradi central store, part 3-FN-BRG-118; NDE shells are nil stock with a 14-week lead time [10].`},
    {q:'What is the tightening torque for the ID fan bearing housing bolts, and what shell crush should I set?',
     c:v({'bearing':0.9,'procedure':1,'overhaul & spares':0.7,'draught fan':0.8}),
     g:[36,27], kw:'tightening torque bearing housing bolts shell crush',
     a:`From SOP-MECH-034 [37]: housing bolts **320 Nm in three passes**, shell crush **0.03–0.05 mm**.\n\nBefore the housing is opened, the permit standard [28] requires electrical isolation, mechanical locking of the coupling, and two-person verification of zero energy — and after the 2024 near miss [30], the barring gear key must be surrendered and its custody recorded.\n\nNote what the retrieval did **not** find: no document in this library gives a torque for the *coupling* bolts. If you had asked for that, a model without retrieval would very likely have invented a number.`},
    {q:'Why is unit 8 heat rate 118 kcal/kWh worse than norm this month?',
     c:v({'turbine':0.8,'pressure parts':0.6,'thermal / temperature':0.7,'event history':0.7,'mill & coal':0.4}),
     g:[34,22,19], kw:'heat rate worse than norm unit 8',
     a:`The June analysis [35] names three contributors, and two of them have their own supporting documents:\n\n- **Condenser back pressure** — 128 mbar against a design 89, with air ingress located at the LP gland and the atmospheric drain tank vent, worth about 38 kcal/kWh [23].\n- **Reheater spray** — averaging 11 t/h against a design of nil, about 14 kcal/kWh, attributed to burner tilt limitation and high excess air [20].\n- **High excess air** — which appears in both notes and is the cheapest of the three to attack.\n\nThat accounts for roughly half the gap. The remainder is not documented in this library — which is the honest answer, and the one a retrieval-grounded assistant should give rather than filling the space.`},
    {q:'Is it safe to open a bearing housing while the adjacent fan is running?',
     c:v({'permit & safety':1,'procedure':0.9,'bearing':0.8,'draught fan':0.6}),
     g:[27,29], kw:'safe open bearing housing adjacent fan running',
     a:`The library does not answer this directly, and that matters.\n\nWhat it does say: the rotating equipment isolation standard [28] requires electrical isolation, mechanical locking of the coupling and two-person verification of zero energy **on the machine being worked on** — it is silent on the adjacent machine. The 2024 near miss [30] involved a fan barred over with a fitter's hand inside the housing, and led to a barring-gear key custody requirement.\n\nA grounded assistant should stop here and say so, rather than reasoning its way to a confident yes or no. **Route this to the safety officer and the shift charge engineer.** An assistant that answers this question fluently from general knowledge is the failure mode, not the feature.`}
  ];

  const st = {qi:0, k:6, mode:'sem', cone:true, act:0, ready:false, scores:[], sel:[]};
  let dots=[], D3=[], Q3=null, qArrow, coneM, links=[], labs={}, gAx;

  /* ---------- projection to 3-D by power iteration ---------- */
  function pca3(V){
    const n=V.length, d=V[0].length;
    const m=new Array(d).fill(0);
    V.forEach(x=>x.forEach((v,i)=>m[i]+=v/n));
    const X=V.map(x=>x.map((v,i)=>v-m[i]));
    const comps=[];
    for(let c=0;c<3;c++){
      let p=new Array(d).fill(0).map((_,i)=>Math.sin(i*7.3+c*2.1)+0.11);
      for(let it=0; it<90; it++){
        const u=new Array(d).fill(0);
        for(const x of X){ let t=0; for(let i=0;i<d;i++) t+=x[i]*p[i];
          for(let i=0;i<d;i++) u[i]+=x[i]*t; }
        let L=Math.hypot(...u)||1; p=u.map(v=>v/L);
      }
      comps.push(p);
      for(const x of X){ let t=0; for(let i=0;i<d;i++) t+=x[i]*p[i];
        for(let i=0;i<d;i++) x[i]-=t*p[i]; }
    }
    return {mean:m, comps};
  }
  let PROJ=null;
  function proj(vec){
    const c=vec.map((v,i)=>v-PROJ.mean[i]);
    return PROJ.comps.map(p=>{ let t=0; for(let i=0;i<c.length;i++) t+=c[i]*p[i]; return t; });
  }
  const cos=(a,b)=>{ let d=0,na=0,nb=0; for(let i=0;i<a.length;i++){d+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i];}
    return d/(Math.sqrt(na*nb)||1); };

  /* ---------- keyword (TF-IDF cosine) — genuinely computed ---------- */
  let VOC=null, TFIDF=null;
  function tok(s){ return s.toLowerCase().replace(/[^a-z0-9₂\- ]/g,' ').split(/\s+/)
    .filter(w=>w.length>2 && !['the','and','for','with','from','that','this','was','are','not','has','its','per','all','any'].includes(w)); }
  function buildTFIDF(){
    const docs=DOCS.map(d=>tok(d.t+' '+d.x));
    const df={}; docs.forEach(ws=>{ new Set(ws).forEach(w=>df[w]=(df[w]||0)+1); });
    VOC=Object.keys(df);
    const idx={}; VOC.forEach((w,i)=>idx[w]=i);
    const N=docs.length;
    TFIDF=docs.map(ws=>{ const v=new Float64Array(VOC.length);
      ws.forEach(w=>{ v[idx[w]] += 1; });
      for(let i=0;i<v.length;i++) if(v[i]) v[i]=(1+Math.log(v[i]))*Math.log(N/df[VOC[i]]);
      return v; });
    TFIDF.idx=idx; TFIDF.df=df; TFIDF.N=N;
  }
  function kwScores(qs){
    const ws=tok(qs), v=new Float64Array(VOC.length);
    ws.forEach(w=>{ const i=TFIDF.idx[w]; if(i!==undefined) v[i]+=1; });
    for(let i=0;i<v.length;i++) if(v[i]) v[i]=(1+Math.log(v[i]))*Math.log(TFIDF.N/TFIDF.df[VOC[i]]);
    return TFIDF.map(d=>cos(Array.from(v), Array.from(d)));
  }

  function topK(mode, kk){
    const Q=QUERIES[st.qi];
    const sem=DOCS.map(d=>cos(Q.c, d.c));
    const kw=kwScores(Q.kw);
    let v;
    if(mode==='sem') v=sem; else if(mode==='kw') v=kw;
    else v=sem.map((x,i)=>0.65*x+0.35*kw[i]*3.0);
    return v.map((x,i)=>({i,x})).sort((a,b)=>b.x-a.x).slice(0,kk).map(r=>r.i);
  }
  function recall(mode, kk){
    const g=QUERIES[st.qi].g||[]; const t=topK(mode,kk);
    return {hit:g.filter(i=>t.includes(i)).length, of:g.length};
  }
  function rankOf(mode, docI){
    const Q=QUERIES[st.qi];
    const sem=DOCS.map(d=>cos(Q.c, d.c)); const kw=kwScores(Q.kw);
    let v; if(mode==='sem') v=sem; else if(mode==='kw') v=kw;
    else v=sem.map((x,i)=>0.65*x+0.35*kw[i]*3.0);
    const o=v.map((x,i)=>({i,x})).sort((a,b)=>b.x-a.x);
    return o.findIndex(r=>r.i===docI)+1;
  }
  function score(){
    const Q=QUERIES[st.qi];
    const sem=DOCS.map(d=>cos(Q.c, d.c));
    const kw=kwScores(Q.kw);
    let s;
    if(st.mode==='sem') s=sem;
    else if(st.mode==='kw') s=kw;
    else s=sem.map((v,i)=>0.65*v+0.35*kw[i]*3.0);
    st.scores=s;
    st.rank=s.map((v,i)=>({i,v})).sort((a,b)=>b.v-a.v);
    st.sel=st.rank.slice(0,st.k).map(r=>r.i);
    return s;
  }

  /* ---------- scene ---------- */
  const SCL=2.35;
  function build(){
    buildTFIDF();
    PROJ = pca3(DOCS.map(d=>d.c.slice()));
    D3 = DOCS.map(d=>{ const p=proj(d.c); return new THREE.Vector3(p[0]*SCL, p[1]*SCL, p[2]*SCL); });

    gAx = new THREE.Group();
    [[1,0,0],[0,1,0],[0,0,1]].forEach((d,i)=>{
      const L=4.4;
      gAx.add(TH3.tube(new THREE.Vector3(-d[0]*L,-d[1]*L,-d[2]*L), new THREE.Vector3(d[0]*L,d[1]*L,d[2]*L),
        0.010, 0x44586C, {emis:0.2, op:0.7}));
    });
    TH3.root.add(gAx);
    TH3.label('MEANING SPACE — 3 of 1,024 embedding axes', new THREE.Vector3(0,-4.0,0),'ax').center();

    const SRC = {'Work order':0xD96A16,'OEM manual':0x11707F,'SOP':0x5B4A85,'Shift log':0x9A6408,
      'Condition report':0x2E93A6,'Safety':0xA8261E,'Chemistry':0x256B45,'Circular':0x8A76C4,
      'RCA':0xD24A28,'Spares':0x6E8496,'Overhaul':0xC08A3E,'Lab report':0x33A06B,
      'Performance note':0x3E7E9A,'Record':0x6E8496,'Planning':0x6E8496,'Fuel report':0x9A6408,
      'Design note':0x11707F,'Study':0x6E8496,'Reliability record':0xD24A28,'Calibration':0x2E93A6,
      'Project note':0x8A76C4,'Schedule':0x6E8496};
    dots=[];
    DOCS.forEach((d,i)=>{
      const s=TH3.sph(0.115, SRC[d.s]||0x6E8496, {emis:0.35, rough:.35});
      s.position.copy(D3[i]); TH3.root.add(s); dots.push(s);
      labs['d'+i]=TH3.label(short(d.t), s, '').offset(11,-11).show(false);
    });

    qArrow = TH3.arrow(new THREE.Vector3(0,0,0), new THREE.Vector3(1,0,0), 0xD96A16,
      {r:0.036, headR:0.14, headL:0.34, emis:0.7});
    qArrow.visible=false; TH3.root.add(qArrow);
    coneM = new THREE.Mesh(new THREE.ConeGeometry(1,1,40,1,true),
      TH3.mat(0xD96A16,{op:0.07, side:2, emis:0.30, rough:.95}));
    coneM.visible=false; TH3.root.add(coneM);
    labs.q = TH3.label('the question', new THREE.Vector3(), 'em').offset(12,-12).show(false);

    score(); place();
    TH3.setCam(0.9, 0.30, 13.4, new THREE.Vector3(0,0,0), false);
    st.ready=true;
  }
  function short(t){ const p=t.split('·'); const s=(p[1]||p[0]).trim(); return s.length>34? s.slice(0,32)+'…' : s; }

  function clearLinks(){ links.forEach(l=>TH3.root.remove(l)); links=[]; }

  function place(){
    const Q=QUERIES[st.qi];
    const p=proj(Q.c);
    Q3=new THREE.Vector3(p[0]*SCL, p[1]*SCL, p[2]*SCL);
    const dir=Q3.clone().normalize();
    qArrow.userData.setEnds(new THREE.Vector3(0,0,0), dir.clone().multiplyScalar(Math.max(2.4,Q3.length()*1.12)));
    labs.q.at(dir.clone().multiplyScalar(Math.max(2.4,Q3.length()*1.12)*1.06));
    // cone: half-angle from the k-th best cosine
    const kth = st.rank[Math.min(st.k,st.rank.length)-1];
    const ang = Math.acos(clamp(kth?kth.v:0.5,-1,1));
    const H=4.6, R=Math.tan(clamp(ang,0.12,1.20))*H;
    coneM.geometry.dispose();
    coneM.geometry=new THREE.ConeGeometry(R,H,44,1,true);
    coneM.position.copy(dir.clone().multiplyScalar(H/2));
    coneM.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir);
    st.coneAng = ang;
    refresh();
  }

  function refresh(){
    if(!st.ready) return;
    score();
    const sel=new Set(st.sel);
    dots.forEach((s,i)=>{
      const on=sel.has(i) && st.act>=2;
      s.material.emissiveIntensity = on?1.05:0.16;
      s.scale.setScalar(on?1.9:(st.act>=2?0.72:1));
      labs['d'+i].show(on || (st.act===0 && i%3===0));
      labs['d'+i].cls(on?'em':'');
    });
    clearLinks();
    if(st.act>=2){
      const dir=Q3.clone().normalize();
      st.sel.forEach(i=>{
        const t=TH3.tube(new THREE.Vector3(0,0,0), D3[i], 0.013+0.026*clamp(st.scores[i],0,1), 0xE0A63A,
          {emis:0.5, op:0.85, seg:6});
        TH3.root.add(t); links.push(t);
      });
    }
    qArrow.visible = st.act>=1;
    labs.q.show(st.act>=1);
    coneM.visible = st.act>=2 && st.cone;
    if(window.THEATRE) THEATRE.repanel();
  }

  function enter(a){
    st.act=a;
    if(a===5) st.mode='kw'; else if(!st._userMode) st.mode='sem';
    if(a===0){ TH3.autospin(0.075); TH3.setCam(0.9,0.30,13.6,new THREE.Vector3(0,0,0),1000); }
    else TH3.autospin(0.02);
    if(a===1) TH3.setCam(1.30,0.26,12.0,new THREE.Vector3(0,0,0),1200);
    if(a===2) TH3.setCam(1.70,0.22,10.8,new THREE.Vector3(0,0,0),1200);
    if(a===3) TH3.setCam(1.15,0.36,11.4,new THREE.Vector3(0,0,0),1200);
    if(a===5) TH3.setCam(0.70,0.30,12.6,new THREE.Vector3(0,0,0),1200);
    place();
  }

  function tick(u,t){
    if(!st.ready) return;
    if(st.act===0){ dots.forEach((s,i)=>{ s.visible = i < Math.ceil(DOCS.length*ease(u)); }); }
    else dots.forEach(s=>s.visible=true);
    if(st.act===1){ const g=easeIO(clamp(u*1.4,0,1)); const dir=Q3.clone().normalize();
      qArrow.userData.setEnds(new THREE.Vector3(0,0,0),
        dir.clone().multiplyScalar(Math.max(0.1, Math.max(2.4,Q3.length()*1.12)*g))); }
    if(coneM.visible) coneM.material.opacity = 0.045+0.035*Math.abs(Math.sin(t*1.3));
    st.sel.forEach((i,n)=>{ if(dots[i]) dots[i].scale.setScalar(1.9+0.22*Math.sin(t*3+n)); });
  }

  function num(){
    const Q=QUERIES[st.qi];
    if(st.act<2) return {k:'Chunks in the library', v:String(DOCS.length), s:'work orders · manuals · SOPs · logs'};
    const top=st.rank[0];
    return {k:'Best match, cosine', v:f2(top.v),
      s:(st.mode==='kw'?'keyword':'semantic')+' · angle '+(Math.acos(clamp(top.v,-1,1))*180/Math.PI).toFixed(0)+'°'};
  }

  function panel(){
    const Q=QUERIES[st.qi];
    const rows=st.rank.slice(0,10).map((r,n)=>{
      const d=DOCS[r.i];
      return `<div class="docrow${n<st.k?' hi':''}"><span class="sc">${f2(r.v)}</span>
        <span class="bd"><b>[${r.i+1}] ${esc(d.t)}</b><span>${esc(d.s)} — ${esc(d.x.slice(0,120))}…</span></span></div>`;
    }).join('');
    const rS=recall('sem',st.k), rK=recall('kw',st.k), rH=recall('hyb',st.k);
    const gold=(Q.g||[]);
    const goldRows=gold.map(gi=>`<tr><td style="font-size:11px">${esc(DOCS[gi].t.slice(0,52))}…</td>
      <td class="num">${rankOf('sem',gi)}</td><td class="num">${rankOf('kw',gi)}</td>
      <td class="num">${rankOf('hyb',gi)}</td></tr>`).join('');

    return `
<div class="hd2"><div class="k">Module 5 · retrieval-augmented generation</div>
<h2>The model does not know your plant. Retrieval is how it finds out.</h2>
<p>A language model trained on the internet has never read your work orders. RAG solves that without
retraining anything: convert every document into a direction in meaning-space, convert the question the same
way, and hand the model only the pages that point the same way.</p></div>

<div class="card"><h3>The question</h3>
<div class="ctl"><select id="m5q">${QUERIES.map((q,i)=>
  `<option value="${i}"${st.qi===i?' selected':''}>${esc(q.q.slice(0,74))}${q.q.length>74?'…':''}</option>`).join('')}</select></div>
<div class="note" style="margin-bottom:0">${esc(Q.q)}</div></div>

<div class="card"><h3>Controls</h3>
<div class="ctl"><label>Retrieval method</label>
  <select id="m5mode">
    <option value="sem"${st.mode==='sem'?' selected':''}>Semantic — cosine between embedding vectors</option>
    <option value="kw"${st.mode==='kw'?' selected':''}>Keyword only — TF-IDF, the search box you already have</option>
    <option value="hyb"${st.mode==='hyb'?' selected':''}>Hybrid — both, blended (what production systems use)</option>
  </select></div>
<div class="ctl"><label>k — chunks handed to the model <span class="v" id="m5kv">${st.k}</span></label>
  <input type="range" id="m5k" min="1" max="10" step="1" value="${st.k}">
  <div class="hint">Too few and the answer is thin. Too many and the useful page is buried among near-misses —
  and every chunk costs tokens and latency.</div></div>
<label class="tog"><input type="checkbox" id="m5cone"${st.cone?' checked':''}>
  <span>Show the retrieval cone — everything within the cut-off angle</span></label>
<div class="kv"><span class="k">Cut-off half-angle at k = ${st.k}</span>
  <span class="v">${(st.coneAng*180/Math.PI).toFixed(0)}°</span></div>
</div>

<div class="card"><h3>The only acceptance test that matters<span class="tag">recall @ k</span></h3>
<div class="small" style="margin-bottom:7px">A human has marked which documents genuinely answer this question.
The measure is simply: <b>did they arrive in the top ${st.k}?</b> Run this over fifty real questions and you
have an acceptance criterion instead of a demo.</div>
<div class="stats">
  <div class="stat"><div class="l">Semantic</div><div class="n ${rS.hit===rS.of?'gn':'em'}">${rS.hit} / ${rS.of}</div><div class="s">recall @ ${st.k}</div></div>
  <div class="stat"><div class="l">Keyword</div><div class="n ${rK.hit<rK.of?'rd':'gn'}">${rK.hit} / ${rK.of}</div><div class="s">recall @ ${st.k}</div></div>
  <div class="stat"><div class="l">Hybrid</div><div class="n ${rH.hit===rH.of?'gn':'em'}">${rH.hit} / ${rH.of}</div><div class="s">recall @ ${st.k}</div></div>
</div>
<table><thead><tr><th>Document that actually answers the question</th><th class="num">Semantic rank</th>
<th class="num">Keyword rank</th><th class="num">Hybrid rank</th></tr></thead><tbody>${goldRows}</tbody></table>
</div>

<div class="card"><h3>Retrieved — top 10 by ${st.mode==='kw'?'keyword score':(st.mode==='hyb'?'blended score':'cosine similarity')}</h3>
<div class="doclist">${rows}</div>
<div class="small" style="margin-top:6px">Highlighted rows are the ${st.k} chunks that will actually be pasted
into the prompt. Everything below the line is invisible to the model.</div></div>

${st.mode!=='kw' ? '' : (rK.hit < rS.hit
 ? `<div class="bad"><b>Keyword scoring has just lost ${rS.hit-rK.hit} of the ${rS.of} documents that answer this
question.</b> Look at the ranks in the table above: the root-cause note and the thermography survey — the two
documents that would actually tell an engineer what to do — sit outside the top ten. The work order that solves
the problem calls the component a "coupling end bearing" on an "induced draught fan"; you asked about the
"drive end bearing" of the "ID fan". An embedding puts <i>coupling end</i> and <i>drive end</i> at almost the
same angle, because in millions of maintenance sentences they were used the same way. Word counting cannot
know they are the same thing.</div>`
 : `<div class="warn"><b>Here keyword scoring does as well as, or better than, the embedding.</b> That is not a
fluke and it is worth understanding: this question happens to use the same words the document uses. Keyword
matching is unbeatable on exact strings — tag numbers, part numbers, drawing references, a specific SOP number
— while embeddings win on paraphrase and synonym. Neither dominates, which is exactly why production systems
run both and blend the scores. Switch the method above to <b>Hybrid</b> and compare the ranks again.</div>`)}

<div class="card"><h3>The prompt that is actually sent</h3>
<div class="eq"><span class="c">SYSTEM</span>
You are a maintenance assistant for MAHAGENCO thermal stations.
Answer <span class="o">only</span> from the context below. Cite the chunk number for
every factual claim. If the context does not contain the answer,
say so and name who to ask. Never invent a torque, a limit or a
part number.

<span class="c">CONTEXT  (${st.k} chunks, ~${st.sel.reduce((s,i)=>s+Math.ceil(DOCS[i].x.length/4),0)} tokens)</span>
${st.sel.map(i=>`[${i+1}] ${DOCS[i].t.slice(0,58)}…`).join('\n')}

<span class="c">USER</span>
${esc(Q.q).replace(/(.{62})/g,'$1\n')}</div>
<div class="small">Notice what is <b>not</b> here: no fine-tuning, no retraining, no plant data inside the model's
weights. The document set can be updated at 09:00 and the assistant is current at 09:01. This is also the
control point — if a document must not be visible to a contractor, it is excluded before this prompt is built,
not afterwards.</div></div>

<div class="card"><h3>The answer</h3>
<div class="good" style="white-space:pre-wrap">${esc(Q.a).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>')}</div>
<div class="small" style="margin:8px 0 10px">The answer above was written against the retrieval at
<b>k = 6</b>. Pull the k slider down and some of its citations fall outside the context the model would
actually be given — which is exactly the trade-off the slider exists to show. In production this is measured,
not guessed: recall @ k on a fixed question set, plotted against k, and k chosen where the curve flattens.</div>
<div class="warn"><b>Without retrieval, the same model answers the same question fluently and wrongly.</b>
Asked for the housing bolt torque with no context, it will produce a specific, confident, plausible figure —
because producing plausible text is what it was built to do. The citation numbers above are not decoration:
they are the only thing that makes the answer auditable. An assistant that cannot show you the page it read
from should not be used to raise a work order.</div></div>

<div class="card"><h3>What makes this work in a plant, and what breaks it</h3>
<table><thead><tr><th>Decision</th><th>Why it matters here</th></tr></thead><tbody>
<tr><td><b>Chunk size</b></td><td>Split a document too finely and the sentence with the torque loses the sentence saying which machine it belongs to. Too coarsely and one chunk covers three unrelated topics and matches everything weakly.</td></tr>
<tr><td><b>Metadata filters</b></td><td>Unit number, equipment tag, document date. Retrieval on meaning alone will happily return the unit-6 manual. Filter first, embed second.</td></tr>
<tr><td><b>Access control</b></td><td>The vector database must carry the same permissions as the file server. A contractor's assistant must not be able to retrieve a safety incident report.</td></tr>
<tr><td><b>Refusal</b></td><td>The fourth question in the list above has no answer in the library. An assistant that answers it anyway is worse than no assistant.</td></tr>
<tr><td><b>Re-indexing</b></td><td>New work orders must enter the index automatically. A RAG system that was indexed once, at handover, is out of date within a month.</td></tr>
<tr><td><b>Evaluation</b></td><td>Keep fifty real questions with known correct pages. Measure whether the right page appears in the top k. That number, not a demo, is how you accept the system.</td></tr>
</tbody></table></div>

<div class="card"><h3>And the agent — one step further</h3>
<div class="vio">Retrieval answers a question. An <b>agent</b> is the same model given tools and a loop:
<i>think → call a tool → read the result → think again</i>. For the specimen we have been following, an agent
asked "why is ID fan A bearing warm?" would query the historian for the last 30 days of the tag, run the
residual model from Module 1, retrieve the maintenance history you see above, check spares availability, and
draft a work order — then stop, and hand it to a human to sign.<br><br>
<b>The stopping point is the design decision.</b> Read-only tools, a written list of what the agent may call,
and a human signature on anything that changes the plant. An agent that can write to the DCS is not an
efficiency measure; it is an unreviewed control system.</div></div>`;
  }

  function wire(){
    const q=$('m5q'); if(q) q.onchange=e=>{ st.qi=+e.target.value; place(); };
    const m=$('m5mode'); if(m) m.onchange=e=>{ st.mode=e.target.value; st._userMode=true; place(); };
    const k=$('m5k'); if(k) k.oninput=e=>{ st.k=+e.target.value; $('m5kv').textContent=st.k; place(); };
    const c=$('m5cone'); if(c) c.onchange=e=>{ st.cone=e.target.checked; refresh(); };
  }

  return {id:'rag', no:'MODULE 5', title:'Retrieval — how a question finds the right page',
    sub:'embeddings · cosine similarity · grounded answers · where agents stop',
    dimcap:'3 of 1,024 embedding axes',
    acts:[
      {t:'1 · The library', d:5000, say:'Forty-one chunks of the plant’s written memory — work orders, OEM manual sections, SOPs, shift logs, lab reports. Each one has been turned into a <b>direction</b>. Documents about the same thing point the same way, whatever words they happen to use.'},
      {t:'2 · A question arrives', d:4000, say:'The question is embedded by exactly the same model that embedded the documents. It becomes one more arrow in the same space. <b>Nothing is searched yet</b> — the question has simply been given a direction.'},
      {t:'3 · The angle is the answer', d:5000, say:'Similarity is the cosine of the angle between the question and each document. The cone is the cut-off: everything inside it is close enough. Note that the chunks lighting up do not share the question’s words — they share its <b>meaning</b>.'},
      {t:'4 · Into the context window', d:4600, say:'The top few chunks are pasted verbatim into the prompt, under an instruction to answer only from them and to cite. The model’s own knowledge of thermal power plants is used for language and reasoning — <b>not for facts about your plant</b>.'},
      {t:'5 · The grounded answer', d:5000, say:'Read the answer on the right with its citation numbers. Every claim traces to a chunk you can open. This is the difference between an assistant an engineer can act on and a very fluent guess.'},
      {t:'6 · What keyword search does instead', d:6000, say:'Switch to keyword scoring and watch the <b>recall @ k</b> figures on the right collapse. The work order that actually solves the problem says <i>coupling end bearing</i> on an <i>induced draught fan</i> — not one word of your question — so keyword scoring has nothing to rank it by, and hands the model documents about a different machine. <b>This is why the search box on the document server has never helped you.</b>'}
    ],
    build, enter, tick, panel, wire, num, st};
})();
