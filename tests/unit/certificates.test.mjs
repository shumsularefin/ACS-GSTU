import test from 'node:test';
import assert from 'node:assert/strict';
import {
  importCertificates,
  normalizeCertificate,
  dateValue,
  publicCertificate,
  certificateURL,
  membershipLookupID,
} from '../../js/lib/certificate-model.js';

const defaults = {
  event: 'Research Recharge',
  eventId: 'research',
  eventDate: '2026-09-21',
  dateIssued: '2026-09-21',
  type: 'participant',
};

test('imports keep legacy IDs, ignore private columns and create unique new IDs', () => {
  const rows = importCertificates([{ Name: 'Person A', ID: 'OLD001', Email: 'private@example.org' }, { Name: 'Person B' }], defaults);
  assert.equal(rows[0].id, 'OLD001');
  assert.equal(rows[0].email, undefined);
  assert.match(rows[1].id, /^ACS-[A-F0-9]{32}$/);
  assert.notEqual(importCertificates([{ Name: 'Person B' }], defaults)[0].id, rows[1].id);
  assert.equal(
    importCertificates({ LEGACY001: { name: 'Name', event: 'Workshop', dateIssued: { seconds: 1757203200 } } })[0].id,
    'LEGACY001',
  );
});

test('invalid batches are rejected', () => {
  for (const rows of [
    [
      { Name: 'A', ID: 'SAME001' },
      { Name: 'B', ID: 'SAME001' },
    ],
    [{ Name: 'A', Type: 'unknown' }],
    [{ Name: 'A', ID: '../unsafe' }],
    [],
  ])
    assert.throws(() => importCertificates(rows, defaults));
  assert.equal(dateValue('2026-02-30'), '');
  assert.throws(() => normalizeCertificate({ name: 'A', event: 'E', id: 'ABC', dateIssued: 'invalid' }));
});

test('executive recognition needs neither an event page nor a membership ID', () => {
  const [record] = importCertificates([{ Name: 'Officer' }], {
    event: 'Executive service · 2025–2026',
    dateIssued: '2026-10-02',
    type: 'executive',
    achievement: 'In recognition of dedicated service',
  });
  assert.equal(record.type, 'executive');
  assert.equal(record.memID, '');
  assert.match(record.eventId, /^event-[a-f0-9]+$/);
});

test('the public record has no membership ID; QR links use the canonical address', async () => {
  const [record] = importCertificates([{ Name: 'A', 'Membership ID': '00042' }], defaults);
  assert.equal(record.memID, '00042');
  assert.ok(!('memID' in publicCertificate(record)));
  assert.equal(certificateURL('ACS-1'), 'https://acs-gstu.web.app/certificates.html?certId=ACS-1');
  assert.equal(await membershipLookupID('research', ' 00042 '), await membershipLookupID('research', '00042'));
  assert.notEqual(await membershipLookupID('research', '00042'), await membershipLookupID('other', '00042'));
});
