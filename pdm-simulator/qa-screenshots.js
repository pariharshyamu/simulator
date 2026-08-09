const {chromium}=require('playwright');
(async()=>{
  const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
  const p=await b.newPage({viewport:{width:1500,height:900}});
  const errs=[];
  p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  p.on('console',m=>{ if(m.type()==='error') errs.push('CONSOLE: '+m.text().slice(0,160)); });
  await p.goto('file://'+process.cwd()+'/MAHAGENCO_PdM_Simulator.html');
  await p.waitForTimeout(2500);
  for(let s=0;s<8;s++){
    await p.click(`#rail .st[data-s="${s}"]`);
    await p.waitForTimeout(900);
    await p.screenshot({path:`pdm-s${s}.png`});
  }
  for(const c of ['motor','mill','bfp','xfmr']){
    await p.click(`#caseSel button[data-c="${c}"]`);
    await p.waitForTimeout(1100);
    await p.screenshot({path:`pdm-case-${c}.png`});
  }
  await p.click('#caseSel button[data-c="idfan"]'); await p.waitForTimeout(600);
  await p.click('#rail .st[data-s="7"]'); await p.waitForTimeout(600);
  await p.fill('#scrub','150'); await p.dispatchEvent('#scrub','input'); await p.waitForTimeout(900);
  await p.screenshot({path:'pdm-day150.png'});
  console.log(errs.length? [...new Set(errs)].join('\n') : 'NO JS ERRORS');
  await b.close();
})();
