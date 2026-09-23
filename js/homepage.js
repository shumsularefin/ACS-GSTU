import {escapeHTML as h,eventPast,safeURL} from './content-model.js';
const hero=document.querySelector('.home-page .slide-inner');
const feature=document.getElementById('open-events');
let images=[],position=0,published=false;
async function show(index){if(!images.length)return;position=(index+images.length)%images.length;const selected=position,url=safeURL(images[position],true);const image=new Image();image.src=url;try{await image.decode();}catch{return;}if(selected!==position)return;hero.style.backgroundImage=`linear-gradient(90deg,rgba(15,32,78,.62),rgba(15,32,78,.18)),url(${JSON.stringify(url)})`;document.getElementById('hero-position').textContent=`${position+1} / ${images.length}`;}
function render(data){
 const next=data.homepage?.images||['images/optimized/slide01-1600.webp'];if(JSON.stringify(images)!==JSON.stringify(next)){images=next;show(0);}document.getElementById('hero-controls').hidden=images.length<2;
 const open=data.events.filter(e=>e.registrationStatus==='open'&&!eventPast(e)).sort((a,b)=>a.date.localeCompare(b.date));
 feature.hidden=!open.length;
 feature.innerHTML=open.length?`<div class="container"><p class="eyebrow">REGISTRATION OPEN</p><h2>Join our next chapter event</h2><div class="open-event-grid">${open.slice(0,3).map(e=>`<a class="open-event" href="event.html?id=${encodeURIComponent(e.id)}"><span>${h(e.category)} · ${h(e.date)}</span><h3>${h(e.title)}</h3><p>${h(e.location||'View event details')}</p><strong>Explore event &amp; register →</strong></a>`).join('')}</div></div>`:'';
}
if(hero&&feature){document.getElementById('hero-previous').addEventListener('click',()=>show(position-1));document.getElementById('hero-next').addEventListener('click',()=>show(position+1));window.addEventListener('chapter-content',e=>{published=true;render(e.detail);});fetch('data/content.json').then(r=>r.json()).then(data=>{if(!published)render(data);}).catch(()=>{});}
