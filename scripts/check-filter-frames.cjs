const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 const page=await browser.newPage({viewport:{width:1345,height:850}});
 await page.route('**/images/**',async route=>{await new Promise(r=>setTimeout(r,150));await route.continue();});
 await page.goto('http://127.0.0.1:4173/activities.html');
 await page.locator('.event-card img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
 await page.evaluate(()=>{
  window.beforeDocument=document;window.framesChecked=0;window.blankFrames=0;
  window.card=document.querySelector('.event-card');window.oldHeight=document.querySelector('.event-grid').getBoundingClientRect().height;
  const monitor=()=>{framesChecked++;if([...document.querySelectorAll('.event-card img')].some(i=>!i.complete||!i.naturalWidth))blankFrames++;requestAnimationFrame(monitor);};requestAnimationFrame(monitor);
 });
 const tabs=page.getByRole('navigation',{name:'Event categories'});
 for(const name of ['Development','Community','Sustainability','Outreach','All events']){
  await tabs.getByRole('link',{name,exact:true}).click();
  await page.waitForFunction(name=>document.querySelector('.category-tabs [aria-current]').textContent===name,name);
 }
 await page.evaluate(()=>{const links=document.querySelectorAll('.category-tabs a');links[1].click();links[2].click();links[3].click();});
 await page.waitForFunction(()=>document.querySelector('.category-tabs [aria-current]').textContent==='Sustainability');
 const result=await page.evaluate(()=>({sameDocument:beforeDocument===document,blankFrames,framesChecked,height:document.querySelector('.event-grid').getBoundingClientRect().height,oldHeight}));
 assert.ok(result.sameDocument);assert.equal(result.blankFrames,0);assert.ok(result.height>=result.oldHeight);console.log(result);
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
