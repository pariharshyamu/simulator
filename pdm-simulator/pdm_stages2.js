/* =========================================================================
   The eight stages
   ========================================================================= */
const dsz = (v,step)=>{ const o=[]; for(let i=0;i<v.length;i+=step){ let s=0,n=0;
  for(let j=i;j<Math.min(v.length,i+step);j++){ if(!isNaN(v[j])){s+=v[j];n++;} }
  o.push(n?s/n:NaN); } return o; };

const ST_RENDER=[], ST_WIRE=[];

/* ---------------- 0 · Asset & failure mode ---------------- */
ST_RENDER[0]=d=>{ const c=d.c, s=ST[c.station];
  const fc=outageCost(c.station,c.outageDays), pc=outageCost(c.station,c.plannedDays)*0.25;
  return hd('Stage 1 of 8','Asset and failure mode',
   'Before any data, decide what you are trying to catch. A predictive model with no named failure mode is a dashboard.')
  +`<div class="card"><h3>${c.name}</h3>
     <p class="small" style="margin-bottom:8px">${c.blurb}</p>
     <table><tbody>
      <tr><td style="width:38%">Station</td><td><b>${c.station}</b> · ${s.unitMW} MW unit · PLF ${fmt(s.plf,2)} %</td></tr>
      <tr><td>Failure mechanism</td><td>${c.mode}</td></tr>
      <tr><td>What "failed" means</td><td>${c.failWhen}</td></tr>
      <tr><td>Signal we will watch</td><td><b>${c.healthName}</b> — alarm ${c.alarm} ${c.healthUnit}, trip ${c.trip} ${c.healthUnit}</td></tr>
      <tr><td>Next planned outage</td><td>Day ${c.outageIn} of this one-year window</td></tr>
     </tbody></table></div>
   <div class="stats">
     <div class="stat"><div class="l">Forced outage</div><div class="n rd">${cr(fc)}</div><div class="s">${c.outageDays} days on a ${s.unitMW} MW unit</div></div>
     <div class="stat"><div class="l">Taken in a planned window</div><div class="n gn">${cr(pc)}</div><div class="s">${c.plannedDays} days, marginal only</div></div>
     <div class="stat"><div class="l">Ratio</div><div class="n em">${fmt(fc/Math.max(pc,0.001),0)}×</div><div class="s">why lead time is the whole game</div></div>
     <div class="stat"><div class="l">Station variable charge</div><div class="n tl">₹${fmt(s.vc,4)}</div><div class="s">per kWh, MERC merit order</div></div>
   </div>
   <div class="card"><h3>The truth we are not allowed to see</h3>
     <canvas class="ch" id="c0a"></canvas>
     <div class="legend"><span><i style="background:#D96A16"></i>${c.healthName}</span>
       <span><i style="background:#A8261E"></i>DCS alarm setpoint</span>
       <span><i style="background:#5B4A85"></i>true fault severity (hidden in real life)</span></div>
     <p class="small" style="margin-top:7px">The fault begins on day ${c.onset}. Everything after this stage is an
     attempt to find that day using only what the instruments actually record.</p></div>
   <div class="warn"><b>The honest framing.</b> In a real plant nobody hands you the purple line. You do not know
   the onset day, you often do not know the mechanism until you open the machine, and the training data may already
   contain the fault. This simulator gives you the answer key so you can see how each decision downstream either
   finds the fault or buries it.</div>
   <div class="ctl"><label>Signal noise <span class="v" id="v-noise">${fmt(S.noise,1)}×</span></label>
     <input type="range" id="i-noise" min="30" max="250" value="${Math.round(S.noise*100)}" step="10">
     <div class="hint">Instrument quality. Everything downstream gets harder as this rises.</div></div>
   `+navBtns(null,1,'Choose instrumentation'); };
ST_WIRE[0]=d=>{
  const c=d.c, step=12;
  const H=dsz(d.health,step), F=dsz(Array.from(d.fault),step);
  const sc = (c.trip - Math.min(...H.filter(x=>!isNaN(x))));
  lineChart($('c0a'),{height:230, yLabel:c.healthUnit, xScale:step/24,
    marks:[{i:c.onset*24/step,label:'fault begins',c:C.vio}],
    series:[
      {data:H,c:C.ember,w:2},
      {data:H.map(()=>c.alarm),c:C.red,dash:[6,4],w:1.5},
      {data:F.map(v=>Math.min(...H.filter(x=>!isNaN(x))) + v*sc*0.92),c:C.vio,w:1.6,dash:[3,3]}
    ]});
  $('i-noise').oninput=e=>{ S.noise=+e.target.value/100; $('v-noise').textContent=fmt(S.noise,1)+'×'; invalidate(); };
};

/* ---------------- 1 · Instrumentation ---------------- */
ST_RENDER[1]=d=>{ const c=d.c;
  const on=c.sensors.filter(s=>S.sensors[s.id]);
  const keyOn=c.sensors.filter(s=>s.key&&S.sensors[s.id]).length, keyN=c.sensors.filter(s=>s.key).length;
  const newOnes=c.sensors.filter(s=>!s.have&&S.sensors[s.id]).length;
  return hd('Stage 2 of 8','Instrumentation',
   'What the machine can tell you is fixed by what you measure. Click the markers in the 3D view or the rows below.')
  +`<div class="stats">
     <div class="stat"><div class="l">Sensors live</div><div class="n em">${on.length} / ${c.sensors.length}</div><div class="s">of the available points</div></div>
     <div class="stat"><div class="l">Key signals</div><div class="n ${keyOn===keyN?'gn':'rd'}">${keyOn} / ${keyN}</div><div class="s">the ones this failure mode needs</div></div>
     <div class="stat"><div class="l">New instrumentation</div><div class="n tl">${newOnes}</div><div class="s">not currently on the machine</div></div>
   </div>
   <div class="card"><h3>Available measurement points</h3>
     <div id="senslist"></div></div>
   ${keyOn<keyN?`<div class="bad"><b>You are missing ${keyN-keyOn} of the signals this failure mode lives in.</b>
     You can still build a model. It will detect later, or not at all, and no algorithm will recover what was never
     measured. This is the most common ceiling on plant analytics and it is set before any data science begins.</div>`
    :`<div class="good"><b>Every key signal for this failure mode is available.</b> Note how few they are — five or
     six tags, most of them already on the machine. Coverage matters far more than volume.</div>`}
   <div class="note"><b>The point of this stage.</b> Two of the sensors here are marked as not currently fitted.
   Switch them on and watch the detection improve in Stage 7 — then decide whether the improvement is worth the
   installation. That is an engineering trade, and it belongs to you, not to the analytics vendor.</div>
   `+navBtns(0,2,'Acquire the data'); };
ST_WIRE[1]=d=>{ const c=d.c;
  $('senslist').innerHTML = c.sensors.map(s=>`
    <div class="sensrow">
      <input type="checkbox" data-s="${s.id}" ${S.sensors[s.id]?'checked':''} style="width:16px;height:16px;accent-color:#D96A16;margin-top:3px;cursor:pointer">
      <div class="nm"><b>${s.n}</b> <span class="small">(${s.u})</span>
        ${s.key?'<span class="pill er">key</span>':'<span class="pill nu">context</span>'}
        ${s.have?'<span class="pill ok">fitted</span>':'<span class="pill wn">to be installed</span>'}
        <div>${s.why} · recorded at ${s.rate}</div></div>
    </div>`).join('');
  $('senslist').querySelectorAll('input').forEach(i=>i.onchange=()=>{ S.sensors[i.dataset.s]=i.checked; invalidate(); });
};

/* ---------------- 2 · Acquisition ---------------- */
ST_RENDER[2]=d=>{ const c=d.c;
  return hd('Stage 3 of 8','Data acquisition',
   'The historian does not store what the sensor measured. It stores what its compression settings let through.')
  +`<div class="row">
    <div class="col" style="max-width:290px"><div class="card"><h3>Historian settings</h3>
      <div class="ctl"><label>Store interval <span class="v" id="v-store">${S.acq.storeMin} min</span></label>
        <input type="range" id="i-store" min="1" max="60" value="${S.acq.storeMin}" step="1"></div>
      <div class="ctl"><label>Exception deviation <span class="v" id="v-dead">${fmt(S.acq.dead,2)} %</span></label>
        <input type="range" id="i-dead" min="0" max="500" value="${Math.round(S.acq.dead*100)}" step="5">
        <div class="hint">Store only when the value moves this far, as a percentage of span</div></div>
      <div class="ctl"><label>Maximum time between stores <span class="v" id="v-gap">${S.acq.maxGapH} h</span></label>
        <input type="range" id="i-gap" min="1" max="48" value="${S.acq.maxGapH}" step="1"></div>
      <hr class="sep">
      <div class="ctl"><label>Frozen transmitter from <span class="v" id="v-fz">${S.acq.freezeDay?('day '+S.acq.freezeDay):'none'}</span></label>
        <input type="range" id="i-fz" min="0" max="180" value="${S.acq.freezeDay}" step="5"></div>
      <div class="ctl"><label>Communication gaps <span class="v" id="v-gp">${fmt(S.acq.gapPct,1)} %</span></label>
        <input type="range" id="i-gp" min="0" max="60" value="${Math.round(S.acq.gapPct*10)}" step="1"></div>
      <button class="btn gh" id="b-typ">Typical plant settings</button>
      <button class="btn gh" id="b-agg" style="margin-top:6px">Aggressive compression</button>
    </div></div>
    <div class="col"><div class="card"><h3>What the sensor saw, and what the historian kept</h3>
      <canvas class="ch" id="c2a"></canvas>
      <div class="legend"><span><i style="background:#8C9AA6"></i>true signal</span>
        <span><i style="background:#D96A16"></i>as stored in the historian</span></div></div>
      <div class="card"><h3>The fault window, magnified</h3>
        <canvas class="ch" id="c2b"></canvas>
        <p class="small" style="margin-top:6px">Days ${c.onset-8} to ${c.onset+38}. This is the slow drift the whole
        programme depends on. Raise the exception deviation and watch it disappear.</p></div>
    </div></div>
   <div id="acqverdict"></div>
   `+navBtns(1,3,'Profile the data'); };
ST_WIRE[2]=d=>{
  const c=d.c, key=c.sensors.find(s=>s.key&&S.sensors[s.id]);
  const tag = key ? key.id : Object.keys(d.truth)[0];
  const T=d.truth[tag], A=d.acq[tag];
  const step=12;
  lineChart($('c2a'),{height:190, yLabel:c.sensors.find(s=>s.id===tag).u, xScale:step/24,
    series:[{data:dsz(T,step),c:'#8C9AA6',w:1.3},{data:dsz(A||[],step),c:C.ember,w:1.8}]});
  const a=(c.onset-8)*24, b=(c.onset+38)*24;
  lineChart($('c2b'),{height:180, yLabel:c.sensors.find(s=>s.id===tag).u, xScale:2/24, xOff:c.onset-8,
    series:[{data:dsz(Array.from(T).slice(a,b),2),c:'#8C9AA6',w:1.3},
            {data:dsz(Array.from(A||[]).slice(a,b),2),c:C.ember,w:2}]});
  // information retained
  let se=0,n=0,rng2=Math.max(...T)-Math.min(...T);
  for(let i=a;i<b;i++){ if(A&&!isNaN(A[i])){ se+=(T[i]-A[i])**2; n++; } }
  const rmse=n?Math.sqrt(se/n):NaN;
  const lossPct = rmse/rng2*100;
  const trueRise = T[b-1]-T[a], storedRise = A? A[b-1]-A[a] : 0;
  const kept = clamp(storedRise/(trueRise||1)*100,0,150);
  $('acqverdict').innerHTML = lossPct>4 || kept<70 ?
   `<div class="bad"><b>Compression has eaten the signal.</b> Across the fault window the stored data differs from
    the true signal by ${fmt(rmse,2)} ${c.sensors.find(s=>s.id===tag).u} RMS, which is ${fmt(lossPct,1)} % of the
    tag's full span, and only ${fmt(kept,0)} % of the real rise survived to storage. A model trained on this cannot
    find what is no longer there. On most plants nobody knows what the exception deviation is set to — find out
    before you commission anything.</div>` :
   `<div class="good"><b>The drift survives storage.</b> RMS difference over the fault window is
    ${fmt(rmse,2)} ${c.sensors.find(s=>s.id===tag).u}, ${fmt(lossPct,1)} % of span, and ${fmt(kept,0)} % of the real
    rise is preserved. These are settings you could defend. The cost is storage, and storage is cheap compared with
    a forced outage.</div>`;
  const wire=(id,vid,f,fmtr)=>$(id).oninput=e=>{ f(+e.target.value); $(vid).textContent=fmtr(); invalidate(); };
  wire('i-store','v-store',v=>S.acq.storeMin=v,()=>S.acq.storeMin+' min');
  wire('i-dead','v-dead',v=>S.acq.dead=v/100,()=>fmt(S.acq.dead,2)+' %');
  wire('i-gap','v-gap',v=>S.acq.maxGapH=v,()=>S.acq.maxGapH+' h');
  wire('i-fz','v-fz',v=>S.acq.freezeDay=v,()=>S.acq.freezeDay?('day '+S.acq.freezeDay):'none');
  wire('i-gp','v-gp',v=>S.acq.gapPct=v/10,()=>fmt(S.acq.gapPct,1)+' %');
  $('b-typ').onclick=()=>{ S.acq={...S.acq, storeMin:5, dead:0.5, maxGapH:8}; invalidate(); };
  $('b-agg').onclick=()=>{ S.acq={...S.acq, storeMin:15, dead:2.5, maxGapH:24}; invalidate(); };
};

/* ---------------- 3 · Data quality ---------------- */
ST_RENDER[3]=d=>{ const c=d.c;
  const rows=c.sensors.filter(s=>S.sensors[s.id]).map(s=>{
    const p=d.prof[s.id]; if(!p) return '';
    const bad = p.missingPct>3 || p.frozenH>48;
    return `<tr class="${bad?'hi':''}"><td><b>${s.n}</b></td><td class="num">${fmt(p.missingPct,1)} %</td>
      <td class="num">${p.frozenH} h</td><td class="num">${fmt(p.min,1)}</td><td class="num">${fmt(p.max,1)}</td>
      <td class="num">${fmt(p.sd,2)}</td><td>${bad?'<span class="pill er">attention</span>':'<span class="pill ok">usable</span>'}</td></tr>`;
  }).join('');
  return hd('Stage 4 of 8','Data quality',
   'Profile every tag before you model anything. This is the least glamorous stage and the one that decides the outcome.')
  +`<div class="card"><h3>Tag profile over the one-year window</h3>
     <div class="tw"><table><thead><tr><th>Signal</th><th class="num">Missing</th><th class="num">Longest frozen run</th>
       <th class="num">Min</th><th class="num">Max</th><th class="num">Std dev</th><th>Verdict</th></tr></thead>
       <tbody>${rows}</tbody></table></div></div>
   <div class="row"><div class="col" style="max-width:290px"><div class="card"><h3>Repair strategy</h3>
     <div class="ctl"><select id="i-rep">
       <option value="none"${S.repair==='none'?' selected':''}>Leave the gaps as they are</option>
       <option value="hold"${S.repair==='hold'?' selected':''}>Hold the last good value</option>
       <option value="interp"${S.repair==='interp'?' selected':''}>Interpolate across the gap</option>
     </select></div>
     <p class="small">Holding is what the historian itself does and is honest about being stale. Interpolating
     invents data that looks real — it is fine for a slow temperature and dangerous for anything that steps.</p>
     </div></div>
     <div class="col"><div class="card"><h3>Effect on the signal being watched</h3>
       <canvas class="ch" id="c3a"></canvas>
       <div class="legend"><span><i style="background:#8C9AA6"></i>true</span>
         <span><i style="background:#D96A16"></i>after acquisition and repair</span></div></div></div></div>
   ${S.acq.freezeDay>0?`<div class="bad"><b>There is a frozen transmitter in this dataset.</b> From day
     ${S.acq.freezeDay} it reads a perfectly plausible constant for ${S.acq.freezeLen} days. Nothing about the value
     is out of range, so no range check catches it. Only a repeated-value check does — and if that period falls
     inside your training window, the model learns that the machine holds absolutely steady, and every later
     movement becomes an anomaly.</div>`:''}
   <div class="note"><b>What a real profile also has to check.</b> Timestamp alignment between systems, tags that
   were rescaled at some point in the past, units that changed, and whether the asset hierarchy in the historian
   matches the one in SAP. That last one is the single most common blocker in plant analytics, and no chart will
   show it to you.</div>
   `+navBtns(2,4,'Engineer features'); };
ST_WIRE[3]=d=>{
  const c=d.c, key=c.sensors.find(s=>s.key&&S.sensors[s.id]) || c.sensors[0];
  const step=12, T=d.truth[key.id], A=d.acq[key.id];
  lineChart($('c3a'),{height:200, yLabel:key.u, xScale:step/24,
    marks:S.acq.freezeDay?[{i:S.acq.freezeDay*24/step,label:'transmitter freezes',c:C.red}]:[],
    series:[{data:dsz(T,step),c:'#8C9AA6',w:1.3},{data:dsz(A||[],step),c:C.ember,w:1.8}]});
  $('i-rep').onchange=e=>{ S.repair=e.target.value; invalidate(); };
};

/* ---------------- 4 · Features ---------------- */
ST_RENDER[4]=d=>{ const c=d.c;
  const rows=c.features.map(f=>{
    const av=d.avail[f.id], co=d.corr[f.id];
    const need=featureTags(c.id,f.id).filter(t=>!d.acq[t]);
    const q = co===null?'—':Math.abs(co);
    const badge = !av ? '<span class="pill nu">needs a sensor</span>'
      : q>0.75 ? '<span class="pill ok">strong</span>' : q>0.45 ? '<span class="pill wn">moderate</span>'
      : '<span class="pill er">weak</span>';
    return `<tr class="${S.primary===f.id?'hi':''}">
      <td style="width:26px"><input type="radio" name="prim" data-p="${f.id}" ${S.primary===f.id?'checked':''} ${av?'':'disabled'}></td>
      <td style="width:26px"><input type="checkbox" data-f="${f.id}" ${S.feats[f.id]?'checked':''} ${av?'':'disabled'}></td>
      <td><b>${f.n}</b><div class="small">${f.desc}${need.length?' · missing: '+need.join(', '):''}</div></td>
      <td class="num">${co===null?'—':fmt(Math.abs(co),3)}</td><td>${badge}</td></tr>`;
  }).join('');
  return hd('Stage 5 of 8','Feature engineering',
   'Raw tags are rarely the right input. The column on the right is the correlation with the true fault — an answer key you will not have in the plant.')
  +`<div class="card"><h3>Candidate features</h3>
     <p class="small" style="margin-bottom:8px">The radio button chooses the <b>signal being watched</b>. The
     checkboxes choose the <b>context signals</b> used to work out what it should have been.</p>
     <div class="tw"><table><thead><tr><th>Watch</th><th>Use</th><th>Feature</th>
       <th class="num">|r| with fault</th><th>Strength</th></tr></thead><tbody>${rows}</tbody></table></div></div>
   <div class="card"><h3>The signal being watched, and what it looks like as a residual</h3>
     <canvas class="ch" id="c4a"></canvas>
     <div class="legend"><span><i style="background:#8C9AA6"></i>raw tag</span>
       <span><i style="background:#D96A16"></i>selected feature</span>
       <span>shaded = training window</span></div></div>
   ${S.feats.dayn?`<div class="bad"><b>You have selected the day number as a feature.</b> Its correlation with the
     fault is near perfect, and that is exactly the problem — it encodes the answer. The model will look superb in
     validation and be worthless on the next machine, because day 140 means nothing to a bearing. This is target
     leakage, and it is the most embarrassing way for a plant model to fail.</div>`:''}
   ${S.feats.hod?`<div class="warn"><b>Hour of day is selected.</b> It will correlate with load, ambient and
     everything else that moves on a daily cycle. It adds no physical information and it makes the model harder to
     explain to an operator. Correlation is not a reason to include a feature.</div>`:''}
   <div class="note"><b>The rule worth remembering.</b> A good feature answers "how far is this from what it should
   be, given the duty?" A bad feature answers "what number is it?" Almost everything in industrial machine learning
   follows from that distinction.</div>
   `+navBtns(3,5,'Train a model'); };
ST_WIRE[4]=d=>{
  const c=d.c, step=12;
  const raw=d.feats.raw, sel=d.feats[S.primary]||raw;
  const nr=(v)=>{ const a=[...v].filter(x=>!isNaN(x)); const mn=Math.min(...a), mx=Math.max(...a);
    return [...v].map(x=>isNaN(x)?NaN:(x-mn)/((mx-mn)||1)); };
  lineChart($('c4a'),{height:210, yLabel:'normalised', xScale:step/24, yMin:-0.08, yMax:1.08,
    bands:[{from:0,to:S.trainDays*24/step,c:'rgba(17,112,127,.07)'}],
    marks:[{i:c.onset*24/step,label:'fault begins',c:C.vio}],
    series:[{data:dsz(nr(raw||[]),step),c:'#8C9AA6',w:1.3},
            {data:dsz(nr(sel||[]),step),c:C.ember,w:2}]});
  $('pw').querySelectorAll('[data-p]').forEach(r=>r.onchange=()=>{ S.primary=r.dataset.p; S.feats[r.dataset.p]=true; invalidate(); });
  $('pw').querySelectorAll('[data-f]').forEach(cb=>cb.onchange=()=>{ S.feats[cb.dataset.f]=cb.checked; invalidate(); });
};

/* ---------------- 5 · Training ---------------- */
ST_RENDER[5]=d=>{ const c=d.c, m=MODELS[S.model];
  const contaminated = S.trainDays > c.onset;
  return hd('Stage 6 of 8','Model training',
   'Choose the technique and the training window. Both decisions matter more than any hyper-parameter.')
  +`<div class="row">
     <div class="col" style="max-width:290px">
      <div class="card"><h3>Technique</h3>
        <div class="chips" id="modchips">${Object.keys(MODELS).map(k=>
          `<div class="chip ${S.model===k?'on':''}" data-m="${k}">${MODELS[k].n}</div>`).join('')}</div>
        <p class="small"><b>${m.n}</b> — ${m.desc}</p>
        <table style="margin-top:7px"><tbody>
          <tr><td>Family</td><td>${m.fam}</td></tr>
          <tr><td>Needs</td><td>${m.needs}</td></tr>
          <tr><td>Compute cost</td><td>${m.cost}</td></tr></tbody></table>
      </div>
      <div class="card"><h3>Training window</h3>
        <div class="ctl"><label>Train on the first <span class="v" id="v-tr">${S.trainDays} days</span></label>
          <input type="range" id="i-tr" min="20" max="340" value="${S.trainDays}" step="10">
          <div class="hint">The fault begins on day ${c.onset}</div></div>
        <div class="ctl"><label>Persistence before alerting <span class="v" id="v-pe">${Math.round(S.persistH/24)} days</span></label>
          <input type="range" id="i-pe" min="6" max="240" value="${S.persistH}" step="6"></div>
      </div>
     </div>
     <div class="col">
       <div class="card"><h3>Model score over the whole window</h3>
         <canvas class="ch" id="c5a"></canvas>
         <div class="legend"><span><i style="background:#D96A16"></i>model score</span>
           <span><i style="background:#256B45"></i>alert threshold</span>
           <span>shaded = training window</span></div>
         <p class="small" style="margin-top:6px">${d.M?d.M.note:'Select at least one available feature.'}</p></div>
       ${d.M&&d.M.pred?`<div class="card"><h3>Measured against expected</h3>
         <canvas class="ch" id="c5b"></canvas>
         <div class="legend"><span><i style="background:#D96A16"></i>measured</span>
           <span><i style="background:#11707F"></i>what the model expected</span></div></div>`:''}
     </div>
   </div>
   ${contaminated?`<div class="bad"><b>Your training window contains the fault.</b> It runs to day ${S.trainDays};
     the fault begins on day ${c.onset}. The model is being taught that a degrading machine is normal, so the
     expected value climbs with the measurement and the residual stays flat. This is the single most common cause
     of a failed predictive-maintenance pilot, and nothing in the validation numbers will reveal it — they will
     look fine. Only somebody who knows the machine's history catches it.</div>`
    :`<div class="good"><b>The training window is clean.</b> It ends on day ${S.trainDays}, comfortably before the
     fault begins on day ${c.onset}. In a real project you establish that by asking the maintenance planner what
     was done to this machine and when — not by looking at the data.</div>`}
   ${seasonNote(d)}
   `+navBtns(4,6,'Validate it'); };

/* The second way a training window goes wrong, and the one nobody checks.
   A window can be perfectly clean of any fault and still be useless, because
   it never saw the weather the machine will meet. Day 0 is 1 January, so a
   45-day window is January and half of February: cooling water 19 to 22 °C,
   entirely below the lube oil cooler's design point. The model never learns
   that the cooler has a knee, and the first hot week in June looks to it
   exactly like a developing fault. */
function seasonNote(d){
  const td = S.trainDays, c = d.c, KNEE = 27.5;
  const m0 = dayToMonth(0), m1 = dayToMonth(Math.min(364, td - 1));
  const span = m1 > m0 ? `${MONTH_NAME[m0]} to ${MONTH_NAME[m1]}` : `${MONTH_NAME[m0]} only`;

  /* The question is not "is the average different". It is "has the window
     been in the regime the model will be asked to predict in". For this
     machine that regime is cooling water above the cooler's design point,
     because that is where the relationship stops being a straight line. */
  const trainH = Math.min(N, td * 24);
  let aboveKnee = 0, trainMax = -1e9, yearMax = -1e9;
  for (let i = 0; i < N; i++) {
    const cw = d.ctx.cw[i];
    if (cw > yearMax) yearMax = cw;
    if (i < trainH) { if (cw > KNEE) aboveKnee++; if (cw > trainMax) trainMax = cw; }
  }
  const pct = 100 * aboveKnee / Math.max(1, trainH);
  const early = (d.ev && d.ev.detectDay !== null && d.ev.detectDay < c.onset)
    ? Math.round(c.onset - d.ev.detectDay) : 0;
  const covered = aboveKnee >= 200 && trainMax >= yearMax - 1.5;

  if (covered)
    return `<div class="good" style="margin-top:10px"><b>The window also covers the weather.</b>
      ${span}, and ${fmt(pct,0)} per cent of those hours had cooling water above the cooler's
      27.5 °C design point, reaching ${fmt(trainMax,1)} °C against ${fmt(yearMax,1)} °C for the year.
      The model has been in the regime it will be asked to predict in, so it can tell a hot day
      from a hot bearing.</div>`;

  return `<div class="bad" style="margin-top:10px"><b>But it has not seen the weather.</b>
    The window is ${span}. Cooling water reached ${fmt(trainMax,1)} °C in it, against ${fmt(yearMax,1)} °C
    over the year, and only ${fmt(pct,0)} per cent of the training hours were above the lube oil cooler's
    27.5 °C design point. Below that point the oil outlet tracks ambient almost linearly; above it the
    cooler runs out of approach and climbs away. A window that never reaches the knee cannot learn
    that it is there.
    ${early ? `<b>It shows: the model raised an advisory on day ${Math.round(d.ev.detectDay)}
      (${dayLabel(Math.round(d.ev.detectDay))}), ${early} days before this fault begins.
      True severity that day was zero. That is not the bearing — that is summer.</b>`
            : 'Drag the window down to 60 days and watch when the advisory appears.'}
    </div>`;
}

ST_WIRE[5]=d=>{
  const c=d.c, step=12;
  if(d.M){
    lineChart($('c5a'),{height:215, yLabel:'score', xScale:step/24,
      bands:[{from:0,to:S.trainDays*24/step,c:'rgba(17,112,127,.07)'}],
      marks:[{i:c.onset*24/step,label:'fault begins',c:C.vio}]
        .concat(d.ev&&d.ev.detectDay!==null?[{i:d.ev.detectDay*24/step,label:'advisory',c:C.ember}]:[]),
      series:[{data:dsz(d.M.score,step),c:C.ember,w:1.9},
              {data:dsz(d.M.score,step).map(()=>d.thr),c:C.grn,dash:[5,4],w:1.5}]});
    if(d.M.pred && $('c5b')){
      const tgt=d.feats[d.prim];
      lineChart($('c5b'),{height:190, yLabel:'', xScale:step/24,
        series:[{data:dsz(tgt,step),c:C.ember,w:1.8},{data:dsz(d.M.pred,step),c:C.teal,w:1.6}]});
    }
  }
  $('modchips').querySelectorAll('.chip').forEach(e=>e.onclick=()=>{ S.model=e.dataset.m; invalidate(); });
  $('i-tr').oninput=e=>{ S.trainDays=+e.target.value; $('v-tr').textContent=S.trainDays+' days'; invalidate(); };
  $('i-pe').oninput=e=>{ S.persistH=+e.target.value; $('v-pe').textContent=Math.round(S.persistH/24)+' days'; invalidate(); };
};

/* ---------------- 6 · Validation ---------------- */
ST_RENDER[6]=d=>{ const c=d.c;
  if(!d.M) return hd('Stage 7 of 8','Validation','No model yet.')+navBtns(5,7);
  const e=d.ev, sw=d.sweep.filter(p=>p.detectDay!==null);
  const fc=outageCost(c.station,c.outageDays), pc=outageCost(c.station,c.plannedDays)*0.25;
  return hd('Stage 7 of 8','Validation',
   'Two numbers decide whether anyone will use this: how much warning it gives, and how often it cries wolf.')
  +`<div class="stats">
     <div class="stat"><div class="l">Model advisory</div><div class="n em">${e.detectDay===null?'never':'Day '+fmt(e.detectDay,0)}</div><div class="s">score held above threshold</div></div>
     <div class="stat"><div class="l">DCS alarm</div><div class="n rd">${d.alarmDay===null?'not in window':'Day '+fmt(d.alarmDay,0)}</div><div class="s">fixed setpoint crossed</div></div>
     <div class="stat"><div class="l">Warning gained</div><div class="n gn">${(e.detectDay!==null&&d.alarmDay!==null)?fmt(d.alarmDay-e.detectDay,0)+' days':'—'}</div><div class="s">over the existing alarm</div></div>
     <div class="stat"><div class="l">False alarms</div><div class="n ${e.faPerMonth<2?'gn':(e.faPerMonth<5?'':'rd')}">${fmt(e.faPerMonth,2)}</div><div class="s">per model-month on a healthy sister machine</div></div>
     <div class="stat"><div class="l">Reaches the outage?</div><div class="n ${(e.detectDay!==null&&e.detectDay<c.outageIn)?'gn':'rd'}">${(e.detectDay!==null&&e.detectDay<c.outageIn)?'Yes':'No'}</div><div class="s">planned outage is day ${c.outageIn}</div></div>
   </div>
   <div class="row">
    <div class="col" style="max-width:290px"><div class="card"><h3>Operating point</h3>
      <div class="ctl"><label>Alert threshold <span class="v" id="v-q">${fmt(S.thrK,2)} σ</span></label>
        <input type="range" id="i-q" min="50" max="1400" value="${Math.round(S.thrK*100)}" step="25">
        <div class="hint">Standard deviations above the score's own healthy-period mean</div></div>
      <div class="ctl"><label>Persistence <span class="v" id="v-pe2">${Math.round(S.persistH/24)} days</span></label>
        <input type="range" id="i-pe2" min="6" max="240" value="${S.persistH}" step="6"></div>
      <hr class="sep">
      <p class="small">Every point on the curve is a real threshold applied to this model, evaluated on the period
      after training. There is no setting that gives you both more warning and fewer false alarms — you are choosing
      a position, not optimising one.</p>
    </div></div>
    <div class="col"><div class="card"><h3>Warning gained against false alarms</h3>
      <canvas class="ch" id="c6a"></canvas>
      <div class="legend"><span><i style="background:#A8261E"></i>6 h persistence</span>
      <span><i style="background:#C58A18"></i>12 h</span><span><i style="background:#D96A16"></i>1 day</span>
      <span><i style="background:#5B4A85"></i>2 days</span><span><i style="background:#11707F"></i>3 days</span>
      <span><i style="background:#256B45"></i>5 days</span><span><i style="background:#3C5064"></i>7 days</span></div>
    <p class="small" style="margin-top:6px">Every dot is a real threshold-and-persistence combination applied to this
      model. Up and to the left is better; the large orange dot is where you are sitting. Below about two false
      alarms per model-month is workable, above five the shift stops reading them. Notice that persistence buys you
      false-alarm reduction almost for free until it starts eating your warning.</p></div>
    </div></div>
   <div class="card"><h3>What each operating point is worth</h3>
     <canvas class="ch" id="c6b"></canvas>
     <p class="small" style="margin-top:6px">Expected cost per event, combining the chance of catching the fault in
     time against the cost of investigating false alarms. Forced outage on this machine is ${cr(fc)};
     taking it in a planned window is ${cr(pc)}; each false alarm is costed at ₹40,000 of investigation time.</p></div>
   <div class="note"><b>Where the false-alarm number comes from.</b> The same model, with the same features and the
   same threshold, is run against a second machine of the same type that never develops a fault — a full year of it.
   Counting nuisance alerts on the faulty machine's own healthy weeks gives you a handful of days and a meaningless
   rate. This is the step most pilots skip, and it is why the false-alarm rate always turns out worse in service
   than it looked in the report.</div>
   <div class="warn"><b>What this validation still does not prove.</b> One fault, on one machine, in one simulated
   year. A real validation runs the model backwards over every known event in the machine's history and asks
   whether it would have caught them — and it counts the events it would have missed, which is the number nobody
   volunteers.</div>
   `+navBtns(5,7,'Deploy and count the money'); };
ST_WIRE[6]=d=>{
  const c=d.c, sw=d.sweep.filter(p=>p.gain!==null && p.faPerMonth<14);
  const PC={6:'rgba(168,38,30,.45)',12:'rgba(197,138,24,.45)',24:'rgba(217,106,22,.45)',
            48:'rgba(91,74,133,.45)',72:'rgba(17,112,127,.5)',120:'rgba(37,107,69,.45)',168:'rgba(60,80,100,.45)'};
  const pts=sw.map(p=>[p.faPerMonth, p.gain, PC[p.ph]||'rgba(17,112,127,.42)', 2.6]);
  pts.push([d.ev.faPerMonth, (d.ev.detectDay!==null&&d.alarmDay!==null)?d.alarmDay-d.ev.detectDay:0, C.ember, 6]);
  scatterChart($('c6a'),{height:215, pts, xMin:0,
    xLabel:'false alarms per model-month', yLabel:'days of warning gained'});
  const fc=outageCost(c.station,c.outageDays), pc=outageCost(c.station,c.plannedDays)*0.25, faCost=0.004;
  const cost=sw.map(p=>{
    const inTime = (p.detectDay!==null && p.detectDay < c.outageIn);
    const ex = inTime ? pc : fc;
    return [p.faPerMonth, ex + p.faPerMonth*6*faCost, PC[p.ph]];
  }).sort((a,b)=>a[0]-b[0]);
  const cur=[d.ev.faPerMonth, ((d.ev.detectDay!==null&&d.ev.detectDay<c.outageIn)?pc:fc)+d.ev.faPerMonth*6*faCost];
  scatterChart($('c6b'),{height:195, pts:cost.map(p=>[p[0],p[1],p[2],2.6]).concat([[cur[0],cur[1],C.ember,6]]),
    xMin:0, xLabel:'false alarms per model-month', yLabel:'expected cost, ₹ crore'});
  $('i-q').oninput=e=>{ S.thrK=+e.target.value/100; $('v-q').textContent=fmt(S.thrK,2)+' σ'; invalidate(); };
  $('i-pe2').oninput=e=>{ S.persistH=+e.target.value; $('v-pe2').textContent=Math.round(S.persistH/24)+' days'; invalidate(); };
};

/* ---------------- 7 · Inference & value ---------------- */
ST_RENDER[7]=d=>{ const c=d.c, e=d.ev;
  const fc=outageCost(c.station,c.outageDays), pc=outageCost(c.station,c.plannedDays)*0.25;
  const caught = e.detectDay!==null && e.detectDay < c.outageIn;
  const saved = caught ? fc-pc : 0;
  const s=ST[c.station];
  return hd('Stage 8 of 8','Inference and value',
   'The model is live. Drag the day scrubber under the 3D view and watch the machine, the score and the money move together.')
  +`<div class="stats">
     <div class="stat"><div class="l">Today</div><div class="n em">Day ${S.day}</div><div class="s">of the 365-day window</div></div>
     <div class="stat"><div class="l">Machine state</div><div class="n ${d.fault[S.day*24]>0.6?'rd':(d.fault[S.day*24]>0.15?'':'gn')}">${fmt(clamp(d.fault[Math.min(N-1,S.day*24)],0,1)*100,0)} %</div><div class="s">true severity — hidden in reality</div></div>
     <div class="stat"><div class="l">Model status</div><div class="n ${e.detectDay!==null&&S.day>=e.detectDay?'em':'gn'}">${e.detectDay!==null&&S.day>=e.detectDay?'ADVISORY':'quiet'}</div><div class="s">${e.detectDay!==null?'raised day '+fmt(e.detectDay,0):'never raised'}</div></div>
     <div class="stat"><div class="l">DCS alarm</div><div class="n ${d.alarmDay!==null&&S.day>=d.alarmDay?'rd':'gn'}">${d.alarmDay!==null&&S.day>=d.alarmDay?'ALARM':'quiet'}</div><div class="s">${d.alarmDay!==null?'day '+fmt(d.alarmDay,0):'not in window'}</div></div>
     <div class="stat"><div class="l">Value of this catch</div><div class="n ${saved>0?'gn':'rd'}">${cr(saved)}</div><div class="s">${caught?'planned instead of forced':'not caught in time'}</div></div>
   </div>
   <div class="card"><h3>Live view</h3>
     <canvas class="ch" id="c7a"></canvas>
     <div class="legend"><span><i style="background:#D96A16"></i>model score</span>
       <span><i style="background:#256B45"></i>threshold</span>
       <span><i style="background:#A8261E"></i>DCS alarm day</span>
       <span><i style="background:#2A3644"></i>today</span></div></div>
   <div class="card"><h3>The decision this produces</h3>
   ${caught?`<div class="good"><b>Advisory on day ${fmt(e.detectDay,0)}. Planned outage on day ${c.outageIn}.</b>
     ${fmt(c.outageIn-e.detectDay,0)} days to order parts, brief the shift and add the job to a window that was
     happening anyway. Cost falls from ${cr(fc)} to ${cr(pc)} — a saving of <b>${cr(saved)}</b> on one event, at
     ${c.station}'s own variable charge of ₹${fmt(s.vc,4)}/kWh.</div>`
   :`<div class="bad"><b>Not caught in time.</b> ${e.detectDay===null?'The model never raised an advisory.'
     :'The advisory came on day '+fmt(e.detectDay,0)+', after the planned outage on day '+c.outageIn+'.'}
     The machine has to be taken out when it fails, at ${cr(fc)}. Go back and change one thing — the missing sensor
     in Stage 2, the compression setting in Stage 3, the feature in Stage 5 or the threshold in Stage 7 — and see
     which one buys the days back.</div>`}
   </div>
   <div class="card"><h3>The loop that keeps it working</h3>
     <table><thead><tr><th>Step</th><th>Who</th><th>What actually has to happen</th></tr></thead><tbody>
      <tr><td>Alert with evidence</td><td>System</td><td>Which signals moved, how far from expected, and since when — not just a red light</td></tr>
      <tr><td>Triage within a shift</td><td>Named engineer</td><td>Real fault, sensor problem, or operating condition. Somebody owns this daily or it dies</td></tr>
      <tr><td>Action raised</td><td>Maintenance planner</td><td>Inspection or work order in SAP, referencing the alert</td></tr>
      <tr class="hi"><td><b>Finding written back</b></td><td>Whoever attended</td><td>What was actually found. <b>This is the step everyone skips, and skipping it is why programmes die in year two</b></td></tr>
      <tr><td>Model updated</td><td>Analytics owner</td><td>Retune the threshold, remove the false-alarm source, and retrain after the overhaul</td></tr>
     </tbody></table></div>
   <div class="vio"><b>Try this before you leave the module.</b> Go back to Stage 2 and switch off the companion
   bearing or the cooler flow. Go to Stage 3 and set the exception deviation to 2.5 per cent. Go to Stage 6 and drag
   the training window past the fault onset. Each one is a decision somebody makes without thinking, and each one
   costs you weeks of warning. The algorithm was never the fragile part.</div>
   `+navBtns(6,0,'Start again with another machine'); };
ST_WIRE[7]=d=>{
  const c=d.c, step=12;
  if(!d.M) return;
  const full=dsz(d.M.score,step).filter(v=>!isNaN(v));
  const lo=Math.min(...full,d.thr), hiV=Math.max(...full,d.thr), pad=(hiV-lo)*0.12||1;
  lineChart($('c7a'),{height:225, yLabel:'model score', xScale:step/24, yMin:lo-pad, yMax:hiV+pad,
    bands:[{from:0,to:S.trainDays*24/step,c:'rgba(17,112,127,.07)'}],
    marks:[{i:S.day*24/step,label:'today',c:C.ink}]
      .concat(d.ev.detectDay!==null?[{i:d.ev.detectDay*24/step,label:'advisory',c:C.ember}]:[])
      .concat(d.alarmDay!==null?[{i:d.alarmDay*24/step,label:'DCS alarm',c:C.red}]:[]),
    series:[{data:dsz(d.M.score,step).map((v,i)=> i*step/24<=S.day ? v : null),c:C.ember,w:2},
            {data:dsz(d.M.score,step).map(()=>d.thr),c:C.grn,dash:[5,4],w:1.5}]});
};

/* =========================================================================
   BOOT
   ========================================================================= */
(function boot(){
  V3.init($('gl'), $('gl'));
  const style=document.createElement('style');
  style.textContent=`.s3dlbl{position:absolute;background:rgba(15,23,32,.86);border:1px solid #3A4A5A;
    color:#D5E0E9;font:600 10.5px Calibri,sans-serif;padding:2px 7px;border-radius:10px;pointer-events:none;
    white-space:nowrap;transform:translateY(-50%);z-index:3}`;
  document.head.appendChild(style);
  resetCase();
  $('scrub').oninput=e=>{ S.day=+e.target.value; S.playing=false; $('play').textContent='▶ Run'; render(); };
  $('play').onclick=()=>{ S.playing=!S.playing; $('play').textContent=S.playing?'❚❚ Pause':'▶ Run';
    if(S.playing) tick(); };
  function tick(){ if(!S.playing) return;
    S.day = S.day>=DAYS-1 ? 0 : S.day+1;
    $('scrub').value=S.day; render();
    setTimeout(()=>requestAnimationFrame(tick), 55); }
  render();
  setTimeout(()=>{ const l=$('loading'); if(l) l.remove(); }, 320);
})();
