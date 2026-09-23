import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeContent,normalizeEvent,mergeRows,calendarICS,calendarValues,eventPast} from '../js/content-model.js';
import {renderEvent,renderMembership} from '../js/content-render.js';
const data=normalizeContent(JSON.parse(fs.readFileSync('public/data/content.json','utf8')));
const event={...data.events[0],date:'2026-10-15',startsAt:'2026-10-15T10:00:00+06:00',endsAt:'2026-10-15T12:00:00+06:00',registrationStatus:'open',registrationUrl:'https://example.org/register'};
test('Excel rows merge by name/year, preserve other years, ignore private columns',()=>{
 const next=mergeRows(data,'roster',[{Year:'2026',Name:'Example Member','Membership tier':'Premium',Email:'private@example.org'}]);
 assert.deepEqual(next.team.committees['2026'].roster,[{name:'Example Member',tier:'premium'}]);
 assert.deepEqual(next.team.committees['2024'],data.team.committees['2024']);
 const updated=mergeRows(next,'roster',[{Year:'2026',Name:'Example Member',Tier:'general'}]);
 assert.equal(updated.team.committees['2026'].roster.length,1);
 assert.equal(updated.team.committees['2026'].roster[0].tier,'general');
 assert.ok(!JSON.stringify(next).includes('private@example.org'));
});
test('invalid imports fail atomically, duplicate rows and unsafe URLs are rejected',()=>{
 const before=JSON.stringify(data);
 assert.throws(()=>mergeRows(data,'roster',[{Year:'2026',Name:'Valid',Tier:'general'},{Year:'invalid',Name:'Bad',Tier:'premium'}]),/Row 3/);
 assert.equal(JSON.stringify(data),before);
 assert.throws(()=>mergeRows(data,'roster',[{Year:'2026',Name:'A',Tier:'general'},{Year:'2026',Name:'A',Tier:'general'}]),/Duplicate/);
 assert.throws(()=>normalizeEvent({...event,registrationUrl:'javascript:alert(1)'}),/HTTPS/);
 assert.throws(()=>normalizeEvent({...event,image:'images/../secret.jpg'}));
 assert.throws(()=>normalizeEvent({...event,date:'2026-02-30'}));
 assert.throws(()=>normalizeEvent({...event,endsAt:'2026-10-15T09:00:00+06:00'}));
});
test('calendar timezone conversion and all-day exclusive end date',()=>{
 assert.deepEqual(calendarValues(event),{start:'20261015T040000Z',end:'20261015T060000Z',allDay:false});
 assert.deepEqual(calendarValues({...event,date:'2026-12-31',startsAt:'',endsAt:''}),{start:'20261231',end:'20270101',allDay:true});
 const ics=calendarICS({...event,title:'Chemistry, community; science\nNew line'});
 assert.ok(ics.includes('DTSTART:20261015T040000Z'));
 assert.ok(ics.includes('SUMMARY:Chemistry\\, community\\; science\\nNew line'));
 assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
 for(const line of ics.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);
});
test('registration respects status/date and membership content is escaped',()=>{
 const next={...data,events:[event]};
 assert.ok(renderEvent(next,event.id,{now:new Date('2026-10-14')}).includes('Register for this event'));
 assert.ok(!renderEvent(next,event.id,{now:new Date('2026-10-16')}).includes('Register for this event'));
 assert.ok(eventPast(event,new Date('2026-10-16')));
 assert.ok(renderEvent({...data,events:[{...event,registrationStatus:'unpublished'}]},event.id,{now:new Date('2026-10-14')}).includes('Registration details will be announced'));
 assert.ok(renderMembership({...data,membership:{...data.membership,intro:'<script>alert(1)</script>'}}).includes('&lt;script&gt;'));
});

test('roster membership IDs match updates but never enter public content',async()=>{const {publicContent}=await import('../js/content-model.js');const {packContent}=await import('../js/editor-access.js');const fs=await import('node:fs');const base=JSON.parse(fs.readFileSync('public/data/content.json'));const added=mergeRows(base,'roster',[{Year:2026,'Members Name':'Member Test','Membership ID':'001234',Tier:'general'}]);const updated=mergeRows(added,'roster',[{Year:2026,'Members Name':'Member Renamed','Membership ID':'001234',Tier:'premium'}]);assert.equal(updated.team.committees['2026'].roster.length,1);assert.equal(updated.team.committees['2026'].roster[0].memID,'001234');assert.ok(!JSON.stringify(publicContent(updated)).includes('001234'));assert.ok(!packContent(updated).payload.includes('001234'));});
