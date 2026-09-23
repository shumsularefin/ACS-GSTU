const {chromium}=require('playwright');const fs=require('fs'),assert=require('assert/strict');
(async()=>{fs.mkdirSync('output/pdf',{recursive:true});const browser=await chromium.launch({headless:true,channel:'msedge'});const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
await context.route('**/data/site-config.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({...JSON.parse(fs.readFileSync('data/site-config.json')),cloudEnabled:false})}));
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4173/admin.html');await page.locator('#editor-workspace').waitFor();
await page.locator('#certificate-file').setInputFiles({name:'participants.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify([{Name:'Ayesha Rahman',ID:'SAMPLE-ACS-2026',Type:'participant',Event:'Research Recharge 2026','Event date':'2026-09-21'}]))});
await page.getByText('File loaded. Select event and issue date, then review.').waitFor();await page.locator('#certificate-review').click();await page.locator('#certificate-preview svg').waitFor();
await page.locator('#certificate-preview').screenshot({path:'checks/certificate-design.png'});
const download=await Promise.all([page.waitForEvent('download'),page.locator('#certificate-sample').click()]);await download[0].saveAs('output/pdf/ACS-universal-certificate-sample.pdf');
assert.ok(fs.statSync('output/pdf/ACS-universal-certificate-sample.pdf').size>10000);
await context.route('https://firestore.googleapis.com/**',r=>{const id=r.request().url().split('/').pop();const fields={name:{stringValue:'Ayesha Rahman'},event:{stringValue:'Research Recharge 2026'},dateIssued:{timestampValue:'2026-09-21T00:00:00Z'},status:{stringValue:id==='REVOKED'?'revoked':'issued'}};return r.fulfill({status:id==='MISSING'?404:200,contentType:'application/json',body:JSON.stringify({fields})});});
for(const width of [390,1440]){await page.setViewportSize({width,height:1000});await page.goto('http://127.0.0.1:4173/verify.html?certId=OLD001');await page.getByText('Certificate verified',{exact:true}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('#download-certificate').waitFor();}
await page.goto('http://127.0.0.1:4173/verify.html?certId=REVOKED');await page.getByText('Certificate revoked',{exact:true}).waitFor();assert.equal(await page.locator('#download-certificate').count(),0);
await page.goto('http://127.0.0.1:4173/verify.html?certId=MISSING');await page.getByText('Certificate not found.',{exact:false}).waitFor();assert.deepEqual(errors,[]);await browser.close();console.log('Certificate preview/PDF, legacy verification, revocation, missing IDs and mobile layout passed.');
})().catch(e=>{console.error(e);process.exit(1)});
