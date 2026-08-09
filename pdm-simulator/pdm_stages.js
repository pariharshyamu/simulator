/* =========================================================================
   Pipeline stages, charts and app wiring
   ========================================================================= */
const C = {ink:'#1C2530',mut:'#5C6B7A',line:'#D3DDE5',grid:'#EAF0F5',ember:'#D96A16',
           teal:'#11707F',red:'#A8261E',grn:'#256B45',amb:'#C58A18',soft:'#F1F4F7',vio:'#5B4A85'};
function hidpi(cv,h){ const r=window.devicePixelRatio||1, w=cv.clientWidth||600;
  cv.height=h*r; cv.width=w*r; cv.style.height=h+'px';
  const x=cv.getContext('2d'); x.setTransform(r,0,0,r,0,0); return {x,w,h}; }
function lineChart(cv,o){
  const {x,w,h}=hidpi(cv,o.height||210);
  const P={l:o.padL||54,r:14,t:12,b:26}, iw=w-P.l-P.r, ih=h-P.t-P.b;
  let lo=o.yMin, hi=o.yMax;
  if(lo===undefined||hi===undefined){ let a=Infinity,b=-Infinity;
    o.series.forEach(s=>s.data.forEach(v=>{ if(v!=null&&!isNaN(v)){a=Math.min(a,v);b=Math.max(b,v);} }));
    if(!isFinite(a)){a=0;b=1;} const pad=(b-a)*0.14||1;
    lo=o.yMin!==undefined?o.yMin:a-pad; hi=o.yMax!==undefined?o.yMax:b+pad; }
  const n=Math.max(...o.series.map(s=>s.data.length));
  const X=i=>P.l+(n<2?0:i*iw/(n-1)), Y=v=>P.t+ih-(v-lo)/((hi-lo)||1)*ih;
  x.clearRect(0,0,w,h);
  (o.bands||[]).forEach(b=>{ x.fillStyle=b.c; x.fillRect(X(b.from),P.t,X(b.to)-X(b.from),ih); });
  x.strokeStyle=C.grid; x.lineWidth=1; x.fillStyle=C.mut; x.font='10.5px Calibri,sans-serif';
  for(let g=0;g<=4;g++){ const v=lo+(hi-lo)*g/4, y=Y(v);
    x.beginPath(); x.moveTo(P.l,y); x.lineTo(P.l+iw,y); x.stroke();
    x.textAlign='right'; x.textBaseline='middle';
    x.fillText(Math.abs(hi-lo)<8?v.toFixed(1):v.toFixed(0), P.l-6, y); }
  x.textAlign='center'; x.textBaseline='top';
  for(let g=0;g<=5;g++){ const i=Math.round(g/5*(n-1)); x.fillText('D'+Math.round((o.xOff||0)+i*(o.xScale||1)), X(i), P.t+ih+5); }
  if(o.yLabel){ x.save(); x.translate(11,P.t+ih/2); x.rotate(-Math.PI/2); x.textAlign='center';
    x.fillStyle=C.mut; x.fillText(o.yLabel,0,0); x.restore(); }
  x.save(); x.beginPath(); x.rect(P.l,P.t,iw,ih); x.clip();
  o.series.forEach(s=>{
    x.beginPath(); x.lineWidth=s.w||1.9; x.strokeStyle=s.c;
    x.setLineDash(s.dash||[]);
    let st=false;
    s.data.forEach((v,i)=>{ if(v==null||isNaN(v)){st=false;return;}
      if(!st){x.moveTo(X(i),Y(v));st=true;} else x.lineTo(X(i),Y(v)); });
    x.stroke(); x.setLineDash([]);
    if(s.dots) s.data.forEach((v,i)=>{ if(v==null||isNaN(v))return;
      x.beginPath(); x.arc(X(i),Y(v),2.2,0,7); x.fillStyle=s.c; x.fill(); });
  });
  x.restore();
  (o.marks||[]).forEach(m=>{ const px=X(m.i);
    x.strokeStyle=m.c||C.red; x.setLineDash([4,3]); x.lineWidth=1.4;
    x.beginPath(); x.moveTo(px,P.t); x.lineTo(px,P.t+ih); x.stroke(); x.setLineDash([]);
    if(m.label){ x.fillStyle=m.c||C.red; x.font='700 10px Calibri,sans-serif';
      x.textAlign = m.i>n*0.72?'right':'left'; x.textBaseline='top';
      x.fillText(m.label, px+(m.i>n*0.72?-4:4), P.t+1); } });
  x.strokeStyle=C.line; x.lineWidth=1; x.beginPath();
  x.moveTo(P.l,P.t); x.lineTo(P.l,P.t+ih); x.lineTo(P.l+iw,P.t+ih); x.stroke();
}
function scatterChart(cv,o){
  const {x,w,h}=hidpi(cv,o.height||210);
  const P={l:52,r:14,t:12,b:32}, iw=w-P.l-P.r, ih=h-P.t-P.b;
  const xs=o.pts.map(p=>p[0]), ys=o.pts.map(p=>p[1]);
  const x0=o.xMin!==undefined?o.xMin:Math.min(...xs), x1=o.xMax!==undefined?o.xMax:Math.max(...xs);
  const y0=o.yMin!==undefined?o.yMin:Math.min(...ys), y1=o.yMax!==undefined?o.yMax:Math.max(...ys);
  const px=v=>P.l+(v-x0)/((x1-x0)||1)*iw, py=v=>P.t+ih-(v-y0)/((y1-y0)||1)*ih;
  x.clearRect(0,0,w,h); x.strokeStyle=C.grid; x.fillStyle=C.mut; x.font='10.5px Calibri,sans-serif';
  for(let g=0;g<=4;g++){ const v=y0+(y1-y0)*g/4,yy=py(v);
    x.beginPath();x.moveTo(P.l,yy);x.lineTo(P.l+iw,yy);x.stroke();
    x.textAlign='right';x.textBaseline='middle';x.fillText(v.toFixed(v<10?1:0),P.l-6,yy); }
  for(let g=0;g<=4;g++){ const v=x0+(x1-x0)*g/4;
    x.textAlign='center';x.textBaseline='top';x.fillText(v.toFixed(v<10?1:0),px(v),P.t+ih+5); }
  x.save(); x.beginPath(); x.rect(P.l,P.t,iw,ih); x.clip();
  if(o.path){ x.beginPath(); o.path.forEach((p,i)=>i?x.lineTo(px(p[0]),py(p[1])):x.moveTo(px(p[0]),py(p[1])));
    x.strokeStyle=o.pathC||C.ember; x.lineWidth=2.2; x.stroke(); }
  o.pts.forEach(p=>{ x.beginPath(); x.arc(px(p[0]),py(p[1]),p[3]||3,0,7); x.fillStyle=p[2]||'rgba(17,112,127,.6)'; x.fill(); });
  x.restore();
  x.strokeStyle=C.line;x.lineWidth=1;x.beginPath();x.moveTo(P.l,P.t);x.lineTo(P.l,P.t+ih);x.lineTo(P.l+iw,P.t+ih);x.stroke();
  x.fillStyle=C.mut;x.font='10.5px Calibri,sans-serif';
  if(o.xLabel){x.textAlign='center';x.textBaseline='bottom';x.fillText(o.xLabel,P.l+iw/2,h-1);}
  if(o.yLabel){x.save();x.translate(11,P.t+ih/2);x.rotate(-Math.PI/2);x.textAlign='center';x.fillText(o.yLabel,0,0);x.restore();}
}

/* ---------------- feature recipes ---------------- */
const FX = {
 idfan:{ raw:{op:'tag',t:'brgT'}, norm:{op:'res',t:'brgT',d:['gasF','amb','motI']},
   delta:{op:'diff',a:'brgT',b:'brgT2'}, oilD:{op:'res',t:'oilT',d:['amb','gasF']},
   vibR:{op:'res',t:'vib',d:['gasF']}, roll:{op:'roll',t:'brgT',w:168},
   hod:{op:'hod'}, dayn:{op:'day'} },
 motor:{ raw:{op:'tag',t:'statI'}, sbAmp:{op:'tag',t:'sb'},
   norm:{op:'res',t:'statI',d:['volt','amb']}, vibR:{op:'res',t:'vib',d:['statI']},
   wTres:{op:'res',t:'windT',d:['statI','amb']}, unbal:{op:'tag',t:'volt'},
   hod:{op:'hod'}, dayn:{op:'day'} },
 mill:{ raw:{op:'tag',t:'dp'}, dpF:{op:'ratio',a:'dp',b:'feed'}, iF:{op:'ratio',a:'milI',b:'feed'},
   dTout:{op:'res',t:'outT',d:['feed','paF'],neg:1}, paR:{op:'ratio',a:'paF',b:'feed'},
   gcvN:{op:'res',t:'dp',d:['feed','gcv','paF']}, hod:{op:'hod'}, dayn:{op:'day'} },
 bfp:{ raw:{op:'tag',t:'leak'}, norm:{op:'res',t:'leak',d:['dP','flow']},
   bres:{op:'res',t:'brgT',d:['flow','sucT']}, vibHF:{op:'res',t:'vib',d:['flow']},
   headD:{op:'res',t:'dP',d:['flow'],neg:1}, npshM:{op:'tag',t:'npsh',neg:1},
   hod:{op:'hod'}, dayn:{op:'day'} },
 xfmr:{ raw:{op:'tag',t:'wti'}, thm:{op:'res',t:'wti',d:['loadI','ambT']},
   topRes:{op:'res',t:'topOil',d:['loadI','ambT']}, coolR:{op:'res',t:'coolI',d:['topOil'],neg:1},
   gasR:{op:'slope',t:'h2',w:336}, duval:{op:'ratio',a:'c2h4',b:'h2'},
   hod:{op:'hod'}, dayn:{op:'day'} }
};
function featureTags(caseId, fid){
  const r = FX[caseId][fid]; if(!r) return [];
  if(r.op==='hod'||r.op==='day') return [];
  if(r.op==='diff'||r.op==='ratio') return [r.a,r.b];
  return [r.t, ...(r.d||[])];
}
function buildFeature(caseId, fid, D, trainEnd){
  const r=FX[caseId][fid]; const out=new Float64Array(N).fill(NaN);
  if(!r) return out;
  const g=t=>D[t];
  if(r.op==='hod'){ for(let i=0;i<N;i++) out[i]=i%24; return out; }
  if(r.op==='day'){ for(let i=0;i<N;i++) out[i]=Math.floor(i/24); return out; }
  if(r.op==='tag'){ const v=g(r.t); if(!v) return out;
    for(let i=0;i<N;i++) out[i]= r.neg? -v[i] : v[i]; return out; }
  if(r.op==='diff'){ const a=g(r.a), b=g(r.b); if(!a||!b) return out;
    for(let i=0;i<N;i++) out[i]=a[i]-b[i]; return out; }
  if(r.op==='ratio'){ const a=g(r.a), b=g(r.b); if(!a||!b) return out;
    for(let i=0;i<N;i++) out[i]= a[i]/(Math.abs(b[i])<1e-6?1e-6:b[i]); return out; }
  if(r.op==='roll'){ const v=g(r.t); if(!v) return out;
    let s=0,q=[]; for(let i=0;i<N;i++){ const x=v[i]; q.push(isNaN(x)?0:x); s+=isNaN(x)?0:x;
      if(q.length>r.w) s-=q.shift(); out[i]=s/q.length; } return out; }
  if(r.op==='slope'){ const v=g(r.t); if(!v) return out; return rollSlope(v, r.w); }
  if(r.op==='res'){ const t=g(r.t), dv=(r.d||[]).map(g);
    if(!t||dv.some(x=>!x)) return out;
    const R=residualise(t,dv,trainEnd);
    for(let i=0;i<N;i++) out[i]= r.neg? -R.res[i] : R.res[i];
    return out; }
  return out;
}
/* correlation of a feature with the (hidden) fault severity — the teaching oracle */
function faultCorr(feat, fault, trainEnd){
  const a=[],b=[];
  for(let i=trainEnd;i<N;i++){ if(isNaN(feat[i])) continue; a.push(feat[i]); b.push(fault[i]); }
  if(a.length<30) return 0;
  const ma=mean(a), mb=mean(b); let num=0,da=0,db=0;
  for(let i=0;i<a.length;i++){ const x=a[i]-ma, y=b[i]-mb; num+=x*y; da+=x*x; db+=y*y; }
  return num/(Math.sqrt(da*db)||1);
}

/* =========================================================================
   APP STATE
   ========================================================================= */
const S = {
  caseId:'idfan', stage:0, day:0, playing:false,
  sensors:{}, acq:{storeMin:5, dead:0.5, maxGapH:8, freezeDay:0, freezeLen:14, gapPct:0, seed:99},
  repair:'hold', noise:1.0, seed:7,
  feats:{}, primary:'norm', model:'knn', trainDays:45, persistH:72, thrK:4.0,
  cache:null, done:{}
};
const STAGES = [
  {n:'01', t:'Asset & failure mode'}, {n:'02', t:'Instrumentation'},
  {n:'03', t:'Data acquisition'},     {n:'04', t:'Data quality'},
  {n:'05', t:'Feature engineering'},  {n:'06', t:'Model training'},
  {n:'07', t:'Validation'},           {n:'08', t:'Inference & value'}
];

function resetCase(){
  const c=CASES[S.caseId];
  S.sensors={}; c.sensors.forEach(s=>S.sensors[s.id]= !!s.have);
  S.feats={}; c.features.forEach(f=>S.feats[f.id] = f.good===1 && f.id!=='roll');
  const firstGood = c.features.find(f=>f.good===1);
  S.primary = firstGood ? firstGood.id : 'raw';
  S.feats[S.primary]=true; S.feats.raw=true;
  S.cache=null; S.done={}; S.day = (S.stage===7? DAYS-1 : 0);
  V3.build(c);
}
function compute(){
  if(S.cache) return S.cache;
  const c=CASES[S.caseId];
  const ctx=context(S.seed);
  const fault=faultProfile(c.onset, c.ttf, c.shape);
  const truth=c.gen(ctx, fault, rng(S.seed+11), {noise:S.noise});
  // acquisition per tag (only enabled sensors survive)
  const acq={}, prof={};
  Object.keys(truth).forEach(k=>{
    if(!S.sensors[k]){ acq[k]=null; return; }
    const a=acquire(truth[k], S.acq);
    acq[k]=repair(a.v, S.repair);
    prof[k]=profileData(a.v);
  });
  const trainEnd=S.trainDays*24;
  // features
  const feats={}, corr={}, avail={};
  c.features.forEach(f=>{
    const need=featureTags(c.id, f.id);
    const ok=need.every(t=>acq[t]);
    avail[f.id]=ok;
    if(!ok){ feats[f.id]=null; corr[f.id]=null; return; }
    feats[f.id]=buildFeature(c.id, f.id, acq, trainEnd);
    corr[f.id]=faultCorr(feats[f.id], fault, trainEnd);
  });
  // model input: primary first, then supporting
  const prim = (avail[S.primary]&&S.feats[S.primary]) ? S.primary
             : (c.features.find(f=>avail[f.id]&&S.feats[f.id])||{id:'raw'}).id;
  const sup = c.features.filter(f=>f.id!==prim && S.feats[f.id] && avail[f.id]).map(f=>f.id);
  const stack=[feats[prim], ...sup.map(id=>feats[id])].filter(Boolean);
  const M = stack.length ? trainModel(S.model, stack, trainEnd, {k:12, nComp:2}) : null;
  // alarm day from the raw health signal against the DCS setpoint
  const H = truth[Object.keys(truth).find(k=>c.health(truth)===truth[k])] || c.health(truth);
  let alarmDay=null;
  for(let i=0;i<N;i++){ if(H[i]>=c.alarm){ alarmDay=i/24; break; } }
  /* ---- a healthy sister machine, same model, to measure the nuisance-alert rate honestly ---- */
  let faRef=null;
  if(true){
    const zero=new Float64Array(N);
    const hTruth=c.gen(ctx, zero, rng(S.seed+733), {noise:S.noise});
    const hAcq={};
    Object.keys(hTruth).forEach(k=>{ if(!S.sensors[k]){ hAcq[k]=null; return; }
      hAcq[k]=repair(acquire(hTruth[k], {...S.acq, seed:(S.acq.seed||99)+7}).v, S.repair); });
    const hFeats={};
    c.features.forEach(f=>{ hFeats[f.id]= avail[f.id] ? buildFeature(c.id, f.id, hAcq, trainEnd) : null; });
    faRef={feats:hFeats};
  }
  let sweep=[], ev=null, thr=null;
  if(M){
    // score the healthy sister with the same technique and feature set
    const hStack=[faRef.feats[prim], ...sup.map(id=>faRef.feats[id])].filter(Boolean);
    const HM = hStack.length ? trainModel(S.model, hStack, trainEnd, {k:12, nComp:2}) : null;
    faRef.score = HM ? HM.score : null;
    sweep = sweepThresholds(M.score, c.onset, trainEnd, S.persistH, alarmDay, faRef.score);
    thr = thrFromTrain(M.score, trainEnd, S.thrK);
    ev = evaluate(M.score, c.onset, trainEnd, thr, S.persistH, faRef.score);
  }
  S.cache={c, ctx, fault, truth, acq, prof, trainEnd, feats, corr, avail, prim, sup, M, sweep, thr, ev, alarmDay, health:H, faRef};
  return S.cache;
}
const invalidate = ()=>{ S.cache=null; render(); };

/* =========================================================================
   RENDER
   ========================================================================= */
function render(){
  const d=compute(), c=d.c;
  // case buttons
  $('caseSel').innerHTML = CASE_ORDER.map(id=>
    `<button data-c="${id}" class="${id===S.caseId?'on':''}">${CASES[id].short}</button>`).join('');
  $('caseSel').querySelectorAll('button').forEach(b=>b.onclick=()=>{ S.caseId=b.dataset.c; resetCase(); render(); });
  // rail
  $('rail').innerHTML = STAGES.map((s,i)=>
    `<div class="st ${i===S.stage?'on':''} ${S.done[i]?'done':''}" data-s="${i}">
       <div class="n">${s.n}</div><div class="t">${s.t}</div></div>`).join('');
  $('rail').querySelectorAll('.st').forEach(e=>e.onclick=()=>{
    S.stage=+e.dataset.s; if(S.stage===7 && S.day<10) S.day=DAYS-1; render(); });
  // 3D
  const h=d.health, hi=Math.min(N-1, Math.round(S.day*24+12));
  const sev=d.fault[hi]||0;
  const band=c.normalBand, hv=h[hi];
  const heat = c.inverted ? clamp((hv-band[0])/(c.trip-band[0]),0,1)
                          : clamp((hv-band[1])/((c.trip)-band[1]),0,1);
  const vib = d.truth.vib ? clamp((d.truth.vib[hi]-2.4)/7,0,1) : clamp(sev,0,1)*0.8;
  V3.setState({sev:clamp(sev,0,1), vib, heat, sensors:S.sensors, running:true, showLabels:S.stage<=1});
  $('glTitle').textContent = c.name;
  $('glSub').textContent = c.station + ' · ' + c.blurb.slice(0,74) + (c.blurb.length>74?'…':'');
  $('dayLbl').textContent = 'Day '+S.day;
  $('scrub').value = S.day;
  const st = sev<=0 ? ['ok','Healthy'] : sev<0.35 ? ['ok','Degrading — undetectable'] :
             sev<0.75 ? ['wn','Degrading'] : ['er','Approaching failure'];
  const alarmed = hv>=c.alarm;
  $('glbadge').innerHTML = `<span class="hpill ${st[0]}">${st[1]}</span>`+
    (alarmed?`<span class="hpill er">DCS ALARM</span>`:'')+
    (d.ev&&d.ev.detectDay!==null&&S.day>=d.ev.detectDay?`<span class="hpill wn">MODEL ADVISORY</span>`:'');
  $('glLegend').innerHTML =
    `<span><i style="background:#D96A16"></i>live sensor</span>
     <span><i style="background:#44586B"></i>not instrumented</span>
     <span>${c.healthName}: <b style="color:#D96A16">${fmt(hv, Math.abs(hv)<10?2:1)} ${c.healthUnit}</b></span>
     <span>drag to orbit · scroll to zoom</span>`;
  // panel
  $('pw').innerHTML = ST_RENDER[S.stage](d);
  ST_WIRE[S.stage] && ST_WIRE[S.stage](d);
  $('pw').querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{
    S.done[S.stage]=true; S.stage=clamp(+b.dataset.go,0,7);
    if(S.stage===7 && S.day<10) S.day=DAYS-1; render();
    document.getElementById('panel').scrollTop=0; });
}
function navBtns(prev,next,label){
  return `<div class="navbtns">
    ${prev!==null?`<button class="btn gh" data-go="${prev}">← Back</button>`:''}
    <div class="sp"></div>
    ${next!==null?`<button class="btn" data-go="${next}">${label||'Next stage'} →</button>`:''}</div>`;
}
function hd(k,t,p){ return `<div class="hd2"><div class="k">${k}</div><h2>${t}</h2><p>${p}</p></div>`; }
