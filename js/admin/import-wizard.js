// Spreadsheet import: choose a file, a worksheet and the record type, review the changes in
// plain language, then add them to a draft. Nothing goes live until the draft is published.
import { planImport } from '../lib/content-model.js';
import { ACCEPTED, LIMITS, readWorkbook, downloadTemplate, templates } from './spreadsheet.js';
import { h, $, openDialog, busy, errorMessage } from './ui.js';

const kindLabels = {
  roster: [
    'General / premium roster',
    'members',
    'Member Name and Membership ID. The year and tier are chosen below; role and photo are not needed.',
  ],
  committee: ['Executive committee', 'committee members', 'Name and Role. Add photos afterwards with Upload from device.'],
  founders: ['Founding members', 'founding members', 'Name and Role.'],
  events: [
    'Events',
    'events',
    'ID, Title, Start date (YYYY-MM-DD), Category and Description are required. End date, Location, Registration status and links are optional.',
  ],
};

const describe = (kind, record) =>
  kind === 'events'
    ? `${record.title} (${record.date})`
    : kind === 'roster'
      ? `${record.name} · ${record.memID}`
      : `${record.name} · ${record.role}`;

/**
 * options.kinds: record types the editor may choose; options.existing(kind) returns the current list;
 * options.apply(kind, plan, settings) stores the result in a draft.
 */
export function importWizard(app, { title, kinds, existing, apply, context = '' }) {
  return openDialog(
    `<h2>${h(title)}</h2>
    <div class="ed-dialog-body ed-steps">
      <ol class="ed-stepper"><li data-step="1" aria-current="step">Choose file</li><li data-step="2">Review</li><li data-step="3">Add to draft</li></ol>
      <section data-panel="1">
        ${context ? `<p>${context}</p>` : ''}
        <div class="ed-grid">
          <label class="ed-field"><span class="ed-label">Record type</span><select name="kind">${kinds.map((k) => `<option value="${k}">${kindLabels[k][0]}</option>`).join('')}</select><small data-kind-help></small></label>
          <label class="ed-field" data-tier hidden><span class="ed-label">Membership tier for every row</span><select name="tier"><option value="general">General</option><option value="premium">Premium</option></select></label>
        </div>
        <p><button type="button" class="ed-btn ed-btn-small ed-btn-quiet" data-template>Download the template</button></p>
        <label class="ed-field ed-drop"><span class="ed-label">Spreadsheet</span><input type="file" accept="${ACCEPTED}"><small>${LIMITS} The file is read on this computer; it is not uploaded.</small></label>
        <label class="ed-field" data-sheet hidden><span class="ed-label">Worksheet</span><select name="sheet"></select></label>
      </section>
      <section data-panel="2" hidden><div data-summary></div><div class="ed-table-wrap" data-preview></div></section>
      <p class="ed-form-error" role="alert" hidden></p>
    </div>
    <div class="ed-actions"><button type="button" class="ed-btn ed-btn-quiet" data-close>Cancel</button><button type="button" class="ed-btn" data-back hidden>Back</button><button type="button" class="ed-btn ed-btn-primary" data-review disabled>Review changes</button><button type="button" class="ed-btn ed-btn-primary" data-apply hidden>Add to draft</button></div>`,
    (dialog, close) => {
      let sheets = [];
      let plan = null;
      const error = $('.ed-form-error', dialog);
      const kind = $('[name="kind"]', dialog);
      const tier = $('[name="tier"]', dialog);
      const sheet = $('[name="sheet"]', dialog);
      const file = $('input[type="file"]', dialog);
      const step = (n) => {
        for (const li of dialog.querySelectorAll('[data-step]')) li.toggleAttribute('aria-current', li.dataset.step === String(n));
        $('[data-panel="1"]', dialog).hidden = n !== 1;
        $('[data-panel="2"]', dialog).hidden = n !== 2;
        $('[data-review]', dialog).hidden = n !== 1;
        $('[data-apply]', dialog).hidden = n !== 2;
        $('[data-back]', dialog).hidden = n !== 2;
      };
      const fail = (message) => {
        error.textContent = message;
        error.hidden = !message;
      };
      const syncKind = () => {
        $('[data-kind-help]', dialog).textContent = 'Columns: ' + kindLabels[kind.value][2];
        $('[data-tier]', dialog).hidden = kind.value !== 'roster';
        fail('');
      };
      syncKind();
      kind.addEventListener('change', syncKind);
      $('[data-template]', dialog).addEventListener('click', (e) =>
        busy(e.currentTarget, 'Preparing…', () => downloadTemplate(kind.value)),
      );
      file.addEventListener('change', async () => {
        fail('');
        $('[data-review]', dialog).disabled = true;
        try {
          sheets = (await readWorkbook(file.files[0])).filter((s) => !/^example/i.test(s.name));
          if (!sheets.length) throw Error('No rows were found. Fill in the first worksheet under the column headings.');
          sheet.innerHTML = sheets
            .map((s, i) => `<option value="${i}">${h(s.name)} · ${s.rows.length} row${s.rows.length === 1 ? '' : 's'}</option>`)
            .join('');
          $('[data-sheet]', dialog).hidden = sheets.length < 2;
          const guess = sheets.findIndex((s) => Object.values(templates).some((t) => t.sheet.toLowerCase() === s.name.toLowerCase()));
          if (guess >= 0) sheet.value = String(guess);
          $('[data-review]', dialog).disabled = false;
        } catch (e) {
          fail(errorMessage(e));
        }
      });
      $('[data-review]', dialog).addEventListener('click', () => {
        fail('');
        try {
          const rows = sheets[Number(sheet.value)].rows;
          plan = planImport(kind.value, rows, { existing: existing(kind.value), tier: tier.value });
          const noun = kindLabels[kind.value][1];
          const parts = [];
          if (plan.added.length) parts.push(`<li><strong>${plan.added.length} new ${noun}</strong> will be added.</li>`);
          if (plan.updated.length)
            parts.push(
              `<li><strong>${plan.updated.length}</strong> existing ${noun} will be updated (matched by ${kind.value === 'roster' ? 'membership ID' : kind.value === 'events' ? 'event ID' : 'name'}).</li>`,
            );
          if (plan.unchanged.length)
            parts.push(
              `<li>${plan.unchanged.length} row${plan.unchanged.length === 1 ? '' : 's'} already match and will be left as they are.</li>`,
            );
          $('[data-summary]', dialog).innerHTML =
            `<p>${rows.length} row${rows.length === 1 ? '' : 's'} checked from “${h(sheets[Number(sheet.value)].name)}”. Nothing is published yet.</p><ul class="ed-summary">${parts.join('') || '<li>No changes found.</li>'}</ul>`;
          const lines = [
            ...plan.added.map((r) => ['New', describe(kind.value, r)]),
            ...plan.updated.map((u) => ['Update', `${describe(kind.value, u.before)} → ${describe(kind.value, u.after)}`]),
          ];
          $('[data-preview]', dialog).innerHTML = lines.length
            ? `<table class="ed-table"><thead><tr><th>Change</th><th>Record</th></tr></thead><tbody>${lines
                .slice(0, 100)
                .map(
                  ([t, d]) => `<tr><td><span class="ed-tag ed-tag-${t === 'New' ? 'new' : 'update'}">${t}</span></td><td>${h(d)}</td></tr>`,
                )
                .join('')}</tbody></table>${lines.length > 100 ? `<p class="ed-muted">…and ${lines.length - 100} more.</p>` : ''}`
            : '';
          $('[data-apply]', dialog).disabled = !plan.added.length && !plan.updated.length;
          step(2);
        } catch (e) {
          fail(e.message);
        }
      });
      $('[data-back]', dialog).addEventListener('click', () => step(1));
      $('[data-apply]', dialog).addEventListener('click', () => {
        apply(kind.value, plan, { tier: tier.value });
        close(plan);
      });
    },
    { wide: true },
  );
}
