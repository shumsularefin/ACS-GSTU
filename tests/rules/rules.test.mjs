// Firestore security rules, exercised through the real dashboard data layer (js/admin/cloud.js).
// Run with the emulator: npm run test:rules
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  getDoc,
  setDoc,
  getDocs,
  collection,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { createCloud, ConflictError } from '../../js/admin/cloud.js';
import { normalizeContent, normalizeEvent } from '../../js/lib/content-model.js';
import { importCertificates, membershipLookupID } from '../../js/lib/certificate-model.js';
import { firestoreREST } from '../../js/lib/firestore-rest.js';
import { normalizeForm, newForm, checkAnswers, responseId, departments } from '../../js/lib/form-model.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error('Run these tests with the Firestore emulator (npm run test:rules).');

const OWNER = 'muhammadshamsularefin01@gmail.com';
let env;
const accounts = {};

const [emulatorHost, emulatorPort] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
/** A Firestore client signed in with a mock token (or 'owner', which bypasses rules for test setup). */
const apps = [];
function client(name, token) {
  const app = initializeApp({ projectId: 'demo-acs-rules' }, name);
  apps.push(app);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, emulatorHost, Number(emulatorPort), token ? { mockUserToken: token } : {});
  return db;
}

function account(name, email, { verified = true, provider = 'google.com' } = {}) {
  const uid = `${name}-uid`;
  const db = client(name, { sub: uid, email, email_verified: verified, firebase: { sign_in_provider: provider, identities: {} } });
  const auth = { currentUser: { uid, email, emailVerified: verified }, authStateReady: async () => {} };
  return { uid, email, db, cloud: createCloud({ db, auth }) };
}

const seed = () =>
  normalizeContent(
    {
      events: JSON.parse(readFileSync('data/seed/events.json', 'utf8')),
      team: JSON.parse(readFileSync('data/seed/team.json', 'utf8')),
      membership: JSON.parse(readFileSync('data/seed/membership.json', 'utf8')),
      homepage: { images: ['images/optimized/slide01-1600.webp'] },
    },
    { keepPrivate: true },
  );

const event = (id, extra = {}) =>
  normalizeEvent({ id, title: `Event ${id}`, date: '2026-11-02', category: 'outreach', description: 'A test event.', ...extra });

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-acs-rules', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
  await env.clearFirestore();
  accounts.owner = account('owner', OWNER);
  accounts.delegate = account('delegate', 'delegate@example.com');
  accounts.admin = account('admin', 'admin@example.com');
  accounts.outreach = account('outreach', 'outreach@example.com');
  accounts.other = account('other', 'other-outreach@example.com');
  accounts.stranger = account('stranger', 'stranger@example.com');
  accounts.unverified = account('unverified', OWNER, { verified: false });
  accounts.password = account('password', OWNER, { provider: 'password' });
  accounts.anon = { db: client('anonymous') };

  // The retired single-document layout, as it exists in production before the upgrade.
  const content = seed();
  content.team.committees['2026'].roster = [
    { key: 'ralpha001', name: 'Private Member', tier: 'general', memID: '00123' },
    { key: 'rbeta0002', name: 'Premium Member', tier: 'premium', memID: 'P-77' },
  ];
  {
    const db = client('setup', 'owner');
    const { events, homepage, membership, ...rest } = structuredClone(content);
    for (const c of Object.values(rest.team.committees)) for (const m of c.roster) delete m.memID;
    await setDoc(doc(db, 'siteContent', 'published'), {
      schemaVersion: 2,
      revision: 7,
      payload: JSON.stringify({ ...rest, certificateArchive: ['event-hello'] }),
      events: Object.fromEntries(events.map((e) => [e.id, e])),
      homepage,
      membership,
    });
    await setDoc(doc(db, 'privateRosters', 'members'), {
      years: {
        2026: [
          { name: 'Private Member', tier: 'general', memID: '00123' },
          { name: 'Premium Member', tier: 'premium', memID: 'P-77' },
        ],
      },
    });
    await setDoc(doc(db, 'certificateEvents', 'event-hello'), { id: 'event-hello', title: 'Hello', date: '2026-09-24' });
    // A certificate issued before the split still holds a membership ID in public.
    const legacy = {
      id: 'ACS-LEGACY0001',
      name: 'Legacy Recipient',
      memID: 'M-500',
      designation: '',
      event: 'Old Workshop',
      eventId: 'old-workshop',
      eventDate: '2025-05-01',
      dateIssued: '2025-05-02',
      type: 'participant',
      status: 'issued',
      achievement: '',
      templateVersion: 1,
    };
    await setDoc(doc(db, 'certificates', legacy.id), { ...legacy, certificate: legacy });
    await setDoc(doc(db, 'certificates', '01025ACSSC001'), { name: 'Older Format', event: 'First Event', dateIssued: '2024-01-01' });
  }
});

after(async () => {
  await Promise.all(apps.map((app) => deleteApp(app)));
  await env?.cleanup();
});

test('only the permanent owner and granted Google accounts get editor roles', async () => {
  const { owner, outreach, unverified, password, stranger } = accounts;
  assert.equal(await owner.cloud.role(owner.cloud && { emailVerified: true, email: OWNER }), 'super-admin');
  await assertSucceeds(owner.cloud.setEditor('outreach@example.com', 'outreach', true));
  await assertSucceeds(owner.cloud.setEditor('other-outreach@example.com', 'outreach', true));
  await assertSucceeds(owner.cloud.setEditor('admin@example.com', 'administrator', true));
  await assertSucceeds(owner.cloud.setEditor('delegate@example.com', 'super-admin', true));
  await assertFails(outreach.cloud.setEditor('stranger@example.com', 'administrator', true));
  await assertFails(unverified.cloud.setEditor('stranger@example.com', 'outreach', true));
  await assertFails(password.cloud.setEditor('stranger@example.com', 'outreach', true));
  await assertFails(
    accounts.delegate.cloud
      .setEditor(OWNER, 'outreach', false)
      .catch(() => setDoc(doc(accounts.delegate.db, 'chapterEditors', OWNER), { email: OWNER })),
  );
  await assertFails(getDocs(collection(outreach.db, 'chapterEditors')));
  await assertSucceeds(getDoc(doc(outreach.db, 'chapterEditors', 'outreach@example.com')));
  await assertFails(getDoc(doc(stranger.db, 'chapterEditors', 'outreach@example.com')));
  assert.equal((await accounts.delegate.cloud.editors()).length, 4);
});

test('the super-admin upgrades the retired layout without losing private roster IDs', async () => {
  const loaded = await accounts.owner.cloud.load('super-admin');
  assert.equal(loaded.layout, 'legacy');
  assert.deepEqual(
    loaded.legacy.content.team.committees['2026'].roster.map((m) => m.memID),
    ['00123', 'P-77'],
  );
  await assertFails(accounts.admin.cloud.migrate(loaded.legacy));
  await assertSucceeds(accounts.owner.cloud.migrate(loaded.legacy));

  const after = await accounts.owner.cloud.load('super-admin');
  assert.equal(after.layout, 'split');
  assert.equal(after.events.length, loaded.legacy.content.events.length);
  assert.deepEqual(
    after.team['2026'].value.roster.map((m) => m.memID),
    ['00123', 'P-77'],
  );

  // Public visitors see names and tiers only.
  const publicTeam = (await assertSucceeds(getDoc(doc(accounts.anon.db, 'team', '2026')))).data();
  assert.ok(!JSON.stringify(publicTeam).includes('00123'));
  await assertFails(getDoc(doc(accounts.anon.db, 'rosterPrivate', '2026')));
  await assertFails(getDoc(doc(accounts.outreach.db, 'rosterPrivate', '2026')));
  // The temporary "Hello" entry stays hidden from the Certificate Center.
  assert.equal((await getDoc(doc(accounts.anon.db, 'certificateEvents', 'event-hello'))).data().archived, true);
  await assertSucceeds(getDoc(doc(accounts.anon.db, 'site', 'meta')));
});

test('events: editors add events, outreach edits only their own, the super-admin deletes', async () => {
  const { owner, outreach, other, admin, anon } = accounts;
  await assertSucceeds(outreach.cloud.saveEvent(event('outreach-talk'), 0));
  await assertSucceeds(outreach.cloud.saveEvent(event('outreach-talk', { title: 'Updated talk' }), 1));
  await assertFails(other.cloud.saveEvent(event('outreach-talk', { title: 'Hijacked' }), 2));
  await assertSucceeds(admin.cloud.saveEvent(event('outreach-talk', { title: 'Edited by administrator' }), 2));
  await assert.rejects(outreach.cloud.saveEvent(event('outreach-talk'), 1), ConflictError);
  await assertFails(outreach.cloud.deleteEvent(event('outreach-talk')));
  await assertFails(setDoc(doc(anon.db, 'events', 'spam'), { ...event('spam'), createdBy: 'x', revision: 1 }));
  await assertSucceeds(owner.cloud.deleteEvent(event('outreach-talk')));
  assert.equal((await getDoc(doc(anon.db, 'events', 'outreach-talk'))).exists(), false);
  // A multi-day event without a registration link is valid.
  await assertSucceeds(owner.cloud.saveEvent(event('science-fair', { endDate: '2026-11-04' }), 0));
  const saved = (await getDoc(doc(anon.db, 'events', 'science-fair'))).data();
  assert.equal(saved.endsAt, '2026-11-04');
  assert.equal(saved.registrationUrl, '');
});

test('homepage and membership are open to every editor role; team records only to super-admins', async () => {
  const { owner, outreach, anon, stranger } = accounts;
  const loaded = await outreach.cloud.load('outreach');
  assert.equal(loaded.team['2026'].value.roster[0].memID, undefined, 'outreach never receives membership IDs');
  await assertSucceeds(
    outreach.cloud.savePage(
      'homepage',
      { images: ['images/optimized/slide01-1600.webp', 'images/featured01.jpg'] },
      loaded.homepage.revision,
    ),
  );
  await assertSucceeds(
    outreach.cloud.savePage('membership', { ...loaded.membership.value, intro: 'Updated by outreach.' }, loaded.membership.revision),
  );
  await assertFails(stranger.cloud.savePage('homepage', { images: [] }, loaded.homepage.revision + 1));
  await assertFails(setDoc(doc(anon.db, 'pages', 'homepage'), { images: [] }));
  await assertFails(outreach.cloud.saveTeam('2026', loaded.team['2026'].value, loaded.team['2026'].revision));
  const team = (await owner.cloud.load('super-admin')).team['2026'];
  team.value.roster.push({ key: 'rgamma0003', name: 'New Member', tier: 'general', memID: '00999' });
  await assertSucceeds(owner.cloud.saveTeam('2026', team.value, team.revision));
  assert.equal((await owner.cloud.load('super-admin')).team['2026'].value.roster.at(-1).memID, '00999');
});

test('certificates: issue by role, public verification without membership IDs, revocation', async () => {
  const { owner, outreach, admin, anon } = accounts;
  const base = { event: 'Green Chemistry Workshop', eventId: 'green-workshop', eventDate: '2026-10-01', dateIssued: '2026-10-02' };
  const participants = importCertificates([{ Name: 'Ayesha Rahman', 'Membership ID': '00777' }, { Name: 'Guest Learner' }], {
    ...base,
    type: 'participant',
  });
  await assertSucceeds(outreach.cloud.issueCertificates(participants));
  // Retrying the same batch is harmless.
  await assertSucceeds(outreach.cloud.issueCertificates(participants));

  const champion = importCertificates([{ Name: 'Winner' }], { ...base, type: 'champion' });
  await assertFails(outreach.cloud.issueCertificates(champion));
  await assertSucceeds(admin.cloud.issueCertificates(champion));
  const executive = importCertificates([{ Name: 'Officer' }], {
    event: 'Executive service · 2025–2026',
    dateIssued: '2026-10-02',
    type: 'executive',
    achievement: 'In recognition of dedicated service',
  });
  await assertFails(admin.cloud.issueCertificates(executive));
  await assertSucceeds(owner.cloud.issueCertificates(executive));

  const record = (await assertSucceeds(getDoc(doc(anon.db, 'certificates', participants[0].id)))).data();
  assert.equal(record.name, 'Ayesha Rahman');
  assert.ok(!('memID' in record), 'public certificate has no membership ID');
  await assertFails(getDoc(doc(anon.db, 'certificatePrivate', participants[0].id)));
  assert.equal((await outreach.cloud.certificate(participants[0].id)).memID, '00777');
  const lookup = await getDoc(doc(anon.db, 'certificateLookup', await membershipLookupID('green-workshop', '00777')));
  assert.deepEqual(lookup.data().ids, [participants[0].id]);
  await assertFails(getDocs(collection(anon.db, 'certificates')));
  await assertFails(getDocs(collection(anon.db, 'certificateLookup')));

  await assertFails(outreach.cloud.revokeCertificate(participants[0].id));
  await assertSucceeds(owner.cloud.revokeCertificate(participants[0].id));
  assert.equal((await getDoc(doc(anon.db, 'certificates', participants[0].id))).data().status, 'revoked');
  await assert.rejects(owner.cloud.issueCertificates(participants.slice(0, 1)), /already exists/);
  await assertFails(deleteDoc(doc(owner.db, 'certificates', participants[1].id)));
  await assertFails(
    owner.cloud.deleteCertificate(participants[1].id).catch(() => deleteDoc(doc(owner.db, 'certificates', participants[1].id))),
  );
  await assertFails(deleteDoc(doc(owner.db, 'certificates', participants[0].id)));
  await assert.rejects(outreach.cloud.deleteCertificate(participants[0].id));
  await assertSucceeds(owner.cloud.deleteCertificate(participants[0].id));
  assert.equal((await getDoc(doc(anon.db, 'certificates', participants[0].id))).exists(), false);

  await assertFails(outreach.cloud.setCertificateEventArchived('green-workshop', true));
  await assertSucceeds(owner.cloud.setCertificateEventArchived('green-workshop', true));
  // Issuing more certificates keeps the archive choice.
  await assertSucceeds(outreach.cloud.issueCertificates(importCertificates([{ Name: 'Late Learner' }], { ...base, type: 'participant' })));
  assert.equal((await getDoc(doc(anon.db, 'certificateEvents', 'green-workshop'))).data().archived, true);
});

test('certificates issued before the split stay private until migrated, then keep working', async () => {
  const { owner, outreach, anon } = accounts;
  await assertFails(getDoc(doc(anon.db, 'certificates', 'ACS-LEGACY0001')));
  await assertSucceeds(getDoc(doc(outreach.db, 'certificates', 'ACS-LEGACY0001')));
  await assertSucceeds(getDoc(doc(anon.db, 'certificates', '01025ACSSC001')));
  assert.equal(await owner.cloud.certificatesNeedingMigration(), 1);
  await assertFails(outreach.cloud.migrateCertificates());
  assert.equal(await owner.cloud.migrateCertificates(), 1);
  const record = (await assertSucceeds(getDoc(doc(anon.db, 'certificates', 'ACS-LEGACY0001')))).data();
  assert.ok(!('memID' in record) && !('certificate' in record));
  assert.equal((await owner.cloud.certificate('ACS-LEGACY0001')).memID, 'M-500');
  const lookup = await getDoc(doc(anon.db, 'certificateLookup', await membershipLookupID('old-workshop', 'M-500')));
  assert.deepEqual(lookup.data().ids, ['ACS-LEGACY0001']);
  assert.equal(await owner.cloud.certificatesNeedingMigration(), 0);
});

test('forms: editors publish forms, anyone answers while open, answers stay private', async () => {
  const { owner, admin, outreach, other, anon } = accounts;
  const rest = firestoreREST('demo-acs-rules', { origin: `http://${process.env.FIRESTORE_EMULATOR_HOST}` });
  const template = newForm('event');
  const form = normalizeForm({
    ...template,
    id: 'workshop-registration',
    title: 'Workshop registration',
    status: 'open',
    payment: { ...template.payment, amount: '100 BDT', accounts: [{ method: 'bkash', number: '01700000000', note: 'Personal' }] },
  });
  await assertSucceeds(outreach.cloud.saveForm(form, 0));
  assert.equal((await rest.get('forms/workshop-registration')).title, 'Workshop registration');

  const person = {
    name: 'Ayesha Rahman',
    email: 'ayesha@example.com',
    phone: '01711111111',
    institution: 'GSTU',
    department: departments[0],
    student_id: '20ACCE001',
    membership: 'General member',
    payment_method: 'bkash',
    payment_sender: '01722222222',
    payment_txn: '8n7a-6b5c4d',
  };
  const paid = checkAnswers(form, person);
  assert.deepEqual(paid.errors, {});
  const paidId = responseId(form, paid.answers);
  assert.equal(paidId, 'txn_8N7A6B5C4D');
  const path = (id) => `forms/workshop-registration/responses/${id}`;
  assert.equal(await rest.create(path(paidId), { answers: paid.answers }, { timeField: 'submittedAt' }), 'created');
  // The same transaction cannot be used twice.
  assert.equal(await rest.create(path(paidId), { answers: paid.answers }, { timeField: 'submittedAt' }), 'exists');
  // A paid answer must use its transaction ID as the document ID.
  await assert.rejects(rest.create(path('r_' + 'a'.repeat(24)), { answers: paid.answers }, { timeField: 'submittedAt' }));
  await assert.rejects(rest.create(path('txn_OTHER12345'), { answers: paid.answers }, { timeField: 'submittedAt' }));
  // Premium members skip the payment.
  const premium = checkAnswers(form, { ...person, membership: 'Premium member', acs_id: 'P-77' });
  assert.deepEqual(premium.errors, {});
  assert.equal(premium.answers.payment_txn, undefined);
  const premiumId = responseId(form, premium.answers);
  assert.match(premiumId, /^r_[a-f0-9]{24}$/);
  assert.equal(await rest.create(path(premiumId), { answers: premium.answers }, { timeField: 'submittedAt' }), 'created');
  // Extra fields and a made-up time are refused.
  await assert.rejects(rest.create(path('r_' + 'b'.repeat(24)), { answers: premium.answers, spam: true }, { timeField: 'submittedAt' }));
  await assert.rejects(rest.create(path('r_' + 'c'.repeat(24)), { answers: premium.answers, submittedAt: 'yesterday' }));

  // Answers are private: the creator, administrators and super-admins read them; nobody else.
  await assertFails(getDocs(collection(anon.db, 'forms', 'workshop-registration', 'responses')));
  await assertFails(other.cloud.formResponses('workshop-registration'));
  assert.equal((await outreach.cloud.formResponses('workshop-registration')).length, 2);
  assert.equal((await admin.cloud.formResponses('workshop-registration')).length, 2);
  await assertSucceeds(outreach.cloud.setResponseVerified('workshop-registration', paidId, true));
  assert.equal((await owner.cloud.formResponses('workshop-registration')).find((r) => r.id === paidId).verified, true);
  await assertFails(updateDoc(doc(admin.db, 'forms', 'workshop-registration', 'responses', paidId), { answers: {} }));
  await assertFails(updateDoc(doc(anon.db, 'forms', 'workshop-registration', 'responses', paidId), { verified: true }));

  // Only the creator and administrators change a form; the time limit and status stop new answers.
  await assertFails(other.cloud.saveForm({ ...form, title: 'Taken over' }, 1));
  await assertSucceeds(admin.cloud.saveForm({ ...form, closesAt: new Date(Date.now() - 60000) }, 1));
  await assert.rejects(
    rest.create(path('r_' + 'd'.repeat(24)), { answers: premium.answers }, { timeField: 'submittedAt' }),
    (e) => e.status === 403,
  );
  await assertSucceeds(admin.cloud.saveForm({ ...form, opensAt: new Date(Date.now() + 3600000) }, 2));
  await assert.rejects(rest.create(path('r_' + 'e'.repeat(24)), { answers: premium.answers }, { timeField: 'submittedAt' }));
  await assertSucceeds(outreach.cloud.saveForm({ ...form, status: 'closed' }, 3));
  await assert.rejects(rest.create(path('r_' + 'f'.repeat(24)), { answers: premium.answers }, { timeField: 'submittedAt' }));
  await assertSucceeds(outreach.cloud.saveForm(form, 4));
  assert.equal(await rest.create(path('r_' + '1'.repeat(24)), { answers: premium.answers }, { timeField: 'submittedAt' }), 'created');

  // Only super-admins delete responses and forms, with a log entry.
  const ids = (await owner.cloud.formResponses('workshop-registration')).map((r) => r.id);
  await assertFails(admin.cloud.deleteFormResponses('workshop-registration', ids));
  await assertFails(deleteDoc(doc(owner.db, 'forms', 'workshop-registration', 'responses', ids[0])));
  await assertSucceeds(owner.cloud.deleteFormResponses('workshop-registration', ids, 'Workshop registration'));
  assert.equal((await owner.cloud.formResponses('workshop-registration')).length, 0);
  await assertFails(outreach.cloud.deleteForm(form));
  await assertSucceeds(owner.cloud.deleteForm(form));
  assert.equal(await rest.get('forms/workshop-registration'), null);
});

test('images, activity log and removals', async () => {
  const { owner, outreach, other, anon, delegate } = accounts;
  const image = 'data:image/jpeg;base64,' + Buffer.from('jpeg').toString('base64');
  const reference = await outreach.cloud.uploadImage(image, 'photo.jpg');
  const id = reference.slice(6);
  await assertSucceeds(getDoc(doc(anon.db, 'siteImages', id)));
  await assertFails(other.cloud.deleteImage(id));
  await assertSucceeds(outreach.cloud.deleteImage(id));

  const page = await owner.cloud.activity();
  assert.ok(page.entries.length > 10);
  assert.ok(page.entries.every((e) => e.createdAt instanceof Date));
  assert.ok(page.entries.some((e) => e.action === 'certificate.issue' && e.actorEmail === 'outreach@example.com'));
  await assertFails(outreach.cloud.activity());
  await assertFails(getDocs(collection(anon.db, 'auditLogs')));
  const logId = page.entries.length && (await getDocs(collection(owner.db, 'auditLogs'))).docs[0].id;
  await assertFails(updateDoc(doc(owner.db, 'auditLogs', logId), { detail: 'rewritten' }));
  await assertFails(deleteDoc(doc(owner.db, 'auditLogs', logId)));
  // Nobody can write a log entry in someone else's name.
  await assertFails(
    setDoc(doc(outreach.db, 'auditLogs', 'forged'), {
      actorUid: owner.uid,
      actorEmail: OWNER,
      action: 'page.update',
      target: 'homepage',
      detail: '',
      createdAt: serverTimestamp(),
    }),
  );

  await assertSucceeds(delegate.cloud.deleteEditor('other-outreach@example.com'));
  await assertFails(delegate.cloud.deleteEditor(OWNER).catch(() => deleteDoc(doc(delegate.db, 'chapterEditors', OWNER))));
  // A deletion must come with its log entry.
  const batch = writeBatch(owner.db);
  batch.delete(doc(owner.db, 'events', 'science-fair'));
  await assertFails(batch.commit());
});
