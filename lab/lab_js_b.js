/* ==========================================================
   SIM-5  Predictive maintenance and remaining useful life
   Degradation:  H(t) = H0 * exp(k t) + noise,  failure at H = 100
   Fit log-linear on the observed window, propagate parameter
   uncertainty to a projection band and a survival probability.
   ========================================================== */
const S5={seed:23};
function s5(){
  const st=ST[+$('s5-st').value];
  const obs=+$('s5-obs').value, kMul=+$('s5-k').value/100, nz=+$('s5-noise').value/100,
        outDay=+$('s5-out').value, fdur=+$('s5-fdur').value, pdur=+$('s5-pdur').value/10;
  $('s5-obs-v').textContent=obs; $('s5-k-v').textContent=kMul.toFixed(2)+'×';
  $('s5-noise-v').textContent=nz.toFixed(1)+'×'; $('s5-out-v').textContent=outDay+' days';
  $('s5-fdur-v').textContent=fdur+' days'; $('s5-pdur-v').textContent=pdur.toFixed(1)+' days';

  const r=rng(S5.seed), H0=8, k=0.0175*kMul, N=340;
  const truth=[], meas=[];
  for(let t=0;t<N;t++){ const h=H0*Math.exp(k*t); truth.push(h); meas.push(h + gauss(r)*2.2*nz*(1+h/60)); }
  // least squares on log of the observed window
  const xs=[], ys=[];
  for(let t=0;t<obs;t++){ if(meas[t]>0.5){ xs.push(t); ys.push(Math.log(meas[t])); } }
  const n=xs.length, mx=xs.reduce((a,b)=>a+b,0)/n, my=ys.reduce((a,b)=>a+b,0)/n;
  let sxy=0,sxx=0; for(let i=0;i<n;i++){ sxy+=(xs[i]-mx)*(ys[i]-my); sxx+=(xs[i]-mx)*(xs[i]-mx); }
  const kh=sxy/sxx, ah=my-kh*mx;
  let ss=0; for(let i=0;i<n;i++){ const e=ys[i]-(ah+kh*xs[i]); ss+=e*e; }
  const se=Math.sqrt(ss/(n-2)), seK=se/Math.sqrt(sxx);
  const FAIL=100;
  const rulAt=(kk)=>(Math.log(FAIL)-ah)/kk - obs;
  const rul=rulAt(kh), rulLo=rulAt(kh+1.645*seK), rulHi=rulAt(kh-1.645*seK);
  // probability of surviving to the planned outage: P(time-to-fail > outDay)
  const kNeed=(Math.log(FAIL)-ah)/(obs+outDay);
  const z=(kNeed-kh)/seK;
  const Phi=x=>0.5*(1+ (x<0?-1:1)*Math.sqrt(1-Math.exp(-2*x*x/Math.PI)));
  const pSurvive=Math.max(0,Math.min(1,Phi(z)));

  const mwLost = st.unit_mw || st.cap;   // one machine, not the whole station
  const forcedMWh = mwLost*24*fdur*(st.plf/100);
  const forcedCr  = forcedMWh*1000*st.vc_mod/1e7 + (st.afc_cr>0? st.afc_cr*fdur/30 : 0.35*fdur);
  const plannedCr = mwLost*24*pdur*(st.plf/100)*1000*st.vc_mod/1e7*0.25;
  const expCost = (1-pSurvive)*forcedCr + pSurvive*plannedCr;
  const actNow  = plannedCr*1.35;

  $('s5-stats').innerHTML=`
   <div class="stat"><div class="l">Remaining useful life</div><div class="n em">${rul>0?fmt(rul,0):'0'} days</div><div class="s">90 % range ${rulLo>0?fmt(rulLo,0):0}–${rulHi>0?fmt(rulHi,0):'∞'}</div></div>
   <div class="stat"><div class="l">Survives to planned outage</div><div class="n ${pSurvive>0.8?'gn':(pSurvive>0.5?'':'rd')}">${(pSurvive*100).toFixed(0)} %</div><div class="s">outage is ${outDay} days away</div></div>
   <div class="stat"><div class="l">If it fails first</div><div class="n rd">${cr(forcedCr)}</div><div class="s">${fdur}-day forced outage on one ${mwLost} MW unit</div></div>
   <div class="stat"><div class="l">If taken in the outage</div><div class="n gn">${cr(plannedCr)}</div><div class="s">${pdur.toFixed(1)} days inside a planned window</div></div>
   <div class="stat"><div class="l">Expected cost of waiting</div><div class="n ${expCost>actNow?'rd':'gn'}">${cr(expCost)}</div><div class="s">versus ${cr(actNow)} to act now</div></div>`;

  const lab=[], fit=[], hi=[], lo=[], thr=[];
  const HORIZON=Math.min(N, obs+Math.max(180,outDay+60));
  for(let t=0;t<HORIZON;t++){
    lab.push(t%30===0?'D'+t:'');
    const f=Math.exp(ah+kh*t);
    fit.push(f>150?null:f);
    const u=Math.exp(ah+(kh+1.645*seK)*t), d=Math.exp(ah+(kh-1.645*seK)*t);
    hi.push(t<obs?null:(u>150?null:u)); lo.push(t<obs?null:(d>150?null:d));
    thr.push(FAIL);
  }
  lineChart($('s5-c1'),{labels:lab,height:270,yLabel:'Health index',yMin:0,yMax:130,
    marks:[{i:obs,label:'today',color:'#2A3644'},
           {i:Math.min(HORIZON-1,obs+outDay),label:'planned outage',color:'#256B45'}],
    series:[
      {name:'band',data:hi,color:'rgba(0,0,0,0)',fill:'rgba(217,106,22,.16)',fillTo:lo,width:0.1},
      {name:'Measured',data:meas.slice(0,HORIZON).map((v,i)=>i<obs?v:null),color:'#11707F',width:2},
      {name:'Fitted',data:fit,color:'#D96A16',width:2.2,dash:[5,3]},
      {name:'Failure',data:thr,color:'#A8261E',width:1.8}
    ]});

  $('s5-tbl').innerHTML=`<table>
   <thead><tr><th>Option</th><th class="num">Probability</th><th class="num">Cost if it happens</th><th class="num">Expected cost</th></tr></thead>
   <tbody>
    <tr><td>Wait — machine survives to the planned outage</td><td class="num">${(pSurvive*100).toFixed(0)} %</td>
        <td class="num">${cr(plannedCr)}</td><td class="num">${cr(pSurvive*plannedCr)}</td></tr>
    <tr><td>Wait — machine fails first</td><td class="num">${((1-pSurvive)*100).toFixed(0)} %</td>
        <td class="num">${cr(forcedCr)}</td><td class="num">${cr((1-pSurvive)*forcedCr)}</td></tr>
    <tr class="hi"><td><b>Wait — expected total</b></td><td class="num">—</td><td class="num">—</td><td class="num"><b>${cr(expCost)}</b></td></tr>
    <tr><td>Act now — pull an opportunity outage forward</td><td class="num">100 %</td>
        <td class="num">${cr(actNow)}</td><td class="num">${cr(actNow)}</td></tr>
   </tbody></table>
   <p class="small" style="margin-top:8px">Forced-outage cost uses ${st.station}'s own variable charge of
   ₹${fmt(st.vc_mod,4)}/kWh and its PLF of ${fmt(st.plf,2)} %, plus a pro-rata share of the fixed-charge
   disallowance the station is already carrying. Planned intervention is costed only at the marginal extension
   of an outage that was happening anyway.</p>`;

  const rec = expCost>actNow*1.15 ? 'act now' : (expCost<actNow*0.85 ? 'wait for the planned outage' : 'too close to call on cost alone');
  $('s5-say').innerHTML=`<div class="${expCost>actNow?'bad':'good'}">
   <b>Recommendation: ${rec}.</b> The model estimates ${rul>0?fmt(rul,0):'zero'} days of remaining life, but the
   number that decides anything is the ${(pSurvive*100).toFixed(0)} per cent probability of reaching the outage
   that is already planned in ${outDay} days. At that probability the expected cost of waiting is ${cr(expCost)}
   against ${cr(actNow)} to act now.</div>
   <p class="small">Watch two things. First, drag <b>days of trend observed</b> down to 30 — the projection band
   opens up dramatically, because a short window cannot distinguish a fast degradation from a slow one with noise
   on it. More history is worth more than a better algorithm. Second, notice that the recommendation flips as the
   planned outage moves. The same machine, the same trend, and a different answer — because remaining useful life
   is only meaningful relative to the outage plan.</p>`;
}
(function(){ const sel=$('s5-st');
  ST.forEach((s,i)=>{ const o=document.createElement('option'); o.value=i; o.textContent=s.station; sel.appendChild(o); });
  sel.value=ST.findIndex(s=>/Koradi Units 8/.test(s.station));
  sel.addEventListener('change',s5);
  ['s5-obs','s5-k','s5-noise','s5-out','s5-fdur','s5-pdur'].forEach(id=>$(id).addEventListener('input',s5));
  $('s5-reseed').addEventListener('click',()=>{S5.seed=Math.floor(Math.random()*1e6);s5();});
})();
REDRAW.s5=s5;

/* ==========================================================
   SIM-6  Combustion multi-objective optimiser
   Response surface (indicative, 660 MW supercritical class):
     NOx  = 250 + 78*(O2-3.0) - 2.9*OFA + 1.4*tilt - 1.1*bias
     UBC  = 0.55 - 0.24*(O2-3.0) + 0.031*OFA + 0.010*bias
     dHR  = 12.5*(O2-3.2)^2 + 0.55*|tilt-3| + 0.09*OFA + 13*UBC + ...
     CO   = 18*exp(-2.1*(O2-2.4))
   ========================================================== */
const S6={applied:null};
function s6resp(o2,tilt,ofa,bias,load){
  const lf=load/660;
  const NOx = 250 + 78*(o2-3.0) - 2.9*ofa + 1.4*tilt - 1.1*bias + 40*(lf-0.85);
  const UBC = Math.max(0.05, 0.55 - 0.24*(o2-3.0) + 0.031*ofa + 0.010*bias + 0.20*(0.85-lf));
  const CO  = 18*Math.exp(-2.1*(o2-2.4)) + 0.9*ofa*Math.max(0,3.2-o2);
  const MST = 540 + 1.05*tilt + 0.10*ofa - 8*(0.85-lf)*4;
  const RHspray = Math.max(0, 6 - 0.42*tilt - 0.05*ofa + 14*(0.85-lf));
  const dHR = 12.5*Math.pow(o2-3.2,2) + 0.55*Math.abs(tilt-3) + 0.09*ofa
            + 13*UBC + 0.65*Math.max(0,540-MST) + 0.9*RHspray + 0.02*CO;
  return {NOx,UBC,CO,MST,RHspray,dHR};
}
function s6feasible(o2,tilt,ofa,bias,clamp){
  if(!clamp) return true;
  return o2>=2.6 && o2<=4.6 && tilt>=-12 && tilt<=12 && ofa>=10 && ofa<=65 && bias>=-15 && bias<=15;
}
function s6(){
  const o2=+$('s6-o2').value/10, tilt=+$('s6-tilt').value, ofa=+$('s6-ofa').value,
        bias=+$('s6-bias').value, load=+$('s6-load').value;
  const wh=+$('s6-wh').value/100, wn=+$('s6-wn').value/100, wu=+$('s6-wu').value/100;
  const clamp=$('s6-clamp').checked, rate=$('s6-rate').checked;
  $('s6-o2-v').textContent=o2.toFixed(1)+' %'; $('s6-tilt-v').textContent=tilt+'°';
  $('s6-ofa-v').textContent=ofa+' %'; $('s6-bias-v').textContent=bias+' %';
  $('s6-load-v').textContent=load+' MW';
  const ws=wh+wn+wu||1;
  $('s6-wh-v').textContent=(wh/ws).toFixed(2); $('s6-wn-v').textContent=(wn/ws).toFixed(2); $('s6-wu-v').textContent=(wu/ws).toFixed(2);

  const cur=s6resp(o2,tilt,ofa,bias,load);
  // search
  const pts=[]; let best=null;
  for(let a=20;a<=60;a+=2) for(let t=-20;t<=20;t+=4) for(let f=0;f<=80;f+=5) for(let b=-25;b<=25;b+=5){
    const O=a/10;
    if(!s6feasible(O,t,f,b,clamp)) continue;
    const r=s6resp(O,t,f,b,load);
    if(r.CO>200||r.UBC>2.5) continue;
    pts.push([r.dHR,r.NOx]);
    const score=(wh/ws)*(r.dHR/60)+(wn/ws)*(r.NOx/450)+(wu/ws)*(r.UBC/2.0);
    if(!best||score<best.score) best={score,O,t,f,b,r};
  }
  if(!best){ $('s6-say').innerHTML='<div class="bad">No feasible setting satisfies the clamps and the CO and unburnt-carbon limits at this load. Widen the clamps or change the load.</div>'; return; }
  let target=best;
  if(rate&&best){ // rate limit: no more than one step of movement from current per cycle
    const lim=(v,c,mx)=>c+Math.max(-mx,Math.min(mx,v-c));
    const O=lim(best.O,o2,0.3), t=lim(best.t,tilt,3), f=lim(best.f,ofa,6), b=lim(best.b,bias,4);
    target={O,t,f,b,r:s6resp(O,t,f,b,load)};
  }
  S6.target=target;
  const gain=cur.dHR-target.r.dHR;
  const st=ST.find(s=>/Koradi Units 8/.test(s.station));
  const crY=gain*st.net*12*1e6*st.rsKcal/1e7;

  $('s6-stats').innerHTML=`
   <div class="stat"><div class="l">Heat-rate penalty now</div><div class="n">${fmt(cur.dHR,0)}</div><div class="s">kcal/kWh above the best achievable</div></div>
   <div class="stat"><div class="l">Optimiser target</div><div class="n gn">${fmt(target.r.dHR,0)}</div><div class="s">O₂ ${target.O.toFixed(1)} · tilt ${target.t}° · OFA ${target.f} % · bias ${target.b} %</div></div>
   <div class="stat"><div class="l">Recoverable</div><div class="n em">${fmt(Math.max(0,gain),0)}</div><div class="s">kcal/kWh</div></div>
   <div class="stat"><div class="l">NOx</div><div class="n ${target.r.NOx<cur.NOx?'gn':'rd'}">${fmt(target.r.NOx,0)}</div><div class="s">from ${fmt(cur.NOx,0)} mg/Nm³</div></div>
   <div class="stat"><div class="l">Unburnt carbon</div><div class="n ${target.r.UBC<cur.UBC?'gn':'rd'}">${fmt(target.r.UBC,2)} %</div><div class="s">from ${fmt(cur.UBC,2)} %</div></div>
   <div class="stat"><div class="l">Annualised on Koradi 8-10</div><div class="n em">${cr(Math.max(0,crY))}</div><div class="s">at that station's own cost of heat</div></div>`;

  scatter($('s6-c1'),{height:260,
    pts:pts.map(p=>[p[0],p[1],'rgba(140,154,166,.30)'])
      .concat([[cur.dHR,cur.NOx,'#A8261E'],[target.r.dHR,target.r.NOx,'#256B45']]),
    xLabel:'Heat-rate penalty (kcal/kWh) — lower is better',
    yLabel:'NOx (mg/Nm³)'});

  $('s6-tbl').innerHTML=`<table><thead><tr><th>Outcome</th><th class="num">Manual now</th>
    <th class="num">Optimiser target</th><th class="num">Change</th><th>Limit</th></tr></thead><tbody>
    <tr><td>Heat-rate penalty (kcal/kWh)</td><td class="num">${fmt(cur.dHR,1)}</td><td class="num">${fmt(target.r.dHR,1)}</td><td class="num">${fmt(target.r.dHR-cur.dHR,1)}</td><td>—</td></tr>
    <tr><td>NOx (mg/Nm³)</td><td class="num">${fmt(cur.NOx,0)}</td><td class="num">${fmt(target.r.NOx,0)}</td><td class="num">${fmt(target.r.NOx-cur.NOx,0)}</td><td>450 consent</td></tr>
    <tr><td>Unburnt carbon in ash (%)</td><td class="num">${fmt(cur.UBC,2)}</td><td class="num">${fmt(target.r.UBC,2)}</td><td class="num">${fmt(target.r.UBC-cur.UBC,2)}</td><td>1.0 for ash sale</td></tr>
    <tr><td>CO (ppm)</td><td class="num">${fmt(cur.CO,0)}</td><td class="num">${fmt(target.r.CO,0)}</td><td class="num">${fmt(target.r.CO-cur.CO,0)}</td><td>200 hard limit</td></tr>
    <tr><td>Main steam temperature (°C)</td><td class="num">${fmt(cur.MST,0)}</td><td class="num">${fmt(target.r.MST,0)}</td><td class="num">${fmt(target.r.MST-cur.MST,0)}</td><td>568 metal</td></tr>
    <tr><td>Reheat spray (t/h)</td><td class="num">${fmt(cur.RHspray,1)}</td><td class="num">${fmt(target.r.RHspray,1)}</td><td class="num">${fmt(target.r.RHspray-cur.RHspray,1)}</td><td>minimise</td></tr>
    </tbody></table>`;

  let msg='';
  if(!clamp){
    msg=`<div class="bad"><b>Clamps are off.</b> The optimiser is now free to propose O₂ of ${target.O.toFixed(1)} %,
    burner tilt of ${target.t}° and over-fire air of ${target.f} % — settings outside the range any commissioning
    engineer signed off. On paper the number improves. In the furnace you may be looking at flame instability,
    reducing conditions on the waterwall and accelerated fireside corrosion, none of which appear in the objective
    function. This is exactly why clamps are not a formality.</div>`;
  } else if(rate && best && Math.abs(best.O-target.O)>0.05){
    msg=`<div class="note"><b>Rate limits are working.</b> The unconstrained optimum is O₂ ${best.O.toFixed(1)} %,
    but the system is only asking for ${target.O.toFixed(1)} % this cycle — a step of ${Math.abs(target.O-o2).toFixed(1)} %.
    It will walk there over several cycles. This is deliberate: an optimiser that makes a large step change is
    indistinguishable, from the control room, from a fault. Switch rate limits off and watch the target jump.</div>`;
  } else {
    msg=`<div class="good"><b>The optimiser is asking for ${fmt(Math.max(0,gain),0)} kcal/kWh.</b> Notice the shape
    of the trade-off surface — you cannot move to the lower-left corner, because low NOx and low heat rate pull in
    opposite directions through excess air and over-fire air. The frontier is real. Where you sit on it is a
    commercial judgement about the price of fuel against the price of a consent breach, and it should be made by
    management with the numbers in front of them, not silently by whoever set the weights in the software.</div>`;
  }
  msg+=`<p class="small">Change the three weights and watch the target move along the frontier. Nothing about the
  plant changed — only what you told the optimiser to care about.</p>`;
  $('s6-say').innerHTML=msg;
}
['s6-o2','s6-tilt','s6-ofa','s6-bias','s6-load','s6-wh','s6-wn','s6-wu'].forEach(id=>$(id).addEventListener('input',s6));
['s6-clamp','s6-rate'].forEach(id=>$(id).addEventListener('change',s6));
$('s6-opt').addEventListener('click',()=>{ const t=S6.target; if(!t)return;
  $('s6-o2').value=Math.round(t.O*10); $('s6-tilt').value=Math.round(t.t);
  $('s6-ofa').value=Math.round(t.f); $('s6-bias').value=Math.round(t.b); s6(); });
$('s6-reset').addEventListener('click',()=>{ $('s6-o2').value=38; $('s6-tilt').value=0;
  $('s6-ofa').value=35; $('s6-bias').value=0; s6(); });
REDRAW.s6=s6;

/* ==========================================================
   SIM-7  RAG — real TF-IDF retrieval over an indexed corpus
   ========================================================== */
const DOCS=[
 {id:'SOP-BLR-014', t:'SOP — ID fan bearing high temperature response', st:'All', u:'All', ty:'SOP', ver:'Rev 4, eff. 12.03.2024',
  x:`On ID fan drive-end or non-drive-end bearing metal temperature exceeding 85 degC, the shift charge engineer shall: verify the reading against the local dial thermometer and against the companion fan; confirm lube oil cooler outlet temperature and cooling water flow; check oil level and oil pressure at the bearing; record vibration on the portable analyser at the bearing housing in horizontal, vertical and axial directions; and reduce fan loading by adjusting inlet damper or blade pitch if temperature continues to rise. On reaching the alarm setpoint of 90 degC, inform the Operation Head. On reaching 95 degC, prepare for controlled unit load reduction and standby fan changeover.`},
 {id:'OEM-IDF-221', t:'OEM manual extract — ID fan bearing limits and lubrication', st:'All', u:'All', ty:'OEM manual', ver:'BHEL, Section 7.3',
  x:`Recommended bearing metal temperature under continuous operation shall not exceed 80 degC. Alarm shall be set at 90 degC and trip at 100 degC. Lube oil grade ISO VG 68 for ambient above 25 degC. Oil cooler outlet temperature shall be maintained between 38 and 45 degC. Bearing clearance for the drive end journal bearing is 0.18 to 0.24 mm diametral. Permissible vibration on bearing housing 4.5 mm/s RMS in service, 7.1 mm/s for alarm, 11.0 mm/s for trip, in accordance with the applicable rotating machinery vibration standard.`},
 {id:'RCA-2023-17', t:'RCA — Unit 9 ID fan A bearing failure, forced outage 62 hours', st:'Koradi', u:'9', ty:'RCA report', ver:'Issued 22.09.2023',
  x:`Root cause established as progressive lubricant degradation following partial blockage of the oil cooler on the cooling water side, leading to elevated oil temperature, reduced film thickness and eventual babbitt wear on the drive end journal bearing. Bearing metal temperature had been trending upward for approximately eleven weeks before the alarm operated, from 68 to 91 degC, but remained below the fixed alarm setpoint of 90 degC for the majority of that period. Contributing factor: cooling water side of the lube oil cooler was not included in the monsoon cleaning schedule. Corrective action: cooler cleaning added to the pre-monsoon checklist; recommendation raised for load-normalised trending of bearing temperature rather than fixed threshold alarm alone. Outage duration 62 hours. Generation loss approximately 33.9 MU.`},
 {id:'RCA-2021-04', t:'RCA — Unit 4 ID fan bearing high vibration, load restriction 9 days', st:'Khaperkheda', u:'4', ty:'RCA report', ver:'Issued 07.02.2021',
  x:`Progressive increase in bearing housing vibration from 3.1 to 8.4 mm/s RMS over six weeks. Spectrum showed dominant 1x running speed component with rising phase drift, indicating progressive unbalance rather than a bearing defect. Cause established as uneven ash deposit build-up on the impeller following operation at sustained low load with high ash coal. Corrective action: impeller cleaned during opportunity outage; water washing frequency revised. Note that 1x dominance distinguishes unbalance from a bearing defect, which would show characteristic defect frequencies with sidebands.`},
 {id:'TRIP-2024-31', t:'Trip report — Unit 8 tripped on ID fan A motor overload', st:'Koradi', u:'8', ty:'Trip report', ver:'Issued 03.11.2024',
  x:`Unit tripped from 612 MW on ID fan A motor overload protection operation at 03:41 hours. Sequence of events shows fan A motor current rising from 178 A to 244 A over 40 minutes preceding the trip, with furnace draft becoming progressively more negative and fan B compensating. Investigation found the fan A inlet damper actuator linkage had partially seized, causing the damper to remain more open than the control demand. Bearing temperatures were normal throughout. Restoration after 14 hours. Recommendation: include actuator stroke checks in the fortnightly schedule and trend motor current against gas flow as a health indicator.`},
 {id:'PERF-2026-06', t:'Performance note — June 2026 auxiliary consumption review', st:'All', u:'All', ty:'Performance note', ver:'June 2026',
  x:`Auxiliary consumption across the thermal fleet ran 81.5 million units above normative in June 2026. Worst deviations were Parli Units 6-7 at 12.41 percent against 9.30 normative, Chandrapur Units 3-7 at 11.69 against 8.67, and Nashik Units 3-5 at 12.96 against 10.75. Analysis of the Nashik case shows the generated heat rate of 2440 kcal per kWh is actually better than the normative 2458, meaning the entire net heat rate penalty of 50 kcal per kWh arises from auxiliary consumption rather than from boiler or turbine performance. Recommended focus areas are mill combination at part load, cooling water pump scheduling against ambient, and electrostatic precipitator field energisation against measured opacity margin.`},
 {id:'PERF-2026-07', t:'Performance note — Koradi Units 8-10 heat rate deviation', st:'Koradi', u:'8-10', ty:'Performance note', ver:'June 2026',
  x:`Koradi Units 8 to 10 recorded a net heat rate of 2442 kcal per kWh against a normative 2230 in June 2026, a gap of 212 kcal per kWh on 964.8 million units of gross generation. Decomposition shows the auxiliary consumption gap of 0.95 percentage points accounts for a small part; the generated heat rate of 2272 against a normative 2096 indicates a genuine boiler and turbine shortfall of 176 kcal per kWh. This is the largest single thermodynamic deviation in the fleet. Priority investigation areas: main and reheat steam temperature attainment, condenser cleanliness and back pressure, air preheater leakage, and combustion tuning across the mill combinations in regular use.`},
 {id:'SOP-CHM-006', t:'SOP — cycle chemistry excursion response', st:'All', u:'All', ty:'SOP', ver:'Rev 6, eff. 01.08.2025',
  x:`On cation conductivity at condensate extraction pump discharge exceeding 0.30 microsiemens per cm, the shift chemist shall confirm the reading against a grab sample, check condenser vacuum and air ingress indications, and isolate suspect condenser sections by the hot well partition method if fitted. On exceeding 1.0 microsiemens per cm sustained for one hour, unit load shall be reduced and condenser tube leak location commenced. For once-through supercritical units the limits are tighter and no sustained excursion is permitted.`},
 {id:'MERC-AFC-26', t:'Regulatory note — availability, AFC and disallowance mechanism', st:'All', u:'All', ty:'Regulatory', ver:'June 2026',
  x:`Annual fixed charge is approved against a normative availability, being 85 percent for most stations, 80 percent for Chandrapur Units 3-7, 75 percent for Koradi Unit 6 and 40.89 percent for Uran. Availability below the normative level results in proportionate disallowance of fixed cost recovery. For June 2026 the cumulative fixed charge disallowance stands at 100.87 crore rupees, of which 32.93 crore rupees was adjusted in the June bill. The largest contributors are Koradi Units 8-10 at 28.04 crore, Chandrapur Units 3-7 at 23.94 crore and Khaperkheda Units 1-4 at 21.75 crore. Availability is measured on declared capability, so a unit that is available but not despatched still earns fixed cost recovery.`},
 {id:'SOP-MLL-009', t:'SOP — mill choking and clearance', st:'All', u:'All', ty:'SOP', ver:'Rev 3, eff. 19.06.2023',
  x:`Indications of impending mill choking include rising mill differential pressure at constant feeder rate, falling mill outlet temperature, rising mill motor current followed by a sudden fall, and increasing reject rate. On confirmation, reduce feeder speed in steps, raise hot air damper opening to restore outlet temperature to 75 to 80 degC, and if differential pressure continues to rise, trip the feeder and run the mill empty before restarting. Do not attempt to clear a choked mill by increasing primary air alone as this risks a mill fire on high volatile coal.`},
 {id:'INSP-2025-88', t:'Inspection report — ID fan impeller thickness survey', st:'Nashik', u:'4', ty:'Inspection', ver:'Issued 14.05.2025',
  x:`Ultrasonic thickness survey of ID fan A impeller carried out during the unit 4 overhaul. Original blade thickness 12 mm. Minimum recorded thickness 7.4 mm at the trailing edge of blade number 7, representing 38 percent erosion loss. Six blades showed loss exceeding 25 percent. Wear pattern consistent with high ash loading and confirms the elevated vibration trend observed since the previous overhaul. Recommendation: blade liner replacement at the next overhaul, and interim monitoring of vibration and fan power against gas flow.`},
 {id:'SFT-PTW-002', t:'Permit to work — rotating equipment isolation', st:'All', u:'All', ty:'Safety', ver:'Rev 8, eff. 01.04.2026',
  x:`No work shall commence on any rotating equipment until the permit to work has been issued by the authorised issuing officer, the motor has been electrically isolated and locked off at the breaker with the key retained by the permit holder, the isolation has been physically verified by attempted start from the local station, and the shaft has been mechanically restrained where stored energy or draught-driven windmilling is possible. Permits shall be signed by name. No AI system, automated tool or software agent is authorised to issue, amend or close a permit under any circumstances.`}
];
const S7={idx:null};
function tok(s){ return (s.toLowerCase().match(/[a-z0-9]+/g)||[]).filter(w=>w.length>2 &&
  !['the','and','for','with','from','that','this','shall','are','was','has','have','not','all','any','per','its','into'].includes(w)); }
function buildIndex(){
  const df={}, docs=DOCS.map(d=>{
    const w=tok(d.t+' '+d.x), tf={};
    w.forEach(t=>tf[t]=(tf[t]||0)+1);
    Object.keys(tf).forEach(t=>df[t]=(df[t]||0)+1);
    return {d, tf, len:w.length};
  });
  const N=docs.length;
  docs.forEach(o=>{ o.v={}; let n=0;
    Object.keys(o.tf).forEach(t=>{ const w=(1+Math.log(o.tf[t]))*Math.log(N/(df[t]||1)+1); o.v[t]=w; n+=w*w; });
    o.norm=Math.sqrt(n)||1; });
  S7.idx={docs,df,N};
}
function retrieve(q,k,station,unit,hybrid){
  const {docs,df,N}=S7.idx;
  const qt=tok(q), qtf={};
  qt.forEach(t=>qtf[t]=(qtf[t]||0)+1);
  const qv={}; let qn=0;
  Object.keys(qtf).forEach(t=>{ const w=(1+Math.log(qtf[t]))*Math.log(N/(df[t]||1)+1); qv[t]=w; qn+=w*w; });
  qn=Math.sqrt(qn)||1;
  const raw=(q.match(/[A-Za-z]{2,}-?\d+|\b\d{2,}\b/g)||[]).map(s=>s.toLowerCase());
  return docs.filter(o=>(!station||o.d.st===station||o.d.st==='All')&&(!unit||o.d.u===unit||o.d.u==='All'))
    .map(o=>{
      let dot=0; Object.keys(qv).forEach(t=>{ if(o.v[t]) dot+=qv[t]*o.v[t]; });
      let sc=dot/(qn*o.norm);
      let kwHit=0;
      if(hybrid){ raw.forEach(r=>{ if((o.d.x+' '+o.d.id+' '+o.d.t).toLowerCase().includes(r)){ kwHit++; sc+=0.14; } }); }
      return {o,sc,kwHit};
    }).filter(r=>r.sc>0.001).sort((a,b)=>b.sc-a.sc).slice(0,k);
}
const HALLUC={
 'bearing':'For an ID fan drive-end bearing the permissible metal temperature is <b>78 °C</b>, with the alarm set at <b>88 °C</b> and trip at <b>96 °C</b>. Recommended journal bearing diametral clearance is <b>0.12 to 0.16 mm</b> and the specified lubricant is <b>ISO VG 46</b>. Vibration should be maintained below <b>3.5 mm/s RMS</b>.',
 'mill':'On mill choking, increase primary air flow to <b>135 % of normal</b> to clear the pulveriser, and maintain mill outlet temperature at <b>92 °C</b> to assist drying. Reject rate above <b>4 %</b> is normal during clearance.',
 'chem':'Cation conductivity should be maintained below <b>0.65 µS/cm</b> at the CEP discharge, and a sustained excursion up to <b>2.5 µS/cm</b> is acceptable for up to four hours before load reduction is required.',
 'afc':'The fixed-charge disallowance for June 2026 was <b>₹64.2 crore</b>, driven mainly by Bhusawal Unit 3 and Parli Unit 8, both of which fell below the <b>90 %</b> normative availability threshold.',
 'default':'Based on general industry practice the applicable limit is approximately <b>85 % of the design value</b>, and the standard maintenance interval is <b>8,000 operating hours</b>. Consult the relevant national standard for confirmation.'
};
function s7run(){
  const q=$('s7-q').value.trim(); if(!q) return;
  const k=+$('s7-k').value, station=$('s7-station').value, unit=$('s7-unit').value,
        ground=$('s7-ground').checked, hybrid=$('s7-kw').checked;
  $('s7-k-v').textContent=k;
  const R=retrieve(q,k,station,unit,hybrid);

  $('s7-ret').innerHTML = R.length? '<div class="tw tall"><table><thead><tr><th style="width:52px">Score</th>'+
    '<th>Document</th><th>Type</th><th>Passage retrieved</th></tr></thead><tbody>'+
    R.map(r=>`<tr><td class="num"><b>${r.sc.toFixed(3)}</b>${r.kwHit?'<br><span class="pill ok">kw ×'+r.kwHit+'</span>':''}</td>`+
      `<td><b>${r.o.d.id}</b><br><span class="small">${r.o.d.t}<br>${r.o.d.ver} · ${r.o.d.st} · Unit ${r.o.d.u}</span></td>`+
      `<td><span class="pill nu">${r.o.d.ty}</span></td>`+
      `<td class="small">${r.o.d.x.slice(0,300)}…</td></tr>`).join('')+'</tbody></table></div>'
    : '<div class="bad">Nothing in the corpus matched. In a real system this is the moment to say "I do not know" — not to guess.</div>';

  if(!ground){
    const key = /bearing|fan/i.test(q)?'bearing' : /mill|pulveris/i.test(q)?'mill' :
                /conductiv|chemistr|cation/i.test(q)?'chem' : /afc|disallow|availab/i.test(q)?'afc' : 'default';
    $('s7-ans').innerHTML=`<div class="bad"><b>Ungrounded answer — no retrieval, no sources</b><p style="margin:8px 0 0">${HALLUC[key]}</p></div>
      <p class="small" style="margin-top:8px">Every figure above is invented. They are plausible, they are in the right
      units, they are in the right order of magnitude, and they are wrong. Nothing in the output tells you that.
      Compare them against the retrieved passages on the left.</p>`;
    $('s7-say').innerHTML=`<div class="bad"><b>This is what hallucination looks like.</b> Not gibberish — a confident,
      well-formatted, technically-shaped answer with specific numbers and no source. An engineer skimming it would
      have no reason to doubt it. Switch <b>Grounded</b> back on and read the difference.</div>`;
    return;
  }
  if(!R.length){ $('s7-ans').innerHTML='<div class="warn">No grounded answer is possible — nothing relevant was retrieved. A correctly built system answers "I could not find this in the indexed documents", and that is the right answer.</div>'; return; }

  const sents=[];
  R.forEach(r=>{
    r.o.d.x.split(/(?<=\.)\s+/).forEach(s=>{
      const t=tok(s), qt=new Set(tok(q));
      let hit=0; t.forEach(w=>{ if(qt.has(w)) hit++; });
      if(hit>0) sents.push({s:s.trim(), score:hit/Math.sqrt(t.length||1)*r.sc, cite:r.o.d});
    });
  });
  sents.sort((a,b)=>b.score-a.score);
  const use=sents.slice(0,5);
  $('s7-ans').innerHTML=`<div class="good"><b>Grounded answer — assembled only from the retrieved passages</b>
    <ul style="margin-top:8px">${use.map(u=>`<li>${u.s} <span class="pill nu">${u.cite.id} · ${u.cite.ver}</span></li>`).join('')}</ul></div>
    <p class="small" style="margin-top:8px"><b>Sources:</b> ${[...new Set(use.map(u=>u.cite.id+' ('+u.cite.t+', '+u.cite.ver+')'))].join(' · ')}</p>`;

  const filt=(station||unit)?`The corpus was filtered to ${station||'all stations'}${unit?', Unit '+unit:''} before retrieval — that metadata filter is what stops a Unit 4 question returning a Unit 3 answer. `:'';
  const kwn=R.reduce((a,b)=>a+b.kwHit,0);
  $('s7-say').innerHTML=`<div class="note"><b>Retrieval ran first, and you can see exactly what it found.</b>
    ${R.length} passages were scored by TF-IDF cosine similarity${kwn?' with '+kwn+' exact keyword hits added by hybrid search':''}.
    ${filt}Only those passages were used to answer, and every line carries its source and revision.
    ${hybrid?'':'<b>Hybrid search is off.</b> Turn it on and search for a specific tag number or document code — pure semantic similarity is poor at exact identifiers, which is precisely what engineers search for.'}</div>
    <p class="small">The important property is not that the answer is good. It is that the answer is
    <i>checkable</i>. If it cites SOP-BLR-014 Rev 4, you can open Rev 4 and look.</p>`;
}
(function(){
  buildIndex();
  const sts=[...new Set(DOCS.map(d=>d.st))].filter(s=>s!=='All');
  const uns=[...new Set(DOCS.map(d=>d.u))].filter(s=>s!=='All');
  sts.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;$('s7-station').appendChild(o);});
  uns.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent='Unit '+s;$('s7-unit').appendChild(o);});
  const P=['ID fan bearing temperature high — what should I check?',
           'What is the trip setting and bearing clearance for the ID fan?',
           'Has an ID fan bearing failed anywhere in the fleet before?',
           'Why is our auxiliary consumption above normative?',
           'How does the availability disallowance mechanism work?',
           'Mill differential pressure is rising — what do I do?',
           'Can an AI agent close a permit to work?'];
  $('s7-presets').innerHTML=P.map((p,i)=>`<button class="btn gh" style="margin:3px 0;width:100%;text-align:left;font-size:12px" data-p="${i}">${p}</button>`).join('');
  $('s7-presets').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{ $('s7-q').value=P[+b.dataset.p]; s7run(); }));
  $('s7-corpus').innerHTML='<div class="tw"><table><thead><tr><th>ID</th><th>Type</th><th>Scope</th></tr></thead><tbody>'+
    DOCS.map(d=>`<tr><td><b>${d.id}</b><br><span class="small">${d.t}</span></td><td><span class="pill nu">${d.ty}</span></td>`+
    `<td class="small">${d.st}${d.u!=='All'?' · U'+d.u:''}<br>${d.ver}</td></tr>`).join('')+'</tbody></table></div>';
  $('s7-go').addEventListener('click',s7run);
  $('s7-q').addEventListener('keydown',e=>{ if(e.key==='Enter') s7run(); });
  ['s7-k','s7-station','s7-unit'].forEach(id=>$(id).addEventListener('input',s7run));
  ['s7-ground','s7-kw'].forEach(id=>$(id).addEventListener('change',s7run));
  s7run();
})();
REDRAW.s7=()=>{};

/* ==========================================================
   SIM-8  Agentic assistant — reason / act / observe
   ========================================================== */
const TOOLS=[
 ['historian.query','Read process tags over a time range','read'],
 ['historian.residual','Fetch the load-normalised residual for a tag','read'],
 ['cmms.search','Search work orders, defects and history','read'],
 ['docs.search','Retrieval over SOPs, manuals and RCA reports','read'],
 ['perf.model','Compute heat-rate and availability consequence','read'],
 ['workorder.draft','Prepare a work order for human review','draft'],
 ['workorder.create','Create a work order in SAP','WRITE'],
 ['dcs.write','Write a setpoint to the control system','WRITE']
];
const STEPS=[
 {k:'goal',t:'Goal',b:`Triage the residual advisory on <b>Koradi Unit 8, ID fan A drive-end bearing</b>. Establish whether it is a real developing fault, a sensor problem or an operating-condition artefact. If real, estimate the consequence and prepare an action for engineering approval.`},
 {k:'plan',t:'Plan',b:`<ol><li>Retrieve the residual history and confirm persistence</li><li>Pull the underlying process tags and check for a sensor fault signature</li><li>Check the CMMS for recent interventions and open defects</li><li>Search the document corpus for the OEM limits and any fleet precedent</li><li>Estimate remaining life and the availability consequence</li><li>Draft a work order and an advisory note for approval</li></ol>`},
 {k:'tool',t:'historian.residual', q:`tag=KOR8_IDFA_DE_BRG_TEMP, window=120d, model=idfan_a_v3`,
  o:`Residual crossed +3.0 °C on day 94 and has held above it for 6 consecutive days.<br>Current residual +4.6 °C. Measured 74.2 °C. Expected 69.6 °C. Fixed alarm setpoint 90 °C.<br>EWMA slope +0.21 °C/day, monotonic.`,
  r:`Persistent and monotonic, not a spike. The measured value is 15.8 °C below the DCS alarm setpoint, so no alarm has operated and none will for some weeks. This has the shape of a real developing fault rather than noise.`},
 {k:'tool',t:'historian.query', q:`tags=[DE_BRG_TEMP, NDE_BRG_TEMP, LUBE_OIL_OUT_TEMP, CW_FLOW, MOTOR_CURRENT, VIB_DE_H, GAS_FLOW, AMBIENT], window=120d`,
  o:`DE bearing +4.6 °C residual · NDE bearing +0.4 °C · lube oil cooler outlet 47.8 °C, rising from 41.2 °C over the same period · cooling water flow to cooler down 11 % · motor current normal against gas flow · VIB_DE_H 3.4 mm/s, up from 2.9.`,
  r:`Two signals moved together with the bearing, and the companion bearing did not. A drifting or failed thermocouple would move alone. The lube oil cooler outlet temperature rising 6.6 °C with cooling water flow down 11 % is a coherent physical story: the cooler is fouling, oil temperature is rising, the oil film is thinning and the bearing is running hot. Vibration is rising but still well within limits.`},
 {k:'tool',t:'cmms.search', q:`equipment=KOR8-IDF-A, window=24 months, include=[work orders, defects, notifications]`,
  o:`No bearing intervention on ID fan A in 24 months. Last lube oil change 14 months ago. Oil cooler cleaning last recorded 19 months ago. One open defect: "ID fan A lube oil cooler CW inlet strainer choking frequently" raised 5 weeks ago, priority Low, unassigned. Next planned unit outage in 116 days.`,
  r:`The open defect matches the physical story exactly, and it has been sitting unassigned for five weeks at Low priority. The cooler has not been cleaned in 19 months. This raises confidence substantially — the analytics and the maintenance record are telling the same story independently.`},
 {k:'tool',t:'docs.search', q:`"ID fan bearing temperature limit trip clearance" + "lube oil cooler" + precedent across fleet`,
  o:`<b>OEM-IDF-221</b> — continuous limit 80 °C, alarm 90 °C, trip 100 °C; oil cooler outlet to be held 38–45 °C.<br><b>SOP-BLR-014 Rev 4</b> — response procedure above 85 °C.<br><b>RCA-2023-17</b> — Koradi Unit 9, September 2023: identical mechanism. Oil cooler blockage on the cooling water side, babbitt wear, 62-hour forced outage, 33.9 MU lost. Bearing had trended up for eleven weeks below the fixed alarm setpoint.`,
  r:`This is not a novel failure. The same mechanism took Unit 9 out for 62 hours in 2023, and the RCA for that event specifically recommended load-normalised trending instead of fixed-threshold alarming. The current oil cooler outlet of 47.8 °C is already above the OEM band of 38–45 °C.`},
 {k:'tool',t:'perf.model', q:`station=Koradi Units 8-10, event=forced outage 660 MW, duration=[2.5 d forced | 0.5 d in planned outage]`,
  o:`Koradi Units 8-10: PLF 66.62 %, MOD variable charge ₹3.2840/kWh, cumulative AFC disallowance ₹28.04 crore.<br>Forced outage, 2.5 days: ≈ 26.4 GWh not generated, plus pro-rata fixed-charge exposure. Estimated consequence <b>₹2.4–2.9 crore</b>.<br>Cooler cleaning inside the outage already planned in 116 days: marginal cost <b>under ₹10 lakh</b>.<br>Cleaning at an opportunity outage within 3 weeks: <b>₹35–45 lakh</b>.`,
  r:`The asymmetry decides it. Doing nothing risks a consequence roughly sixty times the cost of acting. But the degradation trend does not have to reach failure in 116 days for the action to be justified — at this slope it very likely will not survive that long anyway.`},
 {k:'tool',t:'workorder.draft', q:`equipment=KOR8-IDF-A, type=corrective, priority=High`,
  o:`<b>Draft work order — for approval</b><br>Equipment: Koradi Unit 8, ID fan A lube oil cooler and drive-end bearing<br>Priority: High (raised from the existing Low defect)<br>Scope: (1) Clean lube oil cooler cooling-water side and inlet strainer; (2) verify CW flow restored to design; (3) sample and analyse lube oil for wear debris and degradation; (4) record bearing housing vibration in three planes; (5) borescope drive-end bearing if oil analysis shows babbitt debris.<br>Window: opportunity outage within 3 weeks, or immediately on any unit shutdown<br>Evidence attached: residual trend, cooler outlet trend, CW flow trend, RCA-2023-17, OEM-IDF-221<br>Linked defect: existing Low-priority notification raised 5 weeks ago`,
  r:`Prepared as a draft. The agent has linked the existing defect rather than raising a duplicate, attached the evidence an engineer needs to judge it, and specified an oil analysis before any decision to open the bearing.`},
 {k:'gate',t:'Approval required',b:''}
];
const S8={i:0};
function s8render(){
  const el=$('s8-trace');
  if(!S8.i){ el.innerHTML='<p class="small">Press <b>Next step</b> to begin.</p>'; $('s8-gate').style.display='none'; $('s8-say').innerHTML='<p class="small">The explanation appears once the agent reaches the gate.</p>'; return; }
  let h='';
  for(let i=0;i<S8.i;i++){
    const s=STEPS[i];
    if(s.k==='goal'||s.k==='plan'){
      h+=`<div class="note" style="margin-bottom:10px"><b>${s.t}</b><div style="margin-top:6px">${s.b}</div></div>`;
    } else if(s.k==='tool'){
      h+=`<div class="card" style="margin-bottom:10px;background:#FBFCFD">
        <div style="font:700 12px ui-monospace,Consolas,monospace;color:#11707F">▸ ${s.t}
          <span class="pill ok" style="margin-left:6px">read-only</span></div>
        <pre style="margin:8px 0">${s.q}</pre>
        <div class="small" style="margin-bottom:8px"><b>Returned:</b><br>${s.o}</div>
        <div class="good"><b>Agent reasoning:</b> ${s.r}</div></div>`;
    } else if(s.k==='gate'){
      h+=`<div class="warn"><b>The agent has stopped.</b> It has drafted an action and will not proceed further
        without a named human decision. Total elapsed: about 90 seconds.</div>`;
    }
  }
  el.innerHTML=h;
  if(S8.i>=STEPS.length){
    $('s8-gate').style.display='';
    $('s8-gatebody').innerHTML=`<p><b>Decision required from:</b> Deputy Executive Engineer (Mechanical Maintenance), Koradi Unit 8.</p>
      <p class="small">Before approving, check: does the residual story match anything you know about this machine that
      the data does not show? Has the cooler already been cleaned without a record? Is the oil analysis worth doing
      before committing to an outage window? Is High the right priority given the other work in the same window?</p>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn" id="s8-ok">Approve the work order</button>
        <button class="btn gh" id="s8-rej">Reject — I know something the data does not</button>
      </div><div id="s8-out" style="margin-top:10px"></div>`;
    $('s8-ok').onclick=()=>{ $('s8-out').innerHTML=`<div class="good"><b>Work order raised under your name.</b>
      The agent prepared it; you own it. The audit trail records the evidence it used, the tools it called, the
      version of each document it cited, and your approval. If the decision turns out to be wrong, every step is
      reconstructable — which is precisely why the gate exists.</div>`; };
    $('s8-rej').onclick=()=>{ $('s8-out').innerHTML=`<div class="note"><b>Rejected, with a reason recorded.</b>
      This is not a failure of the agent — it is the system working. Your rejection reason becomes training signal:
      if the agent repeatedly misjudges this machine, that is a model problem worth fixing. An agent nobody ever
      overrules is an agent nobody is really reading.</div>`; };
    $('s8-say').innerHTML=`<div class="note"><b>What the agent actually did.</b> It called six read-only tools in an
      order it chose, and at each step it used the result to decide what to ask next. It did not follow a fixed
      script: when the residual turned out to be persistent, it went looking for a sensor-fault signature; when the
      process tags told a cooler-fouling story, it went to the CMMS to see whether anyone had already noticed; when
      the CMMS produced a five-week-old unassigned defect, it went to the document corpus for precedent and found
      the 2023 Unit 9 RCA describing the identical mechanism.</div>
      <p><b>What it got right:</b> it distinguished a sensor fault from a machine fault using the companion bearing;
      it linked the existing defect instead of raising a duplicate; it costed the decision using Koradi's own
      variable charge and its own AFC position; and it asked for an oil analysis before proposing to open a bearing.</p>
      <p><b>What it could get wrong:</b> the residual model itself could be stale after an intervention nobody
      recorded. The RCA precedent is suggestive, not proof — the same symptoms can have different causes. The cost
      model assumes a 2.5-day forced outage, which is an assumption, not a measurement. And it cannot know that the
      cooler was cleaned last month by a contractor who never raised a notification.</p>
      <p><b>Which is why an engineer signs.</b> The agent compressed roughly half a day of investigation into ninety
      seconds and laid out its evidence. It did not make the decision.</p>`;
  } else { $('s8-gate').style.display='none'; }
}
$('s8-step').onclick=()=>{ if(S8.i<STEPS.length){S8.i++; s8render();} };
$('s8-all').onclick=()=>{ S8.i=STEPS.length; s8render(); };
$('s8-reset').onclick=()=>{ S8.i=0; s8render(); };
$('s8-write').addEventListener('change',()=>{
  $('s8-writewarn').innerHTML = $('s8-write').checked ?
   `<div class="bad" style="margin-top:10px"><b>Do not do this.</b> An agent with write access to the CMMS will
    eventually raise a duplicate work order at 3 a.m. against the wrong equipment number, and nobody will know
    where it came from. An agent with write access to the DCS is a category error — it puts a statistical model
    inside the control path of a 660 MW machine, with no deterministic behaviour, no safety rating and no
    verification. Read-only access costs you almost nothing in capability and removes the entire class of risk.
    The worst outcome of a read-only agent is bad advice. The worst outcome of a write-capable one is a unit.</div>` : '';
  s8tools();
});
function s8tools(){
  const w=$('s8-write').checked;
  $('s8-tools').innerHTML=TOOLS.map(t=>{
      const on = t[2]!=='WRITE' || w;
      const pill = t[2]==='WRITE' ? (w?'<span class="pill er">GRANTED</span>':'<span class="pill nu">denied</span>')
                 : t[2]==='draft' ? '<span class="pill wn">draft</span>' : '<span class="pill ok">read</span>';
      return `<div class="toolrow" style="${on?'':'opacity:.45'}">
        <div style="flex:1"><code>${t[0]}</code><div class="tp">${t[1]}</div></div>
        <div style="flex:0 0 auto;padding-top:1px">${pill}</div></div>`;
    }).join('');
}
s8tools(); s8render();
REDRAW.s8=()=>{};

/* ==========================================================
   DATA reference tables
   ========================================================== */
function diagnose(s){
  if(s.hrGap<=0) return 'Already at or better than norm';
  const auxComp = s.ghrAct*(1/(1-s.aux_act/100) - 1/(1-s.aux_norm/100));
  const share = auxComp/s.hrGap;
  if(share>=0.80) return 'Auxiliary power is essentially the whole problem ('+(share*100).toFixed(0)+' %)';
  if(share>=0.55) return 'Mostly auxiliary power ('+(share*100).toFixed(0)+' %)';
  if(share<=0.20) return 'Mostly boiler and turbine ('+((1-share)*100).toFixed(0)+' %)';
  if(share<=0.45) return 'Mainly boiler and turbine ('+((1-share)*100).toFixed(0)+' %)';
  return 'Both, roughly balanced';
}
(function(){
  const T=(head,rows)=>'<div class="tw"><table><thead><tr>'+head.map((h,i)=>`<th class="${i?'num':''}">${h}</th>`).join('')+
    '</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map((c,i)=>`<td class="${i?'num':''}">${c}</td>`).join('')+'</tr>').join('')+'</tbody></table></div>';
  $('d-t1').innerHTML=T(['Station','Cap MW','Avail %','PLF %','Gross MU','Net MU','Net HR','Norm','Gap'],
    ST.map(s=>[s.station,s.cap,fmt(s.avail,2),fmt(s.plf,2),fmt(s.gross,2),fmt(s.net,2),fmt(s.hr_act,0),fmt(s.hr_norm,0),'+'+fmt(s.hrGap,0)]));
  $('d-t2').innerHTML=T(['Station','Aux %','Norm %','Gap pp','Gross HR','Norm','Gross gap','Diagnosis'],
    ST.map(s=>[s.station,fmt(s.aux_act,2),fmt(s.aux_norm,2),'+'+fmt(s.auxGap,2),fmt(s.ghrAct,0),fmt(s.ghrNorm,0),
      (s.ghrGap>0?'+':'')+fmt(s.ghrGap,0),
      diagnose(s)]));
  $('d-t3').innerHTML=T(['Station','MOD VC ₹/kWh','Bill rate ₹/kWh','As-fired GCV','₹/kcal','Implied coal ₹/t'],
    ST.map(s=>[s.station,fmt(s.vc_mod,4),fmt(s.vc_bill,3),fmt(s.gcv_fired,0),s.rsKcal.toFixed(6),fmt(s.coalRsT,0)]));
  $('d-t4').innerHTML=T(['Station','Net HR gap ₹cr/mth','Aux excess MU','Aux excess ₹cr/mth','AFC disallowance ₹cr'],
    ST.map(s=>[s.station,fmt(s.hrGapCr,2),fmt(Math.max(0,s.auxMU),2),fmt(Math.max(0,s.auxCr),2),fmt(s.afc_cr,2)]));
})();

/* first paint */
s1(); s2(); s3(); s4(); s5(); s6();
