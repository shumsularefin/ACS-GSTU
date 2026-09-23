import {publicContent} from './content-model.js';
export const SUPER_ADMIN_EMAIL='muhammadshamsularefin01@gmail.com';
export const editorRoles={administrator:'Chapter administrator',outreach:'Outreach editor'};
export function editorEmail(value){const email=String(value||'').trim().toLowerCase();if(!/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(email)||email.length>200)throw Error('Enter a valid Google account email.');return email;}
export function unpackContent(data){if(!data)return null;const content=JSON.parse(data.payload);return data.schemaVersion===2?{...content,events:Object.values(data.events||{})}:content;}
export function packContent(content){const {events,...protectedContent}=publicContent(content);return {payload:JSON.stringify(protectedContent),events:Object.fromEntries(events.map(e=>[e.id,e])),schemaVersion:2};}

export function contentChanges(before,after){if(!before)return 'Initial publication';const changes=[];const old=new Map(before.events.map(e=>[e.id,e]));for(const e of after.events){if(JSON.stringify(old.get(e.id))!==JSON.stringify(e))changes.push('event: '+e.id);old.delete(e.id);}for(const id of old.keys())changes.push('removed event: '+id);for(const section of ['team','membership','homepage'])if(JSON.stringify(before[section])!==JSON.stringify(after[section]))changes.push(section+' updated');return changes.join('; ')||'Content republished';}
