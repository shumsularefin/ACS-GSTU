import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {importCertificates,membershipLookupID} from '../js/certificate-model.js';
test('certificate transactions are retry-safe, reject conflicts atomically, and preserve revocations',async()=>{
 const store=new Map();globalThis.__certificateTestStore=store;
 const sdk=`const store=globalThis.__certificateTestStore;export const getFirestore=()=>({});let seq=0;export const collection=(db,name)=>name;export const doc=(db,...p)=>p.length?p.join('/'):db+'/'+(++seq);export const serverTimestamp=()=>123;const snap=r=>({exists:()=>store.has(r),data:()=>store.get(r)});export const getDocFromServer=async r=>snap(r);export const runTransaction=async(db,fn)=>{const writes=[];await fn({get:async r=>snap(r),set:(r,v)=>writes.push(()=>store.set(r,v.certificate?{...v,certificate:Object.fromEntries(Object.entries(v.certificate).sort())}:v)),update:(r,v)=>writes.push(()=>store.set(r,{...store.get(r),...v}))});writes.forEach(f=>f());};`;
 const uri=s=>'data:text/javascript,'+encodeURIComponent(s).replaceAll("'",'%27');
 let source=fs.readFileSync(new URL('../js/cloud-editor.js',import.meta.url),'utf8').replace('./certificate-model.js',new URL('../js/certificate-model.js',import.meta.url).href).replace('./editor-access.js',new URL('../js/editor-access.js',import.meta.url).href);
 source=source.replace('https://www.gstatic.com/firebasejs/10.11.1/firebase-app.js',uri('export const initializeApp=()=>({});'))
 .replace('https://www.gstatic.com/firebasejs/10.11.1/firebase-auth.js',uri(`export const getAuth=()=>({currentUser:{uid:'editor',email:'muhammadshamsularefin01@gmail.com'}});`))
 .replace('https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js',uri(sdk));
 // Encode apostrophes too because the SDK URLs are single-quoted imports.
 source=source.replace(/data:text\/javascript,[^']*(?='\))/g,m=>m);
 const api=await (await import(uri(source))).connect({});
 const records=importCertificates([{Name:'A',ID:'CERT001','Membership ID':' mem-001 '},{Name:'A',ID:'CERT002','Membership ID':'MEM-001',Type:'instructor'}],{event:'Workshop',dateIssued:'2026-09-21'});
 await api.issueCertificates(records);assert.equal([...store.keys()].filter(k=>k.startsWith('certificates/')).length,2);await api.issueCertificates(records);assert.equal([...store.keys()].filter(k=>k.startsWith('certificates/')).length,2);
 const lookupKey=await membershipLookupID(records[0].eventId,'MEM-001');
 assert.deepEqual(store.get('certificateLookup/'+lookupKey).ids,['CERT001','CERT002']);
 assert.equal(store.get('certificateEvents/'+records[0].eventId).title,'Workshop');
 assert.notEqual(await membershipLookupID('other-event','MEM-001'),lookupKey);
 await assert.rejects(()=>api.issueCertificates([{...records[0],id:'CERT003'},{...records[1],name:'Changed'}]),/already exists/);assert.equal(store.has('certificates/CERT003'),false);
 await api.revokeCertificate('CERT001');assert.equal((await api.certificate('CERT001')).status,'revoked');await assert.rejects(()=>api.issueCertificates(records),/already exists/);
 delete globalThis.__certificateTestStore;
});

