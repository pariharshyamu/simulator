/* =========================================================================
   MAHAGENCO Predictive Maintenance End-to-End Simulator — core
   Physics, 3D scenes and algorithms. Everything runs in the browser.
   ========================================================================= */
'use strict';
const $ = id => document.getElementById(id);
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const fmt = (x,d=2) => Number(x).toLocaleString('en-IN',{minimumFractionDigits:d,maximumFractionDigits:d});
const cr  = x => '₹'+fmt(x,2)+' cr';
const lakh= x => '₹'+fmt(x,1)+' lakh';
function rng(seed){ let s=(seed>>>0)||1; return ()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; }
function gauss(r){ let u=0,v=0; while(!u)u=r(); while(!v)v=r(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
const mean = a => a.reduce((x,y)=>x+y,0)/(a.length||1);
const sd   = a => { const m=mean(a); return Math.sqrt(a.reduce((x,y)=>x+(y-m)*(y-m),0)/(a.length||1))||1e-9; };

/* ---------- June 2026 station economics (from the MAHAGENCO filing) ---------- */
const ST = {
  'Koradi Units 8-10':{unitMW:660, plf:66.62, vc:3.2840, hr:2442.18, afc:28.04},
  'Nashik Units 3-5' :{unitMW:210, plf:58.40, vc:5.9800, hr:2803.80, afc:0},
  'Chandrapur Units 3-7':{unitMW:500, plf:53.56, vc:4.1330, hr:2709.30, afc:23.94},
  'Khaperkheda Units 1-4':{unitMW:210, plf:54.55, vc:3.6490, hr:2714.99, afc:21.75},
  'Bhusawal Unit 6'  :{unitMW:660, plf:70.37, vc:3.4410, hr:2183.13, afc:7.88}
};
function outageCost(stName, days){
  const s = ST[stName];
  const mwh = s.unitMW*24*days*(s.plf/100);
  return mwh*1000*s.vc/1e7 + (s.afc>0 ? s.afc*days/30 : 0.3*days);   // ₹ crore
}

/* =========================================================================
   1. EQUIPMENT CASES
   ========================================================================= */
/* A FULL YEAR, and the reason is section 2.3.

   "Typically 12 to 24 months, and it must span the full load range the unit
   actually operates over; both seasons — a model trained on winter data
   alarms all summer."

   Over a 200-day window that sentence was untestable: the old ambient term
   was 6.5*sin(day/60*PI), a decorative wiggle with no season in it. A model
   trained on any part of it worked on any other part, so the single most
   common way these projects fail could be taught only in prose.

   Day 0 is 1 January. */
const HOURS_PER_DAY = 24, DAYS = 365, N = DAYS*HOURS_PER_DAY;
const MONTH_START = [0,31,59,90,120,151,181,212,243,273,304,334];
const MONTH_NAME  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const dayToMonth = d => { let m=11; while(m>0 && d<MONTH_START[m]) m--; return m; };
const dayLabel = d => `${Math.round(d-MONTH_START[dayToMonth(d)])+1} ${MONTH_NAME[dayToMonth(d)]}`;

/* Nashik daily mean dry-bulb, by month. Not a sinusoid: it climbs to a May
   peak, drops sharply when the monsoon arrives in June, stays suppressed
   through September, lifts a little in October and then falls to a January
   minimum. One sine wave cannot produce that shape, which is exactly why a
   model fitted to one season mis-predicts another. */
const AMB_MEAN  = [21.0, 23.5, 27.5, 31.0, 33.5, 29.0, 25.5, 24.5, 25.5, 26.5, 23.5, 21.0];
/* Diurnal swing is widest in the dry pre-monsoon months and collapses under
   monsoon cloud — so ambient variance itself is seasonal. */
const AMB_SWING = [ 7.5,  8.0,  8.5,  9.0,  8.5,  5.0,  3.0,  3.0,  4.0,  6.5,  7.5,  7.5];

function smoothMonthly(table, day){
  /* interpolate between month mid-points so the year is continuous and wraps */
  const mid = i => MONTH_START[i] + (( (MONTH_START[(i+1)%12] - MONTH_START[i] + 365) % 365 ) || 31)/2;
  let a = 11;
  for (let i = 0; i < 12; i++) if (day >= mid(i)) a = i;
  const b = (a + 1) % 12;
  let span = mid(b) - mid(a); if (span <= 0) span += 365;
  let t = (day - mid(a)); if (t < 0) t += 365;
  t = clamp(t / span, 0, 1);
  const s = t * t * (3 - 2 * t);                       // smoothstep, no kinks
  return table[a] * (1 - s) + table[b] * s;
}

/* shared plant context: load, ambient, cooling water */
function context(seed){
  const r = rng(seed), L=[], A=[], CW=[];
  let load = 0.80;
  for(let i=0;i<N;i++){
    const day = i/24, hod = i%24, dow = Math.floor(day)%7;
    const night = (hod<6||hod>22) ? -0.13 : 0;
    const weekend = (dow===0) ? -0.10 : 0;
    /* Demand follows the weather: a hot May afternoon and a cold January
       night both pull the fleet up, and the monsoon pulls it down. */
    const mo = dayToMonth(Math.floor(day));
    const season = (mo>=3 && mo<=4) ? 0.06 : (mo>=5 && mo<=8) ? -0.05 : 0;
    load += (0.80+night+weekend+season-load)*0.22 + gauss(r)*0.020;
    load = clamp(load, 0.45, 1.0);
    const mean  = smoothMonthly(AMB_MEAN,  day);
    const swing = smoothMonthly(AMB_SWING, day);
    /* peak at about 15:00, minimum about 05:00 */
    const amb = mean - swing*Math.cos((hod-5)/24*2*Math.PI) + gauss(r)*0.9;
    /* cooling water lags air temperature — a large basin has thermal inertia */
    const cwLag = smoothMonthly(AMB_MEAN, day-9);
    L.push(load); A.push(amb);
    CW.push(cwLag - 1.5 + 0.35*(amb-mean) + gauss(r)*0.5);
  }
  return {load:L, amb:A, cw:CW};
}

/* fault severity 0..1, power-law growth after onset */
function faultProfile(onsetDay, ttfDays, shape){
  const f = new Float64Array(N);
  const o = onsetDay*24, span = ttfDays*24;
  for(let i=0;i<N;i++) f[i] = i<=o ? 0 : clamp(Math.pow((i-o)/span, shape), 0, 1.35);
  return f;
}

const CASES = {

/* ---------------------------------------------------------------- ID fan */
idfan:{
  id:'idfan', short:'ID fan bearing', name:'ID fan — drive-end bearing',
  scene:'rotor', variant:'fan', station:'Koradi Units 8-10',
  blurb:'Induced draught fan A, drive-end journal bearing. The failure that took Unit 9 out for 62 hours in 2023.',
  mode:'Lube oil cooler fouls on the cooling-water side → oil temperature rises → oil film thins → babbitt wear',
  onset:200, ttf:110, shape:1.7,
  failWhen:'Bearing metal temperature reaches the 100 °C trip, or babbitt wipes',
  outageDays:2.5, plannedDays:0.4, outageIn:300,
  sensors:[
    {id:'brgT',  n:'DE bearing metal temperature', u:'°C',   pos:[-1.15,0.62,0], key:1, have:1, rate:'1 min', why:'The signal the fault ends up in'},
    {id:'brgT2', n:'NDE bearing metal temperature',u:'°C',   pos:[ 1.55,0.62,0], key:1, have:1, rate:'1 min', why:'The companion — a sensor fault moves alone, a machine fault does not'},
    {id:'oilT',  n:'Lube oil cooler outlet temp',  u:'°C',   pos:[-0.2,-0.62,0.95], key:1, have:1, rate:'1 min', why:'Where this failure actually starts'},
    {id:'cwF',   n:'Cooler cooling-water flow',    u:'%',    pos:[0.55,-0.62,0.95], key:1, have:0, rate:'1 min', why:'Confirms the mechanism; often not instrumented'},
    {id:'vib',   n:'Bearing housing vibration',    u:'mm/s', pos:[-1.15,0.20,0.55], key:1, have:1, rate:'1 min', why:'Late but unambiguous'},
    {id:'motI',  n:'Fan motor current',            u:'A',    pos:[2.75,0.25,0], key:0, have:1, rate:'1 min', why:'Load proxy; needed to normalise'},
    {id:'gasF',  n:'Flue gas flow',                u:'%',    pos:[0,1.15,-1.0], key:0, have:1, rate:'1 min', why:'Duty — the biggest driver of bearing temperature'},
    {id:'amb',   n:'Ambient temperature',          u:'°C',   pos:[2.2,1.35,1.1], key:0, have:1, rate:'5 min', why:'Without it, every summer afternoon looks like a fault'}
  ],
  gen(ctx, f, r, opt){
    const d={}; ['brgT','brgT2','oilT','cwF','vib','motI','gasF','amb'].forEach(k=>d[k]=new Float64Array(N));
    for(let i=0;i<N;i++){
      const L=ctx.load[i], A=ctx.amb[i], CW=ctx.cw[i], F=f[i];
      d.cwF[i]  = 100 - 16*F + gauss(r)*0.8;
      /* THE KNEE, and it is the whole reason this dataset is a year long.
         A lube oil cooler is sized for a design cooling-water temperature.
         Below it the oil outlet tracks ambient almost linearly. Above it the
         cooler runs out of approach and the oil temperature climbs far
         faster than the water does.

         Fit a straight line to January and February — cooling water 19 to
         22 °C, entirely below the knee — and it extrapolates confidently
         into May and is badly wrong, because it never saw the knee exist.
         That is section 2.3's "a model trained on winter data alarms all
         summer", and without a non-linearity somewhere in the physics it
         cannot be demonstrated: a linear model of a linear plant
         extrapolates perfectly and the warning looks like superstition. */
      const CW_DESIGN = 27.5;
      const knee = Math.max(0, CW - CW_DESIGN);
      d.oilT[i] = 42 + 0.38*(A-31) + 3.2*L + 1.35*Math.pow(knee, 1.45) + 9.5*F + gauss(r)*0.45;
      d.vib[i]  = 2.30 + 1.35*L + 5.4*Math.pow(F,1.5) + gauss(r)*0.09*opt.noise;
      d.brgT[i] = 39 + 16.5*L + 0.42*(A-31) + 0.62*(d.oilT[i]-42) + 27*F + gauss(r)*0.42*opt.noise;
      d.brgT2[i]= 39 + 15.8*L + 0.40*(A-31) + 0.55*(d.oilT[i]-42) + gauss(r)*0.42*opt.noise;
      d.motI[i] = 148 + 96*Math.pow(L,2.4) + gauss(r)*1.1;
      d.gasF[i] = 100*L + gauss(r)*0.7;
      d.amb[i]  = A;
    }
    return d;
  },
  health: d => d.brgT, healthName:'DE bearing metal temperature', healthUnit:'°C',
  trip:100, alarm:90, normalBand:[55,78],
  features:[
    {id:'raw',  n:'Raw bearing temperature',            desc:'The tag as it comes',                    good:0},
    {id:'norm', n:'Load- and ambient-normalised temp',  desc:'Residual against expected for this duty', good:1},
    {id:'delta',n:'DE minus NDE bearing temperature',   desc:'Kills common-mode drift and sensor bias', good:1},
    {id:'oilD', n:'Oil temperature rise across cooler', desc:'Points at the actual mechanism',          good:1},
    {id:'vibR', n:'Vibration normalised to speed/duty', desc:'Late but decisive',                       good:1},
    {id:'roll', n:'7-day rolling mean and slope',       desc:'Suppresses shift-to-shift noise',         good:1},
    {id:'hod',  n:'Hour of day',                        desc:'Correlates with everything and means nothing', good:0},
    {id:'dayn', n:'Day number',                         desc:'A leakage trap — it encodes the answer',  good:-1}
  ]
},

/* ------------------------------------------------------------- HT motor */
motor:{
  id:'motor', short:'HT motor rotor bar', name:'HT motor — broken rotor bar',
  scene:'rotor', variant:'motor', station:'Khaperkheda Units 1-4',
  blurb:'6.6 kV induced draught fan motor. A cracked rotor bar, invisible to every temperature sensor on the machine.',
  mode:'Thermal cycling cracks a rotor bar → current sidebands at ±2sf appear → adjacent bars overload and crack in turn',
  onset:210, ttf:100, shape:2.1,
  failWhen:'Sufficient bars crack to trip on overload, or the bar lifts and destroys the stator',
  outageDays:3.5, plannedDays:0.8, outageIn:310,
  sensors:[
    {id:'sb',    n:'Current sideband at ±2sf',    u:'dB',  pos:[2.55,0.30,0.35], key:1, have:0, rate:'waveform, 5 kHz', why:'The only early indicator. Needs a waveform, not a one-minute average'},
    {id:'statI', n:'Stator current, RMS',         u:'A',   pos:[2.55,-0.10,0.35], key:1, have:1, rate:'1 min', why:'What the historian actually stores'},
    {id:'windT', n:'Stator winding RTD',          u:'°C',  pos:[0.35,0.70,0.30], key:1, have:1, rate:'1 min', why:'Rises late, and only a little'},
    {id:'slip',  n:'Slip',                        u:'%',   pos:[-0.75,0.66,0], key:0, have:0, rate:'1 min', why:'Needed to compute where the sidebands should be'},
    {id:'vib',   n:'Bearing housing vibration',   u:'mm/s',pos:[-1.15,0.20,0.55], key:1, have:1, rate:'1 min', why:'Shows a 2sf beat once it is severe'},
    {id:'brgT',  n:'DE bearing temperature',      u:'°C',  pos:[-1.15,0.62,0], key:0, have:1, rate:'1 min', why:'Largely blind to this fault — a useful negative'},
    {id:'volt',  n:'Supply voltage',              u:'V',   pos:[2.9,0.75,0], key:0, have:1, rate:'1 min', why:'Unbalance alone can mimic a rotor fault'},
    {id:'amb',   n:'Ambient temperature',         u:'°C',  pos:[2.2,1.35,1.1], key:0, have:1, rate:'5 min', why:'Normalisation'}
  ],
  gen(ctx, f, r, opt){
    const d={}; ['sb','statI','windT','slip','vib','brgT','volt','amb'].forEach(k=>d[k]=new Float64Array(N));
    for(let i=0;i<N;i++){
      const L=ctx.load[i], A=ctx.amb[i], F=f[i];
      d.sb[i]    = -54 + 26*Math.pow(F,0.75) + gauss(r)*0.9*opt.noise;
      d.slip[i]  = 0.85 + 0.55*L + 0.22*F + gauss(r)*0.02;
      d.statI[i] = 146 + 92*Math.pow(L,2.4) + 3.5*F + gauss(r)*1.3*opt.noise;
      d.windT[i] = 62 + 34*L + 0.35*(A-31) + 7*F*F + gauss(r)*0.6*opt.noise;
      d.vib[i]   = 2.1 + 1.1*L + 2.4*Math.pow(F,2.2) + gauss(r)*0.08*opt.noise;
      d.brgT[i]  = 44 + 14*L + 0.40*(A-31) + 1.4*F + gauss(r)*0.45*opt.noise;
      d.volt[i]  = 6600 + gauss(r)*22;
      d.amb[i]   = A;
    }
    return d;
  },
  health: d => d.sb, healthName:'±2sf sideband amplitude', healthUnit:'dB',
  trip:-26, alarm:-34, normalBand:[-56,-48], inverted:true,
  features:[
    {id:'raw',  n:'Raw stator current',                  desc:'One-minute RMS — the sidebands are already gone', good:0},
    {id:'sbAmp',n:'Sideband amplitude at ±2sf',          desc:'Requires waveform capture at the machine',        good:1},
    {id:'norm', n:'Current normalised to load',          desc:'Removes duty; leaves a small real rise',          good:1},
    {id:'vibR', n:'Vibration 2sf beat component',        desc:'Confirms, late',                                  good:1},
    {id:'wTres',n:'Winding temperature residual',        desc:'Weak but independent',                            good:1},
    {id:'unbal',n:'Voltage unbalance',                   desc:'Rules out the supply as the cause',               good:1},
    {id:'hod',  n:'Hour of day',                         desc:'Spurious',                                        good:0},
    {id:'dayn', n:'Day number',                          desc:'A leakage trap',                                  good:-1}
  ]
},

/* ------------------------------------------------------------- coal mill */
mill:{
  id:'mill', short:'Coal mill wear', name:'Coal mill — grinding element wear',
  scene:'mill', variant:'bowl', station:'Nashik Units 3-5',
  blurb:'Bowl mill C. Grinding elements wearing towards end of life, with choking risk rising as they go.',
  mode:'Roller and bull-ring wear → grinding pressure spreads → fineness falls, differential pressure rises, choking risk climbs',
  onset:195, ttf:130, shape:1.35,
  failWhen:'Mill chokes and trips the feeder, or fineness falls far enough to force a load reduction',
  outageDays:0.8, plannedDays:0.3, outageIn:315,
  sensors:[
    {id:'dp',    n:'Mill differential pressure', u:'mbar', pos:[0,1.35,0.85], key:1, have:1, rate:'1 min', why:'Rises as the grinding bed thickens and the classifier loads'},
    {id:'milI',  n:'Mill motor current',         u:'A',    pos:[0,-1.45,1.05], key:1, have:1, rate:'1 min', why:'Grinding work; falls suddenly when the mill chokes'},
    {id:'outT',  n:'Mill outlet temperature',    u:'°C',   pos:[0.95,1.75,0], key:1, have:1, rate:'1 min', why:'Drying duty; falls before a choke'},
    {id:'feed',  n:'Feeder speed',               u:'%',    pos:[-1.25,2.05,0], key:1, have:1, rate:'1 min', why:'The denominator for everything else'},
    {id:'paF',   n:'Primary air flow',           u:'t/h',  pos:[-1.55,-0.35,0.7], key:1, have:1, rate:'1 min', why:'Carries the fines out; sets the classifier load'},
    {id:'rej',   n:'Mill reject rate',           u:'kg/h', pos:[0,-1.85,0], key:1, have:0, rate:'batch',why:'Direct wear indicator, rarely instrumented'},
    {id:'vib',   n:'Mill body vibration',        u:'mm/s', pos:[1.35,0.15,0.55], key:0, have:1, rate:'1 min', why:'Uneven bed, roller skidding'},
    {id:'gcv',   n:'As-fired GCV from lab',      u:'kcal/kg', pos:[-1.55,2.35,0.6], key:0, have:1, rate:'1 day', why:'Coal changes look exactly like wear if you ignore this'}
  ],
  gen(ctx, f, r, opt){
    const d={}; ['dp','milI','outT','feed','paF','rej','vib','gcv'].forEach(k=>d[k]=new Float64Array(N));
    let gcvBase = 3000;
    for(let i=0;i<N;i++){
      const L=ctx.load[i], F=f[i];
      if(i%(24*11)===0) gcvBase = 2915 + gauss(r)*130;               // a new coal source arrives
      const gcv = gcvBase + 40*Math.sin(i/300) + gauss(r)*25;
      const coal = 46*L*(3000/gcv);
      const choke = Math.max(0, F-0.55) * (0.5+0.5*Math.sin(i/91));   // choking episodes late in life
      d.gcv[i]  = gcv;
      d.feed[i] = coal/46*100 + gauss(r)*0.8;
      d.paF[i]  = 62 + 24*L + 4*F + gauss(r)*0.7;
      d.dp[i]   = 38 + 26*L + 19*F + 22*choke + gauss(r)*0.9*opt.noise;
      d.milI[i] = 42 + 26*L + 7.5*F - 16*choke + gauss(r)*0.6*opt.noise;
      d.outT[i] = 78 + 3*L - 5.5*F - 11*choke + gauss(r)*0.55*opt.noise;
      d.rej[i]  = 180 + 90*L + 520*F + gauss(r)*22;
      d.vib[i]  = 3.0 + 1.2*L + 3.4*Math.pow(F,1.6) + 4*choke + gauss(r)*0.14*opt.noise;
    }
    return d;
  },
  health: d => d.dp, healthName:'Mill differential pressure', healthUnit:'mbar',
  trip:105, alarm:92, normalBand:[52,78],
  features:[
    {id:'raw',  n:'Raw differential pressure',        desc:'Moves with load more than with wear',        good:0},
    {id:'dpF',  n:'Differential pressure per t/h fed',desc:'The classic wear indicator',                 good:1},
    {id:'iF',   n:'Motor current per t/h fed',        desc:'Specific grinding power',                    good:1},
    {id:'dTout',n:'Outlet temperature residual',      desc:'Early warning of a choke, hours ahead',      good:1},
    {id:'paR',  n:'PA flow to coal flow ratio',       desc:'Classifier loading',                         good:1},
    {id:'gcvN', n:'Correction for as-fired GCV',      desc:'Without it, a coal change reads as wear',    good:1},
    {id:'hod',  n:'Hour of day',                      desc:'Spurious',                                   good:0},
    {id:'dayn', n:'Day number',                       desc:'A leakage trap',                             good:-1}
  ]
},

/* -------------------------------------------------------------------- BFP */
bfp:{
  id:'bfp', short:'BFP seal & cavitation', name:'Boiler feed pump — seal wear and cavitation',
  scene:'rotor', variant:'pump', station:'Chandrapur Units 3-7',
  blurb:'Motor-driven boiler feed pump B. Mechanical seal wearing, with NPSH margin eroding at low load.',
  mode:'Seal faces wear → leak-off rises and bearing runs hot; separately, deaerator level and low-load running erode NPSH margin → intermittent cavitation',
  onset:205, ttf:105, shape:1.55,
  failWhen:'Seal fails and the pump must be taken out, or cavitation damages the first-stage impeller',
  outageDays:1.8, plannedDays:0.5, outageIn:300,
  sensors:[
    {id:'leak', n:'Seal leak-off flow',        u:'l/min', pos:[-0.95,-0.30,0.75], key:1, have:1, rate:'1 min', why:'Direct seal condition'},
    {id:'brgT', n:'Thrust bearing temperature',u:'°C',    pos:[-1.15,0.62,0], key:1, have:1, rate:'1 min', why:'Rises with seal and thrust load'},
    {id:'vib',  n:'Pump vibration, broadband', u:'mm/s',  pos:[0.35,0.55,0.60], key:1, have:1, rate:'1 min', why:'Cavitation shows as raised broadband noise'},
    {id:'dP',   n:'Developed head',            u:'bar',   pos:[1.15,0.80,0], key:1, have:1, rate:'1 min', why:'Hydraulic performance drift'},
    {id:'flow', n:'Feedwater flow',            u:'t/h',   pos:[1.75,0.10,0.55], key:1, have:1, rate:'1 min', why:'The operating point'},
    {id:'npsh', n:'NPSH margin',               u:'m',     pos:[-1.85,0.10,0.55], key:1, have:0, rate:'derived', why:'Rarely computed online, and it is the whole cavitation story'},
    {id:'motI', n:'Motor current',             u:'A',     pos:[2.55,0.25,0], key:0, have:1, rate:'1 min', why:'Power drawn'},
    {id:'sucT', n:'Suction temperature',       u:'°C',    pos:[-1.85,-0.30,0.55], key:0, have:1, rate:'1 min', why:'Sets the vapour pressure in the NPSH calculation'}
  ],
  gen(ctx, f, r, opt){
    const d={}; ['leak','brgT','vib','dP','flow','npsh','motI','sucT'].forEach(k=>d[k]=new Float64Array(N));
    for(let i=0;i<N;i++){
      const L=ctx.load[i], A=ctx.amb[i], F=f[i];
      const cav = L<0.58 ? (0.58-L)*3.1 : 0;
      d.sucT[i] = 158 + 6*L + gauss(r)*0.4;
      d.npsh[i] = 12.5 - 5.5*cav - 1.2*F + gauss(r)*0.25;
      d.flow[i] = 720*L + gauss(r)*4;
      d.dP[i]   = 178 - 26*L*L - 6*F + gauss(r)*0.6*opt.noise;
      d.leak[i] = 0.9 + 0.35*L + 3.6*Math.pow(F,1.4) + gauss(r)*0.06*opt.noise;
      d.brgT[i] = 58 + 15*L + 0.30*(A-31) + 14*F + gauss(r)*0.45*opt.noise;
      d.vib[i]  = 2.0 + 1.0*L + 2.6*Math.pow(F,1.5) + 5.2*cav + gauss(r)*0.10*opt.noise;
      d.motI[i] = 210 + 160*Math.pow(L,2.1) + gauss(r)*1.6;
    }
    return d;
  },
  health: d => d.leak, healthName:'Seal leak-off flow', healthUnit:'l/min',
  trip:5.2, alarm:4.0, normalBand:[1.0,1.9],
  features:[
    {id:'raw',  n:'Raw leak-off flow',            desc:'Moves with load and pressure too',        good:0},
    {id:'norm', n:'Leak-off normalised to head',  desc:'The seal condition on its own',           good:1},
    {id:'bres', n:'Bearing temperature residual', desc:'Independent confirmation',                good:1},
    {id:'vibHF',n:'Vibration high-frequency band',desc:'Separates cavitation from seal wear',     good:1},
    {id:'headD',n:'Head deviation from the curve',desc:'Hydraulic degradation',                   good:1},
    {id:'npshM',n:'Computed NPSH margin',         desc:'Explains the cavitation episodes entirely',good:1},
    {id:'hod',  n:'Hour of day',                  desc:'Spurious',                                good:0},
    {id:'dayn', n:'Day number',                   desc:'A leakage trap',                          good:-1}
  ]
},

/* ------------------------------------------------------------ transformer */
xfmr:{
  id:'xfmr', short:'Transformer hotspot', name:'Generator transformer — cooling degradation',
  scene:'xfmr', variant:'gt', station:'Bhusawal Unit 6',
  blurb:'Generator transformer. Radiator fouling and one cooler bank underperforming, with the winding running hotter than the thermal model says it should.',
  mode:'Radiator fouling and a failing cooler fan → oil and winding temperature rise above the thermal model → paper ageing accelerates and gassing begins',
  onset:190, ttf:140, shape:1.45,
  failWhen:'Hotspot exceeds the insulation limit; gassing crosses the action level and the unit must be derated',
  outageDays:5.0, plannedDays:1.0, outageIn:320,
  sensors:[
    {id:'topOil',n:'Top oil temperature',      u:'°C',   pos:[0,1.30,0.95], key:1, have:1, rate:'1 min', why:'The workhorse measurement'},
    {id:'wti',   n:'Winding temperature (WTI)',u:'°C',   pos:[0.55,1.30,0.95], key:1, have:1, rate:'1 min', why:'A thermal image, not a real measurement — know the difference'},
    {id:'loadI', n:'Load current',             u:'A',    pos:[-1.35,1.85,0], key:1, have:1, rate:'1 min', why:'Drives the whole thermal model'},
    {id:'ambT',  n:'Ambient temperature',      u:'°C',   pos:[2.05,1.05,1.15], key:1, have:1, rate:'5 min', why:'The other half of the thermal model'},
    {id:'h2',    n:'Dissolved hydrogen',       u:'ppm',  pos:[-1.25,0.10,1.05], key:1, have:0, rate:'online or 3-monthly', why:'The earliest chemical evidence of overheating'},
    {id:'c2h4',  n:'Dissolved ethylene',       u:'ppm',  pos:[-1.25,-0.35,1.05], key:1, have:0, rate:'3-monthly', why:'Marks thermal fault severity in the Duval triangle'},
    {id:'coolI', n:'Cooler bank motor current',u:'A',    pos:[1.75,0.35,0], key:1, have:0, rate:'1 min', why:'Tells you the cooling is failing before the oil does'},
    {id:'oilLvl',n:'Oil level',                u:'%',    pos:[0,1.60,0], key:0, have:1, rate:'1 min', why:'Rules out a leak as the cause'}
  ],
  gen(ctx, f, r, opt){
    const d={}; ['topOil','wti','loadI','ambT','h2','c2h4','coolI','oilLvl'].forEach(k=>d[k]=new Float64Array(N));
    for(let i=0;i<N;i++){
      const L=ctx.load[i], A=ctx.amb[i], F=f[i];
      d.loadI[i]  = 620*L + gauss(r)*4;
      d.ambT[i]   = A;
      d.coolI[i]  = 46 - 15*F + gauss(r)*0.5;
      d.topOil[i] = A + 22*Math.pow(L,1.8) + 44*F + gauss(r)*0.5*opt.noise;
      d.wti[i]    = d.topOil[i] + 13*Math.pow(L,1.6) + 20*F + gauss(r)*0.55*opt.noise;
      d.h2[i]     = 18 + 210*Math.pow(F,2.3) + gauss(r)*3.5*opt.noise;
      d.c2h4[i]   = 6 + 150*Math.pow(F,2.8) + gauss(r)*2.2*opt.noise;
      d.oilLvl[i] = 71 + 6*(d.topOil[i]-60)/40 + gauss(r)*0.3;
    }
    return d;
  },
  health: d => d.wti, healthName:'Winding temperature indication', healthUnit:'°C',
  trip:115, alarm:105, normalBand:[62,88],
  features:[
    {id:'raw',   n:'Raw winding temperature',        desc:'Load and ambient dominate it',            good:0},
    {id:'thm',   n:'Deviation from IEC thermal model',desc:'Exactly the residual you want',          good:1},
    {id:'topRes',n:'Top oil residual',               desc:'Independent of the WTI image',            good:1},
    {id:'coolR', n:'Cooler current versus demand',   desc:'Finds the cause, not the symptom',        good:1},
    {id:'gasR',  n:'Hydrogen rate of change',        desc:'Rate matters far more than absolute level',good:1},
    {id:'duval', n:'Ethylene to hydrogen ratio',     desc:'Distinguishes thermal from electrical fault',good:1},
    {id:'hod',   n:'Hour of day',                    desc:'Spurious',                                good:0},
    {id:'dayn',  n:'Day number',                     desc:'A leakage trap',                          good:-1}
  ]
}
};
const CASE_ORDER = ['idfan','motor','mill','bfp','xfmr'];

/* =========================================================================
   2. ACQUISITION — what the historian actually keeps
   ========================================================================= */
function acquire(series, opt){
  // scanSec: DCS scan; storeMin: historian store interval; dead: exception deviation %; freeze/gap injection
  const step = Math.max(1, Math.round(opt.storeMin/60));           // in hours
  const r = rng(opt.seed||99);
  const span = Math.max(1e-9, Math.max(...series) - Math.min(...series));
  const out = new Float64Array(N); const kept = new Uint8Array(N);
  let last = series[0], lastT = 0;
  for(let i=0;i<N;i++){
    if(i % step === 0){
      const dev = Math.abs(series[i]-last)/span*100;
      if(dev >= opt.dead || (i-lastT) >= opt.maxGapH){ last = series[i]; lastT = i; kept[i]=1; }
    }
    out[i] = last;                                                  // held value, exactly as a historian returns it
  }
  // frozen transmitter
  if(opt.freezeDay>0){
    const a = opt.freezeDay*24, b = Math.min(N, a + opt.freezeLen*24), v = out[a]||series[a];
    for(let i=a;i<b;i++){ out[i]=v; kept[i]=0; }
  }
  // communication gaps
  if(opt.gapPct>0){
    let i=0;
    while(i<N){
      if(r() < opt.gapPct/100/24){
        const len = Math.round(2 + r()*22);
        for(let j=i;j<Math.min(N,i+len);j++){ out[j]=NaN; kept[j]=0; }
        i += len;
      } else i++;
    }
  }
  return {v:out, kept};
}
function profileData(v){
  let nan=0, frozenMax=0, run=0, prev=NaN;
  for(let i=0;i<v.length;i++){
    if(isNaN(v[i])){ nan++; run=0; prev=NaN; continue; }
    if(v[i]===prev){ run++; frozenMax=Math.max(frozenMax,run); } else run=0;
    prev=v[i];
  }
  const clean=[...v].filter(x=>!isNaN(x));
  return {missingPct:nan/v.length*100, frozenH:frozenMax, n:clean.length,
          min:Math.min(...clean), max:Math.max(...clean), mean:mean(clean), sd:sd(clean)};
}
function repair(v, mode){
  const out=Float64Array.from(v);
  if(mode==='none') return out;
  for(let i=0;i<out.length;i++){
    if(isNaN(out[i])){
      if(mode==='hold'){ let j=i-1; while(j>=0 && isNaN(out[j])) j--; out[i] = j>=0?out[j]:0; }
      else { let a=i-1; while(a>=0&&isNaN(out[a]))a--; let b=i+1; while(b<out.length&&isNaN(out[b]))b++;
             const va=a>=0?out[a]:out[b], vb=b<out.length?out[b]:out[a];
             out[i] = (va+vb)/2; }
    }
  }
  return out;
}

/* =========================================================================
   3. FEATURES
   ========================================================================= */
function dailyMean(v){
  const out=new Float64Array(DAYS);
  for(let d=0;d<DAYS;d++){ let s=0,c=0; for(let h=0;h<24;h++){ const x=v[d*24+h]; if(!isNaN(x)){s+=x;c++;} } out[d]=c?s/c:NaN; }
  return out;
}
function rollSlope(v,w){
  const out=new Float64Array(v.length);
  for(let i=0;i<v.length;i++){
    const a=Math.max(0,i-w+1); let sx=0,sy=0,sxy=0,sxx=0,n=0;
    for(let j=a;j<=i;j++){ if(isNaN(v[j]))continue; sx+=j; sy+=v[j]; sxy+=j*v[j]; sxx+=j*j; n++; }
    out[i] = n>2 ? (n*sxy-sx*sy)/(n*sxx-sx*sx||1) : 0;
  }
  return out;
}
/* expected-value regression on drivers → residual */
function residualise(target, drivers, trainEnd){
  const p=drivers.length;
  const X=[], y=[];
  for(let i=0;i<trainEnd;i++){
    if(isNaN(target[i])) continue;
    const row=drivers.map(d=>d[i]); if(row.some(isNaN)) continue;
    X.push(row); y.push(target[i]);
  }
  if(X.length<20) return {res:Float64Array.from(target), pred:Float64Array.from(target), w:[]};
  const mu=[],sg=[];
  for(let j=0;j<p;j++){ const c=X.map(r=>r[j]); mu.push(mean(c)); sg.push(sd(c)); }
  const Z=X.map(r=>r.map((v,j)=>(v-mu[j])/sg[j]));
  const ym=mean(y), ys=sd(y), t=y.map(v=>(v-ym)/ys);
  let w=new Array(p).fill(0), b=0;
  for(let it=0; it<700; it++){
    const g=new Array(p).fill(0); let gb=0;
    for(let i=0;i<Z.length;i++){ let pr=b; for(let j=0;j<p;j++) pr+=w[j]*Z[i][j];
      const e=pr-t[i]; gb+=e; for(let j=0;j<p;j++) g[j]+=e*Z[i][j]; }
    for(let j=0;j<p;j++) w[j]-=0.08*(g[j]/Z.length + 0.02*w[j]);
    b-=0.08*gb/Z.length;
  }
  const pred=new Float64Array(target.length), res=new Float64Array(target.length);
  for(let i=0;i<target.length;i++){
    let pr=b; let ok=true;
    for(let j=0;j<p;j++){ const v=drivers[j][i]; if(isNaN(v)){ok=false;break;} pr+=w[j]*((v-mu[j])/sg[j]); }
    pred[i]= ok ? pr*ys+ym : NaN;
    res[i] = ok ? target[i]-pred[i] : NaN;
  }
  return {res, pred, w, mu, sg};
}

/* =========================================================================
   4. MODELS
   ========================================================================= */
const MODELS = {
  thresh:{ n:'Fixed threshold', fam:'Rule', desc:'One tag against one constant. What the DCS already does.',
    needs:'Nothing — it is already running', cost:'Zero' },
  cusum:{ n:'CUSUM change detection', fam:'Statistical', desc:'Accumulates small deviations from a reference until they add up. Two parameters, runs on a PLC.',
    needs:'A stable reference period', cost:'Very low' },
  knn:{ n:'k-NN similarity residual', fam:'Memory-based', desc:'Stores healthy states and predicts the expected value from the closest matches. The family most commercial systems run.',
    needs:'A curated healthy history across the full operating range', cost:'Low' },
  pca:{ n:'PCA reconstruction error', fam:'Multivariate', desc:'Collapses many tags to a few components, reconstructs, and watches the reconstruction error.',
    needs:'Several correlated tags on the same machine', cost:'Low' },
  ridge:{ n:'Regression residual', fam:'Supervised', desc:'Learns the expected value from the drivers and flags the deviation. Interpretable coefficients.',
    needs:'Good driver tags — load, ambient, duty', cost:'Low' }
};
function trainModel(kind, feats, trainEnd, opt){
  const T = feats[0].length;
  const score = new Float64Array(T).fill(NaN);
  if(kind==='thresh'){
    for(let i=0;i<T;i++) score[i]=feats[0][i];
    return {score, kind, note:'The raw signal itself is the score.'};
  }
  if(kind==='cusum'){
    const tr=[...feats[0].slice(0,trainEnd)].filter(x=>!isNaN(x));
    const mu=mean(tr), s=sd(tr), k=0.5*s*(opt.cusumK||1);
    let c=0;
    for(let i=0;i<T;i++){ const x=feats[0][i]; if(isNaN(x)){score[i]=c;continue;}
      c = Math.max(0, c + (x-mu) - k); score[i]=c; }
    return {score, kind, mu, s, note:`Reference mean ${fmt(mu,2)}, slack k = ${fmt(k,3)}.`};
  }
  if(kind==='ridge'){
    const tgt=feats[0], drv=feats.slice(1);
    if(!drv.length) return trainModel('cusum',feats,trainEnd,opt);
    const R=residualise(tgt,drv,trainEnd);
    return {score:R.res, kind, w:R.w, pred:R.pred, note:`Expected value learned from ${drv.length} driver tags.`};
  }
  if(kind==='knn'){
    const tgt=feats[0], drv=feats.slice(1);
    if(!drv.length) return trainModel('cusum',feats,trainEnd,opt);
    const mem=[];
    for(let i=0;i<trainEnd;i+=Math.max(1,Math.floor(trainEnd/900))){
      const f=drv.map(d=>d[i]); if(f.some(isNaN)||isNaN(tgt[i])) continue;
      mem.push({f, y:tgt[i]});
    }
    if(mem.length<10) return trainModel('cusum',feats,trainEnd,opt);
    const p=drv.length, sg=[];
    for(let j=0;j<p;j++) sg.push(sd(mem.map(m=>m.f[j])));
    const k=opt.k||12;
    const pred=new Float64Array(T).fill(NaN);
    for(let i=0;i<T;i++){
      const f=drv.map(d=>d[i]); if(f.some(isNaN)||isNaN(tgt[i])) continue;
      const arr=mem.map(m=>{ let s=0; for(let j=0;j<p;j++){ const z=(f[j]-m.f[j])/sg[j]; s+=z*z; } return {d:Math.sqrt(s), y:m.y}; });
      arr.sort((a,b)=>a.d-b.d);
      let wn=0,ws=0; for(let q=0;q<Math.min(k,arr.length);q++){ const w=1/(arr[q].d+0.05); wn+=w*arr[q].y; ws+=w; }
      pred[i]=wn/ws; score[i]=tgt[i]-pred[i];
    }
    return {score, kind, pred, memN:mem.length, note:`Memory of ${mem.length} healthy states, k = ${k}.`};
  }
  if(kind==='pca'){
    const rows=[];
    for(let i=0;i<trainEnd;i++){ const r=feats.map(f=>f[i]); if(!r.some(isNaN)) rows.push(r); }
    const p=feats.length;
    if(rows.length<30||p<3) return trainModel('cusum',feats,trainEnd,opt);
    const mu=[],sg=[];
    for(let j=0;j<p;j++){ const c=rows.map(r=>r[j]); mu.push(mean(c)); sg.push(sd(c)); }
    const Z=rows.map(r=>r.map((v,j)=>(v-mu[j])/sg[j]));
    const C=Array.from({length:p},()=>new Array(p).fill(0));
    Z.forEach(r=>{ for(let a=0;a<p;a++) for(let b=0;b<p;b++) C[a][b]+=r[a]*r[b]/Z.length; });
    const nc = Math.min(opt.nComp||2, p-1);
    const V=[];
    for(let c=0;c<nc;c++){
      let v=new Array(p).fill(0).map((_,i)=>Math.sin(i+1+c));
      for(let it=0;it<220;it++){
        let nv=new Array(p).fill(0);
        for(let a=0;a<p;a++) for(let b=0;b<p;b++) nv[a]+=C[a][b]*v[b];
        V.forEach(u=>{ const d=nv.reduce((s,x,i)=>s+x*u[i],0); for(let a=0;a<p;a++) nv[a]-=d*u[a]; });
        const nm=Math.sqrt(nv.reduce((s,x)=>s+x*x,0))||1; v=nv.map(x=>x/nm);
      }
      V.push(v);
    }
    for(let i=0;i<T;i++){
      const r=feats.map(f=>f[i]); if(r.some(isNaN)) continue;
      const z=r.map((v,j)=>(v-mu[j])/sg[j]);
      const rec=new Array(p).fill(0);
      V.forEach(u=>{ const t=z.reduce((s,x,k2)=>s+x*u[k2],0); for(let a=0;a<p;a++) rec[a]+=t*u[a]; });
      let q=0; for(let a=0;a<p;a++){ const e=z[a]-rec[a]; q+=e*e; }
      score[i]=Math.sqrt(q);
    }
    return {score, kind, nc, note:`${p} signals reduced to ${nc} components; the score is the Q statistic (reconstruction error).`};
  }
}

/* ---------- evaluation ---------- */
function thrFromTrain(score, trainEnd, k){
  const tr=[...score.slice(0,trainEnd)].filter(x=>!isNaN(x));
  if(!tr.length) return 0;
  return mean(tr) + k*sd(tr);
}
function countAlerts(score, from, to, thr, persistH){
  let run=0, n=0, cool=0;
  for(let i=from;i<to;i++){
    const s=score[i]; if(isNaN(s)) continue;
    if(s>thr){ run++; if(run>=persistH && cool<=0){ n++; cool=persistH; } } else run=0;
    if(cool>0) cool--;
  }
  return n;
}
/* healthyScore: the same model run on a sister machine that never develops a fault.
   That is where the nuisance-alert rate actually comes from — a full year of it, not seven. */
function evaluate(score, faultDay, trainEnd, thr, persistH, healthyScore, healthyThr){
  const T=score.length; const onsetH=faultDay*24;
  let run=0, detectH=null;
  for(let i=trainEnd;i<T;i++){
    const s=score[i]; if(isNaN(s)) continue;
    if(s>thr){ run++; if(run>=persistH && detectH===null) detectH=i; } else run=0;
  }
  let fa, hours;
  /* The sister machine carries its OWN model, so it carries its own baseline
     and its own threshold. Judging its score against this machine's threshold
     compares two independently fitted models on different scales, and it
     silently reported zero nuisance alerts while the sister was sitting at
     thirty times its own limit every afternoon in May. In practice every
     machine gets a threshold from its own quiet period; so does this one. */
  if(healthyScore){
    fa=countAlerts(healthyScore, trainEnd, T,
                   healthyThr===undefined?thr:healthyThr, persistH);
    hours=T-trainEnd;
  }
  else { fa=countAlerts(score, trainEnd, onsetH, thr, persistH); hours=Math.max(1,onsetH-trainEnd); }
  return {detectDay: detectH===null?null:detectH/24,
          leadDays: detectH===null?null:(T/24 - detectH/24),
          faPerMonth: fa/hours*24*30, fa};
}
/* sweep BOTH levers — threshold and persistence — because that is the real design space */
function sweepThresholds(score, faultDay, trainEnd, persistH, alarmDay, healthyScore){
  const out=[]; const PERS=[6,12,24,48,72,120,168];
  for(const ph of PERS){
    for(let k=0.25;k<=12.01;k+=0.25){
      const thr=thrFromTrain(score, trainEnd, k);
      const hthr=healthyScore?thrFromTrain(healthyScore, trainEnd, k):undefined;
      const e=evaluate(score, faultDay, trainEnd, thr, ph, healthyScore, hthr);
      out.push({thr, k, ph, ...e, gain:(e.detectDay!==null && alarmDay!==null) ? alarmDay-e.detectDay : null});
    }
  }
  return out;
}
