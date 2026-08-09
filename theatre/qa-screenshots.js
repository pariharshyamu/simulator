const {chromium}=require('playwright');
(async()=>{
  const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
  const p=await b.newPage({viewport:{width:1560,height:900}});
  const errs=[];
  p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  p.on('console',m=>{ if(m.type()==='error') errs.push('CONSOLE: '+m.text().slice(0,200)); });
  await p.goto('file://'+process.cwd()+'/MAHAGENCO_Algorithm_Theatre.html');
  await p.waitForTimeout(4000);
  for(let m=0;m<7;m++){
    await p.click(`#rail .st[data-m="${m}"]`);
    await p.waitForTimeout(1600);
    const nacts = await p.$$eval('#acts .a', els=>els.length);
    for(let a=0;a<nacts;a++){
      await p.click(`#acts .a:nth-child(${a+1})`);
      await p.waitForTimeout(700);
      await p.fill('#tl','1000'); await p.dispatchEvent('#tl','input');
      await p.waitForTimeout(900);
      await p.screenshot({path:`th-m${m}-a${a}.png`});
    }
  }
  console.log(errs.length? [...new Set(errs)].slice(0,25).join('\n') : 'NO JS ERRORS');
  await b.close();
})();
