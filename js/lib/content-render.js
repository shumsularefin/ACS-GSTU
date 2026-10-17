// HTML renderers shared by the static build and the browser (fresh content after a publish).
import {
  categories,
  escapeHTML as h,
  eventOpen,
  eventPast,
  googleCalendarURL,
  calendarICS,
  validDate,
  TIMEZONE,
  findForm,
  linkedFormState,
  visibleNews,
} from './content-model.js';
import { bdLabel } from './form-model.js';

/** A website form opens in a pop-up on the same page (js/public/form-popup.js), or on form.html without JavaScript. */
export const formHref = (id) => `form.html?id=${encodeURIComponent(id)}`;
const formLinkAttrs = (id) => `href="${formHref(id)}" data-form="${h(id)}"`;

/** Links every mention of Shumsul Arefin (in already escaped text) to his website. */
export const PROFILE_URL = 'https://shumsul-arefin.web.app';
export const linkNames = (html) =>
  String(html).replace(
    /Shumsul Arefin/gi,
    (name) => `<a class="name-link" href="${PROFILE_URL}" target="_blank" rel="noopener">${name}</a>`,
  );

let imageManifest = {};
let bakedMedia = {};
let bakedEvents = null;

/**
 * manifest: responsive variants for bundled images (data/image-manifest.json)
 * media: uploaded image reference -> baked file path (media:<id> -> media/<id>.jpg)
 * events: IDs that have their own static page (event-<id>.html)
 */
export function configureRender({ manifest, media, events } = {}) {
  if (manifest) imageManifest = manifest;
  if (media) bakedMedia = media;
  if (events) bakedEvents = new Set(events);
}

export const latestYear = (data) => Math.max(2024, ...data.events.map((e) => Number(e.date.slice(0, 4))));

export const eventHref = (e) =>
  !bakedEvents || bakedEvents.has(e.id) ? `event-${e.id}.html` : `event.html?id=${encodeURIComponent(e.id)}`;
export const eventsHref = (year, type = 'all') => `activities.html?year=${year}&type=${type}`;
export const teamHref = (year) => (year === 'founders' ? 'team.html' : `team.html?year=${year}`);

export const dateLabel = (value) =>
  new Date(value + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const timeLabel = (iso) => new Date(iso).toLocaleString('en-GB', { timeZone: TIMEZONE, hour: 'numeric', minute: '2-digit', hour12: true });

/** "12 March 2026" or "12 March 2026 – 14 March 2026" for multi-day events. */
export function eventDateLabel(e) {
  const end = e.endsAt
    ? validDate(e.endsAt)
      ? e.endsAt
      : new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date(e.endsAt))
    : e.date;
  return dateLabel(e.date) + (end !== e.date ? ' – ' + dateLabel(end) : '');
}

function imageSource(src) {
  if (src?.startsWith('media:')) return bakedMedia[src] ? { src: bakedMedia[src] } : null;
  const variants = imageManifest[src];
  const image = variants?.[Math.min(1, variants.length - 1)];
  return { src: image?.src || src, variants, width: image?.width, height: image?.height };
}

export function photo(src, alt, cls = '') {
  if (!src) return '<div class="member-placeholder" aria-hidden="true">ACS</div>';
  const image = imageSource(src);
  // Uploaded images not yet baked into the site are fetched by js/public/media.js.
  if (!image)
    return `<img class="${cls}" data-media="${h(src)}" src="images/brand/acs-symbol.png" alt="${h(alt)}" loading="lazy" decoding="async" width="600" height="600">`;
  const srcset = image.variants
    ? ` srcset="${[...new Map(image.variants.map((v) => [v.width, v])).values()].map((v) => `${h(v.src)} ${v.width}w`).join(', ')}" sizes="(max-width: 600px) 100vw, 600px"`
    : '';
  return `<img class="${cls}" src="${h(image.src)}"${srcset} alt="${h(alt)}" loading="lazy" decoding="async" width="${image.width || 600}" height="${image.height || 600}">`;
}

function pagination(items, selected, url, label) {
  const index = items.indexOf(selected);
  const previous =
    index > 0
      ? `<a rel="prev" href="${url(items[index - 1])}">← <span class="pager-word">Previous</span></a>`
      : '<span aria-disabled="true">← <span class="pager-word">Previous</span></span>';
  const next =
    index < items.length - 1
      ? `<a rel="next" href="${url(items[index + 1])}"><span class="pager-word">Next</span> →</a>`
      : '<span aria-disabled="true"><span class="pager-word">Next</span> →</span>';
  const links = items
    .map(
      (item) =>
        `<a href="${url(item)}"${item === selected ? ' aria-current="page"' : ''}>${item === 'founders' ? 'Founding members' : item}</a>`,
    )
    .join('');
  return `<nav class="year-pagination" aria-label="${label}">${previous}${links}${next}</nav>`;
}

export function eventYears(data, extra) {
  return [...new Set([2024, 2025, 2026, ...(extra ? [extra] : []), ...data.events.map((e) => Number(e.date.slice(0, 4)))])].sort();
}

export function renderEvents(data, options = {}) {
  const year = Number(/^20\d{2}$/.test(String(options.year)) ? options.year : latestYear(data));
  const type = Object.hasOwn(categories, options.type) ? options.type : 'all';
  const selected = data.events
    .filter((e) => Number(e.date.slice(0, 4)) === year && (type === 'all' || e.category === type))
    .sort((a, b) => b.date.localeCompare(a.date));
  const tabs = Object.entries(categories)
    .map(([key, label]) => `<a href="${eventsHref(year, key)}"${key === type ? ' aria-current="page"' : ''}>${label}</a>`)
    .join('');
  const cards = selected
    .map(
      (e) =>
        `<a class="event-card" href="${eventHref(e)}" data-event="${h(e.id)}">${photo(e.image, e.title)}<div class="event-card-overlay"><span class="event-kind">${categories[e.category]}</span><h2>${h(e.title)}</h2><time datetime="${e.date}">${eventDateLabel(e)}</time><span class="card-arrow" aria-hidden="true">↗</span></div></a>`,
    )
    .join('');
  const results = selected.length
    ? `<div class="event-grid">${cards}</div>`
    : '<div class="empty-state"><h2>Events will be added soon</h2><p>No events have been published in this category for this year.</p><a href="activities.html">View all events →</a></div>';
  return `<section class="archive" data-year="${year}" data-type="${type}"><div class="archive-heading"><h6>OUR WORKS AND ACTIVITIES</h6><h1 data-text="ACTIVITY">Our Events</h1></div><nav class="category-tabs" aria-label="Event categories">${tabs}</nav><div class="archive-meta"><h2>${year} <span>/ ${categories[type]}</span></h2><span>${selected.length} ${selected.length === 1 ? 'event' : 'events'}</span></div>${results}${pagination(eventYears(data, year), year, (y) => eventsHref(y, type), 'Event years')}</section>`;
}

/**
 * A coverage link to a YouTube or Facebook video becomes a player on the event page.
 * Returns the embed address, or '' for any other link (which stays a plain link).
 */
export function videoEmbedURL(link) {
  let url;
  try {
    url = new URL(link);
  } catch {
    return '';
  }
  const host = url.hostname.replace(/^(www\.|m\.|web\.)/, '');
  const youtubeId = (id) => (/^[A-Za-z0-9_-]{6,20}$/.test(id || '') ? `https://www.youtube-nocookie.com/embed/${id}` : '');
  if (host === 'youtu.be') return youtubeId(url.pathname.slice(1));
  if (host === 'youtube.com' || host === 'music.youtube.com') {
    if (url.pathname === '/watch') return youtubeId(url.searchParams.get('v'));
    const [, kind, id] = url.pathname.split('/');
    if (['shorts', 'live', 'embed'].includes(kind)) return youtubeId(id);
    return '';
  }
  const facebookVideo =
    host === 'fb.watch' ||
    (host === 'facebook.com' &&
      (/\/(videos|reel|reels)\//.test(url.pathname) || /^\/share\/(v|r)\//.test(url.pathname) || url.pathname.startsWith('/watch')));
  if (facebookVideo) return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(link)}&show_text=false&width=1280`;
  return '';
}

function eventVideo(e) {
  const link = e.videoUrl || e.sourceUrl;
  const src = link && !e.hideVideo ? videoEmbedURL(link) : '';
  if (!src) return '';
  return `<section class="event-video" aria-label="Event video"><h2>Watch the event</h2><div class="event-video-frame"><iframe src="${h(src)}" title="${h(e.title)}: event video" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div></section>`;
}

// Photos of the coverage post: a grid of equal tiles (first 8, the last one says how many more);
// any tile opens the whole album (js/public/gallery.js), or the photo itself without JavaScript.
const GRID_PHOTOS = 8;
function eventPhotos(e) {
  if (e.hidePhotos || !e.photos?.length) return '';
  const more = e.photos.length - GRID_PHOTOS;
  const tiles = e.photos
    .map((src, i) => {
      const hidden = i >= GRID_PHOTOS ? ' hidden' : '';
      const badge = i === GRID_PHOTOS - 1 && more > 0 ? `<span class="event-photo-more">+${more}</span>` : '';
      return `<a class="event-photo" href="${h(src)}" data-gallery-index="${i}"${hidden}><img src="${h(src)}" alt="${h(e.title)}: photo ${i + 1} of ${e.photos.length}" width="800" height="600" loading="lazy" decoding="async">${badge}</a>`;
    })
    .join('');
  return `<section class="event-photos" aria-label="Event photos" data-gallery><div class="event-photos-head"><h2>Event photos</h2><span>${e.photos.length} ${e.photos.length === 1 ? 'photo' : 'photos'}</span></div><div class="event-photo-grid">${tiles}</div></section>`;
}

export function renderEvent(data, id, { now = new Date(), inlineCalendar = false } = {}) {
  const e = data.events.find((item) => item.id === id);
  if (!e)
    return '<section class="archive"><h1>Event not found</h1><p>This event has not been published, or its address has changed.</p><a href="activities.html">Back to events</a></section>';
  const forms = data.forms || [];
  const regState = linkedFormState(forms, e.registrationFormId, now);
  const regForm = findForm(forms, e.registrationFormId);
  let registration;
  if (eventPast(e, now)) registration = '<p class="event-status">This event has ended. Registration is closed.</p>';
  else if (regState === 'open')
    registration = `<div class="event-register"><a class="button" ${formLinkAttrs(regForm.id)}>Register now</a>${regForm.closesAt ? `<p class="event-status">Registration closes ${h(bdLabel(regForm.closesAt))}.</p>` : ''}</div>`;
  else if (regState === 'scheduled') registration = `<p class="event-status">Registration opens ${h(bdLabel(regForm.opensAt))}.</p>`;
  else if (regState !== 'none') registration = '<p class="event-status">Registration is closed.</p>';
  else
    registration =
      eventOpen(e, now) && e.registrationUrl
        ? `<a class="button" href="${h(e.registrationUrl)}" target="_blank" rel="noopener noreferrer">Register for this event ↗</a>`
        : e.registrationStatus === 'closed'
          ? '<p class="event-status">Registration is closed.</p>'
          : e.registrationStatus === 'open'
            ? '<p class="event-status">Registration details will be announced here.</p>'
            : '';
  const survey =
    linkedFormState(forms, e.surveyFormId, now) === 'open'
      ? `<a class="button secondary" ${formLinkAttrs(e.surveyFormId)}>Share your feedback</a>`
      : '';
  const timed = e.startsAt && !validDate(e.startsAt);
  const times = timed
    ? `<dt>Time (Bangladesh)</dt><dd>${h(timeLabel(e.startsAt))} – ${h(timeLabel(e.endsAt))} (UTC+06:00)</dd>`
    : '<dt>Time</dt><dd>All day. Calendar links save this as an all-day event.</dd>';
  const ics = inlineCalendar
    ? `<a class="button secondary" href="data:text/calendar;charset=utf-8,${h(encodeURIComponent(calendarICS(e)))}" download="${e.id}.ics">Download calendar (.ics)</a>`
    : `<a class="button secondary" href="calendar/${e.id}.ics" download>Download calendar (.ics)</a>`;
  const year = e.date.slice(0, 4);
  return `<article class="event-detail"><a class="back-link" href="${eventsHref(year, e.category)}">← Back to ${categories[e.category].toLowerCase()} events</a><p class="eyebrow">${categories[e.category]} / ${eventDateLabel(e)}</p><h1>${h(e.title)}</h1><div class="detail-grid">${photo(e.image, e.title, 'detail-image')}<div><h2>About the event</h2><p>${linkNames(h(e.description))}</p><dl><dt>Date</dt><dd><time datetime="${e.date}">${eventDateLabel(e)}</time></dd>${times}<dt>Location</dt><dd>${h(e.location || 'Location not published.')}</dd><dt>Organized by</dt><dd>ACS Student Chapter, GSTU</dd></dl>${registration}<div class="event-actions">${survey}<a class="button secondary" href="${h(googleCalendarURL(e))}" target="_blank" rel="noopener noreferrer">Google Calendar ↗</a>${ics}</div>${e.sourceUrl ? `<a href="${h(e.sourceUrl)}" target="_blank" rel="noopener noreferrer">View event coverage ↗</a>` : ''}</div></div>${eventVideo(e)}${eventPhotos(e)}</article>`;
}

function members(list, cls = '', showRoles = true) {
  const cards = list
    .map(
      (m) =>
        `<article class="member-card">${photo(m.image, m.name)}<div>${showRoles ? `<p>${h(m.role)}</p>` : ''}<h2>${linkNames(h(m.name))}</h2></div></article>`,
    )
    .join('');
  return `<div class="member-grid ${cls}">${cards}</div>`;
}

export function teamYears(data, extra) {
  return ['founders', ...new Set([...Object.keys(data.team.committees), ...(extra && extra !== 'founders' ? [extra] : [])].sort())];
}

export function renderTeam(data, { year = 'founders' } = {}) {
  const founding = year === 'founders';
  const record = founding ? { members: data.team.founders, roster: [] } : data.team.committees[year] || { members: [], roster: [] };
  const title = founding ? 'Founding Members' : `Executive Committee · ${year}`;
  // The founding officers served as the 2024 committee.
  const list =
    !founding && String(year) === '2024' && !record.members.length
      ? data.team.founders.filter((m) => !/advisor|consultant/i.test(m.role))
      : record.members;
  const grid = founding
    ? members(
        list.filter((m) => /advisor/i.test(m.role)),
        'founder-advisors',
      ) +
      members(
        list.filter((m) => /consultant/i.test(m.role)),
        'founder-consultants',
      ) +
      members(
        list.filter((m) => !/advisor|consultant/i.test(m.role)),
        '',
        false,
      )
    : members(list);
  const tier = (key, label) => {
    const names = record.roster.filter((m) => m.tier === key);
    return `<h3>${label} members</h3>${names.length ? `<ul>${names.map((m) => `<li>${linkNames(h(m.name))}</li>`).join('')}</ul>` : '<p>No confirmed members for this year yet. The chapter will add its annual roster here.</p>'}`;
  };
  const roster = founding
    ? ''
    : `<details class="roster"><summary>Show chapter roster · ${year}<span>General &amp; premium members</span></summary><div class="roster-body">${tier('general', 'General')}${tier('premium', 'Premium')}</div></details>`;
  return `<section class="archive" data-year="${year}"><div class="archive-heading"><h6>OUR AMAZING FULLY SKILLED TEAM MEMBERS</h6><h1 data-text="Team">${title}</h1></div>${list.length ? grid : '<p class="empty-state">Committee details will be published here.</p>'}${roster}${pagination(teamYears(data, year), year, teamHref, 'Team archive years')}</section>`;
}

export function renderMembership(data, now = new Date()) {
  const m = data.membership;
  const forms = data.forms || [];
  // Join and renew through the website forms chosen in the Chapter Editor; without an open form, say so.
  const action = (formId, label, closed, cls) => {
    const state = linkedFormState(forms, formId, now);
    const form = findForm(forms, formId);
    if (state === 'open')
      return {
        button: `<a class="btn ${cls}" ${formLinkAttrs(formId)}>${label}</a>`,
        note: form.closesAt ? `Open until ${bdLabel(form.closesAt)}.` : '',
      };
    if (state === 'scheduled') return { button: '', note: `${closed.replace(' is closed now.', '')} opens ${bdLabel(form.opensAt)}.` };
    return { button: '', note: closed };
  };
  const join = action(m.applicationFormId, 'Join now →', 'Membership registration for this year is closed now.', 'btn-primary');
  const renew = action(m.renewalFormId, 'Renew membership', 'Membership renewal is closed now.', 'btn-outline');
  const notes = [join.note, renew.note].filter(Boolean);
  const benefits = m.benefits.map((v) => `<li>${h(v)}</li>`).join('');
  return `<div class="wrap membership-grid"><div class="membership-pitch"><p class="eyebrow">Join us now</p><h2>Start your journey with us</h2><p class="lead">${h(m.intro)}</p>${join.button || renew.button ? `<div class="membership-actions">${join.button}${renew.button}</div>` : ''}${notes.length ? `<ul class="membership-notes">${notes.map((n) => `<li>${h(n)}</li>`).join('')}</ul>` : ''}</div><div class="membership-card"><h3>Why join?</h3><ul class="check-list">${benefits}</ul><details class="home-membership-details"><summary>Membership benefits &amp; renewal</summary><div><h4>Who can join?</h4><p>${h(m.eligibility)}</p><h4>General membership</h4><p>${h(m.general)}</p><h4>Premium membership</h4><p>${h(m.premium)}</p><h4>Renew your membership</h4><p>${h(m.renewal)}</p></div></details></div></div>`;
}

/** Homepage: the next upcoming events, then the most recent ones (three cards). */
export function renderEventHighlights(data, now = new Date()) {
  const upcoming = data.events.filter((e) => !eventPast(e, now)).sort((a, b) => a.date.localeCompare(b.date));
  const recent = data.events.filter((e) => eventPast(e, now)).sort((a, b) => b.date.localeCompare(a.date));
  const list = [...upcoming, ...recent].slice(0, 3);
  if (!list.length) return '<p class="empty-state">Events will be announced here soon.</p>';
  return `<div class="highlight-grid">${list
    .map(
      (e) =>
        `<a class="highlight-card" href="${eventHref(e)}" data-reveal><div class="highlight-media">${photo(e.image, e.title)}<span class="chip">${eventPast(e, now) ? 'Past event' : eventOpen(e, now, data.forms) ? 'Registration open' : 'Upcoming'}</span></div><div class="highlight-body"><span class="event-kind">${categories[e.category]}</span><h3>${h(e.title)}</h3><time datetime="${e.date}">${eventDateLabel(e)}</time><span class="arrow-circle" aria-hidden="true">→</span></div></a>`,
    )
    .join('')}</div>`;
}

/** The pill button on the homepage hero for the next event open for registration. */
/** Photos for the homepage collage: the editable homepage images first, then member and event photos. */
/** Hero slides: homepage images added in the Chapter Editor (the bundled default artwork is left out). */
export function heroSlides(data) {
  return [...new Set(data.homepage.images.filter((src) => src && !/slide01/.test(src)))];
}

export function renderHeroSlides(data) {
  return heroSlides(data)
    .map((src, i) => {
      const image = photo(src, '', i ? '' : 'active').replace(/ sizes="[^"]*"/, ' sizes="100vw"');
      return i ? image : image.replace('loading="lazy"', 'loading="eager" fetchpriority="high"');
    })
    .join('');
}

/**
 * The pill buttons on the homepage hero, shown only while they apply: the next event open for
 * registration, and member registration while the linked membership form accepts answers.
 */
export function renderOpenEvent(data, now = new Date()) {
  const pills = [];
  const open = data.events.filter((e) => eventOpen(e, now, data.forms)).sort((a, b) => a.date.localeCompare(b.date));
  if (open.length) {
    const e = open[0];
    pills.push(
      `<a class="hero-registration" href="${eventHref(e)}" title="${h(e.title)}" aria-label="Explore ${h(e.title)} and register"><span>Explore new event &amp; register</span><span class="registration-arrow" aria-hidden="true">→</span></a>`,
    );
  }
  const memberForm = data.membership?.applicationFormId;
  if (memberForm && linkedFormState(data.forms, memberForm, now) === 'open')
    pills.push(
      `<a class="hero-registration hero-registration-member" ${formLinkAttrs(memberForm)}><span>Member registration is open</span><span class="registration-arrow" aria-hidden="true">→</span></a>`,
    );
  return pills.join('');
}

// ------------------------------------------------------------------ news (Facebook Page posts)

const newsDate = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, day: 'numeric', month: 'long', year: 'numeric' });
/** The first line of a post is its headline; the rest is the story. */
function splitPost(text) {
  const lines = text.split(/\r?\n/);
  const index = lines.findIndex((l) => l.trim());
  const first = index < 0 ? '' : lines[index].trim();
  if (first.length > 140) return { headline: first.slice(0, 137).replace(/\s+\S*$/, '') + '…', rest: text.trim() };
  return {
    headline: first,
    rest: lines
      .slice(index + 1)
      .join('\n')
      .trim(),
  };
}

/** One post: a fixed-size photo, the date and the first line. The whole card opens the post on Facebook. */
function newsCard(post) {
  const { headline } = splitPost(post.text);
  const media = post.image
    ? `<div class="news-media"><img src="${h(post.image)}" alt="" width="800" height="500" loading="lazy" decoding="async"></div>`
    : '<div class="news-media news-media-empty" aria-hidden="true"><span>ACS</span></div>';
  return `<a class="news-card" id="post-${h(post.id)}" href="${h(post.link)}" target="_blank" rel="noopener">${media}<div class="news-body"><time datetime="${h(post.createdAt)}">${newsDate.format(new Date(post.createdAt))}</time><h3>${h(headline || 'Chapter update')}</h3><span class="news-link">View on Facebook ↗</span></div></a>`;
}

/** The News page: every visible post, newest first. */
export function renderNews(data) {
  const posts = visibleNews(data);
  const list = posts.length
    ? `<div class="news-grid">${posts.map((p) => newsCard(p)).join('')}</div>`
    : '<div class="empty-state"><h2>News will appear here soon</h2><p>Posts from our Facebook Page show up here automatically.</p><a href="https://www.facebook.com/acs.gstu" target="_blank" rel="noopener">Visit our Facebook Page ↗</a></div>';
  return `<section class="archive news-archive"><div class="archive-heading"><h6>FROM OUR FACEBOOK PAGE</h6><h1 data-text="NEWS">News &amp; updates</h1></div>${list}</section>`;
}

/** Homepage: the three latest posts, or nothing when there are none. */
export function renderNewsHighlights(data) {
  const posts = visibleNews(data).slice(0, 3);
  if (!posts.length) return '';
  return `<div class="wrap"><div class="section-head row-head" data-reveal><div><p class="eyebrow">From our Facebook Page</p><h2>Latest news</h2></div><a class="btn btn-outline" href="news.html">All news →</a></div><div class="news-grid news-grid-home">${posts.map((p) => newsCard(p)).join('')}</div></div>`;
}
