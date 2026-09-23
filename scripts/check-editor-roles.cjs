const {chromium}=require('playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 const data=JSON.parse(fs.readFileSync('public/data/content.json'));
 for(const role of ['super-admin','administrator','outreach']){
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.route('**/js/cloud-editor.js',r=>r.fulfill({contentType:'text/javascript',body:`export async function connect(){return {currentUser:async()=>({email:'test@example.com'}),access:async()=>${JSON.stringify(role)},read:async()=>({revision:1,content:${JSON.stringify(data)}}),addEvent:async e=>{window.addedEvent=e;},ensureSchema:async()=>{},editors:async()=>[],auditPage:async()=>({entries:[]}),manageEditor:async(...args)=>{window.grant=args;}};}`}));
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173/admin.html');await page.locator('#auth-status').filter({hasText:'Role: '+role}).waitFor();if(role==='super-admin')await page.locator('#access-form').waitFor();else await page.getByText('Ready. Live content loaded.',{exact:false}).waitFor();
  assert.equal(await page.locator('#person-form').isVisible(),role==='super-admin');
  assert.equal(await page.locator('#homepage-form').isVisible(),role==='super-admin');
  assert.equal(await page.locator('#access-panel').isVisible(),role==='super-admin');
  assert.equal(await page.locator('#certificate-type option[value="executive"]').evaluate(el=>el.disabled),role!=='super-admin');
  assert.equal(await page.locator('#certificate-type option[value="champion"]').evaluate(el=>el.disabled),role==='outreach');
  assert.equal(await page.locator('#sign-in-redirect').count(),0);
  assert.equal(await page.locator('.editor-site-nav a').first().getAttribute('href'),'https://acs-gstu.web.app/index.html');
  if(role==='super-admin'){await page.locator('#people-kind').selectOption('roster');assert.ok(await page.locator('#person-form [name=role]').isHidden());assert.ok(await page.locator('#person-form [name=image]').isHidden());await page.locator('#roster-file').setInputFiles({name:'members.csv',mimeType:'text/csv',buffer:Buffer.from('Members Name,Membership ID\nTest Member,001234\nSecond Member,000567')});await page.locator('#roster-apply').click();const saved=JSON.parse(await page.evaluate(()=>localStorage.getItem('acs-editor-draft-v1')));assert.equal(saved.team.committees['2026'].roster[0].memID,'001234');assert.equal(saved.team.committees['2026'].roster.length,2);assert.ok(await page.locator('#publish-content').isEnabled());await page.screenshot({path:'checks/roster-editor.png',fullPage:true});await page.locator('#access-form [name="email"]').fill('new-editor@example.com');await page.locator('#access-form button').click();await page.waitForFunction(()=>window.grant);assert.deepEqual(await page.evaluate(()=>window.grant),['new-editor@example.com','administrator',true]);}
  else{const form=page.locator('#event-form');for(const [key,value] of Object.entries({id:'new-role-event',title:'Role event',date:'2099-10-01',description:'New event from editor'}))await form.locator(`[name="${key}"]`).fill(value);await form.getByRole('button',{name:'Publish new event'}).click();await page.waitForFunction(()=>window.addedEvent);assert.equal((await page.evaluate(()=>window.addedEvent)).id,'new-role-event');}
  assert.deepEqual(errors,[]);await context.close();
 }
 const context=await browser.newContext();const page=await context.newPage();
 const promoted={...data,homepage:{images:['images/optimized/slide01-1600.webp','images/brand/gstu-logo.png']},events:[{...data.events[0],id:'open-event',title:'Registration open test',date:'2099-10-01',registrationStatus:'open',registrationUrl:'https://example.org/register'}]};
 await context.route('https://firestore.googleapis.com/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({fields:{payload:{stringValue:JSON.stringify(promoted)}}})}));
 await page.goto('http://127.0.0.1:4173/index.html');await page.locator('#open-events').getByRole('link').waitFor();assert.equal(await page.locator('#open-events a').getAttribute('href'),'event.html?id=open-event');await page.locator('#hero-next').click();await page.waitForFunction(()=>document.querySelector('#hero-position').textContent==='2 / 2');
 await page.setViewportSize({width:390,height:850});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 fs.mkdirSync('checks',{recursive:true});await page.screenshot({path:'checks/homepage-new-mobile.png',fullPage:true});
 await browser.close();console.log('Role-specific dashboard, email grants, create-only events, certificate choices, homepage promotion and image navigation passed.');
})().catch(e=>{console.error(e);process.exit(1)});

