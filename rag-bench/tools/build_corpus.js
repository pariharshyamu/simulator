/* Build the retrieval corpus for the MAHAGENCO local RAG bench.
   Sources: the 308-page course material, the June 2026 data brief,
   the curated plant document set, and per-station fact sheets. */
const fs = require('fs');
const path = require('path');
const SRC = process.env.SRC || '../sources';
const OUT = '../data';

const MAXC = 1150, MINC = 260, OVERLAP = 1;
const chunks = [];
let nid = 0;
function push(o){ chunks.push(Object.assign({id: nid++}, o)); }

/* ---------------- markdown → sections → chunks ---------------- */
function splitMarkdown(file, srcLabel, srcKind){
  const lines = fs.readFileSync(path.join(SRC, file), 'utf8').split('\n');
  let h1='', h2='', h3='', buf=[], crumbAt='';
  const sections=[];
  const flush=()=>{
    const body = buf.join('\n').trim();
    if(body.length >= 40) sections.push({crumb:crumbAt, body});
    buf=[];
  };
  const crumb=()=>[h2,h3].filter(Boolean).join(' · ') || h1;
  for(const ln of lines){
    const m = /^(#{1,4})\s+(.*)$/.exec(ln);
    if(m){
      flush();
      const lvl=m[1].length, t=m[2].replace(/\s+$/,'');
      if(lvl===1){ h1=t; h2=''; h3=''; }
      else if(lvl===2){ h2=t; h3=''; }
      else { h3=t; }
      crumbAt = crumb();
      continue;
    }
    buf.push(ln);
  }
  flush();

  for(const s of sections){
    // keep markdown tables whole
    const blocks = s.body.split(/\n{2,}/).filter(b=>b.trim().length);
    let cur=[], curLen=0;
    const emit=()=>{
      const body = cur.join('\n\n').trim();
      if(body.length < 40){ cur=[]; curLen=0; return; }
      push({src:srcLabel, kind:srcKind, crumb:s.crumb, text:body});
      cur = cur.slice(Math.max(0, cur.length-OVERLAP));
      curLen = cur.join('\n\n').length;
    };
    const expanded=[];
    for(const b0 of blocks){
      if(/^\s*\|/.test(b0) && b0.length > 1700){
        // split a long markdown table into row groups, repeating the header
        const rows=b0.split('\n').filter(r=>r.trim().length);
        const head=rows.slice(0,2), body=rows.slice(2);
        let grp=[];
        const flushGrp=()=>{ if(grp.length){ expanded.push(head.concat(grp).join('\n')); grp=[]; } };
        for(const r of body){
          grp.push(r);
          if(head.join('\n').length + grp.join('\n').length > 1300) flushGrp();
        }
        flushGrp();
      } else expanded.push(b0);
    }
    for(const b of expanded){
      const isTable = /^\s*\|/.test(b);
      if(curLen + b.length > MAXC && curLen > MINC) emit();
      if(b.length > MAXC*2 && !isTable){
        // very long paragraph: hard-split on sentence boundaries
        const sent = b.split(/(?<=[.!?])\s+/);
        let acc='';
        for(const sn of sent){
          if(acc.length + sn.length > MAXC && acc.length > MINC){
            push({src:srcLabel, kind:srcKind, crumb:s.crumb, text:acc.trim()}); acc='';
          }
          acc += (acc?' ':'') + sn;
        }
        if(acc.trim().length>40) cur.push(acc.trim()), curLen+=acc.length;
      } else {
        cur.push(b); curLen += b.length + 2;
      }
    }
    emit();
    if(cur.length){ const body=cur.join('\n\n').trim();
      if(body.length>=40) push({src:srcLabel, kind:srcKind, crumb:s.crumb, text:body}); }
  }
}

/* ---------------- 1. the course material ---------------- */
splitMarkdown('course_material.md', 'Course material', 'course');
const nCourse = chunks.length;

/* ---------------- 2. the June 2026 data brief ---------------- */
splitMarkdown('JUNE2026_DATA_BRIEF.md', 'June 2026 data brief', 'data');
const nBrief = chunks.length - nCourse;

/* ---------------- 3. the curated plant document set ---------------- */
(function(){
  const js = fs.readFileSync(path.join(SRC,'th_m5.js'),'utf8');
  const a = js.indexOf('const CN = [');
  const b = js.indexOf('const QUERIES');
  const frag = js.slice(a, b);
  const sandbox = {};
  const fn = new Function(frag + '\n; return {CN, DOCS};');
  const {CN, DOCS} = fn();
  DOCS.forEach(d=>{
    push({src:'Plant document library', kind:'plantdoc', crumb:d.s, title:d.t, text:d.x});
  });
  console.log('plant docs:', DOCS.length, '| concepts:', CN.length);
})();
const nDocs = chunks.length - nCourse - nBrief;

/* ---------------- 4. per-station fact sheets ---------------- */
(function(){
  const j = JSON.parse(fs.readFileSync(path.join(SRC,'june2026.json'),'utf8'));
  const S = j.stations || [];
  const f=(x,n=1)=>(x===undefined||x===null||isNaN(x))?'—':Number(x).toFixed(n);
  S.forEach(s=>{
    const t = [
      `${s.station} — June 2026 performance, ${s.cap} MW installed (${s.unit_mw} MW units).`,
      `Availability ${f(s.avail,2)}%, PLF ${f(s.plf,2)}%. Gross generation ${f(s.gross,2)} MU, net generation ${f(s.net,2)} MU.`,
      `Net heat rate actual ${f(s.hr_act,0)} kcal/kWh against a MERC norm of ${f(s.hr_norm,0)}; gap ${s.hrGap>=0?'+':''}${f(s.hrGap,0)} kcal/kWh.`,
      `Gross (generated) heat rate works out at ${f(s.ghrAct,0)} against ${f(s.ghrNorm,0)} normative — a gross gap of ${s.ghrGap>=0?'+':''}${f(s.ghrGap,0)} kcal/kWh.`,
      `Auxiliary power consumption ${f(s.aux_act,2)}% against a norm of ${f(s.aux_norm,2)}%; excess ${s.auxGap>=0?'+':''}${f(s.auxGap,2)} percentage points.`,
      `Secondary fuel oil ${f(s.sfo_act,2)} ml/kWh against ${f(s.sfo_norm,2)} normative. As-fired GCV ${f(s.gcv_fired,0)} kcal/kg. Transit loss ${f(s.transit,2)}% against ${f(s.transit_norm,2)}% allowed.`,
      `Variable cost as billed ₹${f(s.vc_bill,3)}/kWh; annual fixed cost recovered ₹${f(s.afc_cr,2)} crore.`,
      `Note: net heat rate already contains auxiliary power. The net-heat-rate gap and the auxiliary excess overlap and must never be added together.`
    ].join(' ');
    push({src:'June 2026 station data', kind:'station', crumb:s.station, title:`${s.station} — June 2026 figures`, text:t});
  });
  const T = j.totals||{};
  push({src:'June 2026 station data', kind:'station', crumb:'Fleet totals',
    title:'MAHAGENCO thermal fleet — June 2026 totals',
    text:`Across the thermal fleet in June 2026 the net heat rate gap against MERC norms is worth approximately ₹${f(T.hr_gap_cr,2)} crore for the month. Auxiliary power consumed above norm amounts to about ${f(T.aux_gap_mu,1)} million units, worth roughly ₹${f(T.aux_gap_cr,2)} crore. Annual fixed cost recovered in the month is ₹${f(T.afc,2)} crore. The heat-rate figure and the auxiliary figure overlap by construction — net heat rate already includes auxiliary consumption — so they are not additive.`});
  console.log('stations:', S.length);
})();

/* ---------------- write ---------------- */
fs.mkdirSync(OUT, {recursive:true});
const stats = {};
chunks.forEach(c=>{ stats[c.src]=(stats[c.src]||0)+1; });
const totalChars = chunks.reduce((s,c)=>s+c.text.length,0);
fs.writeFileSync(path.join(OUT,'chunks.json'), JSON.stringify(chunks));
console.log('chunks:', chunks.length, '| chars:', totalChars,
  '| mean', Math.round(totalChars/chunks.length));
console.log(stats);
