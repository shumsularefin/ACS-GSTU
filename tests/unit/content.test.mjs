import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  normalizeContent,
  normalizeEvent,
  eventFormValues,
  calendarICS,
  calendarValues,
  eventPast,
  eventOpen,
  planImport,
  publicContent,
} from '../../js/lib/content-model.js';
import { renderEvent, renderMembership, renderOpenEvent, renderTeam, eventDateLabel } from '../../js/lib/content-render.js';
import { contentFromDocuments, contentFromLegacy, documentsFromContent } from '../../js/lib/content-store.js';

const seed = (name) => JSON.parse(fs.readFileSync(`data/seed/${name}.json`, 'utf8'));
const data = normalizeContent({ events: seed('events'), team: seed('team'), membership: seed('membership') });
const event = normalizeEvent({
  id: 'workshop',
  title: 'Workshop',
  date: '2026-10-15',
  category: 'development',
  description: 'A workshop.',
  startsAt: '2026-10-15T10:00:00+06:00',
  endsAt: '2026-10-15T12:00:00+06:00',
  registrationStatus: 'open',
  registrationUrl: 'https://example.org/register',
});

test('events: invalid values and unsafe links are rejected', () => {
  assert.throws(() => normalizeEvent({ ...event, registrationUrl: 'javascript:alert(1)' }), /https/);
  assert.throws(() => normalizeEvent({ ...event, image: 'images/../secret.jpg' }));
  assert.throws(() => normalizeEvent({ ...event, date: '2026-02-30' }));
  assert.throws(() => normalizeEvent({ ...event, endsAt: '2026-10-15T09:00:00+06:00' }), /after the start/);
  assert.throws(() => normalizeEvent({ ...event, startsAt: '', endsAt: '', endDate: '2026-10-01' }), /on or after/);
  assert.equal(normalizeEvent({ ...event, registrationUrl: '' }).registrationUrl, '', 'registration links are optional');
});

test('events: dashboard form values use Bangladesh time and round-trip', () => {
  const timed = normalizeEvent({ ...event, startsAt: '', endsAt: '', startTime: '10:00', endTime: '12:30', endDate: '' });
  assert.equal(timed.startsAt, '2026-10-15T10:00:00+06:00');
  assert.equal(timed.endsAt, '2026-10-15T12:30:00+06:00');
  const form = eventFormValues(timed);
  assert.deepEqual([form.startTime, form.endTime, form.endDate], ['10:00', '12:30', '']);
  const range = normalizeEvent({ ...event, startsAt: '', endsAt: '', date: '2026-09-30', endDate: '2026-10-06' });
  assert.deepEqual([range.startsAt, range.endsAt], ['2026-09-30', '2026-10-06']);
  assert.equal(eventFormValues(range).endDate, '2026-10-06');
  const overnight = normalizeEvent({ ...event, startsAt: '', endsAt: '', endDate: '2026-10-16', startTime: '18:00', endTime: '09:00' });
  assert.equal(eventFormValues(overnight).endDate, '2026-10-16');
});

test('multi-day events stay open through their last day (Bangladesh time) and show a date range', () => {
  const range = normalizeEvent({ ...event, startsAt: '', endsAt: '', date: '2026-09-30', endDate: '2026-10-06' });
  assert.deepEqual(calendarValues(range), { start: '20260930', end: '20261007', allDay: true });
  assert.equal(eventPast(range, new Date('2026-10-06T17:59:00Z')), false);
  assert.equal(eventPast(range, new Date('2026-10-06T18:01:00Z')), true);
  assert.equal(eventDateLabel(range), '30 September 2026 – 6 October 2026');
  assert.match(renderEvent({ ...data, events: [range] }, range.id), /30 September 2026 – 6 October 2026/);
});

test('calendar files convert to UTC, escape text and fold long lines', () => {
  assert.deepEqual(calendarValues(event), { start: '20261015T040000Z', end: '20261015T060000Z', allDay: false });
  const ics = calendarICS({ ...event, title: 'Chemistry, community; science\nNew line', description: 'x'.repeat(200) });
  assert.ok(ics.includes('DTSTART:20261015T040000Z'));
  assert.ok(ics.includes('SUMMARY:Chemistry\\, community\\; science\\nNew line'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
});

test('registration: the homepage button follows status and date; the event page needs a link to register', () => {
  const next = { ...data, events: [event] };
  assert.ok(renderEvent(next, event.id, { now: new Date('2026-10-14') }).includes('Register for this event'));
  assert.ok(!renderEvent(next, event.id, { now: new Date('2026-10-16') }).includes('Register for this event'));
  assert.ok(renderOpenEvent(next, new Date('2026-10-14')).includes('Explore new event &amp; register'));
  assert.equal(renderOpenEvent(next, new Date('2026-10-16')), '');
  const noLink = { ...data, events: [{ ...event, registrationUrl: '' }] };
  assert.ok(eventOpen(noLink.events[0], new Date('2026-10-14')));
  assert.ok(renderEvent(noLink, event.id, { now: new Date('2026-10-14') }).includes('Registration details will be announced'));
  assert.ok(renderOpenEvent(noLink, new Date('2026-10-14')).includes('hero-registration'));
});

test('rendered content is escaped', () => {
  assert.ok(
    renderMembership({ ...data, membership: { ...data.membership, intro: '<script>alert(1)</script>' } }).includes('&lt;script&gt;'),
  );
  const html = renderEvent({ ...data, events: [{ ...event, title: '<img src=x onerror=alert(1)>' }] }, event.id);
  assert.ok(!html.includes('<img src=x'));
});

test('roster imports need only name and membership ID, match by ID, and keep leading zeroes', () => {
  const first = planImport(
    'roster',
    [
      { 'Member Name': 'Ayesha', 'Membership ID': '00123' },
      { 'Members Name': 'Rahim', 'Membership ID': '00456' },
    ],
    { tier: 'premium' },
  );
  assert.equal(first.added.length, 2);
  assert.deepEqual(
    first.result.map((m) => [m.name, m.memID, m.tier]),
    [
      ['Ayesha', '00123', 'premium'],
      ['Rahim', '00456', 'premium'],
    ],
  );
  const second = planImport('roster', [{ 'Member Name': 'Ayesha Rahman', 'Membership ID': '00123', Email: 'private@example.org' }], {
    existing: first.result,
    tier: 'premium',
  });
  assert.equal(second.updated.length, 1);
  assert.equal(second.result.length, 2);
  assert.equal(second.result[0].key, first.result[0].key, 'the private ID stays attached to the same entry');
  assert.ok(!JSON.stringify(second).includes('private@example.org'));
  assert.throws(() => planImport('roster', [{ Name: 'No ID' }]), /Row 2: .*Membership ID/);
  assert.throws(
    () =>
      planImport('roster', [
        { Name: 'A', 'Membership ID': '1' },
        { Name: 'B', 'Membership ID': '1' },
      ]),
    /Row 3/,
  );
  const same = planImport('roster', [{ 'Member Name': 'Rahim', 'Membership ID': '00456' }], { existing: first.result, tier: 'premium' });
  assert.equal(same.unchanged.length, 1);
});

test('committee imports keep uploaded photos and match by name', () => {
  const image = 'media:f956fde7-f385-47fc-a67a-19c1395b220b';
  const plan = planImport('committee', [{ Name: 'New President', Role: 'President', Photo: image }], { existing: [] });
  assert.equal(plan.result[0].image, image);
  const again = planImport('committee', [{ Name: 'new president', Role: 'Vice President' }], { existing: plan.result });
  assert.equal(again.updated.length, 1);
});

test('membership IDs never reach public documents or rendered pages', () => {
  const content = structuredClone(data);
  content.team.committees['2026'].roster = [{ key: 'rabc', name: 'Private Member', tier: 'general', memID: '00999' }];
  const docs = documentsFromContent(content);
  assert.ok(!JSON.stringify(docs.team).includes('00999'));
  assert.deepEqual(docs.rosterPrivate['2026'].ids, { rabc: '00999' });
  assert.ok(!JSON.stringify(publicContent(content)).includes('00999'));
  assert.ok(!renderTeam(content, { year: '2026' }).includes('00999'));
});

test('the per-section layout and the retired layout produce the same content', () => {
  const docs = documentsFromContent(data);
  const split = contentFromDocuments({
    events: Object.values(docs.events),
    homepage: docs.homepage,
    membership: docs.membership,
    team: Object.entries(docs.team).map(([id, value]) => ({ id, data: value })),
  });
  const { events, homepage, membership, ...rest } = publicContent(data);
  const legacy = contentFromLegacy({
    schemaVersion: 2,
    payload: JSON.stringify({ ...rest, certificateArchive: ['x'] }),
    events: Object.fromEntries(events.map((e) => [e.id, e])),
    homepage,
    membership,
  });
  const strip = (c) => JSON.parse(JSON.stringify(c, (k, v) => (k === 'key' ? undefined : v)));
  assert.deepEqual(strip(split), strip(publicContent(data)));
  assert.deepEqual(strip(legacy.content), strip(publicContent(data)));
  assert.deepEqual(legacy.certificateArchive, ['x']);
});

test('one invalid record is skipped instead of taking the website down', () => {
  const warnings = [];
  const content = contentFromDocuments(
    { events: [event, { id: 'broken', title: '' }], membership: data.membership, team: [] },
    { warn: (m) => warnings.push(m) },
  );
  assert.deepEqual(
    content.events.map((e) => e.id),
    ['workshop'],
  );
  assert.equal(warnings.length, 1);
});
