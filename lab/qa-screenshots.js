const {chromium}=require('playwright');
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1366,height:900}});
  const errs=[];
  p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  p.on('console',m=>{ if(m.type()==='error') errs.push('CONSOLE: '+m.text()); });
  await p.goto('file://'+process.cwd()+'/MAHAGENCO_AI_Simulation_Lab.html');
  await p.waitForTimeout(1200);
  const mods=['home','s1','s2','s3','s4','s5','s6','s7','s8','data'];
  for(const m of mods){
    await p.click(`#nav a[data-m="${m}"]`);
    await p.waitForTimeout(700);
    await p.screenshot({path:`lab-${m}.png`, fullPage:false});
  }
  // exercise SIM-8
  await p.click('#nav a[data-m="s8"]'); await p.click('#s8-all'); await p.waitForTimeout(400);
  await p.screenshot({path:'lab-s8-run.png'});
  console.log(errs.length? errs.join('\n') : 'NO JS ERRORS');
  await b.close();
})();
