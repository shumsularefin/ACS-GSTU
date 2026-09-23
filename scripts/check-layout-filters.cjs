const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 const page=await browser.newPage();
 for(const width of [390,768,1440]){
  await page.setViewportSize({width,height:1000});
  await page.goto('http://127.0.0.1:4173/about.html');
  await page.locator('.post-image img').evaluate(img=>img.decode());
  const image=await page.locator('.post-image').boundingBox(),title=await page.locator('.post-date').boundingBox();
  assert.ok(title.y>=image.y+image.height,`About overlap at ${width}`);
  await page.goto('http://127.0.0.1:4173/activities.html');
  await page.evaluate(()=>{window.archiveDocument=document;window.archiveTabs=document.querySelector('.category-tabs');});
  const outreach=page.getByRole('navigation',{name:'Event categories'}).getByRole('link',{name:'Outreach',exact:true});
  await outreach.click();
  await page.waitForFunction(()=>document.querySelectorAll('.event-card').length===2);
  assert.ok(await page.evaluate(()=>archiveDocument===document&&archiveTabs===document.querySelector('.category-tabs')));
  await page.getByRole('navigation',{name:'Event years'}).getByRole('link',{name:'2026',exact:true}).click();
  await page.getByText('No events have been published').waitFor();
  await page.goBack();
  await page.waitForFunction(()=>document.querySelectorAll('.event-card').length===2);
  await page.goBack();
  await page.waitForFunction(()=>document.querySelector('.category-tabs [aria-current]').textContent==='All events');
 }
 await browser.close();console.log('About layout and in-place event navigation passed at all three widths.');
})().catch(e=>{console.error(e);process.exit(1)});
