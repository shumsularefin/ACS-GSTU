import { h, $, $$, busy, toast, confirmDialog, download, field, when, errorMessage } from '../ui.js';
import { ACCEPTED, LIMITS, readWorkbook, downloadTemplate } from '../spreadsheet.js';
import { importCertificates, certificateURL, validCredential, normalizeCertificate, formalTypes } from '../../lib/certificate-model.js';
import { certificateSVG, downloadCertificate } from '../../lib/certificate-render.js';
import { dateLabel } from '../../lib/content-render.js';
import { todayInBangladesh } from '../../lib/content-model.js';

const GROUPS = [
  [
    'Event certificates',
    [
      ['participant', 'Participation', 'Everyone who took part in an event.'],
      ['champion', 'Champion', 'Gold award design.'],
      ['runner-up', 'First runner-up', 'Silver award design.'],
      ['second-runner-up', 'Second runner-up', 'Bronze award design.'],
      ['achievement', 'Achievement', 'Outstanding achievement in an event.'],
    ],
  ],
  [
    'Formal recognition',
    [
      ['instructor', 'Instructor', 'Taught or led a session.'],
      ['teacher', 'Teacher', 'Educators who contributed.'],
      ['guest', 'Guest', 'Distinguished guests and speakers.'],
      ['delegate', 'Delegate', 'Delegates to an event.'],
      ['institution', 'Institution', 'Institutional support and collaboration.'],
      ['organization', 'Organization', 'Partner organizations.'],
    ],
  ],
  ['Executive recognition', [['executive', 'Executive service', 'Service as an executive member for a fiscal year. No event needed.']]],
];
const LABEL = Object.fromEntries(GROUPS.flatMap(([, items]) => items.map(([k, l]) => [k, l])));
const TABS = [
  ['issue', 'Issue certificates', () => true],
  ['find', 'Find or revoke', () => true],
  ['catalog', 'Certificate Center list', (p) => p.catalog],
  ['records', 'Issued records', (p) => p.registry],
];

// The wizard keeps its progress while you move around the dashboard (not across reloads).
let wizard = freshWizard();
function freshWizard() {
  return {
    step: 1,
    type: '',
    eventId: '',
    eventTitle: '',
    eventDate: '',
    dateIssued: todayInBangladesh(),
    term: '',
    office: '',
    citation: '',
    mode: 'single',
    single: {},
    rows: [],
    fileName: '',
    records: [],
    issued: false,
  };
}

export const certificatesView = {
  id: 'certificates',
  title: 'Certificates',
  icon: '✓',
  allowed: (p) => p.certificates,
  render(root, app, [tab = 'issue']) {
    const tabs = TABS.filter(([, , ok]) => ok(app.perms));
    if (!tabs.some(([id]) => id === tab)) tab = 'issue';
    root.innerHTML = `<nav class="ed-tabs" aria-label="Certificate tools">${tabs.map(([id, label]) => `<a href="#certificates/${id}"${id === tab ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav><div data-tab></div>`;
    const body = $('[data-tab]', root);
    ({ issue: renderIssue, find: renderFind, catalog: renderCatalog, records: renderRecords })[tab](body, app);
  },
};

// ------------------------------------------------------------------ issue wizard

const STEPS = ['Category', 'Details', 'Recipients', 'Review & issue'];

function renderIssue(root, app) {
  const w = wizard;
  const allowed = (type) => app.perms.certificateTypes(type);
  root.innerHTML = `<section class="ed-card">
    <ol class="ed-stepper">${STEPS.map((s, i) => `<li${w.step === i + 1 ? ' aria-current="step"' : ''}${w.step > i + 1 ? ' class="done"' : ''}>${s}</li>`).join('')}</ol>
    <div data-step></div></section>`;
  const step = $('[data-step]', root);
  const go = (n) => {
    w.step = n;
    renderIssue(root, app);
    root.scrollIntoView({ block: 'start' });
  };

  if (w.issued) return renderDone(step, app);

  if (w.step === 1) {
    step.innerHTML = `<h3>What kind of certificate?</h3>${GROUPS.map(
      ([group, items]) =>
        `<fieldset class="ed-choice-group"><legend>${group}</legend><div class="ed-choices">${items
          .map(
            ([key, label, text]) =>
              `<label class="ed-choice ed-choice-${key}${allowed(key) ? '' : ' ed-choice-locked'}"><input type="radio" name="type" value="${key}" ${w.type === key ? 'checked' : ''} ${allowed(key) ? '' : 'disabled'}><strong>${label}</strong><span>${allowed(key) ? text : 'Not available for your role.'}</span></label>`,
          )
          .join('')}</div></fieldset>`,
    ).join(
      '',
    )}<div class="ed-actions ed-form-actions"><button type="button" class="ed-btn ed-btn-primary" data-next ${w.type ? '' : 'disabled'}>Continue</button></div>`;
    step.addEventListener('change', (e) => {
      if (e.target.name !== 'type') return;
      w.type = e.target.value;
      w.records = [];
      $('[data-next]', step).disabled = false;
    });
    $('[data-next]', step).addEventListener('click', () => go(2));
    return;
  }

  const executive = w.type === 'executive';
  if (w.step === 2) {
    const events = app.data.events.map((e) => e.value).sort((a, b) => b.date.localeCompare(a.date));
    // Group events by year so the list stays short as the years add up.
    const years = [...new Set(events.map((e) => e.date.slice(0, 4)).filter(Boolean))];
    const picked = events.find((e) => e.id === w.eventId);
    const year = picked ? picked.date.slice(0, 4) : (w.eventYear ?? years[0] ?? '');
    const eventOptions = (y) =>
      `<option value="">Another event (type it below)</option>` +
      events
        .filter((e) => !y || e.date.startsWith(y))
        .map((e) => `<option value="${h(e.id)}"${w.eventId === e.id ? ' selected' : ''}>${h(e.title)} · ${h(dateLabel(e.date))}</option>`)
        .join('');
    step.innerHTML = `<h3>${h(LABEL[w.type])} details</h3><form class="ed-form" novalidate><div class="ed-grid">
      ${
        executive
          ? field({
              label: 'Fiscal year or service term',
              name: 'term',
              value: w.term,
              attrs: 'required maxlength="60" placeholder="e.g. 2025–2026"',
            }) +
            field({
              label: 'Office held',
              name: 'office',
              value: w.office,
              optional: true,
              attrs: 'maxlength="100" placeholder="e.g. General Secretary"',
              hint: 'Use this when everyone in the batch held the same office; otherwise put each office in the Designation column.',
            })
          : `<label class="ed-field"><span class="ed-label">Year</span><select name="eventYear" data-event-year><option value="">All years</option>${years
              .map((y) => `<option value="${y}"${year === y ? ' selected' : ''}>${y}</option>`)
              .join('')}</select></label>
            <label class="ed-field"><span class="ed-label">Event</span><select name="eventId">${eventOptions(year)}</select></label>
            <div class="ed-grid ed-wide" data-custom-event>${field({ label: 'Event title', name: 'eventTitle', value: w.eventTitle, attrs: 'maxlength="250"' })}${field({ label: 'Event date', name: 'eventDate', type: 'date', value: w.eventDate })}</div>`
      }
      ${field({ label: 'Issue date', name: 'dateIssued', type: 'date', value: w.dateIssued, attrs: 'required' })}
      ${field({ label: executive ? 'Recognition wording' : 'Citation', name: 'citation', value: w.citation, optional: true, attrs: 'maxlength="220"', hint: executive ? 'Leave blank for “In recognition of dedicated service … during fiscal year …”.' : 'A short line shown under the event, e.g. “for an outstanding poster presentation”.', wide: true })}
    </div><p class="ed-form-error" role="alert" hidden></p></form>
    <div class="ed-actions ed-form-actions"><button type="button" class="ed-btn ed-btn-quiet" data-back>Back</button><button type="button" class="ed-btn ed-btn-primary" data-next>Continue</button></div>`;
    const form = $('form', step);
    const sync = () => {
      const custom = $('[data-custom-event]', step);
      if (custom) custom.hidden = !!form.elements.eventId.value;
    };
    sync();
    form.addEventListener('change', (e) => {
      if (e.target.name === 'eventYear') {
        w.eventId = form.elements.eventId.value;
        form.elements.eventId.innerHTML = eventOptions(e.target.value);
      }
      sync();
    });
    $('[data-back]', step).addEventListener('click', () => go(1));
    $('[data-next]', step).addEventListener('click', () => {
      const v = Object.fromEntries(new FormData(form));
      Object.assign(w, v);
      const error = executive
        ? !w.term.trim() && 'Enter the fiscal year or service term.'
        : !w.eventId && !w.eventTitle.trim() && 'Choose an event or type the event title.';
      if (error || !w.dateIssued) {
        const box = $('.ed-form-error', form);
        box.textContent = error || 'Choose the issue date.';
        box.hidden = false;
        return;
      }
      w.records = [];
      go(3);
    });
    return;
  }

  if (w.step === 3) {
    step.innerHTML = `<h3>Who receives ${h(LABEL[w.type].toLowerCase())} certificates?</h3>
      <div class="ed-segmented" role="radiogroup" aria-label="Recipients"><label><input type="radio" name="mode" value="single" ${w.mode === 'single' ? 'checked' : ''}> One recipient</label><label><input type="radio" name="mode" value="batch" ${w.mode === 'batch' ? 'checked' : ''}> A list from a spreadsheet</label></div>
      <form class="ed-form" novalidate data-single ${w.mode === 'single' ? '' : 'hidden'}><div class="ed-grid">
        ${field({ label: w.type === 'institution' || w.type === 'organization' ? 'Institution or organization name' : 'Recipient name', name: 'name', value: w.single.name || '', attrs: 'required maxlength="160"', wide: true })}
        ${field({ label: 'ACS membership ID', name: 'memID', value: w.single.memID || '', optional: true, attrs: 'maxlength="80" autocomplete="off"', hint: 'Lets the recipient find the certificate in the Certificate Center. Kept private.' })}
        ${executive ? '' : field({ label: 'Designation or institution', name: 'designation', value: w.single.designation || '', optional: true, attrs: 'maxlength="160"' })}
      </div></form>
      <div data-batch ${w.mode === 'batch' ? '' : 'hidden'}>
        <p>Columns: <strong>Name</strong> (required), <strong>Membership ID</strong>, <strong>Designation</strong> and <strong>Achievement</strong> (all optional). Every row gets the ${h(LABEL[w.type].toLowerCase())} category and the details from the previous step.</p>
        <p><button type="button" class="ed-btn ed-btn-small ed-btn-quiet" data-template>Download the recipient template</button></p>
        <label class="ed-field"><span class="ed-label">Recipient spreadsheet</span><input type="file" accept="${ACCEPTED}"><small>${LIMITS} Up to 1,000 recipients. Read on this computer.</small></label>
        <p data-file-status class="ed-muted">${w.rows.length ? `${w.rows.length} recipients loaded from ${h(w.fileName)}.` : ''}</p>
      </div>
      <p class="ed-form-error" role="alert" hidden></p>
      <div class="ed-actions ed-form-actions"><button type="button" class="ed-btn ed-btn-quiet" data-back>Back</button><button type="button" class="ed-btn ed-btn-primary" data-next>Review certificates</button></div>`;
    const fail = (message) => {
      const box = $('.ed-form-error', step);
      box.textContent = message;
      box.hidden = !message;
    };
    step.addEventListener('change', (e) => {
      if (e.target.name !== 'mode') return;
      w.mode = e.target.value;
      $('[data-single]', step).hidden = w.mode !== 'single';
      $('[data-batch]', step).hidden = w.mode !== 'batch';
    });
    $('[data-template]', step).addEventListener('click', (e) =>
      busy(e.currentTarget, 'Preparing…', () => downloadTemplate('certificates')),
    );
    $('input[type="file"]', step).addEventListener('change', async (e) => {
      fail('');
      try {
        const sheets = (await readWorkbook(e.target.files[0])).filter((s) => !/^example/i.test(s.name));
        if (!sheets.length) throw Error('No recipients were found in the first worksheet.');
        w.rows = sheets[0].rows;
        w.fileName = e.target.files[0].name;
        $('[data-file-status]', step).textContent =
          `${w.rows.length} recipients loaded from ${w.fileName}${sheets.length > 1 ? ` (worksheet “${sheets[0].name}”)` : ''}.`;
      } catch (error) {
        fail(errorMessage(error));
      }
    });
    $('[data-back]', step).addEventListener('click', () => go(2));
    $('[data-next]', step).addEventListener('click', () => {
      if (w.mode === 'single') w.single = Object.fromEntries(new FormData($('[data-single]', step)));
      try {
        w.records = buildRecords(app, w);
        go(4);
      } catch (error) {
        fail(error.message);
      }
    });
    return;
  }

  // Step 4: review and issue.
  const withoutIds = w.records.filter((c) => !c.memID).length;
  step.innerHTML = `<h3>Review ${w.records.length} certificate${w.records.length === 1 ? '' : 's'}</h3>
    <ul class="ed-summary"><li><strong>${h(LABEL[w.type])}</strong> · ${h(w.records[0].event)}</li><li>Issued ${h(dateLabel(w.dateIssued))} · signed by the Advisor and Co-Advisor</li>${
      withoutIds ? `<li>${withoutIds} without a membership ID: share their personal link after issuing.</li>` : ''
    }</ul>
    <div class="ed-table-wrap"><table class="ed-table"><thead><tr><th>Recipient</th><th>Designation</th><th>Membership ID</th><th>Credential ID</th></tr></thead><tbody>${w.records
      .slice(0, 50)
      .map(
        (c) =>
          `<tr><td>${h(c.name)}</td><td>${h(c.designation)}</td><td>${c.memID ? '✓' : '—'}</td><td class="ed-mono">${h(c.id)}</td></tr>`,
      )
      .join('')}</tbody></table>${w.records.length > 50 ? `<p class="ed-muted">…and ${w.records.length - 50} more.</p>` : ''}</div>
    <label class="ed-field"><span class="ed-label">Preview</span><select data-preview-pick data-ignore>${w.records
      .slice(0, 200)
      .map((c, i) => `<option value="${i}">${h(c.name)}</option>`)
      .join('')}</select></label>
    <div class="ed-certificate-preview" data-preview><p class="ed-muted">Drawing the preview…</p></div>
    <label class="ed-check"><input type="checkbox" data-confirm> I checked the names, category and details, and I am authorized to issue these certificates.</label>
    <p class="ed-form-error" role="alert" hidden></p>
    <div class="ed-actions ed-form-actions"><button type="button" class="ed-btn ed-btn-quiet" data-back>Back</button><button type="button" class="ed-btn" data-sample>Download sample PDF</button><button type="button" class="ed-btn ed-btn-primary" data-issue disabled>Issue ${w.records.length} certificate${w.records.length === 1 ? '' : 's'}</button></div>`;
  const preview = async () => {
    const c = w.records[Number($('[data-preview-pick]', step).value) || 0];
    try {
      $('[data-preview]', step).innerHTML = await certificateSVG(c, { preview: true });
    } catch {
      $('[data-preview]', step).innerHTML = '<p class="ed-error-text">The preview could not be drawn.</p>';
    }
  };
  preview();
  $('[data-preview-pick]', step).addEventListener('change', preview);
  $('[data-confirm]', step).addEventListener('change', (e) => ($('[data-issue]', step).disabled = !e.target.checked));
  $('[data-back]', step).addEventListener('click', () => go(3));
  $('[data-sample]', step).addEventListener('click', (e) =>
    busy(e.currentTarget, 'Preparing…', () =>
      downloadCertificate(w.records[Number($('[data-preview-pick]', step).value) || 0], { preview: true }),
    ),
  );
  $('[data-issue]', step).addEventListener('click', (e) =>
    busy(e.currentTarget, 'Issuing…', async () => {
      try {
        localStorage.setItem('acs-certificate-recovery', JSON.stringify({ savedAt: Date.now(), records: w.records }));
      } catch {
        /* The batch is still issued; recovery copy is optional. */
      }
      await app.cloud.issueCertificates(w.records, (done, total) => (e.target.textContent = `Issuing… ${done} of ${total}`));
      w.issued = true;
      toast(`${w.records.length} certificate${w.records.length === 1 ? '' : 's'} issued and saved.`);
      renderIssue(root, app);
    }),
  );
}

function buildRecords(app, w) {
  const executive = w.type === 'executive';
  const event = executive ? null : app.data.events.map((e) => e.value).find((e) => e.id === w.eventId);
  const defaults = {
    type: w.type,
    dateIssued: w.dateIssued,
    event: executive ? `Executive service · ${w.term.trim()}` : event?.title || w.eventTitle.trim(),
    eventId: event?.id || '',
    eventDate: executive ? '' : event?.date || w.eventDate,
    achievement: executive
      ? w.citation.trim() ||
        `In recognition of dedicated service${w.office ? ' as ' + w.office.trim() : ''} during fiscal year ${w.term.trim()}`
      : w.citation.trim(),
  };
  const rows =
    w.mode === 'single'
      ? [{ Name: w.single.name, 'Membership ID': w.single.memID || '', Designation: w.single.designation || '' }]
      : w.rows.map((row) =>
          Object.fromEntries(
            Object.entries(row).filter(
              ([k]) =>
                !/^(type|certificatetype|event|eventtitle|eventid|dateissued|issuedate|id|credentialid)$/i.test(k.replace(/[^a-z]/gi, '')),
            ),
          ),
        );
  if (w.mode === 'single' && !String(w.single.name || '').trim()) throw Error('Enter the recipient name.');
  if (w.mode === 'batch' && !rows.length) throw Error('Choose a spreadsheet with at least one recipient.');
  const records = importCertificates(rows, defaults);
  if (executive) for (const c of records) if (!c.designation && w.office) c.designation = w.office.trim();
  if (records.some((c) => !app.perms.certificateTypes(c.type))) throw Error('Your role cannot issue this certificate category.');
  return records;
}

function renderDone(root, app) {
  const records = wizard.records;
  root.innerHTML = `<div class="ed-success"><h3>✓ ${records.length} certificate${records.length === 1 ? '' : 's'} issued</h3><p>They are saved in the certificate system and can be verified now. Recipients with a membership ID can find theirs in the Certificate Center; share the personal link with everyone else.</p></div>
    <div class="ed-actions"><button type="button" class="ed-btn" data-csv>Download links (CSV)</button><button type="button" class="ed-btn ed-btn-primary" data-again>Issue more certificates</button></div>
    <ul class="ed-issued">${records
      .map(
        (c) =>
          `<li><div><strong>${h(c.name)}</strong><small class="ed-mono">${h(c.id)}</small></div><div class="ed-actions"><a class="ed-btn ed-btn-small ed-btn-quiet" href="${h(certificateURL(c.id, location.origin))}" target="_blank" rel="noopener">Open</a><button type="button" class="ed-btn ed-btn-small ed-btn-quiet" data-copy="${h(c.id)}">Copy link</button><button type="button" class="ed-btn ed-btn-small" data-pdf="${h(c.id)}">Download PDF</button></div></li>`,
      )
      .join('')}</ul>`;
  root.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if ('again' in t.dataset) {
      wizard = freshWizard();
      app.render();
    }
    if ('csv' in t.dataset) {
      const cell = (s) =>
        '"' +
        String(s)
          .replace(/^[=+@-]/, "'$&")
          .replaceAll('"', '""') +
        '"';
      download(
        'certificate-links.csv',
        'Name,Credential ID,Verification link\r\n' +
          records.map((c) => [c.name, c.id, certificateURL(c.id)].map(cell).join(',')).join('\r\n'),
        'text/csv',
      );
    }
    if (t.dataset.copy) {
      try {
        await navigator.clipboard.writeText(certificateURL(t.dataset.copy));
        t.textContent = 'Copied';
      } catch {
        toast('Copy the link from the Open button instead.', { type: 'info' });
      }
    }
    if (t.dataset.pdf) await busy(t, 'Preparing…', () => downloadCertificate(records.find((c) => c.id === t.dataset.pdf)));
  });
}

// ------------------------------------------------------------------ find and revoke

function renderFind(root, app) {
  root.innerHTML = `<section class="ed-card"><h3>Find a certificate</h3><form class="ed-inline-form" novalidate>${field({ label: 'Credential ID', name: 'id', attrs: 'required maxlength="80" autocomplete="off" placeholder="ACS-…"' })}<button type="submit" class="ed-btn ed-btn-primary">Look up</button></form><div data-found aria-live="polite"></div></section>`;
  const form = $('form', root);
  const found = $('[data-found]', root);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = form.elements.id.value.trim();
    if (!validCredential(id)) return toast('Enter a valid credential ID.', { type: 'error' });
    busy($('button', form), 'Looking up…', async () => {
      const raw = await app.cloud.certificate(id);
      if (!raw) {
        found.innerHTML = '<p class="ed-muted">No certificate has this credential ID.</p>';
        return;
      }
      const c = normalizeCertificate(raw, { id, legacy: true });
      const revoked = c.status === 'revoked';
      found.innerHTML = `<dl class="ed-details"><dt>Recipient</dt><dd>${h(c.name)}</dd><dt>Category</dt><dd>${h(LABEL[c.type] || c.type)}</dd><dt>Event or term</dt><dd>${h(c.event)}</dd><dt>Issued</dt><dd>${h(c.dateIssued ? dateLabel(c.dateIssued) : 'Not recorded')}</dd><dt>Membership ID</dt><dd>${h(raw.memID || 'None')}</dd><dt>Status</dt><dd><span class="ed-tag ${revoked ? 'ed-tag-revoked' : 'ed-tag-open'}">${revoked ? 'Revoked' : 'Valid'}</span></dd></dl>
        <div class="ed-actions"><a class="ed-btn ed-btn-quiet" href="${h(certificateURL(id, location.origin))}" target="_blank" rel="noopener">Open verification page</a>${
          app.perms.revoke && !revoked
            ? '<button type="button" class="ed-btn ed-btn-danger-quiet" data-revoke>Revoke certificate</button>'
            : ''
        }</div>${!app.perms.revoke && !revoked ? '<p class="ed-muted">Only a super-admin can revoke certificates.</p>' : ''}`;
      $('[data-revoke]', found)?.addEventListener('click', async (ev) => {
        const ok = await confirmDialog({
          title: `Revoke ${c.name}’s certificate?`,
          body: '<p>The verification page will show this credential as revoked. It cannot be issued again with the same ID. This is recorded in the activity log.</p>',
          confirm: 'Revoke',
          danger: true,
        });
        if (ok)
          await busy(ev.currentTarget, 'Revoking…', async () => {
            await app.cloud.revokeCertificate(id);
            toast('Certificate revoked.');
            form.requestSubmit();
          });
      });
    });
  });
}

// ------------------------------------------------------------------ Certificate Center list

function renderCatalog(root, app) {
  root.innerHTML = `<section class="ed-card"><h3>Events listed in the Certificate Center</h3><p>Recipients choose from this list before entering their membership ID. Hide test or temporary entries; their certificates keep working through credential links.</p><div data-list><p class="ed-muted">Loading…</p></div></section>`;
  const list = $('[data-list]', root);
  const load = async () => {
    const events = await app.cloud.certificateEvents();
    list.innerHTML = events.length
      ? `<table class="ed-table"><thead><tr><th>Event or term</th><th>Date</th><th>Shown publicly</th></tr></thead><tbody>${events
          .map(
            (e) =>
              `<tr><td>${h(e.title)}</td><td>${h(dateLabel(e.date))}</td><td><button type="button" class="ed-btn ed-btn-small ${e.archived ? '' : 'ed-btn-quiet'}" data-toggle="${h(e.id)}" data-archived="${!!e.archived}">${e.archived ? 'Hidden · show it' : 'Shown · hide it'}</button></td></tr>`,
          )
          .join('')}</tbody></table>`
      : '<p class="ed-muted">No certificates have been issued yet.</p>';
  };
  busy(null, '', load);
  list.addEventListener('click', (e) => {
    const t = e.target.closest('[data-toggle]');
    if (t)
      busy(t, 'Saving…', async () => {
        await app.cloud.setCertificateEventArchived(t.dataset.toggle, t.dataset.archived !== 'true');
        await load();
        toast('Certificate Center list updated.');
      });
  });
}

// ------------------------------------------------------------------ issued records

function renderRecords(root, app) {
  root.innerHTML = `<div data-migrate></div><section class="ed-card"><div class="ed-card-head"><h3>Issued certificates</h3><label class="ed-field"><span class="ed-label">Search</span><input type="search" data-search data-ignore placeholder="Name, event or ID"></label></div><div data-list class="ed-table-wrap"><p class="ed-muted">Loading…</p></div></section>`;
  busy(null, '', async () => {
    const records = (await app.cloud.certificates()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const pending = records.filter((c) => 'memID' in c || 'certificate' in c).length;
    if (pending)
      $('[data-migrate]', root).innerHTML =
        `<section class="ed-card ed-card-attention"><h3>${pending} older certificate${pending === 1 ? '' : 's'} need a quick privacy update</h3><p>They were issued before membership IDs moved to private storage. Until updated, their verification pages show “being moved”. The update keeps every credential ID, link and QR code working.</p><button type="button" class="ed-btn ed-btn-primary" data-run>Update ${pending} certificate${pending === 1 ? '' : 's'}</button></section>`;
    $('[data-run]', root)?.addEventListener('click', (e) =>
      busy(e.currentTarget, 'Updating…', async () => {
        await app.cloud.migrateCertificates((done, total) => (e.target.textContent = `Updating… ${done} of ${total}`));
        toast('Older certificates updated. Their links work again.');
        app.render();
      }),
    );
    const rows = records.map(
      (c) =>
        `<tr data-text="${h(`${c.name} ${c.event} ${c.id}`.toLowerCase())}"><td>${h(c.name)}</td><td>${h(LABEL[c.type] || c.type || 'Participation')}</td><td>${h(c.event)}</td><td>${h(c.createdAt ? when(c.createdAt) : c.dateIssued || '')}</td><td><span class="ed-tag ${c.status === 'revoked' ? 'ed-tag-revoked' : 'ed-tag-open'}">${c.status === 'revoked' ? 'Revoked' : 'Valid'}</span></td><td><a class="ed-mono" href="${h(certificateURL(c.id, location.origin))}" target="_blank" rel="noopener">${h(c.id)}</a></td><td>${c.status === 'revoked' ? `<button type="button" class="ed-btn ed-btn-small ed-btn-danger-quiet" data-delete-cert="${h(c.id)}" data-name="${h(c.name)}">Delete</button>` : ''}</td></tr>`,
    );
    $('[data-list]', root).innerHTML = records.length
      ? `<p class="ed-muted">${records.length} certificates, newest first.</p><table class="ed-table"><thead><tr><th>Recipient</th><th>Category</th><th>Event or term</th><th>Issued</th><th>Status</th><th>Credential</th><th><span class="ed-sr">Actions</span></th></tr></thead><tbody>${rows.join('')}</tbody></table>`
      : '<p class="ed-muted">No certificates have been issued yet.</p>';
    $('[data-list]', root).addEventListener('click', async (e) => {
      const t = e.target.closest('[data-delete-cert]');
      if (!t) return;
      const ok = await confirmDialog({
        title: `Delete ${t.dataset.name}’s revoked certificate?`,
        body: '<p>The record is removed permanently and its link will say “not found”. This is recorded in the activity log.</p>',
        confirm: 'Delete permanently',
        danger: true,
      });
      if (ok)
        await busy(t, 'Deleting…', async () => {
          await app.cloud.deleteCertificate(t.dataset.deleteCert);
          toast('Certificate deleted.');
          app.render();
        });
    });
    $('[data-search]', root).addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      for (const row of $$('tr[data-text]', root)) row.hidden = q && !row.dataset.text.includes(q);
    });
  });
}

export const _test = { buildRecords, formalTypes };
