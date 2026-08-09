/* =========================================================================
   3D machine views — three.js
   ========================================================================= */
const V3 = (function(){
  let renderer, scene, cam, root, host, labelHost;
  let spin = {yaw:0.72, pitch:0.30, dist:8.4, drag:false, px:0, py:0};
  let parts = {}, markers = [], clock0 = performance.now();
  let state = {sev:0, vib:0, heat:0, running:true, rpm:1.0, sensors:{}, caseId:null};

  const COL = {steel:0xB6C3D0, dark:0x62788E, ember:0xD96A16, teal:0x11707F,
               base:0x44586C, hot:0xD24A28, cool:0x8494A4, copper:0xD08A3E, oil:0x2E4152};

  function mat(c,{rough=0.45,metal=0.35,emis=0,op=1}={}){
    return new THREE.MeshStandardMaterial({color:c, roughness:rough, metalness:metal,
      emissive:emis?c:0x000000, emissiveIntensity:emis, transparent:op<1, opacity:op});
  }
  function cyl(r1,r2,h,seg,c,o={}){ const m=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,seg||28), mat(c,o)); return m; }
  function box(w,h,d,c,o={}){ return new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat(c,o)); }
  function sph(r,c,o={}){ return new THREE.Mesh(new THREE.SphereGeometry(r,20,14), mat(c,o)); }

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
    el.addEventListener('pointerdown', e=>{ spin.drag=true; spin.px=e.clientX; spin.py=e.clientY; el.style.cursor='grabbing'; });
    window.addEventListener('pointerup', ()=>{ spin.drag=false; el.style.cursor='grab'; });
    window.addEventListener('pointermove', e=>{ if(!spin.drag) return;
      spin.yaw += (e.clientX-spin.px)*0.008; spin.pitch = clamp(spin.pitch + (e.clientY-spin.py)*0.006, -0.25, 1.15);
      spin.px=e.clientX; spin.py=e.clientY; });
    el.addEventListener('wheel', e=>{ e.preventDefault(); spin.dist = clamp(spin.dist + e.deltaY*0.006, 4.2, 17); }, {passive:false});
    new ResizeObserver(()=>resize()).observe(host);
    animate();
  }
  function resize(){ if(!renderer||!host.clientWidth) return;
    renderer.setSize(host.clientWidth, host.clientHeight);
    cam.aspect = host.clientWidth/host.clientHeight; cam.updateProjectionMatrix(); }

  /* ---------------- scene builders ---------------- */
  function clearRoot(){ while(root.children.length) root.remove(root.children[0]);
    parts={}; markers.forEach(m=>m.el.remove()); markers=[]; }

  function buildRotor(variant){
    const g = new THREE.Group(); root.add(g);
    const base = box(6.4,0.34,2.5,COL.base,{rough:.85,metal:.2}); base.position.y=-1.42; g.add(base);
    // pedestals
    [-1.15, 1.55].forEach((x,i)=>{
      const ped = box(0.62,1.05,1.0,COL.dark,{rough:.75,metal:.35}); ped.position.set(x,-0.86,0); g.add(ped);
      const hou = cyl(0.30,0.30,0.52,24,COL.steel,{rough:.35,metal:.85});
      hou.rotation.z=Math.PI/2; hou.position.set(x,0.40,0); g.add(hou);
      parts['brg'+i]=hou;
    });
    // shaft
    const sh = cyl(0.105,0.105,4.6,20,0xB9C4CE,{rough:.25,metal:.95}); sh.rotation.z=Math.PI/2; sh.position.set(0.42,0.40,0); g.add(sh);
    parts.shaft = sh;
    // rotating assembly
    const rot = new THREE.Group(); rot.position.set(0.42,0.40,0); g.add(rot); parts.rot = rot;
    if(variant==='fan'){
      const hub = cyl(0.30,0.30,0.40,22,COL.dark,{rough:.6,metal:.6}); hub.rotation.z=Math.PI/2; hub.position.x=-0.30; rot.add(hub);
      for(let i=0;i<10;i++){
        const b = box(0.09,1.05,0.42,COL.steel,{rough:.45,metal:.8});
        const a = i/10*Math.PI*2;
        b.position.set(-0.30, Math.cos(a)*0.72, Math.sin(a)*0.72);
        b.rotation.x = a + 0.45; rot.add(b);
      }
      const cas = cyl(1.20,1.20,0.72,34,0x7089A0,{rough:.6,metal:.35,op:0.24});
      cas.rotation.z=Math.PI/2; cas.position.set(0.12,0.40,0); g.add(cas);
    } else if(variant==='motor'){
      const bod = cyl(0.62,0.62,1.75,30,0x6B8296,{rough:.6,metal:.55}); bod.rotation.z=Math.PI/2; bod.position.x=0.05; g.add(bod);
      for(let i=0;i<16;i++){ const f=box(0.02,0.16,1.70,0x2F3E4E,{rough:.8,metal:.3});
        const a=i/16*Math.PI*2; f.position.set(0.05, Math.cos(a)*0.68, Math.sin(a)*0.68); f.rotation.x=a; g.add(f); }
      const bars = new THREE.Group(); rot.add(bars); parts.bars = bars;
      for(let i=0;i<14;i++){
        const isBroken = (i===3);
        const b = cyl(0.030,0.030,1.55,10, isBroken?COL.hot:COL.copper, {rough:.35,metal:.9});
        b.rotation.z=Math.PI/2; const a=i/14*Math.PI*2;
        b.position.set(-0.37, Math.cos(a)*0.40, Math.sin(a)*0.40);
        bars.add(b); if(isBroken) parts.brokenBar=b;
      }
    } else {
      const cas = cyl(0.68,0.50,2.05,26,COL.dark,{rough:.65,metal:.5}); cas.rotation.z=Math.PI/2; cas.position.x=0.05; g.add(cas);
      for(let i=0;i<5;i++){ const s=cyl(0.70,0.70,0.06,26,0x5A7086,{rough:.6,metal:.55});
        s.rotation.z=Math.PI/2; s.position.x=-0.85+i*0.42; g.add(s); }
      for(let i=0;i<6;i++){ const imp=cyl(0.42,0.42,0.05,20,COL.copper,{rough:.4,metal:.85});
        imp.rotation.z=Math.PI/2; imp.position.x=-0.80+i*0.40; rot.add(imp); }
      const suc = cyl(0.26,0.26,0.9,18,COL.steel,{rough:.5,metal:.7}); suc.position.set(-1.62,0.10,0.35); suc.rotation.x=Math.PI/2; g.add(suc);
      const dis = cyl(0.20,0.20,0.9,18,COL.steel,{rough:.5,metal:.7}); dis.position.set(1.30,0.72,0); g.add(dis);
    }
    // driver motor (for fan and pump)
    if(variant!=='motor'){
      const mb = cyl(0.50,0.50,1.25,26,0x5E748A,{rough:.6,metal:.55}); mb.rotation.z=Math.PI/2; mb.position.set(2.55,0.32,0); g.add(mb);
      const cp = cyl(0.22,0.22,0.30,18,COL.ember,{rough:.4,metal:.7}); cp.rotation.z=Math.PI/2; cp.position.set(1.90,0.40,0); g.add(cp);
      parts.coupling=cp;
    }
    // lube oil skid
    const sk = box(1.05,0.46,0.66,0x536A80,{rough:.8,metal:.3}); sk.position.set(0.15,-1.02,0.95); g.add(sk);
    parts.oilSkid = sk;
    return g;
  }

  function buildMill(){
    const g=new THREE.Group(); root.add(g);
    const base=cyl(1.95,1.95,0.26,34,COL.base,{rough:.85,metal:.2}); base.position.y=-1.44; g.add(base);
    const body=cyl(1.45,1.62,2.10,34,0x64798E,{rough:.6,metal:.4,op:0.30}); body.position.y=-0.20; g.add(body);
    const bowl=cyl(1.20,0.85,0.42,32,COL.steel,{rough:.4,metal:.85}); bowl.position.y=0.10;
    const bowlG=new THREE.Group(); bowlG.add(bowl); g.add(bowlG); parts.bowl=bowlG;
    parts.rollers=[];
    for(let i=0;i<3;i++){
      const a=i/3*Math.PI*2;
      const rl=cyl(0.42,0.42,0.34,22,COL.copper,{rough:.35,metal:.9});
      rl.rotation.x=Math.PI/2; rl.rotation.y=a;
      rl.position.set(Math.cos(a)*0.72, 0.42, Math.sin(a)*0.72);
      g.add(rl); parts.rollers.push(rl);
      const arm=box(0.12,0.72,0.12,0x5A7086,{rough:.7,metal:.5});
      arm.position.set(Math.cos(a)*0.72, 0.92, Math.sin(a)*0.72); g.add(arm);
    }
    const cls=cyl(0.62,1.32,1.05,30,0x7089A0,{rough:.6,metal:.35,op:0.38}); cls.position.y=1.42; g.add(cls);
    const top=cyl(0.55,0.55,0.34,22,0x415466,{rough:.6,metal:.5}); top.position.y=2.06; g.add(top);
    const feeder=box(0.62,0.42,0.62,COL.ember,{rough:.6,metal:.4}); feeder.position.set(-1.25,2.05,0); g.add(feeder);
    const chute=cyl(0.16,0.16,1.0,14,0x53687C,{rough:.7,metal:.4}); chute.position.set(-0.72,1.90,0); chute.rotation.z=0.72; g.add(chute);
    for(let i=0;i<4;i++){ const a=i/4*Math.PI*2+0.4;
      const p=cyl(0.15,0.15,1.5,14,0x53687C,{rough:.7,metal:.4});
      p.position.set(Math.cos(a)*0.95, 2.55, Math.sin(a)*0.95); g.add(p); }
    const pa=cyl(0.30,0.30,1.1,18,COL.teal,{rough:.6,metal:.5}); pa.position.set(-1.55,-0.35,0.7); pa.rotation.z=Math.PI/2; g.add(pa);
    const mot=cyl(0.52,0.52,0.80,24,0x5E748A,{rough:.6,metal:.55}); mot.position.set(0,-1.45,1.05); g.add(mot);
    return g;
  }

  function buildXfmr(){
    const g=new THREE.Group(); root.add(g);
    const base=box(4.6,0.30,2.6,COL.base,{rough:.85,metal:.2}); base.position.y=-1.42; g.add(base);
    const tank=box(3.1,2.3,1.85,0x64798E,{rough:.5,metal:.4,op:0.30}); tank.position.y=0.10; g.add(tank);
    const lid=box(3.16,0.14,1.91,0x53687E,{rough:.7,metal:.5}); lid.position.y=1.32; g.add(lid);
    parts.wind=[];
    for(let i=0;i<3;i++){
      const x=-0.95+i*0.95;
      const core=cyl(0.20,0.20,1.62,20,0x5A6A7A,{rough:.5,metal:.8}); core.position.set(x,0.06,0); g.add(core);
      const w=cyl(0.36,0.36,1.30,24,COL.copper,{rough:.35,metal:.9}); w.position.set(x,0.06,0); g.add(w);
      parts.wind.push(w);
      const bu=cyl(0.10,0.14,0.85,16,0xC8CFD6,{rough:.35,metal:.15}); bu.position.set(x,1.80,0); g.add(bu);
      for(let k=0;k<5;k++){ const sk=cyl(0.19,0.19,0.05,16,0xD4DBE1,{rough:.35,metal:.1});
        sk.position.set(x,1.50+k*0.16,0); g.add(sk); }
    }
    parts.rads=[];
    for(let s=-1;s<=1;s+=2){
      for(let i=0;i<7;i++){
        const f=box(0.055,1.55,0.60,0x5A7086,{rough:.75,metal:.45});
        f.position.set(1.62*s + s*0.05*0 , 0.10, -0.62+i*0.21);
        f.position.x = s*(1.62 + 0);
        g.add(f); parts.rads.push(f);
      }
      const fan=cyl(0.26,0.26,0.10,18,0x2F3E4E,{rough:.7,metal:.4});
      fan.rotation.x=Math.PI/2; fan.position.set(s*1.75,-0.72,0); g.add(fan);
      if(s>0) parts.coolFan=fan;
    }
    const cons=cyl(0.28,0.28,1.5,20,0x53687C,{rough:.6,metal:.5}); cons.rotation.z=Math.PI/2; cons.position.set(0,1.72,-0.85); g.add(cons);
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
    spin.dist = caseDef.scene==='mill' ? 8.8 : 8.4;
    spin.yaw = 0.72; spin.pitch = 0.30;
  }

  function setState(s){ Object.assign(state, s); }

  function animate(){
    requestAnimationFrame(animate);
    if(!renderer) return;
    const t=(performance.now()-clock0)/1000;
    const sev = state.sev||0;

    cam.position.set(Math.sin(spin.yaw)*Math.cos(spin.pitch)*spin.dist,
                     1.15 + Math.sin(spin.pitch)*spin.dist*0.85,
                     Math.cos(spin.yaw)*Math.cos(spin.pitch)*spin.dist);
    cam.lookAt(0, 0.20, 0);

    const vibAmp = 0.006 + (state.vib||0)*0.055;
    root.position.x = Math.sin(t*36)*vibAmp;
    root.position.y = Math.cos(t*29)*vibAmp*0.75;

    const spd = state.running ? (state.rpm||1) : 0;
    if(parts.rot) parts.rot.rotation.x += 0.16*spd;
    if(parts.shaft) parts.shaft.rotation.y += 0.16*spd;
    if(parts.coupling) parts.coupling.rotation.x += 0.16*spd;
    if(parts.bowl) parts.bowl.rotation.y += 0.028*spd;
    if(parts.rollers) parts.rollers.forEach((r,i)=>{ r.rotation.z += 0.10*spd;
      const wear = 1 - 0.30*sev; r.scale.set(wear,1,wear); });
    if(parts.coolFan) parts.coolFan.rotation.z += 0.13*spd*(1-0.75*sev);

    // heat
    const heat = clamp(state.heat||0,0,1);
    const hot = new THREE.Color(COL.hot), cool = new THREE.Color(COL.steel);
    ['brg0'].forEach(k=>{ if(parts[k]){ parts[k].material.color.copy(cool).lerp(hot, heat);
      parts[k].material.emissive.copy(hot); parts[k].material.emissiveIntensity = heat*0.75; } });
    if(parts.brg1){ parts.brg1.material.color.copy(cool); parts.brg1.material.emissiveIntensity=0; }
    if(parts.wind) parts.wind.forEach(w=>{ w.material.emissive.copy(hot); w.material.emissiveIntensity = heat*0.85; });
    if(parts.brokenBar){ parts.brokenBar.material.emissive.copy(hot);
      parts.brokenBar.material.emissiveIntensity = sev>0.02 ? (0.35+0.5*Math.abs(Math.sin(t*3))) * sev : 0; }
    if(parts.oilSkid){ parts.oilSkid.material.emissive.copy(hot); parts.oilSkid.material.emissiveIntensity = heat*0.32; }

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
  return {init, build, setState, resize};
})();
