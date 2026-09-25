export const categories = {all:'All events',outreach:'Outreach',development:'Development',sustainability:'Sustainability',community:'Community'};
export const escapeHTML = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function contentSignature(data){let hash=2166136261;for(const ch of JSON.stringify(data)){hash=Math.imul(hash^ch.charCodeAt(0),16777619);}return (hash>>>0).toString(16);}
const text = (v,max=5000) => { const s=String(v??'').trim(); if(s.length>max) throw Error(`Text exceeds ${max} characters.`); return s; };
export function safeURL(value, image=false) {
  const url=text(value,2000); if(!url) return '';
  if(image && /^media:[a-f0-9-]{36}$/.test(url))return url;
  if(image && /^images\/[a-z0-9_ /().@-]+\.(webp|png|jpe?g)$/i.test(url) && !url.includes('..')) return url;
  let parsed; try{parsed=new URL(url);}catch{throw Error('Use a complete HTTPS URL'+(image?' or an images/ path.':'.'));}
  if(parsed.protocol!=='https:' || parsed.username || parsed.password) throw Error('Only HTTPS URLs are supported.');
  return url;
}
export function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
}
export function normalizeEvent(raw) {
  const e={id:text(raw.id,80),title:text(raw.title,200),date:text(raw.date,10),category:text(raw.category,30).toLowerCase(),image:safeURL(raw.image,true),description:text(raw.description),location:text(raw.location,300),registrationUrl:safeURL(raw.registrationUrl),registrationStatus:text(raw.registrationStatus||'unpublished',20),sourceUrl:safeURL(raw.sourceUrl),startsAt:text(raw.startsAt,35),endsAt:text(raw.endsAt,35)};
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(e.id)) throw Error('Event ID must use lowercase letters, numbers and single hyphens.');
  if(!e.title || !validDate(e.date) || !e.description) throw Error(`${e.id}: title, valid YYYY-MM-DD date, and description are required.`);
  if(!Object.hasOwn(categories,e.category) || e.category==='all') throw Error(`${e.id}: unknown category.`);
  if(!['unpublished','open','closed'].includes(e.registrationStatus)) throw Error(`${e.id}: invalid registration status.`);
  if(e.startsAt || e.endsAt) {
    const zoned=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/;
    if(!zoned.test(e.startsAt)||!zoned.test(e.endsAt)||!validDate(e.startsAt.slice(0,10))||!validDate(e.endsAt.slice(0,10))||!Number.isFinite(Date.parse(e.startsAt))||!Number.isFinite(Date.parse(e.endsAt))||Date.parse(e.endsAt)<=Date.parse(e.startsAt)) throw Error(`${e.id}: provide start and end with a timezone offset; end must follow start.`);
    if(e.startsAt.slice(0,10)!==e.date) throw Error(`${e.id}: start date must match the event date.`);
  }
  return e;
}
export function normalizePerson(raw, roster=false) {
  const m={name:text(raw.name,150)};
  if(!m.name) throw Error('Member name is required.');
  if(roster) {if(raw.memID)m.memID=text(raw.memID,100);m.tier=text(raw.tier,20).toLowerCase();if(!['general','premium'].includes(m.tier)) throw Error(`${m.name}: membership tier must be general or premium.`);}
  else {m.role=text(raw.role,150);m.image=safeURL(raw.image,true);if(!m.role) throw Error(`${m.name}: role is required.`);}
  return m;
}
function unique(list,key,label){const seen=new Set();for(const item of list){const id=key(item).toLowerCase();if(seen.has(id)) throw Error(`Duplicate ${label}: ${id}`);seen.add(id);}return list;}
export function normalizeMembership(raw) {
  const m={};for(const key of ['intro','eligibility','general','premium','renewal']){m[key]=text(raw[key]);if(!m[key])throw Error(`Membership ${key} is required.`);}
  if(!Array.isArray(raw.benefits)||raw.benefits.length>30)throw Error('Provide up to 30 membership benefits.');
  m.benefits=raw.benefits.map(v=>text(v,500)).filter(Boolean);
  m.applicationUrl=safeURL(raw.applicationUrl);m.renewalUrl=safeURL(raw.renewalUrl);m.contactEmail=text(raw.contactEmail,200);
  if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(m.contactEmail))throw Error('A valid chapter contact email is required.');
  return m;
}
export function normalizeContent(raw) {
  if(!Array.isArray(raw.events)||raw.events.length>300||!Array.isArray(raw.team?.founders)||!raw.team?.committees)throw Error('Invalid site content.');
  const content={schemaVersion:1,events:unique(raw.events.map(normalizeEvent),e=>e.id,'event ID'),team:{founders:unique(raw.team.founders.map(m=>normalizePerson(m)),m=>m.name,'founder'),committees:{}},membership:normalizeMembership(raw.membership)};
  content.certificateArchive=Array.isArray(raw.certificateArchive)?raw.certificateArchive.filter(id=>/^[A-Za-z0-9_-]{1,100}$/.test(id)):[];
  const hero=raw.homepage?.images||['images/optimized/slide01-1600.webp'];if(!Array.isArray(hero)||hero.length>5)throw Error('Use up to five homepage images.');content.homepage={images:hero.map(url=>safeURL(url,true)).filter(Boolean)};
  for(const [year,entry] of Object.entries(raw.team.committees)) {
    if(!/^20\d{2}$/.test(year)||!Array.isArray(entry.members)||!Array.isArray(entry.roster))throw Error(`Invalid committee year or record: ${year}`);
    content.team.committees[year]={members:unique(entry.members.map(m=>normalizePerson(m)),m=>m.name,'committee member'),roster:unique(entry.roster.map(m=>normalizePerson(m,true)),m=>m.name,'roster member')};
  }
  if(new TextEncoder().encode(JSON.stringify(content)).length>600000)throw Error('Content exceeds the 600 KB publishing limit. Split the archive before adding more records.');
  return content;
}
export function eventPast(e,now=new Date()) {return e.endsAt?Date.parse(e.endsAt)<now.getTime():e.date<new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function calendarValues(e) {
  const utc=s=>new Date(s).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  if(e.startsAt)return {start:utc(e.startsAt),end:utc(e.endsAt),allDay:false};
  const next=new Date(`${e.date}T00:00:00Z`);next.setUTCDate(next.getUTCDate()+1);
  return {start:e.date.replaceAll('-',''),end:next.toISOString().slice(0,10).replaceAll('-',''),allDay:true};
}
export function calendarICS(e) {
  const t=calendarValues(e);const quote=s=>String(s||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//ACS GSTU//Chapter Events//EN','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:${e.id}@acs-gstu.web.app`,'DTSTAMP:20260921T000000Z',`DTSTART${t.allDay?';VALUE=DATE':''}:${t.start}`,`DTEND${t.allDay?';VALUE=DATE':''}:${t.end}`,`SUMMARY:${quote(e.title)}`,`DESCRIPTION:${quote(e.description)}`,`LOCATION:${quote(e.location)}`,'END:VEVENT','END:VCALENDAR'];
  return lines.map(line=>{let result='',chunk='';for(const ch of line){if(new TextEncoder().encode(chunk+ch).length>73){result+=chunk+'\r\n ';chunk='';}chunk+=ch;}return result+chunk;}).join('\r\n')+'\r\n';
}
export function googleCalendarURL(e){const t=calendarValues(e);const q=new URLSearchParams({action:'TEMPLATE',text:e.title,dates:`${t.start}/${t.end}`,details:e.description,location:e.location||'',ctz:'Asia/Dhaka'});return `https://calendar.google.com/calendar/render?${q}`;}
export function mergeRows(base,kind,rows) {
  const data=structuredClone(base), seen=new Set();
  const aliases={membershipid:'memID',memid:'memID',membersname:'name',membername:'name',fullname:'name',eventid:'id',membershiptier:'tier',photofilename:'image',photo:'image',year:'year',name:'name',role:'role',title:'title',date:'date',category:'category',description:'description',registrationurl:'registrationUrl',registrationstatus:'registrationStatus',startsat:'startsAt',endsat:'endsAt',sourceurl:'sourceUrl',location:'location',image:'image',id:'id',tier:'tier'};
  rows.forEach((row,index)=>{
    try {
      const mapped={};for(const [k,v] of Object.entries(row)){const normalized=k.toLowerCase().replace(/[^a-z]/g,'');const key=aliases[normalized];if(key)mapped[key]=String(v??'').trim();}
      if(mapped.image && !mapped.image.includes('/') && !/^(https:|media:)/.test(mapped.image)) mapped.image='images/'+mapped.image;
      let list, record, key;
      if(kind==='events'){record=normalizeEvent(mapped);list=data.events;key=record.id;}
      else if(kind==='founders'){record=normalizePerson(mapped);list=data.team.founders;key=record.name;}
      else {
        if(!/^20\d{2}$/.test(mapped.year))throw Error('Year must be a four-digit year.');
        if(!['committee','roster'].includes(kind))throw Error('Unknown sheet type.');
        data.team.committees[mapped.year]??={members:[],roster:[]};
        record=normalizePerson(mapped,kind==='roster');list=data.team.committees[mapped.year][kind==='roster'?'roster':'members'];key=record.memID||record.name;
      }
      const identity=`${mapped.year||''}/${key.toLowerCase()}`;
      if(seen.has(identity))throw Error(`Duplicate row for ${key}.`);seen.add(identity);
      const at=list.findIndex(m=>(kind==='events'?m.id:kind==='roster'&&record.memID?m.memID||'':m.name).toLowerCase()===key.toLowerCase());
      if(at<0)list.push(record);else list[at]=record;
    }catch(error){throw Error(`Row ${index+2}: ${error.message}`);}
  });
  return normalizeContent(data);
}

export function publicContent(content){const copy=structuredClone(content);for(const c of Object.values(copy.team.committees))for(const m of c.roster)delete m.memID;return copy;}
