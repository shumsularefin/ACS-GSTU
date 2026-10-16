// Shared content model: validation and normalization used by the build, the public
// pages and the Chapter Editor. Everything here runs in both Node and the browser.
import { formState } from './form-model.js';

export const categories = {
  all: 'All events',
  outreach: 'Outreach',
  development: 'Development',
  sustainability: 'Sustainability',
  community: 'Community',
};

export const TIMEZONE = 'Asia/Dhaka';
export const TIMEZONE_OFFSET = '+06:00';
export const MAX_HERO_IMAGES = 5;

export const escapeHTML = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Small, stable hash for change detection (not for security). */
export function contentSignature(data) {
  let hash = 2166136261;
  for (const ch of JSON.stringify(data)) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
}

function text(value, max = 5000, label = 'Text') {
  const s = String(value ?? '').trim();
  if (s.length > max) throw Error(`${label} is longer than ${max} characters.`);
  return s;
}

const MEDIA_REF = /^media:[a-f0-9-]{36}$/;
const LOCAL_IMAGE = /^images\/[a-z0-9_ /().@-]+\.(webp|png|jpe?g)$/i;

/** Accepts HTTPS links; images may also be uploaded media references or bundled image paths. */
export function safeURL(value, image = false) {
  const url = text(value, 2000, 'Link');
  if (!url) return '';
  if (image && MEDIA_REF.test(url)) return url;
  if (image && LOCAL_IMAGE.test(url) && !url.includes('..')) return url;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw Error(image ? 'Upload an image or use a complete https:// image link.' : 'Use a complete link that starts with https://');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw Error('Only https:// links are supported.');
  return url;
}

/** A website form's address (forms/{id}), or '' when none is linked. */
function formRef(value) {
  const id = text(value, 80, 'Form');
  if (id && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) throw Error('Choose a form from the list.');
  return id;
}

export function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

const ZONED_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/;

/** Today's date in Bangladesh as YYYY-MM-DD. */
export function todayInBangladesh(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/**
 * Events store `date` (first day) plus optional `startsAt`/`endsAt`:
 *  - both empty: single all-day event
 *  - plain dates (YYYY-MM-DD): all-day event spanning date..endsAt
 *  - zoned times: timed event (shown in Bangladesh time)
 * The editor form may also send `endDate`, `startTime` and `endTime` (Bangladesh time).
 */
export function normalizeEvent(raw) {
  const e = {
    id: text(raw.id, 80, 'Event ID'),
    title: text(raw.title, 200, 'Title'),
    date: text(raw.date, 10, 'Start date'),
    category: text(raw.category, 30).toLowerCase(),
    image: safeURL(raw.image, true),
    description: text(raw.description, 5000, 'Description'),
    location: text(raw.location, 300, 'Location'),
    registrationUrl: safeURL(raw.registrationUrl),
    registrationStatus: text(raw.registrationStatus || 'unpublished', 20),
    registrationFormId: formRef(raw.registrationFormId),
    surveyFormId: formRef(raw.surveyFormId),
    sourceUrl: safeURL(raw.sourceUrl),
    // The editor's "Show the video" box; stored only when the video is hidden.
    hideVideo: raw.showVideo === false || raw.hideVideo === true,
    // Set by the build: the real address behind a Facebook share link (never stored).
    videoUrl: safeURL(raw.videoUrl),
    startsAt: text(raw.startsAt, 35),
    endsAt: text(raw.endsAt, 35),
  };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(e.id)) throw Error('Event ID must use lowercase letters, numbers and single hyphens.');
  if (!e.title) throw Error('Add an event title.');
  if (!validDate(e.date)) throw Error('Choose a valid start date.');
  if (!e.description) throw Error('Add a short event description.');
  if (!Object.hasOwn(categories, e.category) || e.category === 'all') throw Error('Choose an event category.');
  if (!['unpublished', 'open', 'closed'].includes(e.registrationStatus)) throw Error('Choose a registration status.');

  const endDate = text(raw.endDate, 10);
  const startTime = text(raw.startTime, 5);
  const endTime = text(raw.endTime, 5);
  if (endDate && !validDate(endDate)) throw Error('Choose a valid end date.');
  if (endDate && endDate < e.date) throw Error('The end date must be on or after the start date.');
  if (startTime || endTime) {
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime))
      throw Error('Enter both a start and an end time, or leave both blank.');
    e.startsAt = `${e.date}T${startTime}:00${TIMEZONE_OFFSET}`;
    e.endsAt = `${endDate || e.date}T${endTime}:00${TIMEZONE_OFFSET}`;
  } else if (endDate || 'endDate' in raw) {
    // The form sent dates only: an all-day event (multi-day when the end date differs).
    e.startsAt = endDate && endDate !== e.date ? e.date : '';
    e.endsAt = endDate && endDate !== e.date ? endDate : '';
  }

  if (validDate(e.startsAt) || validDate(e.endsAt)) {
    if (e.startsAt !== e.date || !validDate(e.endsAt) || e.endsAt < e.date) throw Error(`${e.id}: the event date range is invalid.`);
  } else if (e.startsAt || e.endsAt) {
    const valid = (s) => ZONED_TIME.test(s) && validDate(s.slice(0, 10)) && Number.isFinite(Date.parse(s));
    if (!valid(e.startsAt) || !valid(e.endsAt) || Date.parse(e.endsAt) <= Date.parse(e.startsAt))
      throw Error('The end time must be after the start time.');
    if (e.startsAt.slice(0, 10) !== e.date) throw Error('The start time must be on the start date.');
  }
  return e;
}

/** Form values for an event (dates and Bangladesh times split into separate inputs). */
export function eventFormValues(e) {
  const timed = e.startsAt && !validDate(e.startsAt);
  const local = (iso) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .reduce((all, p) => ({ ...all, [p.type]: p.value }), {});
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
  };
  const end = timed ? local(e.endsAt) : null;
  return {
    ...e,
    showVideo: !e.hideVideo,
    endDate: timed ? (end.date !== e.date ? end.date : '') : e.endsAt && e.endsAt !== e.date ? e.endsAt : '',
    startTime: timed ? local(e.startsAt).time : '',
    endTime: timed ? end.time : '',
  };
}

export function eventEndDate(e) {
  if (!e.endsAt) return e.date;
  return validDate(e.endsAt) ? e.endsAt : todayInBangladesh(new Date(e.endsAt));
}

export function eventPast(e, now = new Date()) {
  if (e.endsAt && !validDate(e.endsAt)) return Date.parse(e.endsAt) < now.getTime();
  return eventEndDate(e) < todayInBangladesh(now);
}

// ------------------------------------------------------------------ linked website forms

/** What public pages need to know about a form: its title, type and when it accepts answers. */
export function normalizeFormSummary(raw) {
  const iso = (v) => (v ? new Date(v).toISOString() : '');
  const f = {
    id: formRef(raw.id),
    title: text(raw.title, 200, 'Form title'),
    kind: text(raw.kind, 20),
    status: ['draft', 'open', 'closed'].includes(raw.status) ? raw.status : 'draft',
    opensAt: iso(raw.opensAt),
    closesAt: iso(raw.closesAt),
  };
  if (!f.id || !f.title) throw Error('Incomplete form.');
  return f;
}
export const findForm = (forms, id) => (id ? (forms || []).find((f) => f.id === id) || null : null);
/** 'none' when nothing (or a removed or hidden form) is linked; otherwise the form's state. */
export function linkedFormState(forms, id, now = new Date()) {
  const form = findForm(forms, id);
  return !form || form.status === 'draft' ? 'none' : formState(form, now);
}

/**
 * Open for registration and not yet finished. With a website form linked, the form's status and
 * opening times decide; otherwise the event's registration status does (the link is optional).
 */
export function eventOpen(e, now = new Date(), forms = []) {
  if (eventPast(e, now)) return false;
  const state = linkedFormState(forms, e.registrationFormId, now);
  return state === 'none' ? e.registrationStatus === 'open' : state === 'open';
}

export function newRosterKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return (
    'r' +
    [...bytes]
      .map((b) => b.toString(36).padStart(2, '0'))
      .join('')
      .slice(0, 10)
  );
}

export const normalizeMembershipID = (value) =>
  String(value ?? '')
    .trim()
    .toUpperCase();

/** Committee or founding member: name, role, optional photo. */
export function normalizePerson(raw) {
  const m = { name: text(raw.name, 150, 'Name'), role: text(raw.role, 150, 'Role'), image: safeURL(raw.image, true) };
  if (!m.name) throw Error('Member name is required.');
  if (!m.role) throw Error(`${m.name}: role is required.`);
  return m;
}

/** General or premium roster member: name and tier. The membership ID stays private. */
export function normalizeRosterMember(raw, { keepPrivate = false } = {}) {
  const m = { key: text(raw.key, 20) || newRosterKey(), name: text(raw.name, 150, 'Name'), tier: text(raw.tier, 20).toLowerCase() };
  if (!/^[a-z0-9]{1,20}$/.test(m.key)) throw Error('Invalid roster entry.');
  if (!m.name) throw Error('Member name is required.');
  if (!['general', 'premium'].includes(m.tier)) throw Error(`${m.name}: membership tier must be general or premium.`);
  if (keepPrivate) m.memID = text(raw.memID, 100, 'Membership ID');
  return m;
}

function unique(list, key, label) {
  const seen = new Set();
  for (const item of list) {
    const id = key(item).toLowerCase();
    if (seen.has(id)) throw Error(`Duplicate ${label}: ${key(item)}`);
    seen.add(id);
  }
  return list;
}

export function normalizeMembership(raw) {
  const m = {};
  const labels = {
    intro: 'Introduction',
    eligibility: 'Eligibility',
    general: 'General membership',
    premium: 'Premium membership',
    renewal: 'Renewal instructions',
  };
  for (const [key, label] of Object.entries(labels)) {
    m[key] = text(raw[key], 5000, label);
    if (!m[key]) throw Error(`${label} is required.`);
  }
  const benefits = typeof raw.benefits === 'string' ? raw.benefits.split(/\r?\n/) : raw.benefits;
  if (!Array.isArray(benefits)) throw Error('List the membership benefits, one per line.');
  m.benefits = benefits.map((v) => text(v, 500, 'Benefit')).filter(Boolean);
  if (m.benefits.length > 30) throw Error('List up to 30 membership benefits.');
  m.applicationUrl = safeURL(raw.applicationUrl);
  m.renewalUrl = safeURL(raw.renewalUrl);
  m.applicationFormId = formRef(raw.applicationFormId);
  m.renewalFormId = formRef(raw.renewalFormId);
  m.contactEmail = text(raw.contactEmail, 200, 'Contact email');
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(m.contactEmail)) throw Error('Enter a valid chapter contact email.');
  return m;
}

// ------------------------------------------------------------------ news (Facebook Page posts)

/** A post baked by the build: its photo is saved with the site (media/news/…). */
export function normalizeNewsPost(raw) {
  const p = {
    id: text(raw.id, 80),
    text: text(raw.text, 5000),
    createdAt: text(raw.createdAt, 40),
    link: text(raw.link, 2000),
    image: text(raw.image, 200),
  };
  if (!/^[0-9_]{3,80}$/.test(p.id)) throw Error('Invalid post.');
  if (!Number.isFinite(Date.parse(p.createdAt))) throw Error('Invalid post date.');
  if (!/^https:\/\/(www\.|m\.|web\.)?facebook\.com\//.test(p.link)) throw Error('Invalid post link.');
  if (p.image && !/^media\/news\/[0-9_]+\.(jpg|png|webp)$/.test(p.image)) throw Error('Invalid post image.');
  return p;
}
export function normalizeNews(list) {
  const result = [];
  for (const raw of Array.isArray(list) ? list : []) {
    try {
      result.push(normalizeNewsPost(raw));
    } catch {
      /* Skipped. */
    }
  }
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
/** Post IDs hidden in the Chapter Editor. */
export const normalizeNewsHidden = (raw) =>
  [...new Set((Array.isArray(raw?.hidden) ? raw.hidden : []).map(String).filter((id) => /^[0-9_]{3,80}$/.test(id)))].slice(0, 2000);
export const visibleNews = (data) => (data.news || []).filter((p) => !(data.newsHidden || []).includes(p.id));

export function normalizeHomepage(raw) {
  const images = typeof raw?.images === 'string' ? raw.images.split(/\r?\n/) : raw?.images;
  const list = (Array.isArray(images) ? images : []).map((url) => safeURL(url, true)).filter(Boolean);
  if (list.length > MAX_HERO_IMAGES) throw Error(`Use up to ${MAX_HERO_IMAGES} homepage images.`);
  return { images: list.length ? list : ['images/optimized/slide01-1600.webp'] };
}

export function normalizeCommittee(raw, { keepPrivate = false } = {}) {
  if (!Array.isArray(raw?.members) || !Array.isArray(raw?.roster ?? [])) throw Error('Invalid committee record.');
  return {
    members: unique(raw.members.map(normalizePerson), (m) => m.name, 'committee member'),
    roster: unique(
      (raw.roster ?? []).map((m) => normalizeRosterMember(m, { keepPrivate })),
      (m) => m.key,
      'roster entry',
    ),
  };
}

export function normalizeTeam(raw, options = {}) {
  if (!Array.isArray(raw?.founders) || typeof raw?.committees !== 'object') throw Error('Invalid team records.');
  const team = { founders: unique(raw.founders.map(normalizePerson), (m) => m.name, 'founding member'), committees: {} };
  for (const [year, entry] of Object.entries(raw.committees)) {
    if (!/^20\d{2}$/.test(year)) throw Error(`Invalid committee year: ${year}`);
    team.committees[year] = normalizeCommittee(entry, options);
  }
  return team;
}

export function normalizeContent(raw, options = {}) {
  if (!Array.isArray(raw?.events) || raw.events.length > 300) throw Error('Invalid event list.');
  return {
    events: unique(raw.events.map(normalizeEvent), (e) => e.id, 'event ID').sort(
      (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
    ),
    homepage: normalizeHomepage(raw.homepage),
    membership: normalizeMembership(raw.membership),
    team: normalizeTeam(raw.team, options),
    forms: normalizeForms(raw.forms),
    news: normalizeNews(raw.news),
    newsHidden: normalizeNewsHidden({ hidden: raw.newsHidden }),
  };
}

/** Form summaries; one broken form never hides the others. */
export function normalizeForms(list) {
  const result = [];
  for (const raw of Array.isArray(list) ? list : []) {
    try {
      result.push(normalizeFormSummary(raw));
    } catch {
      /* Skipped. */
    }
  }
  return result;
}

/** Removes everything private (membership IDs) from content. */
export function publicContent(content) {
  const copy = structuredClone(content);
  for (const committee of Object.values(copy.team.committees)) for (const m of committee.roster) delete m.memID;
  return copy;
}

// ------------------------------------------------------------------ calendars

export function calendarValues(e) {
  const utc = (s) =>
    new Date(s)
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z');
  if (e.startsAt && !validDate(e.startsAt)) return { start: utc(e.startsAt), end: utc(e.endsAt), allDay: false };
  const next = new Date(`${e.endsAt || e.date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return { start: e.date.replaceAll('-', ''), end: next.toISOString().slice(0, 10).replaceAll('-', ''), allDay: true };
}

export function calendarICS(e) {
  const t = calendarValues(e);
  const quote = (s) =>
    String(s || '')
      .replace(/\\/g, '\\\\')
      .replace(/\r?\n/g, '\\n')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ACS GSTU//Chapter Events//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${e.id}@acs-gstu.web.app`,
    'DTSTAMP:20260921T000000Z',
    `DTSTART${t.allDay ? ';VALUE=DATE' : ''}:${t.start}`,
    `DTEND${t.allDay ? ';VALUE=DATE' : ''}:${t.end}`,
    `SUMMARY:${quote(e.title)}`,
    `DESCRIPTION:${quote(e.description)}`,
    `LOCATION:${quote(e.location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  // Fold lines at 73 bytes as required by RFC 5545.
  const fold = (line) => {
    let result = '';
    let chunk = '';
    for (const ch of line) {
      if (new TextEncoder().encode(chunk + ch).length > 73) {
        result += chunk + '\r\n ';
        chunk = '';
      }
      chunk += ch;
    }
    return result + chunk;
  };
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function googleCalendarURL(e) {
  const t = calendarValues(e);
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${t.start}/${t.end}`,
    details: e.description,
    location: e.location || '',
    ctz: TIMEZONE,
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

// ------------------------------------------------------------------ spreadsheet rows

const columnKey = (name) =>
  String(name)
    .toLowerCase()
    .replace(/[^a-z]/g, '');

const ROW_ALIASES = {
  membershipid: 'memID',
  memid: 'memID',
  membershipnumber: 'memID',
  membersname: 'name',
  membername: 'name',
  fullname: 'name',
  name: 'name',
  eventid: 'id',
  id: 'id',
  membershiptier: 'tier',
  tier: 'tier',
  photofilename: 'image',
  photo: 'image',
  image: 'image',
  year: 'year',
  role: 'role',
  title: 'title',
  date: 'date',
  startdate: 'date',
  enddate: 'endDate',
  category: 'category',
  description: 'description',
  registrationurl: 'registrationUrl',
  registrationstatus: 'registrationStatus',
  startsat: 'startsAt',
  endsat: 'endsAt',
  sourceurl: 'sourceUrl',
  location: 'location',
};

export function mapRow(row) {
  const mapped = {};
  for (const [k, v] of Object.entries(row)) {
    const key = ROW_ALIASES[columnKey(k)];
    if (key) mapped[key] = String(v ?? '').trim();
  }
  if (mapped.image && !mapped.image.includes('/') && !/^(https:|media:)/.test(mapped.image)) mapped.image = 'images/' + mapped.image;
  return mapped;
}

/**
 * Plans a spreadsheet import without changing anything: returns the records to add and update
 * so the editor can review them in plain language first.
 *   kind: 'roster' (name + membership ID; year and tier chosen in the dashboard),
 *         'committee' (name, role, photo), 'founders', or 'events'.
 */
export function planImport(kind, rows, { existing = [], tier = 'general' } = {}) {
  const added = [];
  const updated = [];
  const unchanged = [];
  const seen = new Set();
  const result = existing.map((m) => ({ ...m }));
  rows.forEach((row, index) => {
    const line = index + 2;
    try {
      const mapped = mapRow(row);
      let record;
      let match;
      if (kind === 'roster') {
        if (!mapped.name || !mapped.memID) throw Error('Member Name and Membership ID are both required.');
        const memID = normalizeMembershipID(mapped.memID);
        record = normalizeRosterMember({ name: mapped.name, tier, memID }, { keepPrivate: true });
        record.memID = memID;
        match = result.findIndex((m) => normalizeMembershipID(m.memID) === memID);
        if (seen.has(memID)) throw Error(`Membership ID ${memID} appears more than once.`);
        seen.add(memID);
        if (match >= 0) record.key = result[match].key;
      } else if (kind === 'events') {
        record = normalizeEvent(mapped);
        match = result.findIndex((e) => e.id === record.id);
        if (seen.has(record.id)) throw Error(`Event ID ${record.id} appears more than once.`);
        seen.add(record.id);
      } else {
        record = normalizePerson(mapped);
        match = result.findIndex((m) => m.name.toLowerCase() === record.name.toLowerCase());
        if (seen.has(record.name.toLowerCase())) throw Error(`${record.name} appears more than once.`);
        seen.add(record.name.toLowerCase());
      }
      if (match < 0) {
        result.push(record);
        added.push(record);
      } else if (JSON.stringify(result[match]) === JSON.stringify({ ...result[match], ...record })) {
        unchanged.push(record);
      } else {
        updated.push({ before: result[match], after: record });
        result[match] = { ...result[match], ...record };
      }
    } catch (error) {
      throw Error(`Row ${line}: ${error.message}`);
    }
  });
  return { added, updated, unchanged, result };
}
