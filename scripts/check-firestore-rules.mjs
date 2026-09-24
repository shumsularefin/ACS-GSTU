// Emulator only: verifies role boundaries, immutable logs and public credential privacy.
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,updateDoc,serverTimestamp,writeBatch} from 'firebase/firestore';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('A Firestore emulator is required.');
const env=await initializeTestEnvironment({projectId:'demo-acs-rules',firestore:{rules:readFileSync('firestore.rules','utf8')}});
const superEmail='muhammadshamsularefin01@gmail.com';let sequence=0;
const account=(uid,email,verified=true)=>({uid,email,db:env.authenticatedContext(uid,{email,email_verified:verified}).firestore()});
const delegated=account('delegated','delegated@example.com'),owner=account('owner',superEmail),outreach=account('outreach','outreach@example.com'),admin=account('admin','admin@example.com'),stranger=account('stranger','stranger@example.com'),unverified=account('unverified',superEmail,false),anon=env.unauthenticatedContext().firestore();
function log(batch,a,action,target,extra={}){const id='log-'+(++sequence);batch.set(doc(a.db,'auditLogs',id),{actorUid:a.uid,actorEmail:a.email,action,target,detail:'Test action',createdAt:serverTimestamp(),...extra});return id;}
function grant(a,email,role,active=true){const b=writeBatch(a.db),id=log(b,a,'access.set',email);b.set(doc(a.db,'chapterEditors',email),{email,role,active,auditId:id,updatedAt:serverTimestamp(),updatedBy:a.uid});return b.commit();}
const event=id=>({id,title:'Test event',date:'2026-10-01',category:'outreach',image:'',description:'Test description',location:'',registrationUrl:'',registrationStatus:'unpublished',sourceUrl:'',startsAt:'',endsAt:''});
function content(a,revision,events,payload='{}',eventId=''){const b=writeBatch(a.db),id=log(b,a,eventId?'event.add':'content.publish',eventId||'published',{revision});b.set(doc(a.db,'siteContent','published'),{schemaVersion:2,payload,events,revision,eventId,auditId:id,updatedAt:serverTimestamp(),updatedBy:a.uid});if(!eventId)b.set(doc(a.db,'privateRosters','members'),{years:{'2026':[{name:'Private Member',memID:'PRIVATE001',tier:'general'}]},auditId:id,updatedAt:serverTimestamp()});return b.commit();}
const record=(id,type='participant')=>({id,name:'Test Recipient',memID:'TEST001',designation:'',event:'Test Event',eventId:'test-event',eventDate:'2026-09-21',dateIssued:'2026-09-21',type,status:'issued',achievement:'',templateVersion:1});
function issue(a,ids,type='participant'){const b=writeBatch(a.db),auditId=log(b,a,'certificate.issue',ids[0],{ids,eventIds:['test-event']});for(const id of ids){const c=record(id,type);b.set(doc(a.db,'certificates',id),{...c,certificate:c,auditId,createdAt:serverTimestamp(),issuedBy:a.uid});b.set(doc(a.db,'certificateLookup',createHash('sha256').update(id).digest('hex')),{eventId:c.eventId,ids:[id],auditId});}b.set(doc(a.db,'certificateEvents','test-event'),{id:'test-event',title:'Test Event',date:'2026-09-21',updatedAt:serverTimestamp(),auditId});return b.commit();}
try{
 await assertSucceeds(grant(owner,outreach.email,'outreach'));await assertSucceeds(grant(owner,admin.email,'administrator'));
 await assertFails(grant(outreach,stranger.email,'administrator'));await assertFails(grant(unverified,stranger.email,'administrator'));
 await assertFails(getDocs(collection(outreach.db,'chapterEditors')));await assertSucceeds(getDoc(doc(outreach.db,'chapterEditors',outreach.email)));
 await assertSucceeds(content(owner,1,{'original':event('original')}));
 await assertFails(content(outreach,2,{'original':event('original')},'{"team":"tampered"}'));
 await assertFails(content(outreach,2,{'original':{...event('original'),title:'Changed'}},'{}','original'));
 await assertSucceeds(content(outreach,2,{'original':event('original'),'new-event':event('new-event')},'{}','new-event'));
 await assertFails(content(stranger,3,{'bad':event('bad')},'{}','bad'));
 await assertSucceeds(getDoc(doc(anon,'siteContent','published')));await assertSucceeds(getDoc(doc(owner.db,'privateRosters','members')));await assertFails(getDoc(doc(anon,'privateRosters','members')));await assertFails(getDoc(doc(outreach.db,'privateRosters','members')));
 await assertFails(setDoc(doc(owner.db,'certificates','NOLOG'),{...record('NOLOG'),certificate:record('NOLOG'),auditId:'missing',createdAt:serverTimestamp(),issuedBy:owner.uid}));
 await assertFails(issue(stranger,['DENIED']));await assertFails(issue(unverified,['UNVERIFIED']));
 await assertSucceeds(issue(outreach,['PARTICIPANT']));await assertFails(issue(outreach,['GUEST'],'guest'));
 await assertSucceeds(issue(admin,['CHAMPION'],'champion'));await assertFails(issue(admin,['EXECUTIVE'],'executive'));
 await assertSucceeds(issue(owner,['EXECUTIVE'],'executive'));await assertSucceeds(issue(owner,Array.from({length:40},(_,i)=>'BATCH'+i)));
 await assertSucceeds(getDoc(doc(anon,'certificates','PARTICIPANT')));await assertFails(getDocs(collection(anon,'certificates')));await assertSucceeds(getDocs(collection(anon,'certificateEvents')));await assertFails(getDocs(collection(anon,'certificateLookup')));await assertSucceeds(getDoc(doc(anon,'certificateLookup',createHash('sha256').update('PARTICIPANT').digest('hex'))));
 await assertFails(updateDoc(doc(owner.db,'certificates','PARTICIPANT'),{name:'Tampered'}));
 const rev=writeBatch(owner.db),auditId=log(rev,owner,'certificate.revoke','PARTICIPANT');rev.update(doc(owner.db,'certificates','PARTICIPANT'),{status:'revoked',auditId,revokedAt:serverTimestamp(),revokedBy:owner.uid});await assertSucceeds(rev.commit());
 await assertFails(updateDoc(doc(owner.db,'certificates','PARTICIPANT'),{status:'issued'}));
 await assertFails(getDocs(collection(outreach.db,'auditLogs')));await assertSucceeds(getDocs(collection(owner.db,'auditLogs')));
 await assertFails(updateDoc(doc(owner.db,'auditLogs','log-1'),{detail:'Changed history'}));
 await assertSucceeds(grant(owner,outreach.email,'outreach',false));await assertFails(issue(outreach,['AFTERREVOKE']));

 await assertSucceeds(grant(owner,delegated.email,'super-admin'));
 await assertSucceeds(getDocs(collection(delegated.db,'auditLogs')));
 await assertSucceeds(grant(owner,outreach.email,'outreach',true));
 const state=await getDoc(doc(owner.db,'siteContent','published'));
 const sectionBatch=writeBatch(outreach.db),sectionLog=log(sectionBatch,outreach,'content.update','homepage',{revision:state.data().revision+1});
 sectionBatch.update(doc(outreach.db,'siteContent','published'),{homepage:{images:['images/photo.jpg']},revision:state.data().revision+1,eventId:'homepage',auditId:sectionLog,updatedAt:serverTimestamp(),updatedBy:outreach.uid});await assertSucceeds(sectionBatch.commit());
 await assertFails(updateDoc(doc(outreach.db,'siteContent','published'),{payload:'tampered'}));
 const imageID='00000000-0000-4000-8000-000000000001';
 const imageBatch=writeBatch(outreach.db),imageLog=log(imageBatch,outreach,'image.add',imageID);
 imageBatch.set(doc(outreach.db,'siteImages',imageID),{image:'data:image/jpeg;base64,AAAA',name:'test.jpg',createdBy:outreach.uid,createdAt:serverTimestamp(),auditId:imageLog});await assertSucceeds(imageBatch.commit());
 await assertSucceeds(getDoc(doc(anon,'siteImages',imageID)));await assertFails(getDocs(collection(anon,'siteImages')));
 await assertFails(setDoc(doc(stranger.db,'siteImages','00000000-0000-4000-8000-000000000002'),{image:'data:image/jpeg;base64,AAAA'}));
 const deletion=writeBatch(delegated.db),deleteLog=log(deletion,delegated,'access.delete',admin.email);deletion.set(doc(delegated.db,'editorRemovals',admin.email),{auditId:deleteLog});deletion.delete(doc(delegated.db,'chapterEditors',admin.email));await assertSucceeds(deletion.commit());
 await assertFails(issue(admin,['DELETEDACCESS']));
 const removeImage=writeBatch(owner.db),removeLog=log(removeImage,owner,'image.delete',imageID);removeImage.set(doc(owner.db,'imageRemovals',imageID),{auditId:removeLog});removeImage.delete(doc(owner.db,'siteImages',imageID));await assertSucceeds(removeImage.commit());
 console.log('PASS: super-admin grants; outreach create-only events; protected administration; category restrictions; mandatory immutable audit logs; revocation; 40-record batch; anonymous read privacy.');
}finally{await env.cleanup();}
