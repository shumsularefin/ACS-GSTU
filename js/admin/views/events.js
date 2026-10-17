import { h, $, $$, busy, toast, confirmDialog, openDialog, formValues, fillForm, field, select, slug } from '../ui.js';
import { statusHTML, wireStatus, refreshStatus, autosave, showProblem, empty } from '../section.js';
import { imageFieldHTML, wireImageFields } from '../image-picker.js';
import { canEditEvent } from '../permissions.js';
import { importWizard } from '../import-wizard.js';
import { formSelect, formSummaries, keepMissing } from '../form-select.js';
import { categories, eventFormValues, eventOpen, eventPast, normalizeEvent } from '../../lib/content-model.js';
import { renderEvent, eventDateLabel } from '../../lib/content-render.js';
import { resolveImage } from '../../public/media.js';

const FORM_KEYS = [
  'id',
  'title',
  'category',
  'date',
  'endDate',
  'timed',
  'startTime',
  'endTime',
  'location',
  'image',
  'description',
  'registrationStatus',
  'registrationUrl',
  'registrationFormId',
  'surveyFormId',
  'sourceUrl',
  'showVideo',
  'showPhotos',
];
const BOOLEANS = ['timed', 'showVideo', 'showPhotos'];
const pick = (v) => Object.fromEntries(FORM_KEYS.map((k) => [k, BOOLEANS.includes(k) ? !!v[k] : String(v[k] ?? '')]));
export const formFromEvent = (e) => {
  const v = eventFormValues(e);
  return pick({ ...v, timed: !!v.startTime });
};
const blank = () => pick({ category: 'outreach', registrationStatus: 'unpublished', date: '', timed: false, showVideo: true, showPhotos: true });
const toEvent = (v) => normalizeEvent({ ...v, startTime: v.timed ? v.startTime : '', endTime: v.timed ? v.endTime : '' });

function badge(e, forms) {
  if (eventOpen(e, new Date(), forms)) return '<span class="ed-tag ed-tag-open">Open</span>';
  if (eventPast(e)) return '<span class="ed-tag">Past</span>';
  return '<span class="ed-tag ed-tag-new">Upcoming</span>';
}

export const eventsView = {
  id: 'events',
  title: 'Events',
  icon: '▦',
  allowed: (p) => p.events,
  render(root, app, [selected = '']) {
    const entries = [...app.data.events].sort((a, b) => b.value.date.localeCompare(a.value.date));
    const years = [...new Set(entries.map((e) => e.value.date.slice(0, 4)))];
    const newDraft = app.drafts.get('event:new');
    const forms = formSummaries(app);
    root.innerHTML = `
      <div class="ed-split${selected ? ' ed-split-detail' : ''}">
        <section class="ed-card ed-list-panel" aria-label="All events">
          <div class="ed-card-head"><h3>All events <span class="ed-count">${entries.length}</span></h3><a class="ed-btn ed-btn-primary ed-btn-small" href="#events/new">+ New event</a></div>
          <div class="ed-filters"><label class="ed-field"><span class="ed-label">Search</span><input type="search" data-search placeholder="Title or location" data-ignore></label>
          <label class="ed-field"><span class="ed-label">Year</span><select data-year data-ignore><option value="">All years</option>${years.map((y) => `<option>${y}</option>`).join('')}</select></label></div>
          <ul class="ed-items" data-items>
            ${newDraft ? `<li><a href="#events/new"${selected === 'new' ? ' aria-current="true"' : ''}><strong>${h(newDraft.value.title || 'New event')}</strong><small>Draft · not published</small></a></li>` : ''}
            ${entries
              .map((entry) => {
                const e = entry.value;
                const draft = app.drafts.has(`event:${e.id}`);
                return `<li data-text="${h((e.title + ' ' + e.location).toLowerCase())}" data-year="${e.date.slice(0, 4)}"><a href="#events/${encodeURIComponent(e.id)}"${selected === e.id ? ' aria-current="true"' : ''}><strong>${h(e.title)}</strong><small>${h(eventDateLabel(e))} · ${categories[e.category]}</small><span class="ed-item-tags">${badge(e, forms)}${draft ? '<span class="ed-tag ed-tag-draft">Draft</span>' : ''}</span></a></li>`;
              })
              .join('')}
          </ul>
          ${app.perms.import ? '<button type="button" class="ed-btn ed-btn-quiet ed-btn-small" data-import>Import events from a spreadsheet</button>' : ''}
        </section>
        <section class="ed-card ed-detail-panel" data-detail aria-live="polite"></section>
      </div>`;

    const list = $('[data-items]', root);
    const filter = () => {
      const q = $('[data-search]', root).value.trim().toLowerCase();
      const y = $('[data-year]', root).value;
      for (const li of $$('li[data-text]', list)) li.hidden = (q && !li.dataset.text.includes(q)) || (y && li.dataset.year !== y);
    };
    $('[data-search]', root).addEventListener('input', filter);
    $('[data-year]', root).addEventListener('change', filter);
    $('[data-import]', root)?.addEventListener('click', () => startImport(app));

    const detail = $('[data-detail]', root);
    if (!selected) {
      detail.innerHTML = empty('Choose an event', 'Select an event to edit it, or create a new one. Registration links are optional.');
      return;
    }
    const entry = selected === 'new' ? null : app.data.events.find((e) => e.value.id === selected);
    if (selected !== 'new' && !entry && !app.drafts.has(`event:${selected}`)) {
      detail.innerHTML = empty('Event not found', 'It may have been removed. Choose another event.');
      return;
    }
    renderEditor(detail, app, entry, selected === 'new' ? 'event:new' : `event:${selected}`);
  },
};

function renderEditor(root, app, entry, name) {
  const live = entry ? formFromEvent(entry.value) : null;
  const draft = app.drafts.get(name);
  const values = draft?.value || live || blank();
  const editable = canEditEvent(app.perms, entry, app.user.uid);
  const isNew = !entry;
  root.innerHTML = `
    <a class="ed-back" href="#events">← All events</a>
    <div class="ed-card-head"><h3>${isNew ? 'New event' : h(entry.value.title)}</h3>${!isNew ? `<a class="ed-link" href="event-${encodeURIComponent(entry.value.id)}.html" target="_blank" rel="noopener">View on website ↗</a>` : ''}</div>
    ${editable ? statusHTML(app, name, { live: !isNew }) : '<p class="ed-note">You can view this event. Only its creator, chapter administrators and super-admins can change it.</p>'}
    <form class="ed-form" novalidate>
      <fieldset ${editable ? '' : 'disabled'}>
        <div class="ed-grid">
          ${field({ label: 'Event title', name: 'title', attrs: 'required maxlength="200"', wide: true })}
          ${select({ label: 'Category', name: 'category', options: Object.entries(categories).filter(([k]) => k !== 'all') })}
          ${field({ label: 'Start date', name: 'date', type: 'date', attrs: 'required' })}
          ${field({ label: 'End date', name: 'endDate', type: 'date', optional: true, hint: 'For events that run over several days. Leave blank for one day.' })}
          <label class="ed-check ed-wide"><input type="checkbox" name="timed"> Add start and end times (Bangladesh time, UTC+06:00)</label>
          <div class="ed-grid ed-wide" data-times>
            ${field({ label: 'Start time', name: 'startTime', type: 'time' })}
            ${field({ label: 'End time', name: 'endTime', type: 'time', hint: 'On the end date (or the start date for one-day events).' })}
          </div>
          ${field({ label: 'Location', name: 'location', optional: true, attrs: 'maxlength="300" placeholder="e.g. GSTU Academic Building, Room 301"', wide: true })}
          <fieldset class="ed-wide ed-subsection"><legend>Registration and feedback <em>(optional)</em></legend>
            <p class="ed-muted">Events do not need registration. To take registrations, build a form under <a href="#forms">Forms</a> and choose it here. The Register button opens it in a pop-up on the event page, and the form’s status and opening times decide when registration is open.</p>
            <div class="ed-grid">
              ${formSelect(app, { label: 'Registration form', name: 'registrationFormId', none: 'No registration form', prefer: 'event' })}
              ${formSelect(app, { label: 'Feedback or survey form', name: 'surveyFormId', none: 'No feedback form', prefer: 'feedback', hint: 'Shows a “Share your feedback” button on the event page while the form is open.' })}
            </div>
            <div class="ed-grid" data-outside>
              ${select({
                label: 'Registration without a website form',
                name: 'registrationStatus',
                options: [
                  ['unpublished', 'No registration'],
                  ['open', 'Open: details announced soon'],
                  ['closed', 'Closed'],
                ],
                hint: 'Open events are promoted on the homepage until they end.',
              })}
              ${field({ label: 'Outside registration link', name: 'registrationUrl', type: 'url', optional: true, attrs: 'placeholder="https://…"', hint: 'Only if registration happens on another website.' })}
            </div>
          </fieldset>
          ${field({ label: 'Description', name: 'description', type: 'textarea', attrs: 'required maxlength="5000" rows="6"', wide: true })}
          ${imageFieldHTML({ name: 'image', label: 'Event photo', hint: 'Square photos look best on the events page. Images are optimized automatically.' })}
          ${field({ label: 'Coverage link', name: 'sourceUrl', type: 'url', optional: true, attrs: 'placeholder="https://facebook.com/…"', hint: 'A Facebook post, album or video, or a YouTube video. Its photos and video show on the event page after the next site update (about 15 minutes).', wide: true })}
          <label class="ed-check ed-wide"><input type="checkbox" name="showVideo"> Show the video (“Watch the event”), when the coverage is a YouTube or Facebook video, or a Facebook post with a video</label>
          <label class="ed-check ed-wide"><input type="checkbox" name="showPhotos"> Show the photos (“Event photos”), when the coverage is a Facebook post with photos</label>
        </div>
        <details class="ed-advanced"${isNew ? '' : ' hidden'}><summary>Web address</summary>
          ${field({ label: 'Event ID', name: 'id', attrs: `maxlength="80" pattern="[a-z0-9]+(-[a-z0-9]+)*" ${isNew ? '' : 'readonly'}`, hint: 'Used in the event’s web address. Created from the title; it cannot change after publishing.' })}
        </details>
        <div class="ed-actions ed-form-actions">
          <button type="button" class="ed-btn" data-preview>Preview</button>
          ${!isNew && app.perms.deleteEvents ? '<button type="button" class="ed-btn ed-btn-danger-quiet" data-delete>Delete event</button>' : ''}
        </div>
      </fieldset>
    </form>`;
  const form = $('form', root);
  fillForm(form, values);
  keepMissing(form.elements.registrationFormId, values.registrationFormId);
  keepMissing(form.elements.surveyFormId, values.surveyFormId);
  // With a website form chosen, the form decides when registration is open.
  const outside = $('[data-outside]', form);
  const syncOutside = () => (outside.hidden = !!form.elements.registrationFormId.value);
  syncOutside();
  form.elements.registrationFormId.addEventListener('change', syncOutside);
  const times = $('[data-times]', form);
  const syncTimes = () => {
    times.hidden = !form.elements.timed.checked;
    for (const input of $$('input', times)) input.required = form.elements.timed.checked;
  };
  syncTimes();
  form.elements.timed.addEventListener('change', syncTimes);
  wireImageFields(form, app);
  wireStatus(root, app);
  showProblem(app, name, form);

  // New events: the ID follows the title until the editor changes it.
  let idTouched = isNew && !!values.id && values.id !== suggestId(values);
  form.elements.id.addEventListener('input', () => (idTouched = true));
  const syncId = () => {
    if (isNew && !idTouched) form.elements.id.value = suggestId(formValues(form));
  };
  form.elements.title.addEventListener('input', syncId);
  form.elements.date.addEventListener('change', syncId);

  if (editable)
    autosave(form, app, name, {
      baseRevision: entry?.revision || 0,
      read: (f) => pick(formValues(f)),
      same: (v) => (live ? JSON.stringify(v) === JSON.stringify(live) : !v.title && !v.description && !v.date),
      onSave: () => refreshStatus(root, app, name, { live: !isNew }),
    });

  $('[data-preview]', form).addEventListener('click', async () => {
    let event;
    try {
      event = toEvent(formValues(form));
    } catch (error) {
      toast(error.message, { type: 'error' });
      return;
    }
    await openDialog(
      `<h2>Preview</h2><div class="ed-dialog-body ed-preview">${renderEvent({ events: [event], forms: formSummaries(app) }, event.id, { inlineCalendar: true })}</div><div class="ed-actions"><button type="button" class="ed-btn" data-close>Close</button></div>`,
      (dialog) => {
        for (const img of $$('img[data-media]', dialog))
          resolveImage(img.dataset.media)
            .then((src) => (img.src = src))
            .catch(() => {});
        for (const a of $$('a', dialog)) a.addEventListener('click', (e) => e.preventDefault());
      },
      { wide: true },
    );
  });

  $('[data-delete]', form)?.addEventListener('click', async (e) => {
    const ok = await confirmDialog({
      title: `Delete “${entry.value.title}”?`,
      body: '<p>The event and its page are removed from the website. Certificates already issued for it stay valid. This is recorded in the activity log.</p>',
      confirm: 'Delete event',
      danger: true,
    });
    if (!ok) return;
    await busy(e.currentTarget, 'Deleting…', async () => {
      await app.cloud.deleteEvent(entry.value);
      app.drafts.remove(name);
      await app.reload();
      app.navigate('events');
      toast('Event deleted.');
    });
  });
}

const suggestId = (v) => slug(`${v.title || ''} ${v.date ? v.date.slice(0, 4) : ''}`) || '';

function startImport(app) {
  importWizard(app, {
    title: 'Import events',
    kinds: ['events'],
    context: 'Each new or changed event becomes a draft. Review the drafts, then publish them.',
    existing: () => app.data.events.map((e) => e.value),
    apply: (_, plan) => {
      for (const e of plan.added) app.drafts.set(`event:${e.id}`, formFromEvent(e), 0);
      for (const { after } of plan.updated) {
        const entry = app.data.events.find((x) => x.value.id === after.id);
        app.drafts.set(`event:${after.id}`, formFromEvent(after), entry?.revision || 0);
      }
      app.render();
      toast(`${plan.added.length + plan.updated.length} event draft(s) created. Use Publish all at the top when you are ready.`);
    },
  });
}
