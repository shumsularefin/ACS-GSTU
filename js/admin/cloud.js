// Chapter Editor data layer: Google sign-in and every Firestore read and write.
// Each write runs in one transaction or batch together with its activity-log entry (see firestore.rules).
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  signOut as firebaseSignOut,
  connectAuthEmulator,
} from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  collection,
  runTransaction,
  serverTimestamp,
  writeBatch,
  getDocs,
  getDocFromServer,
  getDocsFromServer,
  query,
  orderBy,
  limit,
  startAfter,
  deleteField,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import { normalizeMembershipID, currentCategory, legacyCategories } from '../lib/content-model.js';
import { stripMeta, contentFromLegacy, documentsFromContent } from '../lib/content-store.js';
import { membershipLookupID, publicCertificate } from '../lib/certificate-model.js';

export const SUPER_ADMIN_EMAIL = 'muhammadshamsularefin01@gmail.com';
export const ROLES = ['super-admin', 'administrator', 'outreach'];

/** Someone else published the same section after this draft was started. */
export class ConflictError extends Error {
  constructor(section, revision) {
    super(`${section} was changed by another editor after you started editing.`);
    this.name = 'ConflictError';
    this.revision = revision;
  }
}

// Form links are left out when empty, so events and membership still save under security rules
// published before form links existed.
const LINK_FIELDS = ['registrationFormId', 'surveyFormId', 'applicationFormId', 'renewalFormId', 'hideVideo', 'hidePhotos'];
// Rules published before the annual report categories accept only the earlier category names, so an
// event the rules refuse is saved once more under the matching earlier name. Everything shows and
// reports it under the new category, and the next save after the new rules are deployed stores that.
const EARLIER_NAME = Object.fromEntries(Object.entries(legacyCategories).map(([earlier, now]) => [now, earlier]));
// Filled in by the build only; never written to the database.
const BUILD_FIELDS = ['videoUrl', 'photos'];
const withoutEmptyLinks = (data) =>
  Object.fromEntries(Object.entries(data).filter(([k, v]) => !BUILD_FIELDS.includes(k) && !(LINK_FIELDS.includes(k) && !v)));

export function editorEmail(value) {
  const email = String(value || '')
    .trim()
    .toLowerCase();
  if (!/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(email) || email.length > 200) throw Error('Enter a valid Google account email.');
  return email;
}

export function connect(config) {
  const app = initializeApp(config.firebase, 'chapter-editor');
  const auth = getAuth(app);
  const db = getFirestore(app);
  if (config.emulators?.firestore) {
    const url = new URL(config.emulators.firestore);
    connectFirestoreEmulator(db, url.hostname, Number(url.port));
  }
  if (!config.emulators?.auth) return createCloud({ db, auth });
  connectAuthEmulator(auth, config.emulators.auth, { disableWarnings: true });
  const cloud = createCloud({ db, auth });
  // End-to-end tests only: the Auth emulator accepts unsigned Google test accounts. Real Firebase rejects them.
  cloud.testSignIn = async (email) =>
    (
      await signInWithCredential(
        auth,
        GoogleAuthProvider.credential(JSON.stringify({ sub: email.replace(/\W/g, ''), email, email_verified: true })),
      )
    ).user;
  return cloud;
}

/** The data layer for a Firestore instance and an auth object with `currentUser` (tests pass their own). */
export function createCloud({ db, auth }) {
  const metaRef = doc(db, 'site', 'meta');
  const uid = () => auth.currentUser.uid;

  function audit(writer, action, target, detail = '', ids) {
    const ref = doc(collection(db, 'auditLogs'));
    writer.set(ref, {
      actorUid: uid(),
      actorEmail: auth.currentUser.email.toLowerCase(),
      action,
      target: String(target).slice(0, 200),
      detail: String(detail).slice(0, 1000),
      createdAt: serverTimestamp(),
      ...(ids ? { ids } : {}),
    });
    return ref.id;
  }
  const stamp = (auditId) => ({ updatedAt: serverTimestamp(), updatedBy: uid(), auditId });
  const bumpMeta = (tx, metaSnap) =>
    tx.set(metaRef, { revision: (metaSnap.exists() ? metaSnap.data().revision : 0) + 1, updatedAt: serverTimestamp(), updatedBy: uid() });

  async function role(user = auth.currentUser) {
    if (!user?.emailVerified) return '';
    if (user.email.toLowerCase() === SUPER_ADMIN_EMAIL) return 'super-admin';
    try {
      const grant = await getDocFromServer(doc(db, 'chapterEditors', user.email.toLowerCase()));
      return grant.exists() && grant.data().active === true && ROLES.includes(grant.data().role) ? grant.data().role : '';
    } catch {
      return '';
    }
  }

  /** Saves one document with a revision check, its log entry and the site revision counter. */
  function saveDocument(ref, { section, action, target, detail, baseRevision, data, extra }) {
    return runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const meta = await tx.get(metaRef);
      const extraSnaps = [];
      for (const item of extra || []) extraSnaps.push(await tx.get(item.ref));
      const current = snap.exists() ? snap.data().revision || 0 : 0;
      if (current !== baseRevision) throw new ConflictError(section, current);
      const auditId = audit(tx, action, target, detail);
      tx.set(ref, { ...data(snap), revision: current + 1, ...stamp(auditId) });
      (extra || []).forEach((item, i) => {
        const previous = extraSnaps[i].exists() ? extraSnaps[i].data().revision || 0 : 0;
        tx.set(item.ref, { ...item.data, revision: previous + 1, ...stamp(auditId) });
      });
      bumpMeta(tx, meta);
      return current + 1;
    });
  }

  function removeDocuments(refs, { action, target, detail }) {
    return runTransaction(db, async (tx) => {
      const meta = await tx.get(metaRef);
      const auditId = audit(tx, action, target, detail);
      for (const { ref, key } of refs) {
        tx.set(doc(db, 'removals', key), { auditId });
        tx.delete(ref);
      }
      bumpMeta(tx, meta);
    });
  }

  const api = {
    role,
    async signIn() {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      return (await signInWithPopup(auth, provider)).user;
    },
    async currentUser() {
      await auth.authStateReady();
      return auth.currentUser;
    },
    signOut: () => firebaseSignOut(auth),

    // ---------------------------------------------------------------- content

    /** Everything the dashboard edits, with revisions for conflict checks. Private IDs only for super-admins. */
    async load(currentRole) {
      const superAdmin = currentRole === 'super-admin';
      const [meta, eventDocs, homepage, membership, teamDocs, privateDocs, formDocs, news] = await Promise.all([
        getDocFromServer(metaRef),
        getDocsFromServer(collection(db, 'events')),
        getDocFromServer(doc(db, 'pages', 'homepage')),
        getDocFromServer(doc(db, 'pages', 'membership')),
        getDocsFromServer(collection(db, 'team')),
        superAdmin ? getDocsFromServer(collection(db, 'rosterPrivate')) : null,
        getDocsFromServer(collection(db, 'forms')).catch(() => null), // Older rules have no forms yet.
        getDocFromServer(doc(db, 'pages', 'news')).catch(() => null),
      ]);
      const ids = Object.fromEntries((privateDocs?.docs || []).map((d) => [d.id, d.data().ids || {}]));
      const privateRevisions = Object.fromEntries((privateDocs?.docs || []).map((d) => [d.id, d.data().revision || 0]));
      const result = {
        layout: meta.exists() ? 'split' : 'empty',
        revision: meta.exists() ? meta.data().revision : 0,
        events: eventDocs.docs.map((d) => ({
          // Events saved before the annual report categories show (and save) with the new category.
          value: { ...stripMeta(d.data()), category: currentCategory(d.data().category) },
          revision: d.data().revision || 0,
          createdBy: d.data().createdBy,
        })),
        homepage: homepage.exists() ? { value: stripMeta(homepage.data()), revision: homepage.data().revision || 0 } : null,
        membership: membership.exists() ? { value: stripMeta(membership.data()), revision: membership.data().revision || 0 } : null,
        team: Object.fromEntries(
          teamDocs.docs.map((d) => [
            d.id,
            {
              value: {
                members: d.data().members || [],
                roster: (d.data().roster || []).map((m) => ({ ...m, ...(superAdmin ? { memID: ids[d.id]?.[m.key] || '' } : {}) })),
              },
              revision: d.data().revision || 0,
              privateRevision: privateRevisions[d.id] || 0,
            },
          ]),
        ),
        formsUnavailable: formDocs === null,
        newsSettings: news?.exists()
          ? { hidden: news.data().hidden || [], revision: news.data().revision || 0 }
          : { hidden: [], revision: 0 },
        forms: (formDocs?.docs || []).map((d) => ({
          value: { ...stripMeta(d.data()), opensAt: d.data().opensAt?.toDate?.() || null, closesAt: d.data().closesAt?.toDate?.() || null },
          revision: d.data().revision || 0,
          createdBy: d.data().createdBy,
        })),
      };
      if (!meta.exists()) {
        // The retired single-document layout, waiting for the one-time upgrade.
        const legacy = await getDocFromServer(doc(db, 'siteContent', 'published'));
        if (legacy.exists()) {
          const rosters = superAdmin ? await getDocFromServer(doc(db, 'privateRosters', 'members')) : null;
          result.layout = 'legacy';
          result.legacy = contentFromLegacy(legacy.data(), rosters?.exists() ? rosters.data() : null);
        }
      }
      return result;
    },

    saveEvent(event, baseRevision) {
      const save = (e) =>
        saveDocument(doc(db, 'events', e.id), {
          section: `Event “${e.title}”`,
          action: baseRevision ? 'event.update' : 'event.create',
          target: e.id,
          detail: `${e.title} · ${e.date}`,
          baseRevision,
          data: (snap) => ({ ...withoutEmptyLinks(e), createdBy: snap.exists() ? snap.data().createdBy : uid() }),
        });
      return save(event).catch((error) => {
        if (error.code !== 'permission-denied' || !EARLIER_NAME[event.category]) throw error;
        return save({ ...event, category: EARLIER_NAME[event.category] });
      });
    },
    deleteEvent(event) {
      return removeDocuments([{ ref: doc(db, 'events', event.id), key: `events:${event.id}` }], {
        action: 'event.delete',
        target: event.id,
        detail: `${event.title} · ${event.date}`,
      });
    },
    savePage(name, value, baseRevision) {
      return saveDocument(doc(db, 'pages', name), {
        section: name === 'homepage' ? 'Homepage images' : name === 'news' ? 'News' : 'Membership information',
        action: 'page.update',
        target: name,
        detail:
          name === 'homepage'
            ? `${value.images.length} homepage image(s)`
            : name === 'news'
              ? `${value.hidden.length} hidden post(s)`
              : 'Membership information updated',
        baseRevision,
        data: () => withoutEmptyLinks(value),
      });
    },
    /** Saves a team year: public names/roles/tiers, and (for annual rosters) the private membership IDs. */
    saveTeam(year, value, baseRevision) {
      const roster = (value.roster || []).map(({ key, name, tier }) => ({ key, name, tier }));
      const ids = Object.fromEntries((value.roster || []).filter((m) => m.memID).map((m) => [m.key, normalizeMembershipID(m.memID)]));
      return saveDocument(doc(db, 'team', year), {
        section: year === 'founders' ? 'Founding members' : `Team ${year}`,
        action: 'team.update',
        target: year,
        detail: `${value.members.length} committee member(s), ${roster.length} roster member(s)`,
        baseRevision,
        data: () => (year === 'founders' ? { members: value.members } : { members: value.members, roster }),
        extra: year === 'founders' ? [] : [{ ref: doc(db, 'rosterPrivate', year), data: { ids } }],
      });
    },
    deleteTeamYear(year) {
      return removeDocuments(
        [
          { ref: doc(db, 'team', year), key: `team:${year}` },
          { ref: doc(db, 'rosterPrivate', year), key: `rosterPrivate:${year}` },
        ],
        { action: 'team.delete', target: year, detail: `Removed team year ${year}` },
      );
    },
    /** Publishes reviewed events from a spreadsheet, ten per transaction (each has its own log entry). */
    async importEvents(events, existingRevisions, onProgress = () => {}) {
      for (let start = 0; start < events.length; start += 10) {
        await api.importEventGroup(events.slice(start, start + 10), existingRevisions);
        onProgress(Math.min(start + 10, events.length), events.length);
      }
    },
    async importEventGroup(events, existingRevisions) {
      await runTransaction(db, async (tx) => {
        const meta = await tx.get(metaRef);
        const snaps = [];
        for (const e of events) snaps.push(await tx.get(doc(db, 'events', e.id)));
        snaps.forEach((snap, i) => {
          const current = snap.exists() ? snap.data().revision || 0 : 0;
          if (current !== (existingRevisions[events[i].id] || 0)) throw new ConflictError(`Event “${events[i].title}”`, current);
        });
        events.forEach((e, i) => {
          const snap = snaps[i];
          const auditId = audit(tx, snap.exists() ? 'event.update' : 'event.create', e.id, `Imported: ${e.title} · ${e.date}`);
          tx.set(doc(db, 'events', e.id), {
            ...withoutEmptyLinks(e),
            createdBy: snap.exists() ? snap.data().createdBy : uid(),
            revision: (snap.exists() ? snap.data().revision || 0 : 0) + 1,
            ...stamp(auditId),
          });
        });
        bumpMeta(tx, meta);
      });
    },

    // ---------------------------------------------------------------- forms

    saveForm(form, baseRevision) {
      return saveDocument(doc(db, 'forms', form.id), {
        section: `Form “${form.title}”`,
        action: baseRevision ? 'form.update' : 'form.create',
        target: form.id,
        detail: `${form.title} · ${form.status}`,
        baseRevision,
        data: (snap) => ({
          ...form,
          opensAt: form.opensAt ? Timestamp.fromDate(new Date(form.opensAt)) : null,
          closesAt: form.closesAt ? Timestamp.fromDate(new Date(form.closesAt)) : null,
          createdBy: snap.exists() ? snap.data().createdBy : uid(),
        }),
      });
    },
    deleteForm(form) {
      return removeDocuments([{ ref: doc(db, 'forms', form.id), key: `forms:${form.id}` }], {
        action: 'form.delete',
        target: form.id,
        detail: form.title,
      });
    },
    async formResponses(formId) {
      const snap = await getDocsFromServer(collection(db, 'forms', formId, 'responses'));
      return snap.docs.map((d) => ({
        id: d.id,
        answers: d.data().answers || {},
        submittedAt: d.data().submittedAt?.toDate?.() || null,
        verified: d.data().verified === true,
        verifiedAt: d.data().verifiedAt?.toDate?.() || null,
      }));
    },
    async setResponseVerified(formId, responseId, verified) {
      await updateDoc(doc(db, 'forms', formId, 'responses', responseId), {
        verified,
        verifiedBy: uid(),
        verifiedAt: serverTimestamp(),
      });
    },
    /** Permanently removes responses (super-admin), 100 per batch, each batch with one log entry. */
    async deleteFormResponses(formId, ids, title = '') {
      for (let start = 0; start < ids.length; start += 100) {
        const group = ids.slice(start, start + 100);
        const batch = writeBatch(db);
        const auditId = audit(batch, 'form.responses.delete', formId, `Deleted ${group.length} response(s) to ${title || formId}`);
        batch.set(doc(db, 'removals', `formResponses:${formId}`), { auditId });
        for (const id of group) batch.delete(doc(db, 'forms', formId, 'responses', id));
        await batch.commit();
      }
    },

    // ---------------------------------------------------------------- one-time upgrade

    /** Copies the retired single-document content (or the seed) into the per-area layout. */
    async migrate({ content, certificateArchive = [] }) {
      const docs = documentsFromContent(content);
      const archived = [];
      for (const id of certificateArchive) {
        const snap = await getDocFromServer(doc(db, 'certificateEvents', id)).catch(() => null);
        if (snap?.exists()) archived.push(snap.data());
      }
      const batch = writeBatch(db);
      const auditId = audit(
        batch,
        'content.migrate',
        'site',
        `Upgraded storage: ${content.events.length} events, ${Object.keys(docs.team).length} team records`,
      );
      const stamped = { revision: 1, ...stamp(auditId) };
      for (const e of Object.values(docs.events))
        batch.set(doc(db, 'events', e.id), { ...withoutEmptyLinks(e), createdBy: uid(), ...stamped });
      batch.set(doc(db, 'pages', 'homepage'), { ...docs.homepage, ...stamped });
      batch.set(doc(db, 'pages', 'membership'), { ...docs.membership, ...stamped });
      for (const [year, value] of Object.entries(docs.team)) batch.set(doc(db, 'team', year), { ...value, ...stamped });
      for (const [year, value] of Object.entries(docs.rosterPrivate)) batch.set(doc(db, 'rosterPrivate', year), { ...value, ...stamped });
      for (const e of archived)
        batch.set(doc(db, 'certificateEvents', e.id), {
          id: e.id,
          title: e.title,
          date: e.date,
          archived: true,
          updatedAt: serverTimestamp(),
          auditId,
        });
      batch.set(metaRef, { revision: 1, updatedAt: serverTimestamp(), updatedBy: uid() });
      await batch.commit();
    },

    /** Moves membership IDs out of public certificate records (records issued before the split). */
    async migrateCertificates(onProgress = () => {}) {
      const [certs, privates] = await Promise.all([
        getDocsFromServer(collection(db, 'certificates')),
        getDocsFromServer(collection(db, 'certificatePrivate')),
      ]);
      const havePrivate = new Set(privates.docs.map((d) => d.id));
      const pending = certs.docs.filter((d) => 'memID' in d.data() || 'certificate' in d.data());
      let done = 0;
      for (let start = 0; start < pending.length; start += 100) {
        const group = pending.slice(start, start + 100);
        const lookups = new Map();
        for (const d of group) {
          const { memID, eventId } = d.data();
          if (!memID || !eventId) continue;
          const key = await membershipLookupID(eventId, memID);
          const entry = lookups.get(key) || { eventId, ids: [] };
          entry.ids.push(d.id);
          lookups.set(key, entry);
        }
        for (const [key, entry] of lookups) {
          const existing = await getDocFromServer(doc(db, 'certificateLookup', key));
          if (existing.exists()) entry.ids = [...new Set([...(existing.data().ids || []), ...entry.ids])].slice(0, 20);
        }
        const batch = writeBatch(db);
        const auditId = audit(
          batch,
          'certificate.migrate',
          group[0].id,
          `Moved membership IDs of ${group.length} certificate(s) to private storage`,
          group.map((d) => d.id),
        );
        for (const d of group) {
          const memID = String(d.data().memID || '').trim();
          batch.update(d.ref, { memID: deleteField(), certificate: deleteField(), auditId, migratedAt: serverTimestamp() });
          if (memID && !havePrivate.has(d.id)) batch.set(doc(db, 'certificatePrivate', d.id), { memID: memID.slice(0, 80), auditId });
        }
        for (const [key, entry] of lookups)
          batch.set(doc(db, 'certificateLookup', key), { eventId: entry.eventId, ids: entry.ids, auditId });
        await batch.commit();
        done += group.length;
        onProgress(done, pending.length);
      }
      return pending.length;
    },
    async certificatesNeedingMigration() {
      const certs = await getDocsFromServer(collection(db, 'certificates'));
      return certs.docs.filter((d) => 'memID' in d.data() || 'certificate' in d.data()).length;
    },

    // ---------------------------------------------------------------- images

    async uploadImage(image, name) {
      const id = crypto.randomUUID();
      const batch = writeBatch(db);
      const auditId = audit(batch, 'image.add', id, name);
      batch.set(doc(db, 'siteImages', id), { image, name: name.slice(0, 150), createdBy: uid(), createdAt: serverTimestamp(), auditId });
      await batch.commit();
      return 'media:' + id;
    },
    async images() {
      const snap = await getDocs(collection(db, 'siteImages'));
      return snap.docs
        .map((d) => ({
          id: d.id,
          reference: 'media:' + d.id,
          name: d.data().name,
          image: d.data().image,
          createdBy: d.data().createdBy,
          createdAt: d.data().createdAt?.toDate?.(),
        }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    },
    async deleteImage(id, name) {
      const batch = writeBatch(db);
      const auditId = audit(batch, 'image.delete', id, `Removed unused image ${name || ''}`.trim());
      batch.set(doc(db, 'removals', `siteImages:${id}`), { auditId });
      batch.delete(doc(db, 'siteImages', id));
      await batch.commit();
    },

    // ---------------------------------------------------------------- editors and activity

    async editors() {
      const snap = await getDocsFromServer(collection(db, 'chapterEditors'));
      return snap.docs.map((d) => ({ ...d.data(), updatedAt: d.data().updatedAt?.toDate?.() }));
    },
    async setEditor(email, editorRole, active) {
      email = editorEmail(email);
      if (email === SUPER_ADMIN_EMAIL) throw Error('The permanent super-admin cannot be changed.');
      if (!ROLES.includes(editorRole)) throw Error('Choose a valid role.');
      const batch = writeBatch(db);
      const auditId = audit(batch, 'access.set', email, `${editorRole} · ${active ? 'active' : 'disabled'}`);
      batch.set(doc(db, 'chapterEditors', email), { email, role: editorRole, active, ...stamp(auditId) });
      await batch.commit();
    },
    async deleteEditor(email) {
      email = editorEmail(email);
      if (email === SUPER_ADMIN_EMAIL) throw Error('The permanent super-admin cannot be removed.');
      const batch = writeBatch(db);
      const auditId = audit(batch, 'access.delete', email, 'Removed editor access');
      batch.set(doc(db, 'removals', `chapterEditors:${email}`), { auditId });
      batch.delete(doc(db, 'chapterEditors', email));
      await batch.commit();
    },
    async activity(cursor) {
      const q = query(collection(db, 'auditLogs'), orderBy('createdAt', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(50));
      const snap = await getDocsFromServer(q);
      return {
        entries: snap.docs.map((d) => ({ ...d.data(), createdAt: d.data().createdAt?.toDate?.() })),
        cursor: snap.docs.at(-1) || null,
      };
    },

    // ---------------------------------------------------------------- certificates

    /** Issues records in groups of 40. Retrying the same batch skips identical, already issued records. */
    async issueCertificates(records, onProgress = () => {}) {
      let completed = 0;
      for (let start = 0; start < records.length; start += 40) {
        const group = records.slice(start, start + 40);
        const lookups = new Map();
        for (const c of group)
          if (c.memID && c.eventId) {
            const key = await membershipLookupID(c.eventId, c.memID);
            const entry = lookups.get(key) || { eventId: c.eventId, ids: [] };
            entry.ids.push(c.id);
            lookups.set(key, entry);
          }
        const events = new Map(
          group.filter((c) => c.eventId).map((c) => [c.eventId, { id: c.eventId, title: c.event, date: c.eventDate || c.dateIssued }]),
        );
        await runTransaction(db, async (tx) => {
          const refs = group.map((c) => doc(db, 'certificates', c.id));
          const existing = [];
          for (const ref of refs) existing.push(await tx.get(ref));
          const lookupEntries = [...lookups];
          const lookupSnaps = [];
          for (const [key] of lookupEntries) lookupSnaps.push(await tx.get(doc(db, 'certificateLookup', key)));
          const eventEntries = [...events];
          const eventSnaps = [];
          for (const [id] of eventEntries) eventSnaps.push(await tx.get(doc(db, 'certificateEvents', id)));
          existing.forEach((snap, i) => {
            if (!snap.exists()) return;
            const issued = publicCertificate(group[i]);
            if (
              snap.data().status === 'revoked' ||
              Object.entries(issued).some(([key, value]) => key !== 'status' && snap.data()[key] !== value)
            )
              throw Error(`Credential ${group[i].id} already exists with different details. Nothing in this group was changed.`);
          });
          const fresh = group.filter((_, i) => !existing[i].exists());
          if (!fresh.length) return;
          const auditId = audit(
            tx,
            'certificate.issue',
            fresh[0].id,
            `Issued ${fresh.length} certificate(s): ${[...new Set(fresh.map((c) => c.event))].join(', ')}`,
            fresh.map((c) => c.id),
          );
          for (const c of fresh) {
            tx.set(doc(db, 'certificates', c.id), { ...publicCertificate(c), createdAt: serverTimestamp(), issuedBy: uid(), auditId });
            if (c.memID) tx.set(doc(db, 'certificatePrivate', c.id), { memID: normalizeMembershipID(c.memID), auditId });
          }
          lookupEntries.forEach(([key, entry], i) => {
            const ids = [...new Set([...(lookupSnaps[i].exists() ? lookupSnaps[i].data().ids : []), ...entry.ids])];
            if (ids.length > 20) throw Error('Too many certificates for one membership ID and event.');
            tx.set(doc(db, 'certificateLookup', key), { eventId: entry.eventId, ids, auditId });
          });
          eventEntries.forEach(([id, event], i) => {
            const archived = eventSnaps[i].exists() ? eventSnaps[i].data().archived === true : false;
            tx.set(doc(db, 'certificateEvents', id), { ...event, archived, updatedAt: serverTimestamp(), auditId });
          });
        });
        completed += group.length;
        onProgress(completed, records.length);
      }
    },
    async certificate(id) {
      const snap = await getDocFromServer(doc(db, 'certificates', id));
      if (!snap.exists()) return null;
      const privateSnap = await getDocFromServer(doc(db, 'certificatePrivate', id)).catch(() => null);
      return { ...snap.data(), memID: privateSnap?.exists() ? privateSnap.data().memID : snap.data().memID || '' };
    },
    async certificates() {
      const snap = await getDocsFromServer(collection(db, 'certificates'));
      return snap.docs.map((d) => ({ ...d.data(), id: d.id, createdAt: d.data().createdAt?.toDate?.() }));
    },
    async revokeCertificate(id) {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'certificates', id);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw Error('Credential not found.');
        if (snap.data().status === 'revoked') throw Error('This credential is already revoked.');
        const auditId = audit(tx, 'certificate.revoke', id, `Revoked ${snap.data().name || ''}`.trim());
        tx.update(ref, { status: 'revoked', revokedAt: serverTimestamp(), revokedBy: uid(), auditId });
      });
    },
    /** Permanently removes a revoked certificate (and its Certificate Center entry when nothing else uses it). */
    async deleteCertificate(id) {
      const snap = await getDocFromServer(doc(db, 'certificates', id));
      if (!snap.exists()) throw Error('Credential not found.');
      if (snap.data().status !== 'revoked') throw Error('Revoke the certificate before deleting it.');
      const eventId = snap.data().eventId;
      const others = eventId ? (await api.certificates()).filter((c) => c.eventId === eventId && c.id !== id).length : 1;
      const batch = writeBatch(db);
      const auditId = audit(batch, 'certificate.delete', id, `Deleted revoked certificate of ${snap.data().name || ''}`.trim());
      batch.set(doc(db, 'removals', `certificates:${id}`), { auditId });
      batch.delete(doc(db, 'certificates', id));
      batch.delete(doc(db, 'certificatePrivate', id));
      await batch.commit();
      if (!others) {
        const b2 = writeBatch(db);
        const audit2 = audit(b2, 'certificate.delete', eventId, `Removed empty Certificate Center entry ${snap.data().event || ''}`.trim());
        b2.set(doc(db, 'removals', `certificateEvents:${eventId}`), { auditId: audit2 });
        b2.delete(doc(db, 'certificateEvents', eventId));
        await b2.commit();
      }
    },
    async certificateEvents() {
      const snap = await getDocsFromServer(collection(db, 'certificateEvents'));
      return snap.docs.map((d) => d.data()).sort((a, b) => b.date.localeCompare(a.date));
    },
    async setCertificateEventArchived(id, archived) {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'certificateEvents', id);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw Error('This Certificate Center entry no longer exists.');
        const auditId = audit(tx, 'certificate.catalog', id, `${archived ? 'Hid' : 'Restored'} ${snap.data().title} in Certificate Center`);
        const { id: eventId, title, date } = snap.data();
        tx.set(ref, { id: eventId, title, date, archived, updatedAt: serverTimestamp(), auditId });
      });
    },
  };
  return api;
}
