export const certificateTypes={participant:['Participation','for participating in'],champion:['Achievement','awarded Champion in'], 'runner-up':['Achievement','awarded First Runner-up in'],'second-runner-up':['Achievement','awarded Second Runner-up in'],delegate:['Recognition','for their contribution as a delegate to'],organization:['Recognition','for institutional partnership and support of'],executive:['Service','in recognition of dedicated executive service to'],instructor:['Appreciation','for contributing as an instructor to'],teacher:['Appreciation','for their contribution as an educator to'],institution:['Recognition','for institutional support and collaboration in'],guest:['Honor','for their distinguished contribution to'],achievement:['Achievement','in recognition of outstanding achievement in']};
export const signatories=[{name:'Dr. Md. Kamruzzaman',role:'Advisor',title:'Professor, Dept. of ACCE, GSTU'},{name:'S. M. Fazle Rabbi',role:'Co Advisor',title:'Lecturer, Dept. of ACCE, GSTU'}];
const text=(v,max=200)=>String(v??'').trim().slice(0,max);
export function validCredential(id){return /^[A-Za-z0-9][A-Za-z0-9_-]{2,79}$/.test(id);}
export function dateValue(value){
 if(value?.toDate)value=value.toDate();
 if(value?.seconds!=null||value?._seconds!=null)value=new Date(Number(value.seconds??value._seconds)*1000);
 if(value instanceof Date)value=value.toISOString().slice(0,10);
 const s=text(value,40).slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s?s:'';
}
export function normalizeCertificate(raw,{id=raw.id||raw.credentialId,legacy=false}={}){
 id=String(id??'').trim();
 if(!validCredential(id||''))throw Error('Credential ID must contain 3–80 letters, numbers, hyphens or underscores.');
 const designation=text(raw.designation).toLowerCase();
 const requested=text(raw.type).toLowerCase().replaceAll(' ','-');
 const type=({'champions':'champion','runners-up':'runner-up','1st-runner-up':'runner-up','2nd-runner-up':'second-runner-up','executive-member':'executive'})[requested]||requested||(legacy&&Object.hasOwn(certificateTypes,designation)?designation:'participant');if(!Object.hasOwn(certificateTypes,type))throw Error('Unknown certificate type: '+type);
 if(raw.status&&!['issued','revoked'].includes(raw.status))throw Error('Unknown certificate status.');
 const record={id,name:text(raw.name,160),memID:text(raw.memID,80),designation:text(raw.designation,160),event:text(raw.event,250),eventId:text(raw.eventId,100),eventDate:dateValue(raw.eventDate),dateIssued:dateValue(raw.dateIssued),type,status:raw.status==='revoked'?'revoked':'issued',achievement:text(raw.achievement,220),templateVersion:1};
 if(!record.name||!record.event)throw Error('Every certificate needs a recipient name and event title.');
 if(!record.eventId&&!legacy){let hash=2166136261;for(const char of record.event+'\n'+record.eventDate)hash=Math.imul(hash^char.charCodeAt(0),16777619);record.eventId='event-'+(hash>>>0).toString(16);}
 if(record.eventId&&!/^[A-Za-z0-9_-]{1,100}$/.test(record.eventId))throw Error('Event ID can contain only letters, numbers, underscores and hyphens.');
 if(String(raw.name).trim().length>160||String(raw.event).trim().length>250)throw Error('Recipient names are limited to 160 characters; event titles to 250.');
 if(!legacy&&!record.dateIssued)throw Error('Use a valid YYYY-MM-DD issue date.');
 return record;
}
export function importCertificates(input,defaults={}){
 let rows=Array.isArray(input)?input:Array.isArray(input?.certificates)?input.certificates:Object.entries(input||{}).map(([id,v])=>({id,...v}));
 if(!rows.length||rows.length>1000)throw Error('Import between 1 and 1,000 recipients per batch.');
 const seen=new Set();
 return rows.map((raw,index)=>{
  const aliases={'credentialid':'id','certificateid':'id','recipientname':'name','participantname':'name','membershipid':'memID','issuedate':'dateIssued','dateissued':'dateIssued','eventdate':'eventDate','eventtitle':'event','certificatetype':'type','membershipnumber':'memID'};
  const row={};for(const [k,v] of Object.entries(raw)){const key=k.toLowerCase().replace(/[^a-z]/g,'');row[aliases[key]||({eventid:'eventId',memid:'memID'}[key])||key]=v;}
  const record=normalizeCertificate({...defaults,...Object.fromEntries(Object.entries(row).filter(([,v])=>v!==''&&v!=null)),id:row.id||`ACS-${crypto.randomUUID().replaceAll('-','').toUpperCase()}`});
  if(seen.has(record.id))throw Error(`Duplicate credential ID on row ${index+1}: ${record.id}`);seen.add(record.id);return record;
 });
}
export function certificateURL(id,origin=location.origin){return `${origin}/certificates.html?certId=${encodeURIComponent(id)}`;}
export const normalizeMembershipID=value=>String(value??'').trim().toUpperCase();
export async function membershipLookupID(eventId,memberId){
 const member=normalizeMembershipID(memberId);if(!eventId||!member||member.length>80)throw Error('Select an event and enter your ACS membership ID.');
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(eventId+'\n'+member));
 return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
