/* =========================================================================
   3D machine views — three.js

   ONE RULE, AND IT EXISTS BECAUSE BREAKING IT PRODUCED A REAL BUG.

   Every rotating machine here lies along the X axis. Cylinder geometry is
   baked into that orientation at creation time (see xcyl), so a part spins
   with `rotation.x` about its own centreline and nothing else.

   Anything whose axis is not X — a mill roller pointing radially, a cooler
   fan pointing down — is placed inside a group that carries the orientation,
   and the part spins on a single local axis inside it.

   What this prevents: the shaft used to be laid along X with `rotation.z =
   PI/2` and then driven with `rotation.y`. Under three.js' default XYZ Euler
   order that Y rotation is composed *after* the Z tilt, about the world Y
   axis — so the shaft swept a cone at right angles to the impeller it was
   supposed to be driving. Set an orientation and a spin on the same object
   with two different Euler components and you get a wobble, not a rotation.
   ========================================================================= */
const V3 = (function(){
  let renderer, scene, cam, root, host, labelHost;
  let spin = {yaw:0.72, pitch:0.30, dist:8.4, drag:false, px:0, py:0,
              target:new THREE.Vector3(0,0.20,0), fit:8.4};

  /* The default camera sits up and to the +X +Z side. Cut-aways are aimed at
     it, and the same constant orients the stator core, its slots and its end
     windings so they can never drift apart. */
  const VIEW_AZ = Math.PI*0.30;              // azimuth the viewer looks from
  const CUT     = Math.PI*0.44;              // width of the wedge removed
  let parts = {}, markers = [], clock0 = performance.now();
  let state = {sev:0, vib:0, heat:0, running:true, rpm:1.0, sensors:{}, caseId:null};

  const COL = {steel:0xB6C3D0, dark:0x62788E, ember:0xD96A16, teal:0x11707F,
               base:0x44586C, hot:0xD24A28, cool:0x8494A4, copper:0xD08A3E, oil:0x2E4152,
               porc:0xD8DEE4, glass:0x9FC4D8, grime:0x4A5560, lam:0x7A8A99};

  function mat(c,{rough=0.45,metal=0.35,emis=0,op=1,side=0}={}){
    return new THREE.MeshStandardMaterial({color:c, roughness:rough, metalness:metal,
      emissive:emis?c:0x000000, emissiveIntensity:emis, transparent:op<1, opacity:op,
      side: side ? THREE.DoubleSide : THREE.FrontSide});
  }

  /* --- primitives -------------------------------------------------------
     xcyl/ycyl/zcyl bake the axis into the geometry. A mesh made by xcyl
     spins correctly on rotation.x, by ycyl on rotation.y, by zcyl on
     rotation.z — with no dependence on Euler order, and safe to nest. */
  /* AZIMUTH. Everywhere in this file an angle `a` around the X axis means the
     direction (y = cos a, z = sin a): a = 0 is straight up, a = PI/2 is
     towards the viewer. ringOf, the volute and the blade rings all use it.

     three.js does not. CylinderGeometry measures theta from +Z, TorusGeometry
     and RingGeometry from +X, and the rotations that lay each one along X
     shift them differently again. The offsets below are applied once, here,
     so a caller passing t0 gets a section where it asked for one. Getting
     this wrong pointed the motor's cut-away at the floor. */
  const CYL_AZ  = -Math.PI/2;      // CylinderGeometry theta -> our azimuth
  const RING_AZ =  Math.PI/2;      // RingGeometry / TorusGeometry theta -> ours

  function cylGeo(r1,r2,h,seg,o,azOff){
    return new THREE.CylinderGeometry(r1,r2,h,seg||28,1,!!o.open,
                                      (o.t0||0) + (azOff||0),
                                      o.tlen===undefined?Math.PI*2:o.tlen);
  }
  function xcyl(r1,r2,h,seg,c,o={}){ const g=cylGeo(r1,r2,h,seg,o,CYL_AZ); g.rotateZ(-Math.PI/2);
    return new THREE.Mesh(g, mat(c,o)); }
  function ycyl(r1,r2,h,seg,c,o={}){ return new THREE.Mesh(cylGeo(r1,r2,h,seg,o), mat(c,o)); }
  function zcyl(r1,r2,h,seg,c,o={}){ const g=cylGeo(r1,r2,h,seg,o); g.rotateX(Math.PI/2);
    return new THREE.Mesh(g, mat(c,o)); }
  function box(w,h,d,c,o={}){ return new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat(c,o)); }
  function sph(r,c,o={}){ return new THREE.Mesh(new THREE.SphereGeometry(r,20,14), mat(c,o)); }
  /* An arc torus around the X axis, starting at azimuth o.t0. */
  function xtorus(r,t,c,o={}){ const g=new THREE.TorusGeometry(r,t,10,o.seg||30,
      o.arc===undefined?Math.PI*2:o.arc); g.rotateY(Math.PI/2);
    const m = new THREE.Mesh(g, mat(c,o));
    if(o.t0) m.rotation.x = o.t0 + RING_AZ;
    return m; }
  function ytorus(r,t,c,o={}){ const g=new THREE.TorusGeometry(r,t,10,o.seg||30);
      g.rotateX(Math.PI/2); return new THREE.Mesh(g, mat(c,o)); }
  /* An open annulus facing along X — a casing side plate you can see through,
     which is the difference between a fan and a drum. */
  function xring(inner,outer,c,o={}){
    const g=new THREE.RingGeometry(inner,outer,o.seg||44,1,(o.t0||0) + RING_AZ,
                                   o.tlen===undefined?Math.PI*2:o.tlen);
    g.rotateY(Math.PI/2);
    return new THREE.Mesh(g, mat(c,Object.assign({side:1},o)));
  }

  /* A ring of small parts around the X axis — bolts, studs, cage bars. */
  function ringOf(n, radius, make, parent, phase){
    const out=[];
    for(let i=0;i<n;i++){
      const a = (i/n)*Math.PI*2 + (phase||0);
      const m = make(i, a);
      if(!m) continue;
      m.position.y += Math.cos(a)*radius;
      m.position.z += Math.sin(a)*radius;
      parent.add(m); out.push(m);
    }
    return out;
  }

  /* A bolted flange: a disc face with a ring of bolt heads, so that a
     stationary joint reads as a joint and not as a change of colour. */
  function flange(rOuter, rBolt, nBolt, colour){
    const g = new THREE.Group();
    const f = xcyl(rOuter, rOuter, 0.05, 24, colour, {rough:.55, metal:.7}); g.add(f);
    ringOf(nBolt, rBolt, () => {
      const b = xcyl(0.026, 0.026, 0.085, 6, 0x3B4A59, {rough:.6, metal:.8});
      b.position.x = 0.05; return b;
    }, g);
    return g;
  }

  function init(container, labels){
    host = container; labelHost = labels;
    renderer = new THREE.WebGLRenderer({antialias:true, alpha:false});
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio||1));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0F1720);
    scene.fog = new THREE.Fog(0x0F1720, 19, 40);
    cam = new THREE.PerspectiveCamera(42, host.clientWidth/host.clientHeight, 0.1, 100);

    scene.add(new THREE.AmbientLight(0xBFD4E4, 0.55));
    scene.add(new THREE.HemisphereLight(0xAECDE4, 0x2A3644, 1.05));
    const key = new THREE.DirectionalLight(0xFFF4E6, 1.65); key.position.set(5,7,5); scene.add(key);
    const fill= new THREE.DirectionalLight(0xE8F2FA, 0.75); fill.position.set(-3,4,6); scene.add(fill);
    const rim = new THREE.DirectionalLight(0x8FC4E4, 0.85); rim.position.set(-6,3,-4); scene.add(rim);
    const grid = new THREE.GridHelper(24, 24, 0x3A4C5E, 0x243240);
    grid.position.y = -1.62; scene.add(grid);

    root = new THREE.Group(); scene.add(root);

    const el = renderer.domElement;
    el.style.cursor='grab';
    /* Without touch-action the browser treats a drag over the canvas as a
       page scroll and a spread as a page zoom, and the machine cannot be
       turned at all on a phone — which is most of what this view is for. */
    el.style.touchAction='none';

    /* One pointer orbits, two pinch. A Map rather than e.touches so mouse,
       pen and finger all arrive the same way. */
    const pts = new Map();
    let pinch0 = 0, dist0 = 0;
    const spread = () => { const [a,b]=[...pts.values()]; return Math.hypot(a.x-b.x, a.y-b.y); };

    el.addEventListener('pointerdown', e=>{
      pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
      try{ el.setPointerCapture(e.pointerId); }catch(err){}
      if(pts.size===2){ spin.drag=false; pinch0=spread(); dist0=spin.dist; return; }
      spin.drag=true; spin.px=e.clientX; spin.py=e.clientY; el.style.cursor='grabbing';
    });
    const drop = e=>{ pts.delete(e.pointerId); if(pts.size<2) pinch0=0;
                      spin.drag=false; el.style.cursor='grab'; };
    el.addEventListener('pointerup', drop);
    el.addEventListener('pointercancel', drop);
    window.addEventListener('pointerup', ()=>{ spin.drag=false; el.style.cursor='grab'; });
    el.addEventListener('pointermove', e=>{
      if(pts.has(e.pointerId)) pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
      if(pts.size===2 && pinch0){
        const s=spread();
        if(s>4) spin.dist = clamp(dist0 * (pinch0/s), spin.fit*0.42, spin.fit*2.1);
        return;
      }
      if(!spin.drag) return;
      spin.yaw += (e.clientX-spin.px)*0.008; spin.pitch = clamp(spin.pitch + (e.clientY-spin.py)*0.006, -0.25, 1.15);
      spin.px=e.clientX; spin.py=e.clientY; });
    el.addEventListener("wheel", e=>{ e.preventDefault(); spin.dist = clamp(spin.dist + e.deltaY*0.006, spin.fit*0.42, spin.fit*2.1); }, {passive:false});
    new ResizeObserver(()=>resize()).observe(host);
    animate();
  }
  function resize(){ if(!renderer||!host.clientWidth) return;
    renderer.setSize(host.clientWidth, host.clientHeight);
    cam.aspect = host.clientWidth/host.clientHeight; cam.updateProjectionMatrix(); }

  /* ---------------- shared machine pieces ---------------- */
  function clearRoot(){ while(root.children.length) root.remove(root.children[0]);
    parts={}; markers.forEach(m=>m.el.remove()); markers=[]; }

  /* A split journal-bearing pedestal: base, cap, joint bolts and an oil
     sight glass. The ID fan case is a drive-end journal bearing, so the
     part carrying the fault ought to look like the part carrying the fault. */
  function bearingPedestal(g, x, key, opt){
    opt = opt || {};
    const r = opt.r || 0.30, L = opt.len || 0.52;
    const ped = box(0.66, 1.02, 1.02, COL.dark, {rough:.75, metal:.35});
    ped.position.set(x, -0.88, 0); g.add(ped);
    const shim = box(0.72, 0.06, 1.08, 0x3E4E5E, {rough:.85, metal:.3});
    shim.position.set(x, -0.36, 0); g.add(shim);

    /* lower half and cap, parted on the shaft centreline */
    const low = xcyl(r, r, L, 24, COL.steel, {rough:.35, metal:.85, open:false,
                     t0: Math.PI, tlen: Math.PI, side:1});
    low.position.set(x, 0.40, 0); g.add(low);
    const cap = xcyl(r, r, L, 24, COL.steel, {rough:.35, metal:.85, open:false,
                     t0: 0, tlen: Math.PI, side:1});
    cap.position.set(x, 0.40, 0); g.add(cap);
    /* the split faces, so the joint reads from any angle */
    [-1,1].forEach(s=>{
      const ear = box(L*0.9, 0.09, 0.16, COL.steel, {rough:.4, metal:.8});
      ear.position.set(x, 0.40, s*(r+0.06)); g.add(ear);
      const bolt = ycyl(0.028, 0.028, 0.22, 6, 0x3B4A59, {rough:.6, metal:.8});
      bolt.position.set(x, 0.47, s*(r+0.06)); g.add(bolt);
    });
    /* oil sight glass — the thing an operator actually looks at */
    const sg = zcyl(0.055, 0.055, 0.06, 14, COL.glass, {rough:.15, metal:.1, op:0.75});
    sg.position.set(x, 0.20, r + 0.02); g.add(sg);
    parts[key] = cap; parts[key+'_low'] = low;
    return {cap, low};
  }

  /* Induction driver motor for the fan and the pump — feet, terminal box,
     cooling cowl. Not the subject of those two cases, so it stays simple. */
  function driverMotor(g, x){
    const frame = xcyl(0.50, 0.50, 1.30, 26, 0x5E748A, {rough:.6, metal:.55});
    frame.position.set(x, 0.32, 0); g.add(frame);
    for(let i=0;i<20;i++){
      const a=i/20*Math.PI*2;
      const f=box(1.24, 0.10, 0.02, 0x4A6076, {rough:.8, metal:.3});
      f.position.set(x, 0.32 + Math.cos(a)*0.54, Math.sin(a)*0.54);
      f.rotation.x = a; g.add(f);
    }
    [-0.68, 0.68].forEach(dx=>{
      const es = xcyl(0.42, 0.36, 0.16, 22, 0x546A80, {rough:.55, metal:.6});
      es.position.set(x+dx, 0.32, 0); g.add(es);
    });
    const cowl = xcyl(0.40, 0.34, 0.30, 22, 0x41576C, {rough:.7, metal:.4});
    cowl.position.set(x+0.92, 0.32, 0); g.add(cowl);
    const tb = box(0.42, 0.34, 0.30, 0x4A6076, {rough:.7, metal:.4});
    tb.position.set(x, 0.86, 0.34); g.add(tb);
    [-1,1].forEach(s=>{
      const foot = box(0.30, 0.30, 0.14, COL.dark, {rough:.8, metal:.3});
      foot.position.set(x + s*0.45, -0.10, 0.46); g.add(foot);
      const foot2 = foot.clone(); foot2.position.z = -0.46; g.add(foot2);
    });
  }

  /* ---------------- scene builders ---------------- */

  function buildRotor(variant){
    const g = new THREE.Group(); root.add(g);
    parts.spinAxis = 'x';
    /* What gets hot is a property of the machine and its failure mode, not of
       the renderer. The broken-rotor-bar case says in as many words that the
       bearing is "largely blind to this fault"; lighting the bearing up red
       on that case teaches the opposite of the lesson. */
    parts.hot = [];

    const base = box(6.6, 0.34, 2.6, COL.base, {rough:.85, metal:.2});
    base.position.y = -1.42; g.add(base);
    for(let i=0;i<5;i++){
      const rib = box(0.10, 0.20, 2.5, 0x3A4C5E, {rough:.9, metal:.2});
      rib.position.set(-2.6 + i*1.3, -1.20, 0); g.add(rib);
    }

    /* Pedestal x-positions. The pump needs room for a seal gland between
       the barrel and the bearing, so its NDE pedestal sits further out. */
    const deX = variant==='pump' ? -1.27 : -1.15;
    const ndeX = 1.55;
    const de = bearingPedestal(g, deX,  'brg0');
    bearingPedestal(g, ndeX, 'brg1');
    if(variant !== 'motor'){ parts.hot.push([de.cap, 0.75], [de.low, 0.75]); parts.hotBearing = true; }

    /* THE ROTATING ASSEMBLY. Shaft, impeller, cage, coupling half — all in
       one group, all turning about X together, because they are one forging
       and one lump of angular momentum. */
    const rot = new THREE.Group(); rot.position.set(0, 0.40, 0); g.add(rot); parts.rot = rot;

    const shaft = xcyl(0.105, 0.105, 4.5, 20, 0xB9C4CE, {rough:.25, metal:.95});
    shaft.position.x = 0.42; rot.add(shaft);
    /* Journal steps and a key. A plain cylinder turning on its own axis is
       invisible; these give the eye something to track, which is the point
       of animating the rotation at all. */
    [deX, ndeX].forEach(x=>{
      const j = xcyl(0.125, 0.125, 0.58, 20, 0xC9D3DC, {rough:.18, metal:.95});
      j.position.x = x; rot.add(j);
      const col = xcyl(0.145, 0.145, 0.05, 20, 0x9FAEBC, {rough:.3, metal:.9});
      col.position.x = x + 0.33; rot.add(col);
    });
    const keyway = box(0.34, 0.028, 0.055, 0x8A99A8, {rough:.4, metal:.85});
    keyway.position.set(1.98, 0.118, 0); rot.add(keyway);

    if(variant === 'fan')       buildFanEnd(g, rot);
    else if(variant === 'motor') buildMotorEnd(g, rot);
    else                         buildPumpEnd(g, rot);

    /* Coupling: half on the rotor, guard on the frame. */
    if(variant !== 'motor'){
      const hub = xcyl(0.24, 0.24, 0.16, 20, COL.ember, {rough:.4, metal:.7});
      hub.position.x = 1.84; rot.add(hub);
      const hub2 = xcyl(0.24, 0.24, 0.16, 20, COL.ember, {rough:.4, metal:.7});
      hub2.position.x = 2.04; rot.add(hub2);
      ringOf(6, 0.165, () => {
        const b = xcyl(0.028, 0.028, 0.30, 6, 0x6B7B8B, {rough:.5, metal:.85});
        b.position.x = 1.94; return b;
      }, rot);
      parts.coupling = hub;
      const guard = xcyl(0.34, 0.34, 0.46, 22, 0x8CA0B2, {rough:.6, metal:.4, op:0.22, open:true, side:1});
      guard.position.set(1.94, 0.40, 0); g.add(guard);
      driverMotor(g, 2.62);
    }

    /* Lube oil skid: tank, cooler shell, pump, and the two tappings the
       ID fan case actually turns on. */
    const sk = box(1.20, 0.50, 0.72, 0x536A80, {rough:.8, metal:.3});
    sk.position.set(0.15, -1.02, 0.95); g.add(sk); parts.oilSkid = sk;
    if(variant !== 'motor') parts.hot.push([sk, 0.20]);
    const cooler = xcyl(0.17, 0.17, 0.86, 18, 0x60788E, {rough:.55, metal:.55});
    cooler.position.set(0.15, -0.66, 0.95); g.add(cooler);
    [-0.32, 0.44].forEach((dx,i)=>{
      const noz = ycyl(0.05, 0.05, 0.22, 12, COL.teal, {rough:.5, metal:.6});
      noz.position.set(0.15+dx, -0.55, 0.95); g.add(noz);
    });
    const op = ycyl(0.13, 0.13, 0.26, 16, 0x455B70, {rough:.7, metal:.5});
    op.position.set(0.78, -1.14, 0.95); g.add(op);

    return g;
  }

  /* ----- ID fan: centrifugal wheel in a scroll ----- */
  /* A large boiler ID fan is normally double-inlet, double-width: one centre
     plate with a set of backward-curved blades on each side, an inlet eye at
     each end, and the wheel carried between the two bearings — which is
     exactly the pedestal layout this case describes. It is also the only
     arrangement in which you can see the blades, because you are looking
     into an inlet eye rather than at the back of a solid disc. */
  function buildFanEnd(g, rot){
    const cx = -0.02;                       // wheel centreline in x
    const HW = 0.44;                        // half-width of the wheel
    const RT = 0.82;                        // blade tip radius
    const RH = 0.40;                        // blade root radius
    const R0 = 0.92, growth = 0.34;         // volute base radius and growth
    const RMAX = R0 + growth;

    /* Centre plate and hub */
    const centre = xcyl(RT+0.03, RT+0.03, 0.05, 36, 0x74899E, {rough:.5, metal:.7});
    centre.position.x = cx; rot.add(centre);
    const hub = xcyl(0.22, 0.22, 0.44, 22, COL.dark, {rough:.6, metal:.6});
    hub.position.x = cx; rot.add(hub);

    /* Two banks of twelve backward-curved blades, one each side. */
    const blades = new THREE.Group(); rot.add(blades); parts.blades = blades;
    [-1, 1].forEach(side=>{
      for(let i=0;i<12;i++){
        const a = i/12*Math.PI*2;
        const arm = new THREE.Group(); arm.rotation.x = a; blades.add(arm);
        [[RH+0.10, -0.44, 0.26],[RT-0.11, -0.80, 0.24]].forEach(([r, beta, len])=>{
          const bl = box(HW*0.72, len, 0.035, COL.steel, {rough:.45, metal:.8});
          bl.rotation.x = beta; bl.position.set(cx + side*HW*0.52, r, 0); arm.add(bl);
        });
      }
      /* The one translucent surface in the whole wheel. On the machine it is
         solid steel; here it is the difference between seeing twelve blades
         and seeing a cone. Everything around it stays opaque so the scene
         never turns back into layered glass. */
      const shroud = xcyl(RH+0.06, RT+0.02, 0.24, 34, 0x8296A8, {rough:.5, metal:.65, op:0.40});
      shroud.position.x = cx + side*(HW - 0.10); rot.add(shroud);
    });

    /* Volute: a true Archimedean spiral closing on a cutwater, with a wedge
       of casing removed on the side the viewer is on. Solid steel with a
       section cut out of it reads far better than four sheets of glass. */
    const SEGS = 48;
    const scroll = new THREE.Group(); g.add(scroll);
    scroll.position.set(0, 0.40, 0);
    for(let i=0;i<SEGS;i++){
      const t = i/SEGS*Math.PI*2, r = R0 + growth*(t/(Math.PI*2));
      /* d is the angular distance from the viewing direction, so the wedge to
         leave out is the one where d is SMALL. */
      const d = Math.abs(((t - VIEW_AZ + Math.PI*3) % (Math.PI*2)) - Math.PI);
      if(d < CUT*0.72) continue;                         // the cut-away wedge
      const seg = box(HW*2+0.18, 0.055, 2*Math.PI*r/SEGS*1.2, 0x6E869C, {rough:.6, metal:.4});
      seg.position.set(cx, Math.cos(t)*r, Math.sin(t)*r);
      seg.rotation.x = t; scroll.add(seg);
    }
    [-1,1].forEach(s=>{
      const sp = xring(RT+0.05, RMAX, 0x62798F, {rough:.6, metal:.4,
                       t0: VIEW_AZ + CUT*0.72, tlen: Math.PI*2 - CUT*1.44});
      sp.position.set(cx + s*(HW+0.09), 0, 0); scroll.add(sp);
    });
    const cut = box(HW*2+0.18, 0.34, 0.06, 0x55697C, {rough:.6, metal:.4});
    cut.position.set(cx, R0+0.15, 0); scroll.add(cut);     // cutwater

    /* Discharge: up and back, ending where the flue-gas sensor sits. */
    const duct = box(HW*2+0.16, 1.02, 0.52, 0x6A8298, {rough:.65, metal:.4});
    duct.position.set(cx, 1.37, -0.72); duct.rotation.x = 0.98; g.add(duct);
    const dflange = box(HW*2+0.28, 0.07, 0.62, 0x55697C, {rough:.7, metal:.4});
    dflange.position.set(cx, 1.13, -1.08); dflange.rotation.x = 0.98; g.add(dflange);

    /* An inlet box, bell mouth and set of guide vanes at each end. */
    [-1,1].forEach(s=>{
      const bell = xcyl(RH+0.14, RT-0.02, 0.28, 28, 0x6A8298, {rough:.6, metal:.4, op:0.22, open:true, side:1});
      bell.position.set(cx + s*(HW+0.24), 0.40, 0); g.add(bell);
      const igv = new THREE.Group(); igv.position.set(cx + s*(HW+0.40), 0.40, 0); g.add(igv);
      ringOf(10, 0.38, (i,a)=>{
        const v = box(0.055, 0.38, 0.02, 0x94A7B8, {rough:.5, metal:.7});
        v.rotation.x = a + 0.85; return v;
      }, igv);
      const fl = xring(0.24, 0.62, 0x55697C, {rough:.7, metal:.4});
      fl.position.set(cx + s*(HW+0.52), 0.40, 0); g.add(fl);
    });
  }

  /* ----- HT motor: the cage has to be visible or the case has no picture ----- */
  function buildMotorEnd(g, rot){
    /* Rotor core, cage bars proud of it, end rings at both ends. */
    const core = xcyl(0.38, 0.38, 1.46, 30, COL.lam, {rough:.6, metal:.7});
    rot.add(core);
    for(let i=0;i<9;i++){                                    // lamination packs
      const s = xcyl(0.385, 0.385, 0.012, 30, 0x62727F, {rough:.7, metal:.6});
      s.position.x = -0.66 + i*0.165; rot.add(s);
    }
    const bars = new THREE.Group(); rot.add(bars); parts.bars = bars;
    const NB = 16;
    for(let i=0;i<NB;i++){
      const a = i/NB*Math.PI*2;
      const broken = (i===3);
      const y = Math.cos(a)*0.405, z = Math.sin(a)*0.405;
      if(broken){
        /* modelled as what it is: a bar cracked near the end ring, not a
           bar painted a different colour */
        [[-0.44, 0.60],[0.36, 0.72]].forEach(([px, len])=>{
          const b = xcyl(0.032, 0.032, len, 8, COL.hot, {rough:.35, metal:.9});
          b.position.set(px, y, z); bars.add(b);
          if(!parts.brokenBar) parts.brokenBar = b; else parts.brokenBar2 = b;
        });
        const spark = sph(0.055, COL.hot, {emis:1.0, rough:.3, metal:.1});
        spark.position.set(0.00, y, z); bars.add(spark); parts.crack = spark;
      } else {
        const b = xcyl(0.032, 0.032, 1.56, 8, COL.copper, {rough:.35, metal:.9});
        b.position.set(0, y, z); bars.add(b);
      }
    }
    [-0.80, 0.80].forEach(x=>{
      const er = xtorus(0.405, 0.045, COL.copper, {rough:.4, metal:.9});
      er.position.x = x; rot.add(er);
    });

    /* Stator: transparent frame, and a core sectioned so the wedge that is
       missing faces the viewer. VIEW_AZ/CUT drive the core, its bore, its
       slots, its end windings and its fins together, so the section cannot
       come apart when any one of them is edited. */
    const T0 = VIEW_AZ + CUT/2, TLEN = Math.PI*2 - CUT;
    const frame = xcyl(0.66, 0.66, 1.86, 40, 0x6B8296, {rough:.6, metal:.55,
                        open:true, side:1, t0: T0, tlen: TLEN});
    frame.position.set(0.02, 0.40, 0); g.add(frame);
    [-0.93, 0.93].forEach(x=>{                               // sectioned frame edge
      const lip = xring(0.58, 0.66, 0x7C90A4, {rough:.6, metal:.5, t0: T0, tlen: TLEN});
      lip.position.set(x + 0.02, 0.40, 0); g.add(lip);
    });
    const sc = xcyl(0.58, 0.58, 1.70, 44, COL.lam, {rough:.65, metal:.6,
                     open:true, side:1, t0: T0, tlen: TLEN});
    sc.position.set(0.02, 0.40, 0); g.add(sc); parts.hot.push([sc, 0.30]);
    const bore = xcyl(0.46, 0.46, 1.70, 44, 0x55636F, {rough:.7, metal:.5,
                       open:true, side:1, t0: T0, tlen: TLEN});
    bore.position.set(0.02, 0.40, 0); g.add(bore);
    [-0.83, 0.87].forEach(x=>{                               // sectioned core faces
      const face = xring(0.46, 0.58, 0x8B9AA8, {rough:.6, metal:.6, t0: T0, tlen: TLEN});
      face.position.set(x, 0.40, 0); g.add(face);
    });
    const slots = new THREE.Group(); slots.position.set(0.02, 0.40, 0); g.add(slots);
    for(let i=0;i<40;i++){
      const a = T0 + (i/40)*TLEN;
      const s = box(1.70, 0.11, 0.020, 0x8B9AA8, {rough:.5, metal:.7});
      s.position.set(0, Math.cos(a)*0.52, Math.sin(a)*0.52); s.rotation.x = a; slots.add(s);
    }
    /* end windings, the copper you actually see when a motor is opened */
    [-0.92, 0.96].forEach(x=>{
      const ew = xtorus(0.50, 0.085, 0xB07A38, {rough:.5, metal:.7, arc: TLEN});
      ew.position.set(x, 0.40, 0); ew.rotation.x = T0 + Math.PI/2; g.add(ew);
      parts.hot.push([ew, 0.85]);
    });
    for(let i=0;i<24;i++){                                   // cooling fins
      const a = T0 + (i/24)*TLEN;
      const f=box(1.80, 0.13, 0.022, 0x4E6478, {rough:.8, metal:.3});
      f.position.set(0.02, 0.40 + Math.cos(a)*0.70, Math.sin(a)*0.70);
      f.rotation.x = a; g.add(f);
    }
    [-1.00, 1.04].forEach(x=>{                                // end shields
      const es = xcyl(0.60, 0.44, 0.16, 26, 0x546A80, {rough:.55, metal:.6});
      es.position.set(x, 0.40, 0); g.add(es);
    });
    [-1,1].forEach(s=>{                                       // feet
      const ft = box(0.44, 0.34, 0.16, COL.dark, {rough:.8, metal:.3});
      ft.position.set(s*0.62, -0.28, 0.70); g.add(ft);
      const ft2 = ft.clone(); ft2.position.z = -0.70; g.add(ft2);
    });
    const eye = ytorus(0.09, 0.022, 0x8A99A8, {rough:.5, metal:.8});
    eye.position.set(0.02, 1.16, 0); eye.rotation.z = Math.PI/2; g.add(eye);
    const plate = box(0.02, 0.16, 0.30, 0xC2CCD4, {rough:.4, metal:.5});
    plate.position.set(0.02, 0.62, 0.72); plate.rotation.y = Math.PI/2; g.add(plate);

    /* Cable box on the machine, and the switchgear panel where the stator
       current and its sidebands are actually measured. That distinction is
       the whole reason the sideband sensor is marked "not available". */
    const cb = box(0.46, 0.44, 0.36, 0x4A6076, {rough:.7, metal:.4});
    cb.position.set(0.30, 0.98, 0.46); g.add(cb);
    const panel = box(0.72, 2.00, 0.78, 0x46596C, {rough:.7, metal:.4});
    panel.position.set(2.66, -0.22, 0.18); g.add(panel);
    const door = box(0.03, 1.70, 0.66, 0x54697E, {rough:.55, metal:.5});
    door.position.set(2.31, -0.22, 0.18); g.add(door);
    const vent = box(0.04, 0.26, 0.50, 0x38495A, {rough:.8, metal:.3});
    vent.position.set(2.30, 0.52, 0.18); g.add(vent);
    [0.30, -0.10].forEach((y,i)=>{                            // CT / relay faces
      const d = box(0.03, 0.20, 0.24, i? 0x2C3B49 : COL.teal, {rough:.4, metal:.3, emis:i?0:0.35});
      d.position.set(2.29, y, 0.35); g.add(d);
    });
    for(let i=0;i<3;i++){                                     // cable run
      const z = 0.34 + i*0.09;
      const c = xcyl(0.038, 0.038, 1.86, 8, 0x2E3B47, {rough:.9, metal:.1});
      c.position.set(1.36, 0.86, z); g.add(c);
      const drop = ycyl(0.038, 0.038, 0.42, 8, 0x2E3B47, {rough:.9, metal:.1});
      drop.position.set(0.46, 0.86 - 0.21, z); g.add(drop);
    }
    const tray = box(1.90, 0.04, 0.36, 0x3E5064, {rough:.85, metal:.3});
    tray.position.set(1.36, 0.80, 0.43); g.add(tray);
  }

  /* ----- BFP: the seal is the case, so the seal gets modelled ----- */
  function buildPumpEnd(g, rot){
    /* Barrel casing, transparent, with its bolted end covers. */
    const barrel = xcyl(0.64, 0.64, 1.90, 30, COL.dark, {rough:.6, metal:.5, op:0.26, open:true, side:1});
    barrel.position.set(0, 0.40, 0); g.add(barrel);
    [-0.95, 0.95].forEach((x,i)=>{
      const fl = flange(0.72, 0.60, 12, 0x55697C); fl.position.set(x, 0.40, 0); g.add(fl);
    });
    for(let i=0;i<6;i++){                                     // stage diffusers
      const d = xcyl(0.58, 0.58, 0.05, 26, 0x5A7086, {rough:.6, metal:.55, op:0.55});
      d.position.set(-0.72 + i*0.31 + 0.155, 0.40, 0); g.add(d);
    }
    /* Six stage impellers, each with real vanes and a shroud. */
    for(let s=0;s<6;s++){
      const x = -0.72 + s*0.31;
      const bp = xcyl(0.44, 0.44, 0.035, 24, COL.copper, {rough:.4, metal:.85});
      bp.position.x = x + 0.05; rot.add(bp);
      const sh = xcyl(0.28, 0.44, 0.10, 24, 0xC08038, {rough:.45, metal:.8, op:0.55, open:true, side:1});
      sh.position.x = x - 0.03; rot.add(sh);
      ringOf(7, 0.32, (i,a)=>{
        const v = box(0.10, 0.20, 0.022, 0xB8823E, {rough:.4, metal:.85});
        v.rotation.x = a - 0.55; v.position.x = x + 0.01; return v;
      }, rot);
    }
    /* Balance drum at the discharge end — where the residual thrust goes. */
    const drum = xcyl(0.40, 0.40, 0.24, 26, 0x9AA8B4, {rough:.35, metal:.9});
    drum.position.x = 0.86; rot.add(drum);

    /* MECHANICAL SEAL CARTRIDGE at the non-drive end, with its gland studs
       and the leak-off tapping that this whole case is measured on. */
    const seal = new THREE.Group(); seal.position.set(-1.05, 0.40, 0); g.add(seal);
    const gland = xcyl(0.30, 0.30, 0.16, 22, 0x8FA0AE, {rough:.35, metal:.85});
    seal.add(gland);
    const sleeve = xcyl(0.20, 0.20, 0.22, 20, 0xC8D2DA, {rough:.25, metal:.9});
    seal.add(sleeve);
    const face = xcyl(0.26, 0.26, 0.035, 22, 0x2E3B47, {rough:.15, metal:.4});
    face.position.x = -0.09; seal.add(face);                  // carbon face
    parts.sealFace = face; parts.hot.push([face, 0.70]);
    ringOf(4, 0.24, () => {
      const st = xcyl(0.022, 0.022, 0.26, 6, 0x3B4A59, {rough:.6, metal:.8});
      st.position.x = -0.04; return st;
    }, seal);
    /* leak-off: tapping, elbow, and the run out to the flow element */
    const tap = ycyl(0.045, 0.045, 0.28, 12, COL.teal, {rough:.5, metal:.6});
    tap.position.set(-1.05, 0.12, 0); g.add(tap);
    const runp = zcyl(0.045, 0.045, 0.78, 12, COL.teal, {rough:.5, metal:.6});
    runp.position.set(-1.05, -0.02, 0.39); g.add(runp);
    const lf = zcyl(0.075, 0.075, 0.16, 14, COL.ember, {rough:.45, metal:.6});
    lf.position.set(-1.02, -0.28, 0.72); g.add(lf); parts.leakMeter = lf;
    const lelb = ycyl(0.045, 0.045, 0.30, 12, COL.teal, {rough:.5, metal:.6});
    lelb.position.set(-1.05, -0.16, 0.72); g.add(lelb);

    /* Suction: radial off the barrel, elbow, and a run out to the NPSH tags. */
    const sstub = zcyl(0.22, 0.22, 0.40, 18, COL.steel, {rough:.5, metal:.7});
    sstub.position.set(-0.68, 0.30, 0.55); g.add(sstub);
    const srun = xcyl(0.22, 0.22, 1.24, 18, COL.steel, {rough:.5, metal:.7});
    srun.position.set(-1.32, 0.12, 0.72); g.add(srun);
    const selb = sph(0.23, COL.steel, {rough:.5, metal:.7});
    selb.position.set(-0.70, 0.12, 0.72); g.add(selb);
    const sfl = xcyl(0.30, 0.30, 0.05, 20, 0x55697C, {rough:.7, metal:.4});
    sfl.position.set(-1.95, 0.12, 0.72); g.add(sfl);
    const stherm = ycyl(0.05, 0.05, 0.24, 10, COL.ember, {rough:.5, metal:.6});
    stherm.position.set(-1.85, -0.14, 0.66); g.add(stherm);

    /* Discharge: up off the barrel, then out past the flow element. */
    const dstub = ycyl(0.17, 0.17, 0.46, 18, COL.steel, {rough:.5, metal:.7});
    dstub.position.set(0.84, 0.86, 0); g.add(dstub);
    const delb = sph(0.18, COL.steel, {rough:.5, metal:.7});
    delb.position.set(0.84, 1.06, 0); g.add(delb);
    const drun = zcyl(0.17, 0.17, 0.62, 18, COL.steel, {rough:.5, metal:.7});
    drun.position.set(0.84, 1.06, 0.31); g.add(drun);
    const drun2 = xcyl(0.17, 0.17, 1.10, 18, COL.steel, {rough:.5, metal:.7});
    drun2.position.set(1.40, 1.06, 0.60); g.add(drun2);
    const dfe = xcyl(0.23, 0.23, 0.20, 18, COL.ember, {rough:.45, metal:.6});
    dfe.position.set(1.75, 1.06, 0.60); g.add(dfe);
    const dgauge = zcyl(0.10, 0.10, 0.05, 16, 0xD4DBE1, {rough:.35, metal:.2});
    dgauge.position.set(1.12, 0.86, 0.10); g.add(dgauge);

    /* Cavitation. Driven from the vibration channel because that is exactly
       where the simulation puts the cavitation term — see CASES.bfp.gen,
       d.vib gains 5.2 * cav. Bubbles at the first-stage eye, nowhere else. */
    const bub = new THREE.Group(); bub.position.set(-0.86, 0.40, 0); g.add(bub);
    parts.bubbles = [];
    for(let i=0;i<16;i++){
      const b = sph(0.026 + (i%3)*0.010, 0xCFE6F2, {rough:.1, metal:.05, op:0.55, emis:0.25});
      const a = i/16*Math.PI*2;
      b.position.set((i%4)*0.05 - 0.06, Math.cos(a)*0.24, Math.sin(a)*0.24);
      bub.add(b); parts.bubbles.push(b);
    }
    parts.bubbleGroup = bub;
  }

  function buildMill(){
    const g=new THREE.Group(); root.add(g);
    const base=ycyl(1.95,1.95,0.26,34,COL.base,{rough:.85,metal:.2}); base.position.y=-1.44; g.add(base);
    const body=ycyl(1.45,1.62,2.10,34,0x64798E,{rough:.6,metal:.4,op:0.30}); body.position.y=-0.20; g.add(body);
    const bowl=ycyl(1.20,0.85,0.42,32,COL.steel,{rough:.4,metal:.85}); bowl.position.y=0.10;
    const bowlG=new THREE.Group(); bowlG.add(bowl); g.add(bowlG); parts.bowl=bowlG;

    /* Rollers. A bowl-mill roller rolls on the table, so its axle points at
       the mill centre. The orientation goes on a holder group and the spin
       goes on the roller inside it — same rule as the shaft. */
    parts.rollers=[];
    for(let i=0;i<3;i++){
      const a=i/3*Math.PI*2;
      const holder = new THREE.Group();
      holder.position.set(Math.cos(a)*0.72, 0.42, Math.sin(a)*0.72);
      holder.rotation.y = -a;                       // local +X now points radially
      g.add(holder);
      const rl = xcyl(0.42,0.42,0.34,22,COL.copper,{rough:.35,metal:.9});
      holder.add(rl); parts.rollers.push(rl);
      for(let k=0;k<8;k++){                          // tyre segments, so it reads as turning
        const t=k/8*Math.PI*2;
        const seg=box(0.36,0.05,0.05,0xB07A38,{rough:.5,metal:.8});
        seg.position.set(0, Math.cos(t)*0.42, Math.sin(t)*0.42); seg.rotation.x=t; rl.add(seg);
      }
      const arm=box(0.12,0.72,0.12,0x5A7086,{rough:.7,metal:.5});
      arm.position.set(Math.cos(a)*0.72, 0.92, Math.sin(a)*0.72); g.add(arm);
    }
    const cls=ycyl(0.62,1.32,1.05,30,0x7089A0,{rough:.6,metal:.35,op:0.38}); cls.position.y=1.42; g.add(cls);
    const top=ycyl(0.55,0.55,0.34,22,0x415466,{rough:.6,metal:.5}); top.position.y=2.06; g.add(top);
    const feeder=box(0.62,0.42,0.62,COL.ember,{rough:.6,metal:.4}); feeder.position.set(-1.25,2.05,0); g.add(feeder);
    /* Coal sampling point on the raw feeder outlet. The as-fired GCV is a lab
       result, but the sample is drawn from a real place, and the sensor dot
       should land on it rather than hang in the air. */
    const samp=ycyl(0.09,0.09,0.34,12,COL.teal,{rough:.5,metal:.6});
    samp.position.set(-1.55,2.30,0.48); samp.rotation.x=0.55; g.add(samp);
    const sampBox=box(0.20,0.20,0.18,0x46596C,{rough:.7,metal:.4});
    sampBox.position.set(-1.55,2.10,0.60); g.add(sampBox);
    const chute=ycyl(0.16,0.16,1.0,14,0x53687C,{rough:.7,metal:.4}); chute.position.set(-0.72,1.90,0); chute.rotation.z=0.72; g.add(chute);
    for(let i=0;i<4;i++){ const a=i/4*Math.PI*2+0.4;
      const p=ycyl(0.15,0.15,1.5,14,0x53687C,{rough:.7,metal:.4});
      p.position.set(Math.cos(a)*0.95, 2.55, Math.sin(a)*0.95); g.add(p); }
    const pa=xcyl(0.30,0.30,1.1,18,COL.teal,{rough:.6,metal:.5}); pa.position.set(-1.55,-0.35,0.7); g.add(pa);
    const mot=ycyl(0.52,0.52,0.80,24,0x5E748A,{rough:.6,metal:.55}); mot.position.set(0,-1.45,1.05); g.add(mot);
    return g;
  }

  /* ----- Generator transformer -------------------------------------------
     A STATIC DEVICE. Nothing on this machine rotates and nothing vibrates:
     no shaft, no bearing, no unbalance. The only moving things in the scene
     are the radiator cooler fans, which are separate bolt-on auxiliaries
     with their own motors — and their current is one of the eight sensors
     in this case, which is why they are here at all.                     */
  function buildXfmr(){
    const g=new THREE.Group(); root.add(g);
    parts.staticScene = true;

    /* Plinth and rails */
    const base=box(5.0,0.30,2.9,COL.base,{rough:.85,metal:.2}); base.position.y=-1.42; g.add(base);
    [-1,1].forEach(s=>{
      const rail=box(4.2,0.10,0.16,0x3A4C5E,{rough:.9,metal:.3});
      rail.position.set(0,-1.22,s*0.85); g.add(rail);
      [-1.3,1.3].forEach(x=>{
        const wh=zcyl(0.13,0.13,0.12,14,0x36434F,{rough:.8,metal:.5});
        wh.position.set(x,-1.14,s*0.85); g.add(wh);
      });
    });

    /* Tank with stiffener ribs and a bolted lid */
    const tank=box(3.1,2.3,1.85,0x64798E,{rough:.5,metal:.4,op:0.20}); tank.position.y=0.10; g.add(tank);
    /* Stiffeners sit ON the tank walls. Modelled as full-depth slabs they
       became four opaque screens straight through the middle of the core,
       which is the one thing this case needs you to see. */
    for(let i=0;i<4;i++){
      const x=-1.15+i*0.77;
      [-1,1].forEach(s=>{
        const rib=box(0.07,2.2,0.05,0x55697C,{rough:.7,metal:.45});
        rib.position.set(x,0.10,s*0.93); g.add(rib);
      });
    }
    [-1,1].forEach(s=>{
      const endrib=box(0.05,2.2,0.07,0x55697C,{rough:.7,metal:.45});
      endrib.position.set(s*1.56,0.10,0.55); g.add(endrib);
      const endrib2=endrib.clone(); endrib2.position.z=-0.55; g.add(endrib2);
    });
    const lid=box(3.20,0.14,1.95,0x53687E,{rough:.7,metal:.5}); lid.position.y=1.32; g.add(lid);
    for(let i=0;i<14;i++){
      const b=ycyl(0.028,0.028,0.07,6,0x3B4A59,{rough:.6,metal:.8});
      b.position.set(-1.50+i*0.231,1.42,0.92); g.add(b);
      const b2=b.clone(); b2.position.z=-0.92; g.add(b2);
    }

    /* Core: three limbs with top and bottom yokes, and concentric LV and HV
       windings on each — which is what a transformer actually is. */
    parts.wind=[]; parts.lv=[];
    const limbX=[-0.95,0,0.95];
    [-0.86,0.98].forEach(y=>{
      const yoke=box(2.55,0.26,0.44,0x5A6A7A,{rough:.5,metal:.8});
      yoke.position.set(0,y,0); g.add(yoke);
    });
    limbX.forEach(x=>{
      const limb=ycyl(0.19,0.19,1.86,20,0x5A6A7A,{rough:.5,metal:.8});
      limb.position.set(x,0.06,0); g.add(limb);
      const lv=ycyl(0.29,0.29,1.24,24,0xB07A38,{rough:.4,metal:.85});
      lv.position.set(x,0.06,0); g.add(lv); parts.lv.push(lv);
      const hv=ycyl(0.40,0.40,1.34,26,COL.copper,{rough:.35,metal:.9,op:0.62});
      hv.position.set(x,0.06,0); g.add(hv); parts.wind.push(hv);
      for(let k=0;k<7;k++){                                  // disc spacers
        const s=ytorus(0.405,0.020,0x8A6A34,{rough:.6,metal:.5});
        s.position.set(x,-0.52+k*0.19,0); g.add(s);
      }
    });

    /* HV bushings behind, LV bushings in front and shorter — the height
       difference is how you tell them apart on a real plinth. */
    function bushing(x,z,h,r,sheds){
      const st=ycyl(0.13,0.16,0.20,16,0x50647A,{rough:.6,metal:.5}); st.position.set(x,1.44,z); g.add(st);
      const bu=ycyl(r*0.6,r*0.8,h,16,COL.porc,{rough:.3,metal:.1}); bu.position.set(x,1.44+h/2,z); g.add(bu);
      for(let k=0;k<sheds;k++){
        const sk=ycyl(r,r,0.045,16,0xDCE2E7,{rough:.3,metal:.1});
        sk.position.set(x,1.60+k*(h-0.30)/sheds,z); g.add(sk);
      }
      const cap=ycyl(0.075,0.075,0.10,12,0x9AA8B4,{rough:.4,metal:.8});
      cap.position.set(x,1.44+h+0.05,z); g.add(cap);
    }
    limbX.forEach(x=>bushing(x,-0.42,0.98,0.20,6));           // HV
    [-0.62,0.62].forEach(x=>bushing(x,0.62,0.52,0.15,3));     // LV, neutral pair

    /* Conservator, breather, Buchholz on the connecting pipe, oil gauge */
    const cons=xcyl(0.30,0.30,1.7,20,0x53687C,{rough:.6,metal:.5});
    cons.position.set(0,1.96,-0.92); g.add(cons);
    [-1,1].forEach(s=>{
      const cap=xcyl(0.30,0.24,0.10,20,0x475C70,{rough:.6,metal:.5});
      cap.position.set(s*0.88,1.96,-0.92); g.add(cap);
      const brk=box(0.10,0.62,0.10,0x455B70,{rough:.8,metal:.3});
      brk.position.set(s*0.55,1.55,-0.92); g.add(brk);
    });
    const gauge=xcyl(0.14,0.14,0.05,16,0xD4DBE1,{rough:.35,metal:.2});
    gauge.position.set(0.92,1.96,-0.92); g.add(gauge);
    const pipe=ycyl(0.09,0.09,0.62,12,0x50647A,{rough:.6,metal:.5});
    pipe.position.set(0,1.62,-0.55); g.add(pipe);
    const buch=ycyl(0.15,0.15,0.20,16,COL.ember,{rough:.45,metal:.5});
    buch.position.set(0,1.60,-0.30); g.add(buch);
    const breath=ycyl(0.09,0.09,0.42,12,0xC97A6A,{rough:.5,metal:.2});
    breath.position.set(-1.10,1.62,-1.15); g.add(breath);

    /* Radiator banks: top and bottom headers with panel elements between,
       plus valves. The right-hand bank is the one that degrades. */
    parts.rads=[]; parts.radsR=[]; parts.radsL=[];
    for(let s=-1;s<=1;s+=2){
      const bank=new THREE.Group(); g.add(bank);
      [0.86,-0.66].forEach(y=>{
        const hdr=zcyl(0.09,0.09,1.72,14,0x50647A,{rough:.6,metal:.5});
        hdr.position.set(s*1.62,y,0); bank.add(hdr);
        const arm=xcyl(0.08,0.08,0.55,12,0x50647A,{rough:.6,metal:.5});
        arm.position.set(s*1.32,y,0); bank.add(arm);
        const vlv=xcyl(0.11,0.11,0.12,12,COL.ember,{rough:.5,metal:.5});
        vlv.position.set(s*1.15,y,0); bank.add(vlv);
      });
      /* Panel elements, thin and clearly separated so a bank reads as a bank
         of radiators and not as a slab. */
      for(let i=0;i<9;i++){
        [0,1].forEach(row=>{
          const f=box(0.035,1.50,0.10,0x5A7086,{rough:.75,metal:.45});
          f.position.set(s*(1.50+row*0.24),0.10,-0.72+i*0.18); bank.add(f);
          parts.rads.push(f); (s>0?parts.radsR:parts.radsL).push(f);
        });
      }
      /* Two cooler fans per bank in their cowls, slung underneath. The axis
         is vertical, so the orientation lives on the cowl group and the spin
         lives on the propeller inside it — the same rule as the shaft.

         The right-hand bank is the one the case describes as failing, and it
         fails the way a bank actually fails: ONE fan of the two stops. That
         is what a cooler-bank current dropping from 46 A to 31 A looks like.
         A pair of fans both mysteriously slowing to 70% does not. */
      [-0.42,0.42].forEach((z,fi)=>{
        const cowlG=new THREE.Group(); cowlG.position.set(s*1.62,-1.00,z); bank.add(cowlG);
        const cowl=ycyl(0.30,0.30,0.20,20,0x41576C,{rough:.7,metal:.4,op:0.38,open:true,side:1});
        cowlG.add(cowl);
        const ring=ytorus(0.30,0.022,0x50647A,{rough:.6,metal:.5});
        ring.position.y=0.10; cowlG.add(ring);
        const mot=ycyl(0.085,0.085,0.18,12,0x36434F,{rough:.7,metal:.5}); cowlG.add(mot);
        const prop=new THREE.Group(); cowlG.add(prop);
        for(let i=0;i<5;i++){
          const bl=box(0.24,0.018,0.095,0x8CA0B2,{rough:.5,metal:.6});
          const a=i/5*Math.PI*2;
          bl.position.set(Math.cos(a)*0.15,0,Math.sin(a)*0.15);
          bl.rotation.y=-a; bl.rotation.x=0.48; prop.add(bl);
        }
        if(s>0){ if(fi===0) parts.fanRfail=prop; else parts.fanRok=prop; }
        else    { if(fi===0) parts.fanL=prop;    else parts.fanL2=prop; }
        const leg=box(0.05,0.30,0.05,0x455B70,{rough:.8,metal:.3});
        leg.position.set(s*1.62,-0.80,z); bank.add(leg);
      });
    }

    /* Instruments where their sensors actually are: OTI and WTI dials on the
       front of the tank, DGA monitor low on the front, marshalling box,
       on-load tap changer, and an ambient RTD on its own post. */
    [[0,1.30,COL.teal],[0.55,1.30,COL.ember]].forEach(([x,y,c])=>{
      const brk=zcyl(0.04,0.04,0.14,8,0x455B70,{rough:.8,metal:.3});
      brk.position.set(x,y,0.99); g.add(brk);
      const dial=zcyl(0.13,0.13,0.06,18,0xD4DBE1,{rough:.35,metal:.2});
      dial.position.set(x,y,1.08); g.add(dial);
      const nd=box(0.015,0.10,0.01,c,{rough:.4,metal:.3,emis:0.5});
      nd.position.set(x,y+0.05,1.12); nd.rotation.z=0.5; g.add(nd);
    });
    const dga=box(0.34,0.52,0.26,0x46596C,{rough:.7,metal:.4});
    dga.position.set(-1.25,-0.10,1.05); g.add(dga);
    const dgaW=box(0.22,0.14,0.02,COL.glass,{rough:.2,metal:.1,emis:0.3});
    dgaW.position.set(-1.25,0.06,1.19); g.add(dgaW);
    [[-1.25,0.10],[-1.25,-0.35]].forEach(([x,y])=>{
      const t=zcyl(0.03,0.03,0.30,8,COL.teal,{rough:.5,metal:.6});
      t.position.set(x+0.24,y,0.95); t.rotation.x=Math.PI/2; t.rotation.y=Math.PI/2; g.add(t);
    });
    const mb=box(0.44,0.42,0.28,0x46596C,{rough:.7,metal:.4});
    mb.position.set(0.95,-0.78,1.04); g.add(mb);          // below the core, not across it
    const oltc=box(0.40,1.24,0.46,0x5A6E82,{rough:.6,metal:.45});
    oltc.position.set(1.74,0.24,0.96); g.add(oltc);
    const oltcD=ycyl(0.14,0.14,0.22,16,COL.ember,{rough:.5,metal:.5});
    oltcD.position.set(1.74,0.97,0.96); g.add(oltcD);
    const post=ycyl(0.05,0.05,1.60,10,0x455B70,{rough:.8,metal:.3});
    post.position.set(2.05,0.25,1.15); g.add(post);
    const shield=ycyl(0.10,0.10,0.20,12,0xC2CCD4,{rough:.5,metal:.3});
    shield.position.set(2.05,1.05,1.15); g.add(shield);
    return g;
  }

  function build(caseDef){
    clearRoot();
    state.caseId = caseDef.id;
    if(caseDef.scene==='rotor') buildRotor(caseDef.variant);
    else if(caseDef.scene==='mill') buildMill();
    else buildXfmr();
    caseDef.sensors.forEach(s=>{
      const dot = sph(0.075, COL.teal, {emis:0.9, rough:.3, metal:.2});
      dot.position.set(s.pos[0], s.pos[1], s.pos[2]);
      root.add(dot);
      const el = document.createElement('div');
      el.className='s3dlbl'; el.textContent = s.n.length>30 ? s.n.slice(0,28)+'…' : s.n;
      labelHost.appendChild(el);
      markers.push({id:s.id, dot, el, base:s.pos});
    });
    /* Frame the machine from its own bounding box rather than from a table
       of hand-tuned distances. Add a switchgear panel three metres off the
       end of a motor and the view accommodates it instead of cropping it. */
    root.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(root);
    const size = bb.getSize(new THREE.Vector3());
    bb.getCenter(spin.target);
    spin.target.y = Math.max(spin.target.y, 0.05);
    const halfV = Math.max(size.y, size.z*0.7) / 2;
    const halfH = Math.max(size.x, size.z) / 2;
    const vFov = cam.fov * Math.PI/180;
    const need = Math.max(halfV / Math.tan(vFov/2),
                          halfH / Math.tan(vFov/2) / Math.max(0.4, cam.aspect));
    spin.fit = clamp(need * 1.22, 5.0, 16);
    spin.dist = spin.fit;
    spin.yaw = 0.72; spin.pitch = 0.30;
  }

  function setState(s){ Object.assign(state, s); }

  function animate(){
    requestAnimationFrame(animate);
    if(!renderer) return;
    const t=(performance.now()-clock0)/1000;
    const sev = state.sev||0;

    cam.position.set(spin.target.x + Math.sin(spin.yaw)*Math.cos(spin.pitch)*spin.dist,
                     spin.target.y + 0.42 + Math.sin(spin.pitch)*spin.dist*0.85,
                     spin.target.z + Math.cos(spin.yaw)*Math.cos(spin.pitch)*spin.dist);
    cam.lookAt(spin.target);

    /* A transformer has no rotor, no bearing and no unbalance. It does not
       shake, and pretending it does teaches the wrong reflex. */
    if(parts.staticScene){
      root.position.set(0,0,0);
    } else {
      const vibAmp = 0.006 + (state.vib||0)*0.055;
      root.position.x = Math.sin(t*36)*vibAmp;
      root.position.y = Math.cos(t*29)*vibAmp*0.75;
    }

    const spd = state.running ? (state.rpm||1) : 0;
    /* One rotating assembly, one axis. Shaft, impeller, cage and coupling
       half are all children of parts.rot and turn together. */
    if(parts.rot)      parts.rot.rotation.x += 0.16*spd;
    if(parts.bowl)     parts.bowl.rotation.y += 0.028*spd;
    if(parts.rollers)  parts.rollers.forEach(r=>{ r.rotation.x += 0.10*spd;
      const wear = 1 - 0.30*sev; r.scale.set(1, wear, wear); });
    /* Cooler fans. Both banks run; on the right-hand bank one of the two
       fans loses it and stops, which is the shape of a bank current that
       falls by a third rather than to zero. */
    [parts.fanL, parts.fanL2, parts.fanRok].forEach(f=>{ if(f) f.rotation.y += 0.16*spd; });
    if(parts.fanRfail) parts.fanRfail.rotation.y += 0.16*spd*clamp(1 - 1.6*sev, 0, 1);

    // heat
    const heat = clamp(state.heat||0,0,1);
    const hot = new THREE.Color(COL.hot), cool = new THREE.Color(COL.steel);
    (parts.hot||[]).forEach(([m, gain])=>{
      m.material.emissive.copy(hot);
      m.material.emissiveIntensity = heat*gain;
    });
    /* The DE bearing also changes colour where it is the thing failing; the
       NDE bearing stays cool, which is the comparison the case is built on. */
    if(parts.hotBearing){ ['brg0','brg0_low'].forEach(k=>{ if(parts[k])
      parts[k].material.color.copy(cool).lerp(hot, heat); }); }
    ['brg1','brg1_low'].forEach(k=>{ if(parts[k]){ parts[k].material.color.copy(cool);
      parts[k].material.emissiveIntensity=0; } });
    /* Radiator fouling: the right bank fouls, the left stays clean, which is
       exactly the asymmetry the case describes. */
    if(parts.radsR){
      const grime = new THREE.Color(COL.grime), clean = new THREE.Color(0x5A7086);
      parts.radsR.forEach(f=>f.material.color.copy(clean).lerp(grime, clamp(sev*1.1,0,1)));
      parts.radsL.forEach(f=>f.material.color.copy(clean).lerp(grime, clamp(sev*0.25,0,1)));
    }
    if(parts.brokenBar){
      const gl = sev>0.02 ? (0.35+0.5*Math.abs(Math.sin(t*3))) * sev : 0;
      [parts.brokenBar, parts.brokenBar2].forEach(b=>{ if(b){
        b.material.emissive.copy(hot); b.material.emissiveIntensity = gl; } });
      if(parts.crack){ parts.crack.material.emissiveIntensity = gl*1.6;
        parts.crack.scale.setScalar(0.6 + gl*0.9); parts.crack.visible = sev>0.02; }
    }
    if(parts.leakMeter){ parts.leakMeter.material.emissive.copy(hot);
      parts.leakMeter.material.emissiveIntensity = 0.15 + sev*0.6; }
    /* Cavitation bubbles at the first-stage eye. Driven from the vibration
       channel because that is where CASES.bfp.gen puts the cavitation term. */
    if(parts.bubbles){
      const cav = clamp((state.vib||0)-0.28, 0, 1)/0.72;
      parts.bubbles.forEach((b,i)=>{
        b.visible = cav > 0.04;
        const ph = t*5.5 + i*0.7;
        b.material.opacity = 0.15 + 0.55*cav*Math.abs(Math.sin(ph));
        b.scale.setScalar(0.5 + cav*(0.7 + 0.5*Math.abs(Math.cos(ph))));
      });
    }

    // sensor markers
    const on = state.sensors||{};
    markers.forEach(m=>{
      const live = !!on[m.id];
      m.dot.material.color.set(live ? COL.ember : 0x44586B);
      m.dot.material.emissiveIntensity = live ? 0.55+0.35*Math.abs(Math.sin(t*2.4)) : 0.05;
      m.dot.scale.setScalar(live?1.18:0.75);
      const p = m.dot.position.clone().project(cam);
      const vis = p.z<1 && Math.abs(p.x)<1.05 && Math.abs(p.y)<1.05;
      if(vis && state.showLabels!==false){
        m.el.style.display='block';
        m.el.style.left = ((p.x*0.5+0.5)*host.clientWidth+9)+'px';
        m.el.style.top  = ((-p.y*0.5+0.5)*host.clientHeight-8)+'px';
        m.el.style.opacity = live ? 1 : 0.42;
        m.el.style.borderColor = live ? '#D96A16' : '#3A4A5A';
      } else m.el.style.display='none';
    });
    renderer.render(scene, cam);
  }
  /* Exposed for the geometry test: it asserts on real world-space axes
     rather than on how the picture looks. */
  /* `spin` is exposed so the mobile suite can assert that a pinch actually
     moved the camera rather than the page. */
  function _probe(){ return {parts, root, cam, state, spin}; }
  return {init, build, setState, resize, _probe};
})();
