import {normalizeCertificate,validCredential,certificateURL,membershipLookupID,normalizeMembershipID} from './certificate-model.js';
import {certificateSVG,downloadCertificate} from './certificate-render.js';
import {escapeHTML as h} from './content-model.js';
const result=document.getElementById('result'),display=document.getElementById('certificate-display'),input=document.getElementById('certId');let request=0;
function decode(v){if('stringValue'in v)return v.stringValue;if('timestampValue'in v)return v.timestampValue;if('integerValue'in v)return Number(v.integerValue);if('booleanValue'in v)return v.booleanValue;if(v.arrayValue)return (v.arrayValue.values||[]).map(decode);if(v.mapValue)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)]));return null;}
const unpack=doc=>Object.fromEntries(Object.entries(doc.fields||{}).map(([k,v])=>[k,decode(v)]));
const configPromise=fetch('data/site-config.json').then(r=>r.json());
async function read(path){const config=await configPromise;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{const response=await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.firebase.projectId)}/databases/(default)/documents/${path}`,{signal:controller.signal,cache:'no-store'});if(response.status===404)return null;if(!response.ok)throw Error('The certificate service is unavailable. Please try again later.');return await response.json();}finally{clearTimeout(timer);}}
async function catalog(){const select=document.getElementById('member-event'),status=document.getElementById('catalog-status');try{let events=[],token='';do{const page=await read('certificateEvents?pageSize=100'+(token?'&pageToken='+encodeURIComponent(token):''));events.push(...(page?.documents||[]).map(unpack));token=page?.nextPageToken||'';}while(token&&events.length<1000);select.innerHTML='<option value="">Select an event</option>'+events.sort((a,b)=>b.date.localeCompare(a.date)).map(e=>`<option value="${h(e.id)}">${h(e.title)} · ${h(e.date)}</option>`).join('');if(!events.length)status.textContent='Events appear here once their certificates are issued. Existing certificates can still be found by credential ID.';}catch{select.innerHTML='<option value="">Events unavailable</option>';status.textContent='Event lookup is temporarily unavailable. You can still try your credential ID below.';}}
document.getElementById('member-certificate-form').addEventListener('submit',async e=>{
 e.preventDefault();const current=++request,event=document.getElementById('member-event').value,member=document.getElementById('member-id').value,matches=document.getElementById('member-matches');matches.innerHTML='';display.innerHTML='';result.textContent='Finding your issued certificates…';
 try{const key=await membershipLookupID(event,member),doc=await read('certificateLookup/'+key);if(current!==request)return;const entry=doc?unpack(doc):null;
 if(!entry?.ids?.length){result.textContent='No issued certificate matches this event and membership ID. Check the ID or contact the chapter.';return;}
 const certs=await Promise.all(entry.ids.map(async id=>{const doc=await read('certificates/'+encodeURIComponent(id));return doc?normalizeCertificate(unpack(doc),{id,legacy:true}):null;}));if(current!==request)return;
 const valid=certs.filter(c=>c&&c.eventId===event&&normalizeMembershipID(c.memID)===normalizeMembershipID(member));
 if(!valid.length){result.textContent='No matching certificate found. Contact the chapter.';return;}
 result.textContent=`${valid.length} certificate record(s) found. Select one to view its current status and download.`;
 matches.innerHTML=valid.map(c=>`<button type="button" class="certificate-match" data-credential="${h(c.id)}">${h(c.name)} · ${h(c.type)} · ${h(c.status)}<br><small>${h(c.id)}</small></button>`).join('');
 }catch(err){if(current===request)result.textContent=err.name==='AbortError'?'Lookup timed out. Please try again.':err.message;}
});
document.getElementById('member-matches').addEventListener('click',e=>{const button=e.target.closest('[data-credential]');if(button){history.replaceState(null,'',certificateURL(button.dataset.credential));verify(button.dataset.credential);}});
catalog();
async function verify(id){
 const current=++request;display.innerHTML='';result.textContent='Checking the official certificate record…';
 if(!validCredential(id)){result.textContent='Enter a valid credential ID (letters, numbers, hyphens and underscores).';return;}
 input.value=id;
 try{
  const config=await fetch('data/site-config.json').then(r=>r.json());const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);let response;
  try{response=await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.firebase.projectId)}/databases/(default)/documents/certificates/${encodeURIComponent(id)}`,{signal:controller.signal,cache:'no-store'});}finally{clearTimeout(timer);}
  if(current!==request)return;
  if(response.status===404){result.textContent='Certificate not found. Check the ID or contact the chapter.';return;}
  if(!response.ok)throw Error('The verification service is unavailable. Please try again later.');
  const doc=await response.json(),raw=Object.fromEntries(Object.entries(doc.fields||{}).map(([k,v])=>[k,decode(v)]));
  const c=normalizeCertificate(raw,{id,legacy:true});
  if(c.status==='revoked'){result.innerHTML=`<div class="credential-revoked"><h2>Certificate revoked</h2><p>This credential is no longer valid. Contact the chapter for assistance.</p><p>${h(id)}</p></div>`;return;}
  const svg=await certificateSVG(c);if(current!==request)return;
  result.innerHTML=`<div class="credential-valid"><h2>Certificate verified</h2><p><strong>${h(c.name)}</strong> · ${h(c.event)}</p><p>Credential ID: ${h(id)}${c.designation?' · '+h(c.designation):''}</p><a href="${h(certificateURL(id))}">Permanent verification link</a></div>`;
  display.innerHTML=svg+'<button type="button" class="button" id="download-certificate">Download certificate PDF</button><p class="editor-note">The online record is the source of validity. Recheck this link when confirming a certificate.</p>';
  document.getElementById('download-certificate').addEventListener('click',async e=>{e.target.disabled=true;try{await downloadCertificate(c);}catch{result.textContent='The PDF could not be generated. Please try again.';}finally{e.target.disabled=false;}});
 }catch(e){if(current===request)result.textContent=e.name==='AbortError'?'Verification timed out. Please try again.':e.message;}
}
document.getElementById('verify-form').addEventListener('submit',e=>{e.preventDefault();const id=input.value.trim();history.replaceState(null,'',certificateURL(id));verify(id);});
const initial=new URLSearchParams(location.search).get('certId');if(initial)verify(initial);
