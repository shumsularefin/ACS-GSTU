import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {publicContent,normalizeContent,escapeHTML as h,calendarICS,contentSignature} from '../js/content-model.js';
import {renderEvents,renderEvent,renderTeam,renderMembership,eventFile,latestYear,useImages} from '../js/content-render.js';
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
const read=p=>fs.readFileSync(p,'utf8');
const json=p=>JSON.parse(read(p));
const data=publicContent(normalizeContent({events:json('data/events.json'),team:json('data/team.json'),membership:json('data/membership.json')}));
const previousPages=fs.existsSync('data/generated-pages.json')?json('data/generated-pages.json'):[];
const images=json('data/image-manifest.json');useImages(images);
// public is generated output; rebuild it without stale bundles or deployment files.
const publicRoot=path.resolve('public');
if(path.dirname(publicRoot)!==process.cwd()||path.basename(publicRoot)!=='public')throw Error('Unexpected output directory');
fs.rmSync(publicRoot,{recursive:true,force:true});
for(const dir of ['public/css','public/js','public/data','public/calendar','calendar'])fs.mkdirSync(dir,{recursive:true});
let legacy=read('css/style.css').replace(/@import[^;]+;/g,'').replaceAll('url(../images/bg-noise.gif)','url(../images/bg-noise-static.webp)');
const css=(read('css/original-fonts.css')+'\n'+legacy+'\n'+read('css/site.css')).replace(/#01f7b6/gi,'#64ccc9').replace(/#01bfa5/gi,'#323fa0').replace(/#008c67/gi,'#323fa0');
const cssName=`site.${createHash('sha256').update(css).digest('hex').slice(0,12)}.css`;
for(const dir of ['css','public/css'])fs.writeFileSync(`${dir}/${cssName}`,css);
const navItems=[['index','Home'],['activities','Activities'],['team','Team'],['certificates','Certificate Center'],['about','About'],['contactus','Contact Us']];
const generated=[];
function optimize(html){return html.replace(/<img\b([^>]*?)src="([^"]+)"([^>]*?)>/g,(tag,before,src,after)=>{
 const variants=images[src];if(!variants)return tag;
 const v=variants[Math.min(1,variants.length-1)],logo=tag.includes('ACS Student Chapter');
 const attrs=(before+after).replace(/\s(?:width|height|loading|decoding)="[^"]*"/g,'');
 return `<img${attrs} src="${v.src}" srcset="${[...new Map(variants.map(x=>[x.width,x])).values()].map(x=>`${x.src} ${x.width}w`).join(', ')}" sizes="${logo?'200px':'(max-width: 640px) 100vw, 600px'}" width="${v.width}" height="${v.height}" loading="${logo?'eager':'lazy'}" decoding="async">`;
});}
function page(filename,title,description,body,active,editable){
 const navigation=navItems.map(([id,label])=>`<li><a href="${id}.html"${id===active?' aria-current="page"':''}>${label}</a></li>`).join('');
 const header=read('src/partials/header.html').replaceAll('{{navigation}}',navigation);
 if(active==='index')body=body.replace('{{membership}}',`<div id="editable-content" data-view="membership" data-signature="${contentSignature(data.membership)}">${renderMembership(data)}</div><script type="module" src="js/public-content.js"></script>`);
 if(editable)body=`<div id="editable-content" data-signature="${contentSignature(editable.view==='team'?data.team:data.events)}" ${Object.entries(editable).map(([k,v])=>`data-${k}="${h(v)}"`).join(' ')}>${body}</div><script type="module" src="js/public-content.js"></script>`;
 const html=optimize(`<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${h(title)} | ACS Student Chapter, GSTU</title><meta name="description" content="${h(description)}"><meta name="theme-color" content="#323fa0"><link rel="canonical" href="https://acs-gstu.web.app/${filename}"><meta property="og:title" content="${h(title)}"><meta property="og:description" content="${h(description)}">${active==='admin'?'<meta name="robots" content="noindex,nofollow">':''}<link rel="icon" href="ico/favicon.png"><link rel="stylesheet" href="css/bootstrap.min.css"><link rel="stylesheet" href="css/${cssName}">${active==='index'?'<link rel="preload" as="image" href="images/optimized/slide01-1600.webp" fetchpriority="high">':''}<script defer src="js/site-shell.js"></script><script type="module" src="js/media.js"></script></head><body class="page-loaded ${active==='index'?'home-page':'inner-page'}">${header}<main id="main">${body}</main>${read('src/partials/footer.html')}</body></html>`);
 fs.writeFileSync(filename,html);fs.writeFileSync('public/'+filename,html);generated.push(filename);
}
const meta={index:['ACS Student Chapter, GSTU','The ACS Student Chapter at GSTU: connect, learn, and grow.'],about:['Our story','Discover our chapter story and vision.'],contactus:['Contact us','Contact the chapter for membership, events and collaboration.'],verify:['Certificate verification','Verify a chapter certificate.'],admin:['Chapter Editor','Authorized chapter content editor.']};
for(const [name,[title,desc]] of Object.entries(meta))page(name+'.html',title,desc,read(`src/pages/${name}.html`),name);
const years=[...new Set([2024,2025,2026,...data.events.map(e=>Number(e.date.slice(0,4)))])].sort();
for(const year of years)for(const type of ['all','outreach','development','sustainability','community'])page(eventFile(data,year,type),`Events · ${year}`,`Chapter events and activities in ${year}.`,renderEvents(data,{year,type}),'activities',{view:'events',year:year===latestYear(data)&&type==='all'?'':year,category:type});
for(const e of data.events){
 const body=renderEvent(data,e.id);page(`event-${e.id}.html`,e.title,e.description,body,'activities',{view:'event',event:e.id});
 const ics=calendarICS(e);fs.writeFileSync(`calendar/${e.id}.ics`,ics);fs.writeFileSync(`public/calendar/${e.id}.ics`,ics);
}
const legacyEvent=data.events.find(e=>e.id==='green-and-clean')||data.events[0];
if(legacyEvent)page('activities-single.html',legacyEvent.title,legacyEvent.description,renderEvent(data,legacyEvent.id),'activities',{view:'event',event:legacyEvent.id});
page('event.html','Event details','Chapter event information and registration.',renderEvent(data,''),'activities',{view:'event'});
page('certificates.html','Certificate Center','Find and download your official ACS chapter certificates.',read('src/pages/verify.html'),'certificates');
for(const year of ['founders',...Object.keys(data.team.committees).sort()])page(year==='founders'?'team.html':`team-${year}.html`,year==='founders'?'Founding Members':`Executive Committee · ${year}`,'Meet our founding members and annual executive committees.',renderTeam(data,{year}),'team',{view:'team',year});
page('404.html','Page not found','Find your way back to the chapter.','<section class="archive"><h1>Page not found</h1><a href="index.html">Return home</a></section>','');
for(const dir of ['images','ico','fonts'])fs.cpSync(dir,'public/'+dir,{recursive:true,filter:source=>!path.basename(source).startsWith('.')});
for(const name of ['media.js','site-shell.js','homepage.js','editor-access.js','admin-access-panel.js','content-model.js','content-render.js','public-content.js','admin.js','cloud-editor.js','excel-worker.js','certificate-model.js','certificate-render.js','certificate-admin.js','verify.js'])fs.copyFileSync('js/'+name,'public/js/'+name);
fs.cpSync('js/vendor','public/js/vendor',{recursive:true});
fs.copyFileSync('css/bootstrap.min.css','public/css/bootstrap.min.css');
for(const name of ['site-config','image-manifest'])fs.copyFileSync(`data/${name}.json`,`public/data/${name}.json`);
fs.writeFileSync('public/data/content.json',JSON.stringify(data));
// Remove only obsolete generated pages tracked by the preceding build.
for(const filename of previousPages){
 if(!/^[a-z0-9-]+\.html$/.test(filename)||generated.includes(filename))continue;
 for(const dir of ['.','public'])fs.rmSync(path.join(dir,filename),{force:true});
 if(filename.startsWith('event-'))for(const dir of ['calendar','public/calendar'])fs.rmSync(path.join(dir,filename.slice(6,-5)+'.ics'),{force:true});
}
fs.copyFileSync('google3d74b2f79116caad.html','public/google3d74b2f79116caad.html');
fs.writeFileSync('data/generated-pages.json',JSON.stringify(generated,null,2)+'\n');
console.log(`Built ${generated.length} pages in the original theme. No Cloud Functions or Cloud Storage required.`);
