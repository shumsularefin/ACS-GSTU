// Maps the Firestore document layout to the in-memory content shape used by renderers.
//
// Current layout (one document per area):
//   site/meta, events/{id}, pages/homepage, pages/membership, team/founders, team/{year}
// Retired layout (read for migration and as a fallback):
//   siteContent/published  { payload (JSON string), events (map), homepage, membership }
import {
  normalizeEvent,
  normalizeHomepage,
  normalizeMembership,
  normalizePerson,
  normalizeRosterMember,
  normalizeContent,
  normalizeForms,
  normalizeNewsHidden,
  newRosterKey,
} from './content-model.js';

const META_FIELDS = ['revision', 'updatedAt', 'updatedBy', 'auditId', 'createdBy'];
export const stripMeta = (doc) => Object.fromEntries(Object.entries(doc || {}).filter(([key]) => !META_FIELDS.includes(key)));

/** Normalizes record by record so one bad record cannot take the whole website down. */
function lenient(list, normalize, label, warn) {
  const result = [];
  for (const item of list) {
    try {
      result.push(normalize(item));
    } catch (error) {
      warn(`Skipped ${label}: ${error.message}`);
    }
  }
  return result;
}

export function contentFromDocuments(
  { events = [], homepage, membership, team = [], forms = [], news = null },
  { warn = () => {}, fallback } = {},
) {
  const content = {
    events: lenient(events.map(stripMeta), normalizeEvent, 'event', warn),
    homepage: normalizeHomepage(stripMeta(homepage) || {}),
    membership: null,
    team: { founders: [], committees: {} },
    forms: normalizeForms(forms),
    news: [], // Facebook posts are added by the build (scripts/build.mjs).
    newsHidden: normalizeNewsHidden(news),
  };
  try {
    content.membership = normalizeMembership(stripMeta(membership));
  } catch (error) {
    if (!fallback) throw error;
    warn(`Membership information is incomplete (${error.message}); using the previous version.`);
    content.membership = fallback.membership;
  }
  for (const { id, data } of team) {
    const members = lenient(data.members || [], normalizePerson, `team member (${id})`, warn);
    if (id === 'founders') content.team.founders = members;
    else if (/^20\d{2}$/.test(id))
      content.team.committees[id] = {
        members,
        roster: lenient(data.roster || [], (m) => normalizeRosterMember(m), `roster entry (${id})`, warn),
      };
  }
  content.events.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  return content;
}

/** Reads the retired single-document layout. Roster entries receive keys when they have none. */
export function contentFromLegacy(doc, privateRosters) {
  const payload = JSON.parse(doc.payload || '{}');
  const raw = {
    ...payload,
    events: doc.schemaVersion === 2 ? Object.values(doc.events || {}) : payload.events || [],
    homepage: doc.homepage || payload.homepage,
    membership: doc.membership || payload.membership,
  };
  for (const [year, committee] of Object.entries(raw.team?.committees || {})) {
    const ids = privateRosters?.years?.[year] || [];
    committee.roster = (committee.roster || []).map((m) => ({
      key: m.key || newRosterKey(),
      name: m.name,
      tier: m.tier,
      memID: ids.find((r) => r.name === m.name && r.tier === m.tier)?.memID || m.memID || '',
    }));
  }
  const content = normalizeContent(raw, { keepPrivate: !!privateRosters });
  return { content, certificateArchive: Array.isArray(payload.certificateArchive) ? payload.certificateArchive : [] };
}

/**
 * Loads the published content through a REST client (see firestore-rest.js).
 * Returns { layout: 'split' | 'legacy', revision, content } or null when nothing is published.
 */
export async function loadPublished(rest, options = {}) {
  // Rules deployed before the split do not allow reading site/meta (403): that means the retired layout.
  const meta = await rest.get('site/meta').catch((error) => {
    if (error.status === 403) return null;
    throw error;
  });
  if (meta) {
    const [events, homepage, membership, team, forms, news] = await Promise.all([
      rest.list('events'),
      rest.get('pages/homepage'),
      rest.get('pages/membership'),
      rest.list('team'),
      // Security rules older than the forms feature refuse this list; the site then shows no forms.
      rest.list('forms').catch(() => []),
      rest.get('pages/news').catch(() => null),
    ]);
    const content = contentFromDocuments(
      { events: events.map((d) => d.data), homepage, membership, team, forms: forms.map((d) => d.data), news },
      options,
    );
    return { layout: 'split', revision: meta.revision, content };
  }
  const legacy = await rest.get('siteContent/published');
  if (legacy) {
    const { content, certificateArchive } = contentFromLegacy(legacy);
    return { layout: 'legacy', revision: `legacy-${legacy.revision}`, content, hiddenCertificateEvents: certificateArchive };
  }
  return null;
}

/** Document writes for the current layout (public team documents never include membership IDs). */
export function documentsFromContent(content) {
  const team = { founders: { members: content.team.founders } };
  const rosterPrivate = {};
  for (const [year, committee] of Object.entries(content.team.committees)) {
    team[year] = { members: committee.members, roster: committee.roster.map(({ key, name, tier }) => ({ key, name, tier })) };
    rosterPrivate[year] = { ids: Object.fromEntries(committee.roster.filter((m) => m.memID).map((m) => [m.key, m.memID])) };
  }
  return {
    events: Object.fromEntries(content.events.map((e) => [e.id, e])),
    homepage: content.homepage,
    membership: content.membership,
    team,
    rosterPrivate,
  };
}
