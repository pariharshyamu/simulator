/* ==========================================================
   SIM-1  Residual anomaly detection — ID fan bearing
   k-nearest-neighbour similarity model on a healthy-history
   memory matrix.  Physics of the synthetic plant:
     bearing = 38 + 14*loadFrac + 0.45*(amb-30) + 0.55*(oil-42)
               + 3.2*(vibFrac) + fault(t) + noise
   Fault:  f(t) = sev * ((t-onset)/25)^1.85   for t > onset
   ========================================================== */
const S1={seed:7};
function s1gen(p){
  const r=rng(p.seed), N=140, d=[];
  let load=0.78, amb=30, oil=42;
  for(let t=0;t<N;t++){
    const wk=t%7;
    const drift=(wk===0||wk===6)?-0.16:0;                 // weekend backing down
    load += (0.78+drift-load)*0.35 + gauss(r)*0.055*p.varf;
    load = Math.max(0.42, Math.min(1.0, load));
    amb  = 30 + 5.5*Math.sin(t/12) + gauss(r)*1.5;
    oil  = 42 + 0.35*(amb-30) + gauss(r)*0.7;
    const power = 3.1 + 4.9*Math.pow(load,2.35) + gauss(r)*0.06;   // MW, ID fan pair
    let vib = 2.4 + 1.5*load + gauss(r)*0.10;
    let f = 0;
    if(t>p.onset){ f = Math.min(58, p.sev*Math.pow((t-p.onset)/25, 1.85)); }
    vib += f*0.42;
    const bear = 38 + 14*load + 0.45*(amb-30) + 0.55*(oil-42) + 3.2*(vib-3.5)/3 + f + gauss(r)*p.noise;
    d.push({t,load,amb,oil,power,vib,bear,f});
  }
  return d;
}
/* memory-matrix similarity model: predict bearing from the k most similar healthy states */
function s1model(d,trainEnd,k){
  const F=x=>[x.load, x.amb/40, x.oil/50, x.power/8];
  const mem=d.slice(0,trainEnd).map(x=>({f:F(x), y:x.bear}));
  const sd=[0,1,2,3].map(j=>{ const v=mem.map(m=>m.f[j]); const mu=v.reduce((a,b)=>a+b,0)/v.length;
    return Math.sqrt(v.reduce((a,b)=>a+(b-mu)*(b-mu),0)/v.length)||1; });
  return d.map(x=>{
    const f=F(x);
    const sc=mem.map(m=>{ let s=0; for(let j=0;j<4;j++){ const z=(f[j]-m.f[j])/sd[j]; s+=z*z; } return {d:Math.sqrt(s), y:m.y}; });
    sc.sort((a,b)=>a.d-b.d);
    let wn=0, ws=0;
    for(let i=0;i<Math.min(k,sc.length);i++){ const w=1/(sc[i].d+0.06); wn+=w*sc[i].y; ws+=w; }
    return wn/ws;
  });
}
function s1(){
  const p={ seed:S1.seed,
    onset:+$('s1-onset').value, sev:+$('s1-rate').value/100*7.5,
    noise:+$('s1-noise').value/100, varf:+$('s1-var').value/55 };
  $('s1-onset-v').textContent='day '+p.onset;
  $('s1-rate-v').textContent=(+$('s1-rate').value/100).toFixed(2)+'×';
  $('s1-noise-v').textContent=p.noise.toFixed(2)+' °C';
  $('s1-var-v').textContent = p.varf<0.5?'steady':(p.varf<1.2?'normal':'heavy cycling');
  const alarm=+$('s1-alarm').value, thr=+$('s1-thr').value/10,
        pers=+$('s1-pers').value, k=+$('s1-k').value, dirty=$('s1-dirty').checked;
  $('s1-alarm-v').textContent=alarm+' °C';
  $('s1-thr-v').textContent=thr.toFixed(1)+' °C';
  $('s1-pers-v').textContent=pers+' day'+(pers>1?'s':'');
  $('s1-k-v').textContent=k;

  const d=s1gen(p);
  const trainEnd = dirty ? Math.min(140, p.onset+38) : Math.min(p.onset-6, 60);
  const pred=s1model(d,Math.max(20,trainEnd),k);
  const res=d.map((x,i)=>x.bear-pred[i]);
  // EWMA smoothing then persistence rule
  const ew=[]; let e=0;
  res.forEach((v,i)=>{ e = i? 0.78*e+0.22*v : v; ew.push(e); });
  let run=0, mday=null;
  for(let i=Math.max(20,trainEnd);i<ew.length;i++){
    if(ew[i]>thr){ run++; if(run>=pers && mday===null) mday=i; } else run=0;
  }
  let aday=null;
  for(let i=0;i<d.length;i++) if(d[i].bear>=alarm){ aday=i; break; }
  // false alarms during the genuinely healthy period
  let fa=0, r2=0;
  for(let i=Math.max(20,trainEnd);i<p.onset;i++){ if(ew[i]>thr){ r2++; if(r2===pers) fa++; } else r2=0; }
  const healthyDays=Math.max(1,p.onset-Math.max(20,trainEnd));
  const faRate=fa/healthyDays*30;

  $('s1-mday').textContent = mday!==null? 'Day '+mday : 'none';
  $('s1-mday-s').textContent = mday!==null? ('residual held above '+thr.toFixed(1)+' °C for '+pers+' days') : 'never triggered';
  $('s1-aday').textContent = aday!==null? 'Day '+aday : 'not in window';
  const lead = (mday!==null&&aday!==null)? aday-mday : null;
  $('s1-lead').textContent = lead!==null? lead+' days' : '—';
  $('s1-fa').textContent = faRate.toFixed(2);

  const labels=d.map(x=> x.t%20===0? 'D'+x.t : '');
  lineChart($('s1-c1'),{labels,height:250,yLabel:'Bearing temperature (°C)',xEvery:1,yMin:30,yMax:118,
    bands:[{from:0,to:200,color:'rgba(0,0,0,0)'}],
    marks:[...(mday!==null?[{i:mday,label:'model advisory',color:'#D96A16'}]:[]),
           ...(aday!==null?[{i:aday,label:'DCS alarm',color:'#A8261E'}]:[])],
    series:[
      {name:'Measured',data:d.map(x=>x.bear),color:'#D96A16',width:2.2},
      {name:'Expected',data:pred,color:'#11707F',width:2},
      {name:'Setpoint',data:d.map(()=>alarm),color:'#A8261E',dash:[6,4],width:1.6}
    ]});
  // shade the training window
  (function(){ const cv=$('s1-c1'), x=cv.getContext('2d'), w=cv.clientWidth, P=56, iw=w-P-14;
    x.save(); x.globalCompositeOperation='destination-over';
    x.fillStyle='rgba(17,112,127,.07)';
    x.fillRect(P,14,iw*Math.max(20,trainEnd)/(d.length-1),250-14-30); x.restore(); })();

  lineChart($('s1-c2'),{labels,height:190,yLabel:'Residual (°C)',yMin:-6,yMax:Math.max(12,Math.ceil(Math.max(...ew)/5)*5),
    marks: mday!==null?[{i:mday,label:'advisory',color:'#D96A16'}]:[],
    series:[
      {name:'Raw',data:res,color:'#8C9AA6',width:1.2},
      {name:'EWMA',data:ew,color:'#D96A16',width:2.4},
      {name:'Threshold',data:res.map(()=>thr),color:'#256B45',dash:[5,4],width:1.6},
      {name:'Zero',data:res.map(()=>0),color:'#D3DDE5',width:1}
    ]});

  let msg='';
  if(dirty){
    msg=`<div class="bad"><b>You have trained the model on the fault.</b> The training window now runs to day
    ${Math.max(20,trainEnd)}, past the onset at day ${p.onset}. The model has learned the degrading bearing as normal,
    so the expected line rises with the measured line and the residual stays flat. Detection is
    ${mday===null?'lost entirely':'delayed to day '+mday}. This is the most common single cause of a failed
    predictive-maintenance pilot, and it is invisible unless somebody who knows the machine's history curates the
    training window.</div>`;
  } else if(mday===null){
    msg=`<div class="warn">No advisory was raised. Either the threshold of ${thr.toFixed(1)} °C is above anything this
    fault produced, or the persistence requirement of ${pers} days is never met. Lower the threshold and watch the
    false-alarm rate rise — that trade-off is the whole of alert engineering.</div>`;
  } else {
    msg=`<div class="good"><b>The model raised an advisory on day ${mday}; the DCS alarm operated on day
    ${aday!==null?aday:'—'}.</b> ${lead!==null?'That is '+lead+' days of notice':'The alarm never operated in the window'} —
    enough to order a bearing, plan the outage and take the fan out on your terms. Notice what the model did: it did
    not compare the temperature to a number. It compared it to what this bearing has historically run at under
    <i>this</i> load, <i>this</i> ambient and <i>this</i> oil temperature. At day ${mday} the measured value was
    ${d[mday].bear.toFixed(1)} °C — nowhere near the ${alarm} °C setpoint, but ${ew[mday].toFixed(1)} °C above expected,
    and it had stayed there for ${pers} days.</div>
    <p class="small">False-alarm rate during the healthy period: <b>${faRate.toFixed(2)} per model-month</b>.
    Below about two is workable. Above five and the shift stops reading them, which is worse than having no model.</p>`;
  }
  $('s1-say').innerHTML=msg;
}
['s1-onset','s1-rate','s1-noise','s1-var','s1-alarm','s1-thr','s1-pers','s1-k'].forEach(id=>$(id).addEventListener('input',s1));
$('s1-dirty').addEventListener('change',s1);
$('s1-reseed').addEventListener('click',()=>{S1.seed=Math.floor(Math.random()*1e6);s1();});
REDRAW.s1=s1;

/* ==========================================================
   SIM-2  Heat rate loss attribution — real June 2026 data
   ========================================================== */
const S2SENS={o2:{lo:10,hi:15,n:'Excess O₂ above optimum',u:'%',step:0.1},
              mst:{lo:0.5,hi:0.8,n:'Main steam temperature below design',u:'°C',step:1},
              bp:{lo:0.8,hi:1.2,n:'Condenser back pressure above achievable',u:'mmHg',step:1},
              ubc:{lo:10,hi:15,n:'Unburnt carbon above target',u:'%',step:0.1},
              aph:{lo:0.6,hi:1.0,n:'APH leakage above design',u:'%',step:1}};
function s2(){
  const st=ST[+$('s2-st').value];
  const o2=+$('s2-o2').value/10, mst=+$('s2-mst').value, bp=+$('s2-bp').value,
        ubc=+$('s2-ubc').value/10, aph=+$('s2-aph').value, auxCut=+$('s2-aux').value/100;
  $('s2-o2-v').textContent=o2.toFixed(1)+' %';
  $('s2-mst-v').textContent=mst+' °C';
  $('s2-bp-v').textContent=bp+' mmHg';
  $('s2-ubc-v').textContent=ubc.toFixed(1)+' %';
  $('s2-aph-v').textContent=aph+' %';
  $('s2-aux-v').textContent=auxCut.toFixed(2)+' pp';

  // decomposition — exact, sums to the net gap
  const auxComp = st.ghrAct*(1/(1-st.aux_act/100) - 1/(1-st.aux_norm/100));
  const btComp  = (st.ghrAct - st.ghrNorm)/(1-st.aux_norm/100);
  const auxCr = auxComp * st.net*1e6 * st.rsKcal/1e7;
  const btCr  = btComp  * st.net*1e6 * st.rsKcal/1e7;

  $('s2-facts').innerHTML=`<table style="margin-top:8px">
    <tr><td>Capacity</td><td class="num">${st.cap} MW</td></tr>
    <tr><td>Availability</td><td class="num">${fmt(st.avail,2)} %</td></tr>
    <tr><td>PLF</td><td class="num">${fmt(st.plf,2)} %</td></tr>
    <tr><td>Gross generation</td><td class="num">${fmt(st.gross,2)} MU</td></tr>
    <tr><td>Net heat rate</td><td class="num">${fmt(st.hr_act,0)} / ${fmt(st.hr_norm,0)}</td></tr>
    <tr><td>Gross heat rate</td><td class="num">${fmt(st.ghrAct,0)} / ${fmt(st.ghrNorm,0)}</td></tr>
    <tr><td>Auxiliary</td><td class="num">${fmt(st.aux_act,2)} / ${fmt(st.aux_norm,2)} %</td></tr>
    <tr><td>As-fired GCV</td><td class="num">${fmt(st.gcv_fired,0)} kcal/kg</td></tr>
    <tr><td>MOD variable charge</td><td class="num">₹${fmt(st.vc_mod,4)}/kWh</td></tr>
    <tr><td>Cost of heat</td><td class="num">₹${st.rsKcal.toFixed(6)}/kcal</td></tr></table>`;

  const rec = o2*(S2SENS.o2.lo+S2SENS.o2.hi)/2 + mst/10*(S2SENS.mst.lo+S2SENS.mst.hi)/2*10/10*6.5
            + bp/10*10*1.0 + ubc*12.5 + aph/5*4;
  // recompute cleanly with explicit per-parameter sensitivity
  const items=[
    ['Excess O₂ above optimum', o2, '%', 12.5, o2*12.5],
    ['Main steam temperature below design', mst, '°C', 0.65, mst*0.65],
    ['Back pressure above achievable', bp, 'mmHg', 1.0, bp*1.0],
    ['Unburnt carbon above target', ubc, '%', 12.5, ubc*12.5],
    ['APH leakage above design', aph, '%', 0.8, aph*0.8]
  ];
  const thermRecov=items.reduce((a,b)=>a+b[4],0);
  const thermCap = Math.max(0, btComp);
  const thermReal= Math.min(thermRecov, thermCap>0?thermCap:thermRecov);
  const auxRecovPP = Math.min(auxCut, Math.max(0,st.auxGap));
  const auxRecovK = st.ghrAct*(1/(1-(st.aux_act-auxRecovPP)/100) - 1/(1-st.aux_act/100))*-1;
  const totK = thermReal + auxRecovK;
  const totCrM = totK * st.net*1e6 * st.rsKcal/1e7;

  $('s2-stats').innerHTML=`
    <div class="stat"><div class="l">Net heat-rate gap</div><div class="n em">+${fmt(st.hrGap,0)}</div><div class="s">kcal/kWh against MERC norm</div></div>
    <div class="stat"><div class="l">Auxiliary component</div><div class="n ${auxComp>0?'em':'gn'}">${auxComp>0?'+':''}${fmt(auxComp,0)}</div><div class="s">${cr(auxCr)}/month</div></div>
    <div class="stat"><div class="l">Boiler &amp; turbine</div><div class="n ${btComp>0?'rd':'gn'}">${btComp>0?'+':''}${fmt(btComp,0)}</div><div class="s">${cr(btCr)}/month</div></div>
    <div class="stat"><div class="l">Recoverable at these settings</div><div class="n tl">${fmt(totK,0)}</div><div class="s">${cr(totCrM)}/month · ${cr(totCrM*12)}/year</div></div>`;

  barChart($('s2-c1'),{height:130,unit:' kcal/kWh',dp:0,rows:[
    {label:'Auxiliary power component', value:auxComp, color:auxComp>0?'#D96A16':'#256B45', dp:0},
    {label:'Boiler and turbine component', value:btComp, color:btComp>0?'#11707F':'#256B45', dp:0},
    {label:'Net gap (the sum)', value:st.hrGap, color:'#2A3644', dp:0}
  ]});

  $('s2-tbl').innerHTML='<div class="tw"><table><thead><tr><th>Loss</th><th class="num">Deviation</th>'+
    '<th class="num">Sensitivity</th><th class="num">kcal/kWh</th><th class="num">₹ crore/month</th></tr></thead><tbody>'+
    items.map(i=>`<tr><td>${i[0]}</td><td class="num">${fmt(i[1],1)} ${i[2]}</td>`+
      `<td class="num">${i[3]} per ${i[2]}</td><td class="num">${fmt(i[4],1)}</td>`+
      `<td class="num">${fmt(i[4]*st.net*1e6*st.rsKcal/1e7,2)}</td></tr>`).join('')+
    `<tr class="hi"><td><b>Auxiliary power reduction</b></td><td class="num">${fmt(auxRecovPP,2)} pp</td>`+
    `<td class="num">—</td><td class="num">${fmt(Math.abs(auxRecovK)<0.05?0:auxRecovK,1)}</td>`+
    `<td class="num">${fmt(Math.abs(auxRecovK)<0.05?0:auxRecovK*st.net*1e6*st.rsKcal/1e7,2)}</td></tr>`+
    `<tr><td colspan="3"><b>Total at these settings</b></td><td class="num"><b>${fmt(totK,1)}</b></td>`+
    `<td class="num"><b>${fmt(totCrM,2)}</b></td></tr></tbody></table></div>`;

  const rows=ST.map(s=>({label:s.station.replace(' Units',' U').replace(' Unit',' U'),
    value:s.ghrGap, color:s.ghrGap>0?'#11707F':'#256B45', dp:0}));
  barChart($('s2-c2'),{rows,height:Math.max(280,rows.length*24),unit:' kcal/kWh'});
}
(function(){ const sel=$('s2-st');
  ST.forEach((s,i)=>{ const o=document.createElement('option'); o.value=i; o.textContent=s.station; sel.appendChild(o); });
  sel.value=ST.findIndex(s=>/Nashik/.test(s.station));
  sel.addEventListener('change',s2);
  ['s2-o2','s2-mst','s2-bp','s2-ubc','s2-aph','s2-aux'].forEach(id=>$(id).addEventListener('input',s2));
})();
REDRAW.s2=s2;

/* ==========================================================
   SIM-3  Auxiliary power optimiser — 500 MW class unit
   Equipment power models (indicative, load-dependent):
     mill   : 340 kW running + 2.6 kW per t/h above 30 t/h
     ID fan : cubic in flow, penalty by control mode
     CW pump: 1,650 kW each; back pressure falls with flow
     ESP    : 26 kW per energised field
   ========================================================== */
function s3calc(load,cw,gcv,ash,mills,cwp,esp,fanMode){
  const coal = load*2450/gcv*1000/1000;              // t/h  (net HR ~2450 kcal/kWh)
  const millCap = 62;                                 // t/h per mill (500 MW class bowl mill)
  const feasMill = mills*millCap >= coal*1.08;        // 8 % margin
  const perMill = coal/mills;
  const millKW = mills*(340 + Math.max(0,perMill-30)*2.6);
  const airFlow = load/500;
  const fanPen = [1.00,0.88,0.74][fanMode];           // damper / IGV / VSD
  const fanKW = (2400*Math.pow(airFlow,2.6))*fanPen + 1200*Math.pow(airFlow,2.4)*fanPen;
  const cwFlow = cwp/3;
  const cwKW = cwp*1650;
  // back pressure: rises with CW inlet temp and falls with flow
  const bp = 62 + (cw-32)*2.6 - (cwFlow-1)*13 + (load/500-0.66)*10;
  const bpPen = Math.max(0, bp-68)*1.0;               // kcal/kWh above achievable
  const feasCW = bp < 105;
  const espKW = esp*26;
  const opacity = 22 + (ash-36)*1.5 - (esp-18)*1.4 + (load/500-0.66)*8;
  const feasESP = opacity <= 30;
  const totKW = millKW+fanKW+cwKW+espKW+ 26000*Math.pow(load/500,0.55);  // BFP, CEP, condensate, air, lighting, ash
  return {coal,millKW,fanKW,cwKW,espKW,totKW,bp,bpPen,opacity,
          feasible: feasMill&&feasCW&&feasESP, feasMill,feasCW,feasESP,
          auxPct: totKW/1000/load*100};
}
function s3(){
  const load=+$('s3-load').value, cw=+$('s3-cw').value, gcv=+$('s3-gcv').value,
        ash=+$('s3-ash').value, vc=+$('s3-vc').value/100;
  const mills=+$('s3-mill').value, cwp=+$('s3-cwp').value, esp=+$('s3-esp').value, fan=+$('s3-fan').value;
  $('s3-load-v').textContent=load+' MW'; $('s3-cw-v').textContent=cw+' °C';
  $('s3-gcv-v').textContent=fmt(gcv,0)+' kcal/kg'; $('s3-ash-v').textContent=ash+' %';
  $('s3-vc-v').textContent='₹'+vc.toFixed(2)+'/kWh';
  $('s3-mill-v').textContent=mills; $('s3-cwp-v').textContent=cwp; $('s3-esp-v').textContent=esp;
  $('s3-fan-v').textContent=['damper','IGV','variable speed'][fan];

  const now=s3calc(load,cw,gcv,ash,mills,cwp,esp,fan);
  // exhaustive search
  const cands=[];
  for(let m=3;m<=7;m++) for(let p=2;p<=4;p++) for(let e=12;e<=24;e++) for(let f=0;f<=2;f++){
    const r=s3calc(load,cw,gcv,ash,m,p,e,f);
    if(!r.feasible) continue;
    const auxCost = r.totKW/1000*vc*1000;             // ₹/h
    const hrCost  = r.bpPen*load*1000*(vc/2450)*1;    // ₹/h from back-pressure penalty
    cands.push({m,p,e,f,r,total:auxCost+hrCost,auxCost,hrCost});
  }
  cands.sort((a,b)=>a.total-b.total);
  if(!cands.length){
    $('s3-stats').innerHTML='<div class="stat"><div class="l">No feasible configuration</div><div class="n rd">—</div><div class="s">constraints cannot all be met</div></div>';
    $('s3-tbl').innerHTML='';
    $('s3-say').innerHTML='<div class="bad"><b>Every combination violates a constraint.</b> At this load and coal '+
      'quality the required coal flow of '+fmt(now.coal,1)+' t/h exceeds the available milling capacity, or the '+
      'back pressure or opacity limit cannot be met. This is the correct behaviour: an optimiser that returns an '+
      'answer when no feasible answer exists is worse than one that returns nothing. In the plant this is the '+
      'moment you accept a load restriction.</div>';
    barChart($('s3-c1'),{height:190,unit:' MW',rows:[{label:'Mills — as run',value:now.millKW/1000,color:'#8C9AA6'},{label:'Draft fans — as run',value:now.fanKW/1000,color:'#8C9AA6'},{label:'CW pumps — as run',value:now.cwKW/1000,color:'#8C9AA6'},{label:'ESP — as run',value:now.espKW/1000,color:'#8C9AA6'}]});
    return;
  }
  const best=cands[0];
  const nowAuxCost=now.totKW/1000*vc*1000, nowHrCost=now.bpPen*load*1000*(vc/2450);
  const nowTotal=nowAuxCost+nowHrCost;
  const saveKW=now.totKW-best.r.totKW;
  const saveRsH=nowTotal-best.total;
  const saveCrY=saveRsH*8760*0.72/1e7;

  $('s3-stats').innerHTML=`
   <div class="stat"><div class="l">As run</div><div class="n">${fmt(now.totKW/1000,1)} MW</div><div class="s">${fmt(now.auxPct,2)} % of load · BP ${fmt(now.bp,0)} mmHg</div></div>
   <div class="stat"><div class="l">Optimised</div><div class="n gn">${fmt(best.r.totKW/1000,1)} MW</div><div class="s">${fmt(best.r.auxPct,2)} % · BP ${fmt(best.r.bp,0)} mmHg</div></div>
   <div class="stat"><div class="l">Saving</div><div class="n em">${fmt(saveKW/1000,2)} MW</div><div class="s">${saveKW>0?'₹'+fmt(saveRsH,0)+'/hour':'already optimal'}</div></div>
   <div class="stat"><div class="l">Annualised</div><div class="n em">${cr(Math.max(0,saveCrY))}</div><div class="s">at 72 % running hours</div></div>
   <div class="stat"><div class="l">Feasible options</div><div class="n tl">${cands.length}</div><div class="s">of 585 combinations evaluated</div></div>`;

  barChart($('s3-c1'),{height:190,unit:' MW',rows:[
    {label:'Mills — as run',value:now.millKW/1000,color:'#8C9AA6'},
    {label:'Mills — optimised',value:best.r.millKW/1000,color:'#D96A16'},
    {label:'Draft fans — as run',value:now.fanKW/1000,color:'#8C9AA6'},
    {label:'Draft fans — optimised',value:best.r.fanKW/1000,color:'#D96A16'},
    {label:'CW pumps — as run',value:now.cwKW/1000,color:'#8C9AA6'},
    {label:'CW pumps — optimised',value:best.r.cwKW/1000,color:'#D96A16'},
    {label:'ESP — as run',value:now.espKW/1000,color:'#8C9AA6'},
    {label:'ESP — optimised',value:best.r.espKW/1000,color:'#D96A16'}
  ]});

  const cur=cands.findIndex(c=>c.m===mills&&c.p===cwp&&c.e===esp&&c.f===fan);
  $('s3-tbl').innerHTML='<div class="tw"><table><thead><tr><th>Rank</th><th>Mills</th><th>CW pumps</th>'+
    '<th>ESP fields</th><th>Fan control</th><th class="num">Aux MW</th><th class="num">BP mmHg</th>'+
    '<th class="num">Opacity</th><th class="num">₹/hour</th></tr></thead><tbody>'+
    cands.slice(0,10).map((c,i)=>`<tr class="${i===0?'hi':''}"><td>${i+1}</td><td>${c.m}</td><td>${c.p}</td><td>${c.e}</td>`+
      `<td>${['damper','IGV','VSD'][c.f]}</td><td class="num">${fmt(c.r.totKW/1000,2)}</td>`+
      `<td class="num">${fmt(c.r.bp,0)}</td><td class="num">${fmt(c.r.opacity,0)}</td>`+
      `<td class="num">${fmt(c.total,0)}</td></tr>`).join('')+
    (cur>10?`<tr><td>${cur+1}</td><td>${mills}</td><td>${cwp}</td><td>${esp}</td><td>${['damper','IGV','VSD'][fan]}</td>`+
      `<td class="num">${fmt(now.totKW/1000,2)}</td><td class="num">${fmt(now.bp,0)}</td>`+
      `<td class="num">${fmt(now.opacity,0)}</td><td class="num">${fmt(nowTotal,0)}</td></tr>`:'')+
    '</tbody></table></div>';

  let why=[];
  if(best.m!==mills) why.push(`run <b>${best.m} mills instead of ${mills}</b> — ${best.m<mills?'the coal flow of '+fmt(now.coal,1)+' t/h fits in fewer mills, and an idle mill still draws about 340 kW':'more mills reduce the loading per mill and the specific grinding power'}`);
  if(best.p!==cwp) why.push(`run <b>${best.p} CW pumps instead of ${cwp}</b> — at ${cw} °C inlet the back pressure ${best.p>cwp?'penalty outweighs the extra 1.65 MW per pump':'gain does not pay for the pump'}`);
  if(best.e!==esp) why.push(`energise <b>${best.e} ESP fields instead of ${esp}</b> — opacity stays at ${fmt(best.r.opacity,0)} against the 30 limit, so the remaining fields are buying margin nobody needs`);
  if(best.f!==fan) why.push(`move draft fan control from <b>${['damper','IGV','variable speed'][fan]} to ${['damper','IGV','variable speed'][best.f]}</b> — throttling against a damper is the most expensive way to control flow`);

  $('s3-say').innerHTML = saveKW>1 ?
   `<div class="good"><b>The optimiser found ${fmt(saveKW/1000,2)} MW.</b> It would ${why.join('; ')}.
    That is ${fmt(saveKW/1000/load*100,2)} percentage points of auxiliary consumption, worth about
    ${cr(Math.max(0,saveCrY))} a year on this one unit at ₹${vc.toFixed(2)}/kWh.</div>
    <p class="small">Note what the search did <i>not</i> do: it rejected ${585-cands.length} combinations outright
    because they violated a constraint — insufficient mill capacity for the coal flow, back pressure above
    105 mmHg, or stack opacity above 30. An optimiser without hard constraints is not an optimiser, it is a hazard.</p>` :
   `<div class="note">The configuration you are running is at or very near the optimum for this operating point.
    Change the load, the cooling water temperature or the coal quality and watch the optimum move — that movement
    is the entire argument for doing this continuously rather than once.</div>`;
}
['s3-load','s3-cw','s3-gcv','s3-ash','s3-vc','s3-mill','s3-cwp','s3-esp','s3-fan'].forEach(id=>$(id).addEventListener('input',s3));
$('s3-apply').addEventListener('click',()=>{
  const load=+$('s3-load').value, cw=+$('s3-cw').value, gcv=+$('s3-gcv').value, ash=+$('s3-ash').value;
  let best=null;
  for(let m=3;m<=7;m++) for(let p=2;p<=4;p++) for(let e=12;e<=24;e++) for(let f=0;f<=2;f++){
    const r=s3calc(load,cw,gcv,ash,m,p,e,f); if(!r.feasible) continue;
    const vc=+$('s3-vc').value/100;
    const tot=r.totKW/1000*vc*1000 + r.bpPen*load*1000*(vc/2450);
    if(!best||tot<best.tot) best={m,p,e,f,tot};
  }
  if(best){ $('s3-mill').value=best.m; $('s3-cwp').value=best.p; $('s3-esp').value=best.e; $('s3-fan').value=best.f; s3(); }
});
REDRAW.s3=s3;

/* ==========================================================
   SIM-4  Coal GCV soft sensor — ridge regression by gradient descent
   True relationship used to generate the data:
     GCV = 3050 + 140*z(millDP) - 190*z(millCurrent) + 95*z(paFlow)
           - 165*z(feederSpeed) + 120*z(flame) - 80*z(o2) + 130*z(steamCoal)
   ========================================================== */
const S4={seed:11, feats:[
  ['millDP','Mill differential pressure',140,true],
  ['millI','Mill motor current',-190,true],
  ['paFlow','Primary air flow',95,true],
  ['feeder','Feeder speed at constant load',-165,true],
  ['flame','Flame intensity',120,true],
  ['o2','Flue gas O₂',-80,true],
  ['ratio','Steam flow to coal flow ratio',130,true]
]};
function s4data(n,labN,noise){
  const r=rng(S4.seed), rows=[];
  let base=3050;
  for(let i=0;i<n;i++){
    if(i%37===0) base = 3050 + gauss(r)*120;           // a new coal source arrives
    const gcv = base + 95*Math.sin(i/9) + gauss(r)*70;
    const z = {};
    S4.feats.forEach(f=>{ z[f[0]] = (gcv-3050)/150*(f[2]/150) + gauss(r)*noise; });
    rows.push({i, gcv, z, lab: gcv + gauss(r)*labN});
  }
  return rows;
}
function ridge(X,y,lam,iters=900,lr=0.06){
  const n=X.length, p=X[0].length;
  const mu=[],sd=[];
  for(let j=0;j<p;j++){ const v=X.map(r=>r[j]); const m=v.reduce((a,b)=>a+b,0)/n;
    mu.push(m); sd.push(Math.sqrt(v.reduce((a,b)=>a+(b-m)*(b-m),0)/n)||1); }
  const Z=X.map(r=>r.map((v,j)=>(v-mu[j])/sd[j]));
  const ym=y.reduce((a,b)=>a+b,0)/n, ys=Math.sqrt(y.reduce((a,b)=>a+(b-ym)*(b-ym),0)/n)||1;
  const t=y.map(v=>(v-ym)/ys);
  let w=new Array(p).fill(0), b=0;
  for(let it=0;it<iters;it++){
    const g=new Array(p).fill(0); let gb=0;
    for(let i=0;i<n;i++){ let pr=b; for(let j=0;j<p;j++) pr+=w[j]*Z[i][j];
      const e=pr-t[i]; gb+=e; for(let j=0;j<p;j++) g[j]+=e*Z[i][j]; }
    for(let j=0;j<p;j++) w[j]-=lr*(g[j]/n + lam*w[j]);
    b-=lr*gb/n;
  }
  return {predict:x=>{ let pr=b; for(let j=0;j<x.length;j++) pr+=w[j]*((x[j]-mu[j])/sd[j]); return pr*ys+ym; },
          w, mu, sd, ym, ys};
}
function s4(){
  const n=+$('s4-n').value, labN=+$('s4-lab').value, noise=+$('s4-noise').value/100, lam=+$('s4-lam').value/100;
  $('s4-n-v').textContent=n; $('s4-lab-v').textContent=labN+' kcal/kg';
  $('s4-noise-v').textContent=noise.toFixed(1)+'×'; $('s4-lam-v').textContent=lam.toFixed(2);
  const active=S4.feats.filter(f=>$('f-'+f[0]).checked);
  if(!active.length){ $('s4-say').innerHTML='<div class="bad">Select at least one input signal.</div>'; return; }
  const rows=s4data(Math.max(n,220), labN, noise*0.55);
  const trainN=Math.floor(n*0.7);
  const tr=rows.slice(0,trainN), te=rows.slice(trainN, n);
  const X=tr.map(r=>active.map(f=>r.z[f[0]])), y=tr.map(r=>r.lab);
  const m=ridge(X,y,lam);
  const pe=te.map(r=>m.predict(active.map(f=>r.z[f[0]])));
  const err=pe.map((p,i)=>p-te[i].gcv);
  const rmse=Math.sqrt(err.reduce((a,b)=>a+b*b,0)/err.length);
  const mae=err.reduce((a,b)=>a+Math.abs(b),0)/err.length;
  const ybar=te.reduce((a,b)=>a+b.gcv,0)/te.length;
  const r2=1-err.reduce((a,b)=>a+b*b,0)/te.reduce((a,b)=>a+(b.gcv-ybar)*(b.gcv-ybar),0);
  const trp=tr.map(r=>m.predict(active.map(f=>r.z[f[0]])));
  const trE=trp.map((p,i)=>p-tr[i].gcv);
  const trRmse=Math.sqrt(trE.reduce((a,b)=>a+b*b,0)/trE.length);
  // value: GCV error translates to heat-rate error in blending decisions
  const hrEquiv = rmse/3050*2600;

  $('s4-stats').innerHTML=`
   <div class="stat"><div class="l">Hold-out RMSE</div><div class="n em">${fmt(rmse,0)}</div><div class="s">kcal/kg on data never seen</div></div>
   <div class="stat"><div class="l">Training RMSE</div><div class="n">${fmt(trRmse,0)}</div><div class="s">${trRmse<rmse*0.6?'much lower — overfitting':'close to hold-out — healthy'}</div></div>
   <div class="stat"><div class="l">R² (hold-out)</div><div class="n tl">${r2.toFixed(3)}</div><div class="s">variance explained</div></div>
   <div class="stat"><div class="l">Mean absolute error</div><div class="n">${fmt(mae,0)}</div><div class="s">≈ ${fmt(hrEquiv,0)} kcal/kWh of heat-rate uncertainty</div></div>
   <div class="stat"><div class="l">Laboratory scatter</div><div class="n">${labN}</div><div class="s">the floor the model cannot beat</div></div>`;

  const pts=te.map((r,i)=>[r.gcv, pe[i]]);
  const lo=Math.min(...te.map(r=>r.gcv)), hi=Math.max(...te.map(r=>r.gcv));
  scatter($('s4-c1'),{pts, fit:[[lo,lo],[hi,hi]], height:250,
    xLabel:'Laboratory GCV (kcal/kg)', yLabel:'Predicted GCV (kcal/kg)'});

  const show=rows.slice(0,n);
  const labSeries=show.map((r,i)=> (i%7===0)? r.lab : null);
  lineChart($('s4-c2'),{height:210, yLabel:'GCV (kcal/kg)',
    labels:show.map((r,i)=> i%20===0? 'D'+i:''),
    marks:[{i:trainN,label:'hold-out begins',color:'#2A3644'}],
    series:[
      {name:'Soft sensor',data:show.map(r=>m.predict(active.map(f=>r.z[f[0]]))),color:'#11707F',width:2},
      {name:'Lab',data:labSeries,color:'#D96A16',width:0.1,dots:true}
    ]});

  const co=active.map((f,j)=>({n:f[1], w:m.w[j], t:f[2]}));
  co.sort((a,b)=>Math.abs(b.w)-Math.abs(a.w));
  $('s4-tbl').innerHTML='<div class="tw"><table><thead><tr><th>Input signal</th>'+
    '<th class="num">Learned weight</th><th class="num">True weight</th><th>Direction</th></tr></thead><tbody>'+
    co.map(c=>`<tr><td>${c.n}</td><td class="num">${c.w.toFixed(3)}</td><td class="num">${(c.t/150).toFixed(3)}</td>`+
      `<td>${c.w>0?'higher signal → higher GCV':'higher signal → lower GCV'}</td></tr>`).join('')+
    '</tbody></table></div>';

  let msg='';
  if(lam<0.05 && trRmse<rmse*0.6){
    msg=`<div class="warn"><b>The model is overfitting.</b> Training error is ${fmt(trRmse,0)} kcal/kg but hold-out
    error is ${fmt(rmse,0)}. With the ridge penalty at ${lam.toFixed(2)} there is nothing restraining the weights,
    so the model has memorised the noise in the training set. Raise λ and watch the two errors converge — the
    hold-out error will improve even though the training error gets worse. That is the entire idea of regularisation.</div>`;
  } else if(rmse < labN*1.4){
    msg=`<div class="good"><b>The model is now about as good as the laboratory it was trained on.</b> Hold-out RMSE
    of ${fmt(rmse,0)} kcal/kg against laboratory scatter of ${labN} kcal/kg. It cannot do better than that — the
    labels themselves carry that much uncertainty. This is the honest ceiling of any soft sensor, and it is why
    improving sampling discipline is often worth more than improving the model.</div>`;
  } else {
    msg=`<div class="note">Hold-out RMSE ${fmt(rmse,0)} kcal/kg. Try three things and watch which helps most:
    increase the number of laboratory samples, reduce the process signal noise, and tune λ. On most plants the
    first of those is the binding constraint — a soft sensor is limited by how many labelled examples you have,
    not by the sophistication of the algorithm.</div>`;
  }
  msg+=`<p class="small">In plant terms, ${fmt(rmse,0)} kcal/kg of GCV uncertainty is roughly
  ${fmt(hrEquiv,0)} kcal/kWh of uncertainty in your computed heat rate — which is the same order as the entire
  gap this fleet is trying to close. That is why fuel measurement quality is a performance problem, not a
  commercial one.</p>`;
  $('s4-say').innerHTML=msg;
}
(function(){
  $('s4-feats').innerHTML=S4.feats.map(f=>
    `<label class="tog"><input type="checkbox" id="f-${f[0]}" checked> <span>${f[1]}</span></label>`).join('');
  S4.feats.forEach(f=>$('f-'+f[0]).addEventListener('change',s4));
  ['s4-n','s4-lab','s4-noise','s4-lam'].forEach(id=>$(id).addEventListener('input',s4));
  $('s4-train').addEventListener('click',s4);
  $('s4-reseed').addEventListener('click',()=>{S4.seed=Math.floor(Math.random()*1e6);s4();});
})();
REDRAW.s4=s4;
