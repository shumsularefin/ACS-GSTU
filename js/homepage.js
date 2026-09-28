import {resolveImage} from './media.js';
import {escapeHTML as h,eventPast,safeURL} from './content-model.js';
const hero=document.querySelector('.home-page .slide-inner');
const feature=document.getElementById('open-events');
let images=[],position=0,published=false;
async function show(index){if(!images.length)return;position=(index+images.length)%images.length;const selected=position;let url;try{url=await resolveImage(safeURL(images[position],true));}catch{return;}const image=new Image();image.src=url;try{await image.decode();}catch{return;}if(selected!==position)return;hero.style.backgroundImage=`linear-gradient(90deg,rgba(15,32,78,.62),rgba(15,32,78,.18)),url(${JSON.stringify(url)})`;document.getElementById('hero-position').textContent=`${position+1} / ${images.length}`;}
function render(data){
 const next=data.homepage?.images||['images/optimized/slide01-1600.webp'];if(JSON.stringify(images)!==JSON.stringify(next)){images=next;show(0);}document.getElementById('hero-controls').hidden=images.length<2;
 const open=data.events.filter(e=>e.registrationStatus==='open'&&!eventPast(e)).sort((a,b)=>a.date.localeCompare(b.date));
 feature.hidden=!open.length;
 feature.innerHTML=open.length?open.slice(0,3).map(e=>`<a class="hero-registration" href="event.html?id=${encodeURIComponent(e.id)}"><span class="registration-label">Registration open <span aria-hidden="true">↗</span></span><strong>${h(e.title)}</strong><span>Explore event &amp; register</span></a>`).join(''):'';
 const anchor=hero?.querySelector('.slide-btn');if(anchor&&!hero.querySelector('.hero-actions')){const row=document.createElement('div');row.className='hero-actions';anchor.before(row);row.append(anchor,feature);}
}
if(hero&&feature){document.getElementById('hero-previous').addEventListener('click',()=>show(position-1));document.getElementById('hero-next').addEventListener('click',()=>show(position+1));window.addEventListener('chapter-content',e=>{published=true;render(e.detail);});fetch('data/content.json').then(r=>r.json()).then(data=>{if(!published)render(data);}).catch(()=>{});}

if(hero){let paused=matchMedia('(prefers-reduced-motion: reduce)').matches;const play=document.getElementById('hero-play');const label=()=>{play.textContent=paused?'Play':'Pause';play.setAttribute('aria-label',paused?'Play slideshow':'Pause slideshow');};label();play.addEventListener('click',()=>{paused=!paused;label();});setInterval(()=>{if(!paused&&!document.hidden&&!hero.closest('.header')?.matches(':focus-within')&&images.length>1)show(position+1);},6500);}
