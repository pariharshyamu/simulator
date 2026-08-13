/* =========================================================================
   ALGORITHM ANATOMY THEATRE — core
   Shared utilities, the specimen, the plant dataset, and the 3-D engine.
   ========================================================================= */

/* ---------- small maths ---------- */
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function lerp(a,b,t){ return a+(b-a)*t; }
function mean(a){ let s=0,n=0; for(const x of a){ if(!isNaN(x)){s+=x;n++;} } return n?s/n:0; }
function sd(a){ const m=mean(a); let s=0,n=0; for(const x of a){ if(!isNaN(x)){s+=(x-m)*(x-m);n++;} } return n>1?Math.sqrt(s/(n-1)):0; }
function mn(a){ return a.reduce((p,c)=>Math.min(p,c), Infinity); }
function mx(a){ return a.reduce((p,c)=>Math.max(p,c), -Infinity); }
function rng(seed){ let s=seed>>>0; return function(){ s|=0; s=s+0x6D2B79F5|0;
  let t=Math.imul(s^s>>>15,1|s); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function gauss(r){ let u=0,v=0; while(u===0)u=r(); while(v===0)v=r();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
function f1(x){ return (Math.round(x*10)/10).toFixed(1); }
function f2(x){ return (Math.round(x*100)/100).toFixed(2); }
function f0(x){ return Math.round(x).toLocaleString('en-IN'); }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function easeIO(t){ return t<0.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2; }
function ease(t){ return 1-Math.pow(1-t,3); }
const $ = id=>document.getElementById(id);

/* =========================================================================
   THE SPECIMEN
   One reading, followed through all six modules.
   Koradi TPS Unit 8 (660 MW supercritical) — ID fan A, drive-end bearing.
   ========================================================================= */
const SPEC = {
  tag:'0-FN-201-TE-03',
  what:'ID fan A — drive-end bearing metal temperature',
  unit:'Koradi TPS Unit 8 · 660 MW supercritical',
  day:96, hour:14,
  value:74.2,
  alarm:85, trip:90,
  ctx:{ load:612, amb:34.6, flow:1845, curr:214, vib:4.1, dp:41.6, msT:566 },
  line:'74.2 °C · below the 85 °C alarm · below the 90 °C trip · nothing rings'
};

/* =========================================================================
   THE DATASET
   140 days of hourly data for the ID fan and its unit. One slow bearing
   degradation beginning day 82. Everything the six modules use comes
   from this one array, so the same reading really is the same reading.
   ========================================================================= */
const DATA = (function(){
  const HRS = 24, DAYS = 140, N = DAYS*HRS;
  const r = rng(20260731);
  const rows = new Array(N);
  const FAULT_ON = 82;

  for(let i=0;i<N;i++){
    const day = i/HRS, hod = i%HRS;
    // ---- context drivers (these are the plant, not the fault) ----
    const dow = Math.floor(day)%7;
    // merit-order style load: high by day, backed down at night, deeper at weekends
    let load = 545
      + 88*Math.sin((hod-6)/24*2*Math.PI)          // diurnal demand
      - (dow===0?58:0) - (dow===6?26:0)             // weekend backing down
      + 22*Math.sin(day/11*2*Math.PI)               // slow merit drift
      + 13*gauss(r);
    // two genuine low-load excursions and one start-up ramp
    if(day>36.2 && day<38.6) load = 300 + 40*gauss(r)*0.3;          // technical minimum run
    if(day>63.0 && day<64.1) load = 250 + 30*gauss(r)*0.3;          // reserve shut-down approach
    let startup = 0;
    if(day>64.1 && day<65.4){ startup = 1; load = 190 + (day-64.1)/1.3*430 + 18*gauss(r); }
    load = clamp(load, 175, 662);

    const amb = 30.5 + 6.4*Math.sin((hod-15)/24*2*Math.PI) + 2.6*Math.sin(day/23*2*Math.PI) + 1.05*gauss(r);
    const cw  = 0.62*amb + 12.4 + 0.5*gauss(r);
    const coalGCV = 3520 + 190*Math.sin(day/9*2*Math.PI) + 55*gauss(r);   // as-fired kcal/kg

    // ---- fan aerodynamics ----
    const flow = 1.02*load + 1215 + 4.2*(amb-30.5) + 0.06*(3520-coalGCV) + 11*gauss(r);
    const dp   = 0.0000098*flow*flow + 0.0035*flow - 4 + 0.9*gauss(r);
    const curr = 0.126*flow - 9.5 + 0.35*(amb-30.5) + 1.5*gauss(r);
    const msT  = load>230 ? 566 + 0.006*(load-560) - (startup?38:0) + 1.4*gauss(r) : 470 + 26*gauss(r)*0.4;
    const auxP = 8.6 + 640/Math.max(200,load) + (startup?2.4:0) + 0.09*gauss(r);
    const mills= clamp(Math.round(load/118)+1, 3, 6);
    const o2   = clamp(3.35 + 1300/Math.max(200,load) - 2.2 + 0.16*gauss(r), 2.4, 7.4);

    // ---- the fault: bearing lubrication film breaking down ----
    let fSev = 0;
    if(day>FAULT_ON){ const u=(day-FAULT_ON)/36; fSev = Math.pow(u,1.28); }
    // fault expresses itself in bearing temp and, later and more weakly, in vibration
    const vib = 2.05 + 0.0016*(flow-1700) + 0.22*gauss(r)*0.6 + 3.4*Math.pow(Math.max(0,fSev-0.42),1.5);

    let brgT = 54.0
      + 0.0322*(load-380)          // more gas, more work, more heat
      + 0.660*(amb-24)             // ambient walks straight into the bearing
      + 0.0042*(flow-1700)
      + 0.052*(cw-30)
      + 0.62*(vib-2.2)             // roughness heats it
      + 0.55*gauss(r)
      + 15.4*fSev;                 // <-- the fault

    rows[i] = {i, day, hod, dow, load, amb, cw, coalGCV, flow, dp, curr, msT, auxP, mills, o2,
               vib, brgT, fSev, startup};
  }
  // ---- calibrate so the specimen reads exactly 74.2 °C ----
  const iSpec = SPEC.day*HRS + SPEC.hour;
  const off = SPEC.value - rows[iSpec].brgT;
  for(const R of rows) R.brgT += off;
  // pin the specimen context so the chip and the panels agree with the data
  const S = rows[iSpec];
  SPEC.i = iSpec;
  SPEC.ctx.load = Math.round(S.load); SPEC.ctx.amb = Math.round(S.amb*10)/10;
  SPEC.ctx.flow = Math.round(S.flow); SPEC.ctx.curr = Math.round(S.curr);
  SPEC.ctx.vib  = Math.round(S.vib*10)/10; SPEC.ctx.dp = Math.round(S.dp*10)/10;
  SPEC.ctx.msT  = Math.round(S.msT);
  return {rows, N, HRS, DAYS, FAULT_ON, iSpec};
})();

/* Feature list — the "40 dimensions" the captions refer to.
   Twelve are real columns above; the rest are the derived and neighbouring
   tags a real MSET / PCA model on one fan would carry. */
const FEATNAMES = ['ID fan A DE bearing temp','ID fan A NDE bearing temp','ID fan B DE bearing temp',
 'Motor DE bearing temp','Motor NDE bearing temp','Motor winding U','Motor winding V','Motor winding W',
 'Motor current','Motor kW','Fan inlet damper %','Blade pitch %','Fan flow','Fan inlet pressure',
 'Fan outlet pressure','Fan differential pressure','Vibration DE horizontal','Vibration DE vertical',
 'Vibration DE axial','Vibration NDE horizontal','Lube oil supply pressure','Lube oil supply temp',
 'Lube oil tank level','Cooling water inlet temp','Cooling water outlet temp','Cooling water flow',
 'Unit load','Main steam temperature','Main steam pressure','Furnace draught','APH gas outlet temp',
 'ESP inlet gas temp','Flue gas O₂','Ambient temperature','Ambient humidity','Mills in service',
 'Total air flow','Secondary air pressure','Coal flow','Time since last start'];

/* =========================================================================
   TH3 — the 3-D engine shared by all six modules
   ========================================================================= */
const TH3 = (function(){
  let renderer, scene, cam, root, host, labelHost;
  let labels = [];
  let orb = {yaw:0.86, pitch:0.40, dist:13, tgt:new THREE.Vector3(0,0,0),
             drag:false, pan:false, px:0, py:0, auto:0};
  let fly = null;
  let frameCB = null, clock0 = performance.now(), lastT = 0;
  const COL = {
    bg:0x0E1620, steel:0xB6C3D0, dark:0x62788E, ember:0xD96A16, teal:0x11707F,
    base:0x44586C, hot:0xD24A28, cool:0x8494A4, copper:0xD08A3E, grn:0x33A06B,
    vio:0x8A76C4, amb:0xE0A63A, dim:0x3A4C5E, white:0xE9F1F7, sky:0x6FB7D8
  };

  function mat(c,o={}){
    const {rough=0.42, metal=0.25, emis=0, op=1, flat=false, side=0} = o;
    return new THREE.MeshStandardMaterial({color:c, roughness:rough, metalness:metal,
      emissive:emis?(o.ec!==undefined?o.ec:c):0x000000, emissiveIntensity:emis,
      transparent:op<1, opacity:op, flatShading:flat,
      side: side===2?THREE.DoubleSide:(side===1?THREE.BackSide:THREE.FrontSide),
      depthWrite: op>=0.985});
  }
  function basic(c,op,o={}){ return new THREE.MeshBasicMaterial({color:c, transparent:op<1, opacity:op,
      side:o.side===2?THREE.DoubleSide:THREE.FrontSide, depthWrite:op>=0.99}); }
  function sph(r,c,o={}){ return new THREE.Mesh(new THREE.SphereGeometry(r, o.seg||18, o.seg2||12), mat(c,o)); }
  function box(w,h,d,c,o={}){ return new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat(c,o)); }
  function cyl(r1,r2,h,seg,c,o={}){ return new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,seg||18,1,!!o.open), mat(c,o)); }
  function plane(w,h,c,o={}){ const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h,o.seg||1,o.seg||1), mat(c,Object.assign({side:2},o))); return m; }

  /* a tube from a to b — used everywhere for weighted links */
  function tube(a,b,r,c,o={}){
    const d = new THREE.Vector3().subVectors(b,a); const len = d.length();
    const g = new THREE.Mesh(new THREE.CylinderGeometry(r,r,Math.max(len,1e-5),o.seg||8), mat(c,o));
    g.position.copy(a).add(b).multiplyScalar(0.5);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), d.clone().normalize());
    g.userData.setEnds = function(a2,b2,r2){
      const dd = new THREE.Vector3().subVectors(b2,a2); const L = Math.max(dd.length(),1e-5);
      g.position.copy(a2).add(b2).multiplyScalar(0.5);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dd.clone().normalize());
      g.scale.set(r2!==undefined?r2/r:g.scale.x, L/Math.max(len,1e-5), r2!==undefined?r2/r:g.scale.z);
    };
    return g;
  }
  function arrow(a,b,c,o={}){
    const grp = new THREE.Group();
    const d = new THREE.Vector3().subVectors(b,a); const L = d.length();
    const hr = o.headR || Math.min(0.16, L*0.10), hl = o.headL || Math.min(0.42, L*0.24);
    const sr = o.r || hr*0.34;
    const shaft = tube(a, new THREE.Vector3().copy(a).add(d.clone().setLength(Math.max(L-hl,0.001))), sr, c, o);
    grp.add(shaft);
    const head = new THREE.Mesh(new THREE.ConeGeometry(hr, hl, o.seg||14), mat(c,o));
    head.position.copy(b).add(d.clone().setLength(-hl/2));
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), d.clone().normalize());
    grp.add(head);
    grp.userData.setEnds=(a2,b2)=>{
      const dd=new THREE.Vector3().subVectors(b2,a2), LL=Math.max(dd.length(),0.002);
      shaft.userData.setEnds(a2, new THREE.Vector3().copy(a2).add(dd.clone().setLength(Math.max(LL-hl,0.001))));
      head.position.copy(b2).add(dd.clone().setLength(-hl/2));
      head.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dd.clone().normalize());
    };
    return grp;
  }
  /* dashed line between two points (segments) */
  function dashed(a,b,c,o={}){
    const grp = new THREE.Group();
    const d = new THREE.Vector3().subVectors(b,a), L=d.length();
    const seg = o.seg||0.16, gap=o.gap||0.11, r=o.r||0.018;
    const n = Math.max(1,Math.floor(L/(seg+gap)));
    for(let i=0;i<n;i++){
      const t0=i*(seg+gap)/L, t1=Math.min(1,(i*(seg+gap)+seg)/L);
      grp.add(tube(new THREE.Vector3().copy(a).addScaledVector(d,t0),
                   new THREE.Vector3().copy(a).addScaledVector(d,t1), r, c, {emis:o.emis||0.5, rough:.5}));
    }
    return grp;
  }
  function lineSet(pairs, colors){
    const pos = new Float32Array(pairs.length*3), col = new Float32Array(pairs.length*3);
    pairs.forEach((p,i)=>{ pos[i*3]=p.x; pos[i*3+1]=p.y; pos[i*3+2]=p.z;
      const c = colors[i]||new THREE.Color(0x888888); col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b; });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos,3));
    g.setAttribute('color', new THREE.BufferAttribute(col,3));
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({vertexColors:true, transparent:true, opacity:0.9}));
  }
  let _dotTex=null;
  function dotTexture(){
    if(_dotTex) return _dotTex;
    const c=document.createElement('canvas'); c.width=c.height=64;
    const g=c.getContext('2d');
    const gr=g.createRadialGradient(32,32,1,32,32,31);
    gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(0.55,'rgba(255,255,255,0.96)');
    gr.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=gr; g.beginPath(); g.arc(32,32,31,0,6.2832); g.fill();
    _dotTex=new THREE.CanvasTexture(c); return _dotTex;
  }
  function points(xyz, cols, size){
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(xyz),3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols),3));
    const m = new THREE.PointsMaterial({size:size||0.13, vertexColors:true, sizeAttenuation:true,
      transparent:true, opacity:0.95, map:dotTexture(), alphaTest:0.22, depthWrite:true});
    return new THREE.Points(g,m);
  }

  /* ---------- HTML labels projected onto the scene ---------- */
  function label(text, target, cls){
    const el = document.createElement('div');
    el.className = 'l3d' + (cls? ' '+cls : '');
    el.innerHTML = text;
    labelHost.appendChild(el);
    const L = {el, v:new THREE.Vector3(), obj:null, off:[10,0], vis:true, hideBehind:false,
      set(t){ el.innerHTML=t; return L; },
      at(x,y,z){ if(x&&x.isVector3) L.v.copy(x); else L.v.set(x,y,z); L.obj=null; return L; },
      follow(o){ L.obj=o; return L; },
      offset(dx,dy){ L.off=[dx,dy]; return L; },
      show(b){ L.vis=b; if(!b) el.style.display='none'; return L; },
      cls(c){ el.className='l3d'+(c?' '+c:''); return L; },
      center(){ el.style.transform='translate(-50%,-50%)'; L.off=[0,0]; return L; },
      remove(){ el.remove(); const k=labels.indexOf(L); if(k>=0) labels.splice(k,1); }
    };
    if(target){ if(target.isVector3) L.at(target); else L.follow(target); }
    labels.push(L); return L;
  }
  function clearLabels(){ labels.forEach(l=>l.el.remove()); labels=[]; }

  /* ---------- axis frame with named axes and ticks ---------- */
  function axisFrame(opt){
    const {size=5, names=['x','y','z'], colors=[0x6E8496,0x6E8496,0x6E8496],
           ticks=null, floor=true} = opt||{};
    const g = new THREE.Group();
    const O = new THREE.Vector3(0,0,0);
    const ends = [new THREE.Vector3(size,0,0), new THREE.Vector3(0,size,0), new THREE.Vector3(0,0,size)];
    ends.forEach((e,i)=>{
      g.add(arrow(O, e, colors[i], {r:0.022, headR:0.075, headL:0.22, rough:.6, metal:.2, emis:0.28}));
      label(names[i], e.clone().multiplyScalar(1.06), 'ax').offset(i===1?-4:8, i===1?-12:0);
    });
    if(floor){
      const gh = new THREE.GridHelper(size*2, 10, 0x2E4054, 0x1E2C3A);
      gh.position.set(size/2-0.0001, 0, size/2);
      gh.scale.set(0.5,1,0.5);
      g.add(gh);
    }
    if(ticks) ticks.forEach(t=>{
      const p = t.axis===0?new THREE.Vector3(t.at*size,0,0):t.axis===1?new THREE.Vector3(0,t.at*size,0):new THREE.Vector3(0,0,t.at*size);
      label(t.t, p, 'ax').offset(t.axis===1?-34:-2, t.axis===1?0:12);
    });
    return g;
  }

  /* ---------- init ---------- */
  function init(container, lh){
    host = container; labelHost = lh;
    renderer = new THREE.WebGLRenderer({antialias:true, alpha:false});
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio||1));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);
    scene = new THREE.Scene();
    scene.background = new THREE.Color(COL.bg);
    cam = new THREE.PerspectiveCamera(42, host.clientWidth/host.clientHeight, 0.05, 400);

    scene.add(new THREE.AmbientLight(0xC4D8E8, 0.62));
    scene.add(new THREE.HemisphereLight(0xAECDE4, 0x2A3644, 0.95));
    const key = new THREE.DirectionalLight(0xFFF4E6, 1.35); key.position.set(6,9,6); scene.add(key);
    const fill= new THREE.DirectionalLight(0xE8F2FA, 0.62); fill.position.set(-5,4,7); scene.add(fill);
    const rim = new THREE.DirectionalLight(0x8FC4E4, 0.70); rim.position.set(-7,4,-6); scene.add(rim);

    root = new THREE.Group(); scene.add(root);

    const el = renderer.domElement;
    el.style.cursor='grab';
    /* Without this the browser treats a drag across the canvas as a page
       scroll and a two-finger spread as a page zoom, so on a phone the scene
       could not be orbited at all — the gesture was gone before three.js
       ever saw it. */
    el.style.touchAction='none';

    /* One pointer orbits, two pinch. Tracking them in a map rather than
       reading e.touches keeps mouse, pen and finger on the same code path. */
    const pts = new Map();
    let pinch0 = 0, dist0 = 0, tap = null;

    const spread = () => {
      const [a,b] = [...pts.values()];
      return Math.hypot(a.x-b.x, a.y-b.y);
    };

    el.addEventListener('pointerdown', e=>{
      pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
      try{ el.setPointerCapture(e.pointerId); }catch(err){}
      if(pts.size===2){ orb.drag=false; pinch0=spread(); dist0=orb.dist; return; }
      orb.drag=true; orb.pan=(e.button===2||e.shiftKey);
      orb.px=e.clientX; orb.py=e.clientY; el.style.cursor='grabbing';
      /* Remember where this gesture began so a release that never moved can
         be treated as a tap on whatever is under it. */
      tap={x:e.clientX, y:e.clientY, t:performance.now(), id:e.pointerId};
    });
    el.addEventListener('contextmenu', e=>e.preventDefault());

    const release = e=>{
      pts.delete(e.pointerId);
      if(pts.size<2) pinch0=0;
      orb.drag=false; if(el) el.style.cursor='grab';
      if(tap && tap.id===e.pointerId){
        const moved=Math.hypot(e.clientX-tap.x, e.clientY-tap.y);
        if(moved<6 && performance.now()-tap.t<600) doPick(e.clientX, e.clientY);
        tap=null;
      }
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', e=>{ pts.delete(e.pointerId); orb.drag=false; tap=null; });
    window.addEventListener('pointerup', ()=>{ orb.drag=false; if(el) el.style.cursor='grab'; });

    el.addEventListener('pointermove', e=>{
      if(pts.has(e.pointerId)) pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
      if(pts.size===2 && pinch0){
        fly=null; tap=null;
        const s=spread();
        if(s>4) orb.dist = clamp(dist0 * (pinch0/s), 1.6, 70);
        return;
      }
      if(!orb.drag) return; fly=null;
      const dx=e.clientX-orb.px, dy=e.clientY-orb.py;
      if(orb.pan){
        const right = new THREE.Vector3().crossVectors(cam.getWorldDirection(new THREE.Vector3()), cam.up).normalize();
        const up = cam.up.clone();
        orb.tgt.addScaledVector(right, -dx*orb.dist*0.0013).addScaledVector(up, dy*orb.dist*0.0013);
      } else {
        orb.yaw += dx*0.0085; orb.pitch = clamp(orb.pitch + dy*0.0062, -0.55, 1.32);
      }
      orb.px=e.clientX; orb.py=e.clientY;
    });
    el.addEventListener('wheel', e=>{ e.preventDefault(); fly=null;
      orb.dist = clamp(orb.dist*(1+e.deltaY*0.0011), 1.6, 70); }, {passive:false});
    new ResizeObserver(()=>resize()).observe(host);
    animate();
  }
  function resize(){ if(!renderer||!host.clientWidth) return;
    renderer.setSize(host.clientWidth, host.clientHeight);
    cam.aspect=host.clientWidth/host.clientHeight; cam.updateProjectionMatrix(); }

  function clear(){
    while(root.children.length){ const c=root.children[0]; root.remove(c); disposeTree(c); }
    clearLabels(); frameCB=null; fly=null; orb.auto=0;
    /* Drop the pick list with the scene. Leaving it holds disposed geometry
       alive and lets a tap in a new module select a neuron from the old one. */
    pickList = []; pickCB = null;
  }
  function disposeTree(o){ o.traverse&&o.traverse(x=>{ if(x.geometry) x.geometry.dispose();
    if(x.material){ if(Array.isArray(x.material)) x.material.forEach(m=>m.dispose()); else x.material.dispose(); } }); }

  function setCam(y,p,d,t,animateIt){
    const tgt = t? (t.isVector3?t.clone():new THREE.Vector3(t[0],t[1],t[2])) : orb.tgt.clone();
    if(animateIt===false){ orb.yaw=y; orb.pitch=p; orb.dist=d; orb.tgt.copy(tgt); fly=null; }
    else fly = {t0:performance.now(), dur:(animateIt===true?1200:(animateIt||1200)),
                y0:orb.yaw, p0:orb.pitch, d0:orb.dist, g0:orb.tgt.clone(), y1:y, p1:p, d1:d, g1:tgt};
  }
  function autospin(v){ orb.auto = v||0; }
  function onFrame(cb){ frameCB = cb; }
  function getCam(){ return {yaw:orb.yaw, pitch:orb.pitch, dist:orb.dist, tgt:orb.tgt.clone()}; }
  function toScreen(v){ const p=v.clone().project(cam);
    return {x:(p.x*0.5+0.5)*host.clientWidth, y:(-p.y*0.5+0.5)*host.clientHeight, z:p.z,
            vis:p.z<1 && Math.abs(p.x)<1.25 && Math.abs(p.y)<1.25}; }

  function animate(){
    requestAnimationFrame(animate);
    if(!renderer) return;
    const now = performance.now(), t=(now-clock0)/1000, dt=Math.min(0.05,(now-lastT)/1000||0.016);
    lastT = now;
    if(fly){
      const u = clamp((now-fly.t0)/fly.dur, 0, 1), e = easeIO(u);
      orb.yaw = lerp(fly.y0, fly.y1, e); orb.pitch = lerp(fly.p0, fly.p1, e);
      orb.dist = lerp(fly.d0, fly.d1, e);
      orb.tgt.lerpVectors(fly.g0, fly.g1, e);
      if(u>=1) fly=null;
    }
    if(orb.auto && !orb.drag && !fly) orb.yaw += orb.auto*dt;
    const cy=Math.cos(orb.pitch), sy=Math.sin(orb.pitch);
    cam.position.set(orb.tgt.x + Math.sin(orb.yaw)*cy*orb.dist,
                     orb.tgt.y + sy*orb.dist,
                     orb.tgt.z + Math.cos(orb.yaw)*cy*orb.dist);
    cam.lookAt(orb.tgt);
    if(frameCB){ try{ frameCB(t, dt); }catch(e){ console.error(e); frameCB=null; } }
    // labels
    const W=host.clientWidth, H=host.clientHeight;
    for(const L of labels){
      if(!L.vis){ L.el.style.display='none'; continue; }
      if(L.obj) L.obj.getWorldPosition(L.v);
      const s = toScreen(L.v);
      if(!s.vis){ L.el.style.display='none'; continue; }
      L.el.style.display='block';
      L.el.style.left = (s.x + L.off[0]) + 'px';
      L.el.style.top  = (s.y + L.off[1]) + 'px';
    }
    renderer.render(scene, cam);
  }

  /* ---------------------------------------------------------- picking
     A module registers a list of meshes and a callback; a tap that did not
     turn into an orbit raycasts against them. This is what makes "click the
     neuron to see its arithmetic" possible on a phone, where there is no
     hover to hint that a thing is clickable and a dropdown is the only
     alternative. Registered meshes get a slightly generous hit radius,
     because a fingertip is about 8 mm across and a neuron is not. */
  let pickList = [], pickCB = null;
  const ray = new THREE.Raycaster();
  function onPick(list, cb){
    pickList = list || []; pickCB = cb || null;
    if (ray.params.Points) ray.params.Points.threshold = 0.2;
  }
  function doPick(cx, cy){
    if (!pickCB || !pickList.length || !renderer) return;
    const r = renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((cx-r.left)/r.width)*2-1, -((cy-r.top)/r.height)*2+1);
    ray.setFromCamera(v, cam);
    const hits = ray.intersectObjects(pickList, false);
    if (hits.length){ pickCB(hits[0].object, hits[0]); return; }
    /* Missed every mesh. Fall back to the nearest one in screen space, so a
       finger that lands beside a small sphere still selects it rather than
       doing nothing — but only if it is genuinely close. */
    let best = null, bd = 34;
    for (const m of pickList){
      const p = m.getWorldPosition(new THREE.Vector3()).project(cam);
      const sx = r.left + (p.x*0.5+0.5)*r.width, sy = r.top + (-p.y*0.5+0.5)*r.height;
      const d = Math.hypot(sx-cx, sy-cy);
      if (p.z < 1 && d < bd){ bd = d; best = m; }
    }
    if (best) pickCB(best, null);
  }

  return {init, clear, resize, setCam, autospin, onFrame, getCam, toScreen, onPick,
          label, clearLabels, axisFrame,
          mat, basic, sph, box, cyl, plane, tube, arrow, dashed, lineSet, points,
          COL, get root(){return root;}, get scene(){return scene;}, get cam(){return cam;},
          get host(){return host;}};
})();

/* =========================================================================
   2-D chart helper for the panel insets
   ========================================================================= */
function chart(cv, o){
  const dpr = Math.min(2, window.devicePixelRatio||1);
  const W = cv.clientWidth||520, H = o.h||150;
  cv.width = W*dpr; cv.height = H*dpr; cv.style.height = H+'px';
  const g = cv.getContext('2d'); g.setTransform(dpr,0,0,dpr,0,0);
  g.clearRect(0,0,W,H); g.fillStyle='#fff'; g.fillRect(0,0,W,H);
  const L=o.left!==undefined?o.left:44, R=o.right!==undefined?o.right:10,
        T=o.top!==undefined?o.top:12, B=o.bottom!==undefined?o.bottom:24;
  const pw=W-L-R, ph=H-T-B;
  const series = o.series||[];
  let x0=o.x0, x1=o.x1, y0=o.y0, y1=o.y1;
  if(x0===undefined){ x0=Infinity; x1=-Infinity; series.forEach(s=>s.pts.forEach(p=>{x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);})); }
  if(y0===undefined){ y0=Infinity; y1=-Infinity; series.forEach(s=>s.pts.forEach(p=>{if(!isNaN(p[1])){y0=Math.min(y0,p[1]);y1=Math.max(y1,p[1]);}}));
    const pad=(y1-y0)*0.12||1; y0-=pad; y1+=pad; }
  if(!isFinite(x0)){x0=0;x1=1;} if(!isFinite(y0)){y0=0;y1=1;}
  const X = v=>L+(v-x0)/(x1-x0||1)*pw, Y = v=>T+ph-(v-y0)/(y1-y0||1)*ph;
  // bands
  (o.bands||[]).forEach(b=>{ g.fillStyle=b.c; g.fillRect(X(b.x0),T,Math.max(1,X(b.x1)-X(b.x0)),ph); });
  (o.hbands||[]).forEach(b=>{ g.fillStyle=b.c; g.fillRect(L,Y(b.y1),pw,Math.max(1,Y(b.y0)-Y(b.y1))); });
  // grid
  g.strokeStyle='#E7EDF2'; g.lineWidth=1; g.font='9.5px Calibri,sans-serif'; g.fillStyle='#7A8896';
  const ny=o.ny||4;
  for(let i=0;i<=ny;i++){ const v=y0+(y1-y0)*i/ny, y=Y(v);
    g.beginPath(); g.moveTo(L,y); g.lineTo(L+pw,y); g.stroke();
    g.textAlign='right'; g.textBaseline='middle';
    g.fillText(o.yfmt?o.yfmt(v):(Math.abs(v)>=100?v.toFixed(0):v.toFixed(Math.abs(v)<10?2:1)), L-5, y); }
  const nx=o.nx||5;
  for(let i=0;i<=nx;i++){ const v=x0+(x1-x0)*i/nx, x=X(v);
    if(i>0&&i<nx){ g.strokeStyle='#F0F4F7'; g.beginPath(); g.moveTo(x,T); g.lineTo(x,T+ph); g.stroke(); }
    g.textAlign='center'; g.textBaseline='top'; g.fillStyle='#7A8896';
    g.fillText(o.xfmt?o.xfmt(v):(Math.abs(v)>=100?v.toFixed(0):v.toFixed(1)), x, T+ph+4); }
  // axis
  g.strokeStyle='#C8D3DC'; g.beginPath(); g.moveTo(L,T); g.lineTo(L,T+ph); g.lineTo(L+pw,T+ph); g.stroke();
  // marks
  (o.marks||[]).forEach(m=>{
    g.strokeStyle=m.c||'#A8261E'; g.setLineDash(m.dash||[4,3]); g.lineWidth=m.w||1.3;
    g.beginPath();
    if(m.x!==undefined){ g.moveTo(X(m.x),T); g.lineTo(X(m.x),T+ph); }
    else { g.moveTo(L,Y(m.y)); g.lineTo(L+pw,Y(m.y)); }
    g.stroke(); g.setLineDash([]);
    if(m.t){ g.fillStyle=m.c||'#A8261E'; g.font='700 9.5px Calibri,sans-serif';
      if(m.x!==undefined){ g.textAlign=m.ta||'left'; g.textBaseline='top'; g.fillText(m.t, X(m.x)+3, T+2); }
      else { g.textAlign='right'; g.textBaseline='bottom'; g.fillText(m.t, L+pw-3, Y(m.y)-2); } }
  });
  // series
  g.save(); g.beginPath(); g.rect(L,T,pw,ph); g.clip();
  series.forEach(s=>{
    if(s.type==='dots'){
      g.fillStyle=s.c; s.pts.forEach(p=>{ if(isNaN(p[1]))return;
        g.beginPath(); g.arc(X(p[0]),Y(p[1]), s.r||2, 0, 6.2832); g.fill(); });
    } else if(s.type==='bars'){
      const bw = Math.max(2, pw/s.pts.length*0.72);
      g.fillStyle=s.c; s.pts.forEach(p=>{ if(isNaN(p[1]))return;
        const y=Y(Math.max(p[1],y0)); g.fillRect(X(p[0])-bw/2, y, bw, T+ph-y); });
    } else {
      g.strokeStyle=s.c; g.lineWidth=s.w||1.6; g.setLineDash(s.dash||[]);
      g.beginPath(); let pen=false;
      s.pts.forEach(p=>{ if(isNaN(p[1])){pen=false;return;} const x=X(p[0]),y=Y(p[1]);
        if(!pen){ g.moveTo(x,y); pen=true; } else g.lineTo(x,y); });
      g.stroke(); g.setLineDash([]);
    }
  });
  (o.dots||[]).forEach(d=>{ g.fillStyle=d.c; g.strokeStyle='#fff'; g.lineWidth=1.6;
    g.beginPath(); g.arc(X(d.x),Y(d.y), d.r||4.5, 0, 6.2832); g.fill(); g.stroke();
    if(d.t){ g.fillStyle=d.c; g.font='700 10px Calibri,sans-serif'; g.textAlign=d.ta||'left'; g.textBaseline='bottom';
      g.fillText(d.t, X(d.x)+(d.ta==='right'?-7:7), Y(d.y)-4); } });
  g.restore();
  if(o.title){ g.fillStyle='#4E5F70'; g.font='700 10px Calibri,sans-serif'; g.textAlign='left'; g.textBaseline='top';
    g.fillText(o.title, L, 1); }
}
