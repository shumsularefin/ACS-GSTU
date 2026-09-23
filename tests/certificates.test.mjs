import test from 'node:test';
import assert from 'node:assert/strict';
import {importCertificates,normalizeCertificate,dateValue} from '../js/certificate-model.js';
const defaults={event:'Research Recharge',eventId:'research',eventDate:'2026-09-21',dateIssued:'2026-09-21'};
test('certificate imports preserve legacy IDs, ignore private columns, and generate unique new IDs',()=>{
 const rows=importCertificates([{Name:'Person A',ID:'OLD001',Email:'private@example.org'},{Name:'Person B',Type:'instructor'}],defaults);
 assert.equal(rows[0].id,'OLD001');assert.equal(rows[0].email,undefined);assert.match(rows[1].id,/^ACS-[A-F0-9]{32}$/);assert.equal(rows[1].type,'instructor');
 assert.deepEqual(importCertificates(JSON.parse(JSON.stringify(rows)),defaults),rows);
 assert.equal(importCertificates({LEGACY001:{name:'Name',event:'Workshop',dateIssued:{seconds:1757203200}}})[0].id,'LEGACY001');
});
test('certificate validation rejects ambiguous or invalid batches',()=>{
 for(const rows of [[{Name:'A',ID:'SAME001'},{Name:'B',ID:'SAME001'}],[{Name:'A',Type:'unknown'}],[{Name:'A',ID:'../unsafe'}],[]])assert.throws(()=>importCertificates(rows,defaults));
 assert.equal(dateValue('2026-02-30'),'');assert.throws(()=>normalizeCertificate({name:'A',event:'E',id:'ABC',dateIssued:'invalid'}));
});
