import {normalizeContent,contentSignature} from './content-model.js';
import {renderEvents,renderEvent,renderTeam,renderMembership,useImages} from './content-render.js';
const root=document.getElementById('editable-content');
let query=new URLSearchParams(location.search);
let displayedData,filterRequest=0;
const initialArchive={path:location.pathname,year:root?.dataset.year,type:root?.dataset.category};
let localData;
function getLocalData(){return localData??=fetch('data/content.json').then(r=>{if(!r.ok)throw new Error('Content unavailable');return r.json();}).then(normalizeContent);}
let selected=!['year','type','id'].some(key=>query.has(key))&&!(root?.dataset.view==='event'&&!root.dataset.event);
let signature=root?.dataset.signature,interacted=false,pending,notice;
for(const event of ['pointermove','pointerdown','focusin','touchstart'])root?.addEventListener(event,()=>{interacted=true;},{passive:true});
function paint(data,explicit=false) {
  window.dispatchEvent(new CustomEvent('chapter-content',{detail:data}));
  const view=root.dataset.view;
  const nextSignature=contentSignature(view==='membership'?data.membership:view==='team'?data.team:data.events);
  // A background read must not replace identical cards or interrupt hover/focus.
  if(selected&&signature===nextSignature){displayedData=data;return;}
  if(selected&&interacted&&!explicit){
    pending=data;
    if(!notice){notice=document.createElement('aside');notice.className='content-update-notice';notice.setAttribute('role','status');notice.innerHTML='<span>Updated chapter information is available.</span> <button type="button" class="button">Show updates</button>';notice.querySelector('button').addEventListener('click',()=>{const next=pending;notice.remove();notice=null;pending=null;paint(next,true);});document.body.append(notice);}
    return;
  }
  const options={year:query.get('year')||root.dataset.year,type:query.get('type')||root.dataset.category,live:true};
  if(options.year && !(view==='team'?/^(?:founders|20\d{2})$/:/^20\d{2}$/).test(options.year))options.year=undefined;
  const openDetails=[...root.querySelectorAll('details[open] summary')].map(el=>el.textContent);
  root.innerHTML=view==='events'?renderEvents(data,options):view==='team'?renderTeam(data,options):view==='membership'?renderMembership(data):renderEvent(data,query.get('id')||root.dataset.event,options);
  for(const detail of root.querySelectorAll('details'))if(openDetails.includes(detail.querySelector('summary')?.textContent))detail.open=true;
  selected=true;signature=nextSignature;displayedData=data;
  if(view==='event')document.title=`${data.events.find(e=>e.id===(query.get('id')||root.dataset.event))?.title||'Event not found'} | ACS Student Chapter, GSTU`;
}
async function load(){
  const [config,images]=await Promise.all([fetch('data/site-config.json').then(r=>r.json()),fetch('data/image-manifest.json').then(r=>r.json())]);useImages(images);
  const cacheKey=`acs-content:${config.firebase.projectId}`;
  let cached;try{cached=config.cloudEnabled?JSON.parse(sessionStorage.getItem(cacheKey)||'null'):null;}catch{}
  if(cached?.content){try{paint(normalizeContent(cached.content));}catch{cached=null;}}
  if(!cached?.content&&(!selected||root.dataset.view==='events')){try{paint(await getLocalData());}catch{}}
  if(config.cloudEnabled&&(!cached||Date.now()-cached.time>300000)){
    try{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
      let response;try{response=await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.firebase.projectId)}/databases/(default)/documents/siteContent/published`,{signal:controller.signal});}finally{clearTimeout(timer);}
      if(response.ok){const doc=await response.json(),raw=JSON.parse(doc.fields.payload.stringValue);if(Number(doc.fields.schemaVersion?.integerValue)===2)raw.events=Object.values(doc.fields.events?.mapValue?.fields||{}).map(decodeField);const content=normalizeContent(raw);paint(content);try{sessionStorage.setItem(cacheKey,JSON.stringify({time:Date.now(),content}));}catch{}}
      else{try{sessionStorage.setItem(cacheKey,JSON.stringify({time:Date.now(),content:cached?.content||null}));}catch{}}
    }catch{/* Keep static/cached content when offline or when quota is unavailable. */}
  }
}
if(root)load().catch(()=>{/* Static content remains usable if configuration cannot load. */});

// Keep the document and focused category links mounted when filtering the archive.
function archiveOptions(url){
  const match=url.pathname.match(/activities-(20\d{2})-([a-z-]+)\.html$/);
  const original=url.pathname===initialArchive.path&&!url.search;
  return {year:url.searchParams.get('year')||match?.[1]||(original?initialArchive.year:undefined),type:url.searchParams.get('type')||match?.[2]||(original?initialArchive.type:'all'),live:true};
}
async function filterArchive(url,push){
  const request=++filterRequest;
  try{
    // Local data lets navigation work even if the optional cloud read is slow.
    const data=displayedData||await getLocalData();
    if(request!==filterRequest)return;
    const options=archiveOptions(url),template=document.createElement('template');
    template.innerHTML=renderEvents(data,options);
    const archive=root.querySelector('.archive'),next=template.content.querySelector('.archive');
    const currentResults=archive.querySelector('.event-grid, .empty-state');
    const nextResults=next.querySelector('.event-grid, .empty-state');
    // Reuse decoded cards; new lazy images must be ready before entering the viewport.
    const existing=new Map([...currentResults.querySelectorAll('.event-card')].map(card=>[new URL(card.href).searchParams.get('id')||new URL(card.href).pathname.replace(/^.*event-|\.html$/g,''),card]));
    const reuse=[];
    for(const card of nextResults.querySelectorAll('.event-card')){
      const id=new URL(card.getAttribute('href'),location.href).searchParams.get('id');
      const previous=existing.get(id);
      if(previous)reuse.push([card,previous]);
    }
    await Promise.all([...nextResults.querySelectorAll('img')].map(async img=>{
      img.loading='eager';
      try{await img.decode();}catch{/* Failed images retain their reserved square. */}
    }));
    if(request!==filterRequest)return;
    // Prevent scroll clamping and footer jumps when a shorter category is selected.
    nextResults.style.minHeight=`${currentResults.getBoundingClientRect().height}px`;
    for(const [card,previous] of reuse)card.replaceWith(previous);
    const tabs=archive.querySelector('.category-tabs'),nextTabs=next.querySelector('.category-tabs');
    [...tabs.querySelectorAll('a')].forEach((link,index)=>{
      const replacement=nextTabs.querySelectorAll('a')[index];
      link.href=replacement.href;
      if(replacement.hasAttribute('aria-current'))link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
    });
    for(const selector of ['.archive-meta','.event-grid, .empty-state','.year-pagination'])archive.querySelector(selector).replaceWith(next.querySelector(selector));
    if(push)history.pushState(null,'',url);
    query=new URLSearchParams(url.search);
    root.dataset.year=String(options.year||Math.max(2024,...data.events.map(e=>Number(e.date.slice(0,4)))));
    root.dataset.category=options.type||'all';
    selected=true;signature=contentSignature(data.events);displayedData=data;
  }catch{if(request===filterRequest)location.assign(url.href);}
}
if(root?.dataset.view==='events'){
  root.addEventListener('click',event=>{
    const link=event.target.closest('.category-tabs a, .year-pagination a, .empty-state a');
    if(!link||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    event.preventDefault();filterArchive(new URL(link.href),true);
  });
  window.addEventListener('popstate',()=>filterArchive(new URL(location.href),false));
}


function decodeField(v){if('stringValue' in v)return v.stringValue;if('integerValue' in v)return Number(v.integerValue);if('booleanValue' in v)return v.booleanValue;if(v.mapValue)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decodeField(x)]));if(v.arrayValue)return (v.arrayValue.values||[]).map(decodeField);return null;}
