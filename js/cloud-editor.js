import {SUPER_ADMIN_EMAIL,editorEmail,packContent,unpackContent,contentChanges} from './editor-access.js';
import {membershipLookupID} from './certificate-model.js';
// These SDKs load only after an editor chooses to sign in.
let instance;
export async function connect(config) {
  if(instance)return instance;
  const [app,authSDK,dbSDK]=await Promise.all([import('https://www.gstatic.com/firebasejs/10.11.1/firebase-app.js'),import('https://www.gstatic.com/firebasejs/10.11.1/firebase-auth.js'),import('https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js')]);
  const firebase=app.initializeApp(config,'chapter-editor'),auth=authSDK.getAuth(firebase),db=dbSDK.getFirestore(firebase);
  const ref=dbSDK.doc(db,'siteContent','published');
  function audit(tx,action,target,detail='',extra={}){const r=dbSDK.doc(dbSDK.collection(db,'auditLogs'));tx.set(r,{actorUid:auth.currentUser.uid,actorEmail:auth.currentUser.email.toLowerCase(),action,target,detail:detail.slice(0,1000),createdAt:dbSDK.serverTimestamp(),...extra});return r.id;}
  async function access(user){if(!user?.emailVerified)return '';if(user.email.toLowerCase()===SUPER_ADMIN_EMAIL)return 'super-admin';const grant=await dbSDK.getDocFromServer(dbSDK.doc(db,'chapterEditors',user.email.toLowerCase()));return grant.exists()&&grant.data().active&&['super-admin','administrator','outreach'].includes(grant.data().role)?grant.data().role:'';}
  instance={
    access,
    async ensureSchema(seed){if(await access(auth.currentUser)!=='super-admin')return;await dbSDK.runTransaction(db,async tx=>{const snap=await tx.get(ref);if(snap.exists()&&snap.data().schemaVersion===2&&snap.data().homepage&&snap.data().membership)return;const data=snap.exists()?snap.data():null;const content=data?unpackContent(data):seed;const revision=(data?.revision||0)+1;const auditId=audit(tx,'content.publish','published','Upgrade content storage for editor roles',{revision});tx.set(ref,{...packContent(content),revision,eventId:'',auditId,updatedAt:dbSDK.serverTimestamp(),updatedBy:auth.currentUser.uid});});},
    async manageEditor(email,role,active){email=editorEmail(email);if(email===SUPER_ADMIN_EMAIL)throw Error('The super-admin account cannot be changed.');if(!['super-admin','administrator','outreach'].includes(role))throw Error('Choose a valid editor role.');await dbSDK.runTransaction(db,async tx=>{const r=dbSDK.doc(db,'chapterEditors',email);const auditId=audit(tx,'access.set',email,role+' / '+(active?'active':'disabled'));tx.set(r,{email,role,active,auditId,updatedAt:dbSDK.serverTimestamp(),updatedBy:auth.currentUser.uid});});},
    async images(){const snap=await dbSDK.getDocs(dbSDK.collection(db,'siteImages'));return snap.docs.map(d=>({id:d.id,name:d.data().name}));},
    async deleteImage(id){await dbSDK.runTransaction(db,async tx=>{const snap=await tx.get(ref);if(snap.exists()&&JSON.stringify(snap.data()).includes('media:'+id))throw Error('This image is used on the published website. Remove it from its section and publish that change first.');const auditId=audit(tx,'image.delete',id,'Removed unused image');tx.set(dbSDK.doc(db,'imageRemovals',id),{auditId});tx.delete(dbSDK.doc(db,'siteImages',id));});},
    async uploadImage(image,name){const id=crypto.randomUUID();await dbSDK.runTransaction(db,async tx=>{const auditId=audit(tx,'image.add',id,name.slice(0,150));tx.set(dbSDK.doc(db,'siteImages',id),{image,name:name.slice(0,150),createdBy:auth.currentUser.uid,createdAt:dbSDK.serverTimestamp(),auditId});});return 'media:'+id;},
    async deleteEditor(email){email=editorEmail(email);if(email===SUPER_ADMIN_EMAIL)throw Error('The permanent owner cannot be deleted.');await dbSDK.runTransaction(db,async tx=>{const auditId=audit(tx,'access.delete',email,'Deleted editor grant');tx.set(dbSDK.doc(db,'editorRemovals',email),{auditId});tx.delete(dbSDK.doc(db,'chapterEditors',email));});},
    async publishSection(section,value){if(!['homepage','membership'].includes(section))throw Error('Unknown editable section.');await dbSDK.runTransaction(db,async tx=>{const snap=await tx.get(ref);if(!snap.exists()||!snap.data().homepage)throw Error('The super-admin must sign in once to initialize homepage editing.');const revision=snap.data().revision+1;const auditId=audit(tx,'content.update',section,section+' updated',{revision});tx.update(ref,{[section]:value,revision,eventId:section,auditId,updatedAt:dbSDK.serverTimestamp(),updatedBy:auth.currentUser.uid});});},
    async editors(){const snap=await dbSDK.getDocs(dbSDK.collection(db,'chapterEditors'));return snap.docs.map(d=>d.data());},
    async auditPage(cursor){const q=dbSDK.query(dbSDK.collection(db,'auditLogs'),dbSDK.orderBy('createdAt','desc'),...(cursor?[dbSDK.startAfter(cursor)]:[]),dbSDK.limit(50));const snap=await dbSDK.getDocs(q);return {entries:snap.docs.map(d=>d.data()),cursor:snap.docs.at(-1)};},
    async addEvent(event){await dbSDK.runTransaction(db,async tx=>{const snap=await tx.get(ref);if(!snap.exists()||snap.data().schemaVersion!==2)throw Error('The super-admin must sign in once to initialize editor permissions.');const data=snap.data();if(data.events[event.id])throw Error('This event ID already exists. Ask the super-admin to edit existing events.');if(Object.keys(data.events).length>=300)throw Error('The event archive is full.');const revision=data.revision+1;const auditId=audit(tx,'event.add',event.id,event.title+' / '+event.date,{revision});tx.update(ref,{events:{...data.events,[event.id]:event},revision,eventId:event.id,auditId,updatedAt:dbSDK.serverTimestamp(),updatedBy:auth.currentUser.uid});});},
    async signIn(){const provider=new authSDK.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});return (await authSDK.signInWithPopup(auth,provider)).user;},
    async currentUser(){await auth.authStateReady();return auth.currentUser;},
    async signOut(){await authSDK.signOut(auth);},
    async isEditor(user){return !!(await access(user));},
    async read(){const snap=await dbSDK.getDocFromServer(ref);if(!snap.exists())return {content:null,revision:0};const content=unpackContent(snap.data());if(await access(auth.currentUser)==='super-admin'){const privateSnap=await dbSDK.getDocFromServer(dbSDK.doc(db,'privateRosters','members'));if(privateSnap.exists())for(const [year,rows] of Object.entries(privateSnap.data().years||{})){const committee=content.team.committees[year];if(committee)for(const m of committee.roster)m.memID=rows.find(r=>r.name===m.name&&r.tier===m.tier)?.memID||'';}}return {content,revision:snap.data().revision};},
    async issueCertificates(records,onProgress=()=>{}){
      let completed=0;
      for(let start=0;start<records.length;start+=40){
        const group=records.slice(start,start+40);
        const lookups=new Map();
        for(const c of group)if(c.memID&&c.eventId){const key=await membershipLookupID(c.eventId,c.memID);const entry=lookups.get(key)||{eventId:c.eventId,ids:[]};entry.ids.push(c.id);lookups.set(key,entry);}
        const events=new Map(group.filter(c=>c.eventId).map(c=>[c.eventId,{id:c.eventId,title:c.event,date:c.eventDate||c.dateIssued}]));
        await dbSDK.runTransaction(db,async tx=>{
          const refs=group.map(c=>dbSDK.doc(db,'certificates',c.id));
          const existing=await Promise.all(refs.map(r=>tx.get(r)));
          const lookupEntries=[...lookups],lookupRefs=lookupEntries.map(([key])=>dbSDK.doc(db,'certificateLookup',key));
          const existingLookups=await Promise.all(lookupRefs.map(r=>tx.get(r)));
          existing.forEach((snap,i)=>{if(snap.exists()&&(snap.data().status==='revoked'||!snap.data().certificate||Object.entries(group[i]).some(([key,value])=>snap.data().certificate[key]!==value)))throw Error(`Credential ${group[i].id} already exists with different data. No records in this group were changed.`);});
          const fresh=group.filter((c,i)=>!existing[i].exists());if(!fresh.length)return;
          const auditId=audit(tx,'certificate.issue',fresh[0].id,`Issued ${fresh.length} certificates: ${[...new Set(fresh.map(c=>c.event))].join(', ')}`,{ids:fresh.map(c=>c.id),eventIds:[...events.keys()]});
          existing.forEach((snap,i)=>{if(!snap.exists())tx.set(refs[i],{...group[i],certificate:group[i],auditId,createdAt:dbSDK.serverTimestamp(),issuedBy:auth.currentUser.uid});});
          existingLookups.forEach((snap,i)=>{const entry=lookupEntries[i][1],ids=[...new Set([...(snap.exists()?snap.data().ids:[]),...entry.ids])];if(ids.length>20)throw Error('Too many certificates for one membership ID and event.');tx.set(lookupRefs[i],{eventId:entry.eventId,ids,auditId});});
          for(const [id,event] of events)tx.set(dbSDK.doc(db,'certificateEvents',id),{...event,auditId,updatedAt:dbSDK.serverTimestamp()});
        });
        completed+=group.length;onProgress(completed);
      }
    },
    async certificate(id){const snap=await dbSDK.getDocFromServer(dbSDK.doc(db,'certificates',id));return snap.exists()?snap.data():null;},
    async revokeCertificate(id){await dbSDK.runTransaction(db,async tx=>{const r=dbSDK.doc(db,'certificates',id),s=await tx.get(r);if(!s.exists())throw Error('Credential not found.');const auditId=audit(tx,'certificate.revoke',id,'Revoked credential');tx.update(r,{auditId,status:'revoked',revokedAt:dbSDK.serverTimestamp(),revokedBy:auth.currentUser.uid});});},
    async publish(content,expectedRevision){
      return dbSDK.runTransaction(db,async tx=>{const existing=await tx.get(ref);const revision=existing.exists()?existing.data().revision:0;if(revision!==expectedRevision)throw Error('Another editor published changes. Export your draft, load the published version, and merge before publishing.');const next=revision+1;const auditId=audit(tx,'content.publish','published',contentChanges(existing.exists()?unpackContent(existing.data()):null,content),{revision:next});tx.set(dbSDK.doc(db,'privateRosters','members'),{years:Object.fromEntries(Object.entries(content.team.committees).map(([year,c])=>[year,c.roster.map(m=>({name:m.name,tier:m.tier,memID:m.memID||''}))])),auditId,updatedAt:dbSDK.serverTimestamp()});tx.set(ref,{...packContent(content),revision:next,eventId:'',auditId,updatedAt:dbSDK.serverTimestamp(),updatedBy:auth.currentUser.uid});return next;});
    }
  };return instance;
}
