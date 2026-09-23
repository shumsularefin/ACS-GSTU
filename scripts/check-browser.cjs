const {chromium}=require('playwright');
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 fs.mkdirSync('checks',{recursive:true});
 const sandbox={};vm.createContext(sandbox);vm.runInContext(fs.readFileSync('js/vendor/xlsx.full.min.js','utf8'),sandbox);const X=sandbox.XLSX;
 function fixture(rows,name='Roster'){const b=X.utils.book_new();X.utils.book_append_sheet(b,X.utils.json_to_sheet(rows),name);return Buffer.from(X.write(b,{type:'array',bookType:'xlsx'}));}
 const roster=fixture([{Year:2026,Name:'Import Test Member','Membership tier':'premium',Email:'private@example.org'}]);
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 await context.route('**/data/site-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({...JSON.parse(fs.readFileSync('data/site-config.json')),cloudEnabled:false})}));
 await context.route('https://firestore.googleapis.com/**',route=>route.fulfill({status:404,contentType:'application/json',body:'{}'}));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.message);});
 async function visit(name){await page.goto(`http://127.0.0.1:4173/${name}`);await page.locator('h1').first().waitFor();}
 async function shot(name){for(const img of await page.locator('img').all()){await img.scrollIntoViewIfNeeded();await img.evaluate(el=>el.decode());}await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`checks/${name}.png`,fullPage:true});}
 for(const width of (process.env.CHECK_FAST?[]:[1440,390,768])){
  await page.setViewportSize({width,height:1000});
  for(const name of ['index','activities','team','team-2026','event-green-and-clean','admin']){
   await visit(name+'.html');if(name==='admin')await page.locator('#editor-workspace').waitFor();await page.evaluate(()=>document.fonts.ready);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} ${width} overflow`);
   assert.ok((await page.locator('body').evaluate(el=>getComputedStyle(el).fontFamily)).includes('Poppins'));
   if(name!=='admin'||width===1440)await shot(`${name}-restored-${width}`);
  }
 }
 await visit('index.html');await page.locator('#menu-toggle').click();await page.locator('#site-menu a[href="activities.html"]').click();await page.waitForURL('**/activities.html');await visit('index.html#membership');await page.locator('.home-membership-details summary').click();assert.ok(await page.getByRole('heading',{name:'Renew your membership'}).isVisible());
 await visit('activities.html');await page.getByRole('navigation',{name:'Event categories'}).getByRole('link',{name:'Outreach',exact:true}).click();assert.equal(await page.locator('.event-card').count(),2);
 await page.getByRole('navigation',{name:'Event years'}).getByRole('link',{name:'2026',exact:true}).click();assert.ok(await page.getByText('No events have been published').isVisible());
 await visit('event-green-and-clean.html');assert.ok(await page.getByText('This event has ended. Registration is closed.').isVisible());const calendar=await Promise.all([page.waitForEvent('download'),page.getByRole('link',{name:'Download calendar (.ics)',exact:true}).click()]);assert.ok(calendar[0].suggestedFilename().endsWith('.ics'));
 await visit('admin.html');await page.locator('#editor-workspace').waitFor();assert.ok(await page.locator('#publish-content').isDisabled());
 await page.getByText('Advanced: import events or committees in bulk',{exact:true}).click();await page.locator('#excel-file').setInputFiles({name:'roster.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:roster});await page.locator('#import-options').waitFor();await page.locator('#review-import').click();await page.locator('#apply-import').click();assert.ok((await page.locator('#draft-summary').innerText()).includes('1 roster members'));
 let stored=JSON.parse(await page.evaluate(()=>localStorage.getItem('acs-editor-draft-v1')));assert.deepEqual(stored.team.committees['2026'].roster,[{name:'Import Test Member',tier:'premium'}]);assert.ok(!JSON.stringify(stored).includes('private@example.org'));
 const bad=fixture([{Year:2026,Name:'Should not save','Membership tier':'invalid'}]);await page.locator('#excel-file').setInputFiles({name:'bad.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:bad});await page.locator('#import-options').waitFor();await page.locator('#review-import').click();assert.ok((await page.locator('#editor-status').innerText()).includes('must be general or premium'));assert.ok(await page.locator('#apply-import').isDisabled());
 const template=await Promise.all([page.waitForEvent('download'),page.locator('#download-template').click()]);assert.equal(template[0].suggestedFilename(),'ACS-import-template.xlsx');
 await page.locator('#new-event').click();const form=page.locator('#event-form');
 for(const [key,value] of Object.entries({id:'browser-test-event',title:'Browser test event',date:'2090-10-15',description:'Browser-only event used to test the editor.',registrationUrl:'https://example.org/register',startsAt:'2090-10-15T10:00:00+06:00',endsAt:'2090-10-15T12:00:00+06:00'}))await form.locator(`[name="${key}"]`).fill(value);
 await form.locator('[name="registrationStatus"]').selectOption('open');await page.locator('#preview-event').click();assert.ok(await page.locator('#event-preview').getByRole('link',{name:'Register for this event'}).isVisible());await form.getByRole('button',{name:'Save event changes'}).click();
 await page.getByText('Backups and saved drafts',{exact:true}).click();const backup=await Promise.all([page.waitForEvent('download'),page.locator('#export-content').click()]);assert.equal(backup[0].suggestedFilename(),'acs-content.json');await page.reload();await page.locator('#editor-workspace').waitFor();assert.ok((await page.locator('#event-select').innerText()).includes('Browser test event'));
 // Exercise publishing UI against a local in-memory fake, never against the live project.
 await context.route('**/data/site-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({...JSON.parse(fs.readFileSync('data/site-config.json')),cloudEnabled:true})}));
 await page.reload();await page.getByText('Sign in with an authorized chapter account to open the editor.').waitFor();assert.ok(await page.locator('#editor-workspace').isHidden());
 await context.route('**/js/cloud-editor.js',route=>route.fulfill({contentType:'text/javascript',body:`export async function connect(){return {signIn:async()=>({email:'muhammadshamsularefin01@gmail.com',emailVerified:true}),isEditor:async()=>true,read:async()=>({content:null,revision:0}),publish:async(c,r)=>{window.__published=c;return r+1},signOut:async()=>{}}}`}));
 await page.reload();await page.getByText('Sign in with an authorized chapter account to open the editor.').waitFor();assert.ok(await page.locator('#editor-workspace').isHidden());
 await page.locator('#sign-in').click();await page.getByText('Signed in as muhammadshamsularefin01@gmail.com. Role: super-admin.').waitFor();await page.locator('#restore-draft').evaluate(el=>el.closest('details').open=true);page.on('dialog',d=>d.accept());await page.locator('#restore-draft').click();await page.locator('#publish-content').click();assert.ok((await page.locator('#editor-status').innerText()).includes('Published revision 1'));
 const live=await page.evaluate(()=>window.__published);assert.ok(live.events.some(e=>e.id==='browser-test-event'));
 const visitorContext=await browser.newContext({acceptDownloads:true,viewport:{width:768,height:1000}});
 await visitorContext.route('**/data/site-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({...JSON.parse(fs.readFileSync('data/site-config.json')),cloudEnabled:true})}));
 await visitorContext.route('https://firestore.googleapis.com/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({fields:{payload:{stringValue:JSON.stringify(live)}}})}));
 const visitor=await visitorContext.newPage();visitor.on('pageerror',e=>errors.push(e.message));
 await visitor.goto('http://127.0.0.1:4173/activities.html?year=2090&type=all');await visitor.getByRole('link',{name:/Browser test event/}).click();await visitor.waitForURL('**/event.html?id=browser-test-event');assert.ok(await visitor.getByRole('link',{name:'Register for this event'}).isVisible());
 assert.ok(await visitor.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Live event without image must not overflow');
 const liveCalendar=await Promise.all([visitor.waitForEvent('download'),visitor.getByRole('link',{name:'Download calendar (.ics)'}).click()]);assert.equal(liveCalendar[0].suggestedFilename(),'browser-test-event.ics');
 // Background updates must not replace a tile while it is being hovered.
 const stableContext=await browser.newContext({viewport:{width:1440,height:1000}});
 await stableContext.route('**/data/site-config.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({...JSON.parse(fs.readFileSync('data/site-config.json')),cloudEnabled:true})}));
 let release;const held=new Promise(resolve=>{release=resolve;});
 const newer=JSON.parse(fs.readFileSync('public/data/content.json'));newer.events[0].title='Updated chapter event';
 await stableContext.route('https://firestore.googleapis.com/**',async r=>{await held;await r.fulfill({contentType:'application/json',body:JSON.stringify({fields:{payload:{stringValue:JSON.stringify(newer)}}})});});
 const stable=await stableContext.newPage();await stable.goto('http://127.0.0.1:4173/activities.html');
 const tile=stable.locator('.event-card').first(),tileHandle=await tile.elementHandle(),rect=await tile.boundingBox();
 await tile.hover();await stable.waitForTimeout(180);assert.deepEqual(await tile.boundingBox(),rect);assert.equal(await tile.locator('img').evaluate(el=>getComputedStyle(el).transform),'none');
 release();await stable.getByRole('button',{name:'Show updates',exact:true}).waitFor();assert.ok(await tileHandle.evaluate(el=>el.isConnected));
 await stable.getByRole('button',{name:'Show updates',exact:true}).click();assert.ok((await stable.locator('.event-card').first().innerText()).includes('Updated chapter event'));
 const still=await browser.newContext({reducedMotion:'reduce',viewport:{width:1440,height:1000}});const reduced=await still.newPage();await reduced.goto('http://127.0.0.1:4173/activities.html');assert.equal(await reduced.locator('.event-card-overlay').first().evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
 const nojs=await browser.newContext({javaScriptEnabled:false});const plain=await nojs.newPage();await plain.goto('http://127.0.0.1:4173/team-2026.html');await plain.locator('.roster summary').click();assert.ok(await plain.getByRole('heading',{name:'Premium members',exact:true}).isVisible());
 assert.deepEqual(errors,[]);console.log('Browser checks passed: original fonts, 3 viewport widths, restored menu, archives, calendar downloads, real XLSX import/validation, draft persistence, export, and mocked cloud publishing/reading.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

