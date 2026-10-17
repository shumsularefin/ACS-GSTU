import { formSummaries } from '../form-select.js';
import { h, busy, when } from '../ui.js';
import { roleInfo } from '../permissions.js';
import { eventOpen, eventPast } from '../../lib/content-model.js';
import { eventDateLabel } from '../../lib/content-render.js';
import { currentReportYear, fiscalYear } from '../../lib/annual-report.js';

export const overviewView = {
  id: 'overview',
  title: 'Overview',
  icon: '◎',
  allowed: (p) => p.editor,
  render(root, app) {
    const { perms, data, drafts } = app;
    const events = data.events.map((e) => e.value);
    const open = events.filter((e) => eventOpen(e, new Date(), formSummaries(app)));
    const upcoming = events.filter((e) => !eventPast(e)).sort((a, b) => a.date.localeCompare(b.date));
    const names = drafts.names();
    const actions = [
      perms.events && ['events/new', 'Add an event', 'Dates, registration link and photo.'],
      perms.reports && [
        'reports',
        'Create the annual report',
        `The ${fiscalYear(currentReportYear()).label} report is due 31 May ${currentReportYear()}.`,
      ],
      perms.homepage && ['homepage', 'Change homepage images', 'Upload or reorder the hero slideshow.'],
      perms.certificates && ['certificates', 'Issue certificates', 'One recipient or a participant spreadsheet.'],
      perms.team && ['team', 'Update team & rosters', 'Committees, photos and member imports.'],
      perms.membership && ['membership', 'Edit membership information', 'Benefits, fees and renewal links.'],
      perms.editors && ['editors', 'Manage editors', 'Give or remove dashboard access.'],
    ].filter(Boolean);
    root.innerHTML = `
      <section class="ed-card ed-welcome">
        <div><p class="ed-eyebrow">Signed in as ${h(roleInfo[app.role].label)}</p><h3>Welcome, ${h(app.user.displayName ? app.user.displayName.split(' ')[0] : app.user.email.split('@')[0])}</h3><p>${h(roleInfo[app.role].summary)}</p></div>
        <ol class="ed-howto"><li><strong>Edit</strong> a section. Your changes are saved as a draft in this browser automatically.</li><li><strong>Publish</strong> the section to put it on the website. Each section publishes on its own.</li></ol>
      </section>
      ${
        names.length
          ? `<section class="ed-card ed-card-attention"><div class="ed-card-head"><h3>Unpublished drafts</h3><button type="button" class="ed-btn ed-btn-primary" data-publish-all>${names.length > 1 ? `Publish all (${names.length})` : 'Publish'}</button></div><ul class="ed-draft-list">${names
              .map(
                (n) =>
                  `<li><div><strong>${h(app.draftLabel(n))}</strong><small>Saved ${h(when(new Date(drafts.get(n).savedAt)))}</small></div><div class="ed-actions"><a class="ed-btn ed-btn-quiet ed-btn-small" href="#${app.draftView(n).map(encodeURIComponent).join('/')}">Open</a><button type="button" class="ed-btn ed-btn-small" data-publish-draft="${h(n)}">Publish</button></div></li>`,
              )
              .join('')}</ul></section>`
          : ''
      }
      <section class="ed-quick">${actions.map(([href, title, text]) => `<a class="ed-card ed-quick-card" href="#${href}"><strong>${h(title)}</strong><span>${h(text)}</span></a>`).join('')}</section>
      <div class="ed-columns">
        <section class="ed-card"><h3>Open for registration</h3>${
          open.length
            ? `<ul class="ed-list">${open.map((e) => `<li><a href="#events/${encodeURIComponent(e.id)}">${h(e.title)}</a><small>${h(eventDateLabel(e))}${e.registrationUrl || e.registrationFormId ? '' : ' · no registration form yet'}</small></li>`).join('')}</ul><p class="ed-muted">The first one is promoted on the homepage with the “Explore new event &amp; register” button.</p>`
            : '<p class="ed-muted">No event is open for registration. Set an event’s registration status to Open to promote it on the homepage.</p>'
        }</section>
        <section class="ed-card"><h3>Coming up</h3>${
          upcoming.length
            ? `<ul class="ed-list">${upcoming
                .slice(0, 5)
                .map(
                  (e) => `<li><a href="#events/${encodeURIComponent(e.id)}">${h(e.title)}</a><small>${h(eventDateLabel(e))}</small></li>`,
                )
                .join('')}</ul>`
            : '<p class="ed-muted">No upcoming events are published.</p>'
        }</section>
      </div>
      <section class="ed-card"><h3>How publishing reaches the website</h3><p>Published changes appear for visitors right away. The site is also rebuilt automatically within about 15 minutes, so search engines and link previews pick them up. Website revision: <strong>${h(data.revision)}</strong>.</p></section>`;
    root
      .querySelector('[data-publish-all]')
      ?.addEventListener('click', (e) => busy(e.currentTarget, 'Publishing…', () => app.publishAll()));
    root.addEventListener('click', (e) => {
      const button = e.target.closest('[data-publish-draft]');
      if (button) busy(button, 'Publishing…', () => app.publish(button.dataset.publishDraft));
    });
  },
};
