// Keeps baked pages current: renders ?year=/?type=/?id= views from the baked content and swaps in
// content published after the last build. Filters change in place, without a page reload.
import { contentSignature } from '../lib/content-model.js';
import { renderEvents, renderEvent, renderTeam, renderMembership, renderNews, renderNewsHighlights } from '../lib/content-render.js';
import { bakedContent, freshContent, renderReady } from './site-data.js';

const SITE = 'ACS Student Chapter, GSTU';

function viewOptions(root, url = new URL(location.href)) {
  const q = url.searchParams;
  return {
    year: q.get('year') || undefined,
    type: q.get('type') || undefined,
    id: q.get('id') || root.dataset.event || '',
  };
}

function render(view, data, options) {
  if (view === 'events') return renderEvents(data, options);
  if (view === 'team') return renderTeam(data, { year: /^(founders|20\d{2})$/.test(options.year || '') ? options.year : 'founders' });
  if (view === 'membership') return renderMembership(data);
  if (view === 'news') return renderNews(data);
  if (view === 'news-highlights') return renderNewsHighlights(data);
  return renderEvent(data, options.id, { inlineCalendar: true });
}

function sectionSignature(view, data, options) {
  const part =
    view === 'membership'
      ? data.membership
      : view === 'team'
        ? data.team
        : view === 'news' || view === 'news-highlights'
          ? [data.news, data.newsHidden]
          : view === 'event'
            ? data.events.find((e) => e.id === options.id)
            : data.events;
  // Linked forms change what the event and membership buttons say.
  return contentSignature([part ?? null, data.forms ?? null, options]);
}

/** Replaces the view once its images are decoded, so cards never flash or jump. */
async function swap(root, html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  await Promise.all(
    [...template.content.querySelectorAll('img:not([data-media])')].slice(0, 12).map(async (img) => {
      img.loading = 'eager';
      try {
        await img.decode();
      } catch {
        /* A failed image keeps its reserved square. */
      }
    }),
  );
  const open = [...root.querySelectorAll('details[open] summary')].map((el) => el.textContent);
  root.replaceChildren(template.content);
  for (const detail of root.querySelectorAll('details'))
    if (open.includes(detail.querySelector('summary')?.textContent)) detail.open = true;
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** After a year or page change, bring the new list into view from its start (never a random spot). */
function revealTop(root) {
  const target = root.querySelector('.archive-meta, .archive-heading') || root;
  if (target.getBoundingClientRect().top >= 80 && target.getBoundingClientRect().top < innerHeight / 2) return;
  target.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
}

export function setupLiveContent() {
  const roots = [...document.querySelectorAll('#editable-content')];
  if (!roots.length) return;
  let data = null;
  let interacted = false;
  for (const type of ['pointerdown', 'focusin', 'touchstart'])
    document.addEventListener(type, () => (interacted = true), { passive: true, once: true });

  async function paint(root, content, url, { quiet = false } = {}) {
    const view = root.dataset.view;
    const options = viewOptions(root, url);
    const signature = sectionSignature(view, content, options);
    if (root.dataset.signature === signature) return;
    await swap(root, render(view, content, options));
    root.dataset.signature = signature;
    if (view === 'event' && !quiet)
      document.title = `${content.events.find((e) => e.id === options.id)?.title || 'Event not found'} | ${SITE}`;
  }

  async function start() {
    await renderReady();
    const needsQuery =
      roots.some((root) => ['events', 'team'].includes(root.dataset.view) && location.search) ||
      roots.some((r) => r.dataset.view === 'event' && !r.dataset.event);
    const baked = await bakedContent();
    for (const root of roots) root.dataset.signature = sectionSignature(root.dataset.view, baked, needsQuery ? {} : viewOptions(root));
    data = baked;
    if (needsQuery) for (const root of roots) await paint(root, data, new URL(location.href));
    const latest = await freshContent();
    if (!latest) return;
    // Facebook posts come with the build; the database only says which ones are hidden.
    const fresh = { ...latest, news: baked.news };
    data = fresh;
    window.dispatchEvent(new CustomEvent('chapter-content', { detail: fresh }));
    if (!interacted) {
      for (const root of roots) await paint(root, data, new URL(location.href));
      return;
    }
    // Do not move content under someone who is already reading or clicking.
    const notice = document.createElement('aside');
    notice.className = 'content-update-notice';
    notice.setAttribute('role', 'status');
    notice.innerHTML = '<span>Updated chapter information is available.</span> <button type="button" class="button">Show updates</button>';
    notice.querySelector('button').addEventListener('click', async () => {
      notice.remove();
      for (const root of roots) await paint(root, data, new URL(location.href));
    });
    document.body.append(notice);
  }

  // Category, year and team links update the view in place.
  for (const root of roots.filter((r) => ['events', 'team'].includes(r.dataset.view))) {
    root.addEventListener('click', async (event) => {
      const link = event.target.closest('.category-tabs a, .year-pagination a, .empty-state a');
      const moves = !!link?.closest('.year-pagination, .empty-state');
      if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const url = new URL(link.href);
      try {
        history.pushState(null, '', url);
        await renderReady();
        await paint(root, data || (await bakedContent()), url, { quiet: true });
        if (moves) revealTop(root);
        // Keep keyboard focus on the same control after the content is replaced.
        root.querySelector(`a[href="${link.getAttribute('href')}"]`)?.focus({ preventScroll: true });
      } catch {
        location.assign(url.href);
      }
    });
  }
  window.addEventListener('popstate', async () => {
    for (const root of roots) await paint(root, data || (await bakedContent()), new URL(location.href), { quiet: true });
  });

  start().catch(() => {
    /* The baked page stays usable if anything here fails. */
  });
}
