// Forms: build member registration, event registration and feedback forms, publish them on the
// website, and read, check and export the responses.
import { h, $, $$, busy, toast, confirmDialog, openDialog, download, slug, when } from '../ui.js';
import { statusHTML, wireStatus, refreshStatus, autosave, showProblem, empty } from '../section.js';
import { canManageForm } from '../permissions.js';
import { xlsx } from '../spreadsheet.js';
import { formFromEvent } from './events.js';
import { pick as membershipValues } from './membership.js';
import { renderForm } from '../../lib/form-render.js';
import {
  formKinds,
  fieldTypes,
  choiceTypes,
  paymentMethods,
  PAYMENT_FIELDS,
  newForm,
  newFieldId,
  formLink,
  formState,
  stateLabels,
  toLocalBD,
  bdLabel,
  responseColumns,
  responseRows,
  summarize,
  answerText,
  answerless,
} from '../../lib/form-model.js';
import qrcode from '../../vendor/qrcode.mjs';

// ------------------------------------------------------------------ draft values

/** The editable shape of a form (dates as Bangladesh "YYYY-MM-DDTHH:mm", options as arrays). */
function canon(v) {
  return {
    id: String(v.id || ''),
    title: String(v.title || ''),
    description: String(v.description || ''),
    kind: v.kind || 'general',
    status: v.status || 'draft',
    opensAt: v.opensAt instanceof Date ? toLocalBD(v.opensAt) : String(v.opensAt || ''),
    closesAt: v.closesAt instanceof Date ? toLocalBD(v.closesAt) : String(v.closesAt || ''),
    eventId: String(v.eventId || ''),
    fields: (v.fields || []).map((f) => ({
      id: f.id,
      type: f.type,
      label: String(f.label || ''),
      help: String(f.help || ''),
      required: !!f.required,
      options: Array.isArray(f.options) ? f.options.map(String) : [],
      other: !!f.other,
      min: f.type === 'scale' ? (Number(f.min) === 0 ? 0 : 1) : undefined,
      max: f.type === 'scale' ? Number(f.max) || 5 : undefined,
      minLabel: f.type === 'scale' ? String(f.minLabel || '') : undefined,
      maxLabel: f.type === 'scale' ? String(f.maxLabel || '') : undefined,
      showIf: f.showIf?.field ? { field: f.showIf.field, equals: String(f.showIf.equals || '') } : null,
    })),
    payment: {
      enabled: !!v.payment?.enabled,
      amount: String(v.payment?.amount || ''),
      instructions: String(v.payment?.instructions || ''),
      accounts: (v.payment?.accounts || []).map((a) => ({
        method: a.method || 'bkash',
        number: String(a.number || ''),
        note: String(a.note || ''),
      })),
      skipIf: v.payment?.skipIf?.field ? { field: v.payment.skipIf.field, equals: String(v.payment.skipIf.equals || '') } : null,
    },
    confirmation: String(v.confirmation || ''),
  };
}
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

/** Reads the builder back into a draft value. */
function readBuilder(form) {
  const el = form.elements;
  const val = (name) => el[name]?.value ?? '';
  const fields = $$('[data-q]', form).map((card) => {
    const get = (k) => $(`[data-k="${k}"]`, card);
    const type = get('type').value;
    const showField = get('showField')?.value || '';
    return {
      id: card.dataset.id,
      type,
      label: get('label').value,
      help: get('help').value,
      required: !!get('required')?.checked,
      options: get('options')
        ? get('options')
            .value.split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      other: !!get('other')?.checked,
      min: get('min')?.value,
      max: get('max')?.value,
      minLabel: get('minLabel')?.value,
      maxLabel: get('maxLabel')?.value,
      showIf: showField ? { field: showField, equals: get('showEquals')?.value || '' } : null,
    };
  });
  const skipField = val('paySkipField');
  return canon({
    id: val('id'),
    title: val('title'),
    description: val('description'),
    kind: val('kind'),
    status: val('status'),
    opensAt: val('opensAt'),
    closesAt: val('closesAt'),
    eventId: val('eventId'),
    fields,
    payment: {
      enabled: el.payEnabled.value === '1',
      amount: val('payAmount'),
      instructions: val('payInstructions'),
      accounts: $$('[data-account]', form).map((row) => ({
        method: $('[data-k="method"]', row).value,
        number: $('[data-k="number"]', row).value,
        note: $('[data-k="note"]', row).value,
      })),
      skipIf: skipField ? { field: skipField, equals: val('paySkipEquals') } : null,
    },
    confirmation: val('confirmation'),
  });
}

// ------------------------------------------------------------------ list

const stateTag = (form) => {
  const state = formState(form);
  const cls = state === 'open' ? 'ed-tag-open' : state === 'scheduled' ? 'ed-tag-new' : '';
  return `<span class="ed-tag ${cls}">${h(stateLabels[state])}</span>`;
};

export const formsView = {
  id: 'forms',
  title: 'Forms',
  icon: '☰',
  allowed: (p) => p.forms,
  render(root, app, [selected = '', tab = '']) {
    const entries = [...app.data.forms].sort((a, b) => a.value.title.localeCompare(b.value.title));
    const newDraft = app.drafts.get('form:new');
    root.innerHTML = `
      ${app.data.formsUnavailable ? '<div class="ed-card ed-card-attention"><p><strong>Forms need the latest security rules.</strong> Publish <code>firestore.rules</code> in the Firebase Console (Firestore → Rules), then reload this page. Until then forms cannot be saved or answered.</p></div>' : ''}
      <div class="ed-split${selected ? ' ed-split-detail' : ''}">
        <section class="ed-card ed-list-panel" aria-label="All forms">
          <div class="ed-card-head"><h3>All forms <span class="ed-count">${entries.length}</span></h3><button type="button" class="ed-btn ed-btn-primary ed-btn-small" data-new>+ New form</button></div>
          <ul class="ed-items">
            ${newDraft ? `<li><a href="#forms/new"${selected === 'new' ? ' aria-current="true"' : ''}><strong>${h(newDraft.value.title || 'New form')}</strong><small>Draft · not published</small></a></li>` : ''}
            ${entries
              .map((entry) => {
                const f = entry.value;
                const draft = app.drafts.has(`form:${f.id}`);
                return `<li><a href="#forms/${encodeURIComponent(f.id)}"${selected === f.id ? ' aria-current="true"' : ''}><strong>${h(f.title)}</strong><small>${h(formKinds[f.kind] || 'Form')}${f.closesAt ? ` · until ${h(bdLabel(f.closesAt))}` : ''}</small><span class="ed-item-tags">${stateTag(f)}${draft ? '<span class="ed-tag ed-tag-draft">Draft</span>' : ''}</span></a></li>`;
              })
              .join('')}
          </ul>
          ${!entries.length && !newDraft ? '<p class="ed-muted">No forms yet. Start with a member registration, event registration or feedback template.</p>' : ''}
        </section>
        <section class="ed-card ed-detail-panel" data-detail aria-live="polite"></section>
      </div>`;
    $('[data-new]', root).addEventListener('click', () => startNew(app));

    const detail = $('[data-detail]', root);
    if (!selected) {
      detail.innerHTML = empty(
        'Choose a form',
        'Select a form to edit it or read its responses, or create one with <strong>+ New form</strong>. Answers can be downloaded as an Excel file.',
      );
      return;
    }
    if (selected === 'new' && !newDraft) {
      detail.innerHTML = empty('Start a new form', 'Choose <strong>+ New form</strong> and pick a template.');
      return;
    }
    const entry = selected === 'new' ? null : app.data.forms.find((f) => f.value.id === selected);
    if (selected !== 'new' && !entry && !app.drafts.has(`form:${selected}`)) {
      detail.innerHTML = empty('Form not found', 'It may have been removed. Choose another form.');
      return;
    }
    if (tab === 'responses' && entry) renderResponses(detail, app, entry);
    else renderBuilder(detail, app, entry, selected === 'new' ? 'form:new' : `form:${selected}`);
  },
};

async function startNew(app) {
  if (app.drafts.has('form:new')) {
    const replace = await confirmDialog({
      title: 'Replace your unpublished new form?',
      body: '<p>You already started a new form that is not published yet. Starting another one discards it.</p>',
      confirm: 'Start a new one',
      danger: true,
    });
    if (!replace) return app.navigate('forms', ['new']);
  }
  const kind = await openDialog(
    `<h2>New form</h2><div class="ed-dialog-body"><p>Start from a template. You can change, add or remove any question.</p>
      <div class="ed-fb-templates">
        <button type="button" data-kind="member"><strong>Member registration</strong><span>Personal and academic details, addresses, motivation, and membership fee payment.</span></button>
        <button type="button" data-kind="event"><strong>Event registration</strong><span>Contact details, membership status (premium members can skip payment) and registration fee.</span></button>
        <button type="button" data-kind="feedback"><strong>Event feedback</strong><span>Ratings, what went well, what to improve. Results are summarised for you.</span></button>
        <button type="button" data-kind="general"><strong>Blank form</strong><span>Start with name and email and build the rest.</span></button>
      </div></div><div class="ed-actions"><button type="button" class="ed-btn ed-btn-quiet" data-close>Cancel</button></div>`,
    (dialog, close) =>
      dialog.addEventListener('click', (e) => e.target.closest('[data-kind]') && close(e.target.closest('[data-kind]').dataset.kind)),
  );
  if (!kind) return;
  const value = canon(newForm(kind));
  value.id = slug(`${value.title} ${new Date().getFullYear()}`);
  app.drafts.set('form:new', value, 0);
  app.navigate('forms', ['new']);
}

// ------------------------------------------------------------------ builder

/** What visitors see right now, for the saved (published) version of the form. */
function websiteLine(entry) {
  if (!entry) return 'Not saved yet. Choose Publish to save the form; it stays off the website while its status is Hidden.';
  const state = formState(entry.value);
  if (state === 'draft') return 'On the website: <strong>hidden</strong>. Set Status to Open and Publish to start taking answers.';
  if (state === 'open') return 'On the website: <strong>accepting responses</strong>.';
  if (state === 'scheduled') return `On the website: <strong>opens ${h(bdLabel(entry.value.opensAt))}</strong>.`;
  return 'On the website: <strong>not accepting responses</strong>.';
}

const option = (value, label, current) => `<option value="${h(value)}"${value === current ? ' selected' : ''}>${h(label)}</option>`;
const tabs = (entry, active) =>
  entry
    ? `<nav class="ed-tabs ed-fb-tabs" aria-label="Form tools"><a href="#forms/${encodeURIComponent(entry.value.id)}"${active === 'build' ? ' aria-current="page"' : ''}>Questions &amp; settings</a><a href="#forms/${encodeURIComponent(entry.value.id)}/responses"${active === 'responses' ? ' aria-current="page"' : ''}>Responses</a></nav>`
    : '';

function questionCard(f, i, all, editable) {
  const choices = all.slice(0, i).filter((g) => choiceTypes.includes(g.type));
  const showSource = choices.find((g) => g.id === f.showIf?.field);
  const typeOptions = Object.entries(fieldTypes)
    .map(([k, label]) => option(k, label, f.type))
    .join('');
  return `<div class="ed-fb-q${f.type === 'section' ? ' ed-fb-q-section' : ''}" data-q data-id="${h(f.id)}">
    <div class="ed-fb-q-head">
      <span class="ed-fb-num" aria-hidden="true">${f.type === 'section' ? '§' : i + 1}</span>
      <label class="ed-fb-type"><span class="ed-sr">Question type</span><select data-k="type" data-rerender>${typeOptions}</select></label>
      ${f.type === 'section' ? '' : `<label class="ed-check"><input type="checkbox" data-k="required"${f.required ? ' checked' : ''}> Required</label>`}
      ${
        editable
          ? `<div class="ed-fb-q-tools"><button type="button" class="ed-icon-btn" data-move="-1" aria-label="Move up"${i === 0 ? ' disabled' : ''}>↑</button><button type="button" class="ed-icon-btn" data-move="1" aria-label="Move down"${i === all.length - 1 ? ' disabled' : ''}>↓</button><button type="button" class="ed-icon-btn" data-copy-q aria-label="Duplicate">⧉</button><button type="button" class="ed-icon-btn ed-icon-danger" data-remove-q aria-label="Remove">✕</button></div>`
          : ''
      }
    </div>
    <label class="ed-field"><span class="ed-label">${f.type === 'section' ? 'Section title' : 'Question'}</span><input data-k="label" value="${h(f.label)}" maxlength="300"></label>
    <label class="ed-field"><span class="ed-label">${f.type === 'section' ? 'Text under the title' : 'Help text'} <em>(optional)</em></span><input data-k="help" value="${h(f.help)}" maxlength="500"></label>
    ${
      choiceTypes.includes(f.type)
        ? `<label class="ed-field"><span class="ed-label">Options</span><textarea data-k="options" rows="${Math.min(10, Math.max(3, f.options.length + 1))}">${h(f.options.join('\n'))}</textarea><small>One option per line.</small></label>
           ${f.type === 'dropdown' ? '' : `<label class="ed-check"><input type="checkbox" data-k="other"${f.other ? ' checked' : ''}> Add an “Other” option with a text box</label>`}`
        : ''
    }
    ${
      f.type === 'scale'
        ? `<div class="ed-grid ed-fb-scale">
            <label class="ed-field"><span class="ed-label">From</span><select data-k="min">${option('0', '0', String(f.min))}${option('1', '1', String(f.min ?? 1))}</select></label>
            <label class="ed-field"><span class="ed-label">To</span><select data-k="max">${[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => option(String(n), String(n), String(f.max ?? 5))).join('')}</select></label>
            <label class="ed-field"><span class="ed-label">Label for the lowest <em>(optional)</em></span><input data-k="minLabel" value="${h(f.minLabel || '')}" maxlength="60"></label>
            <label class="ed-field"><span class="ed-label">Label for the highest <em>(optional)</em></span><input data-k="maxLabel" value="${h(f.maxLabel || '')}" maxlength="60"></label>
          </div>`
        : ''
    }
    ${
      choices.length && f.type !== 'section'
        ? `<details class="ed-fb-logic"${f.showIf ? ' open' : ''}><summary>Show only for some answers</summary><div class="ed-grid">
            <label class="ed-field"><span class="ed-label">Show this question when</span><select data-k="showField" data-rerender><option value="">Always show</option>${choices.map((g) => option(g.id, g.label, f.showIf?.field || '')).join('')}</select></label>
            ${showSource ? `<label class="ed-field"><span class="ed-label">is answered with</span><select data-k="showEquals">${showSource.options.map((o) => option(o, o, f.showIf?.equals || '')).join('')}</select></label>` : ''}
          </div></details>`
        : ''
    }
  </div>`;
}

function renderBuilder(root, app, entry, name) {
  const live = entry ? canon(entry.value) : null;
  const draft = app.drafts.get(name);
  const v = canon(draft?.value || live);
  const editable = canManageForm(app.perms, entry, app.user.uid);
  const isNew = !entry;
  const choiceFields = v.fields.filter((f) => choiceTypes.includes(f.type));
  const skipSource = choiceFields.find((f) => f.id === v.payment.skipIf?.field);
  const events = [...app.data.events].sort((a, b) => b.value.date.localeCompare(a.value.date));
  root.innerHTML = `
    <a class="ed-back" href="#forms">← All forms</a>
    <div class="ed-card-head"><h3>${h(v.title || 'New form')}</h3>${entry && entry.value.status !== 'draft' ? `<a class="ed-link" href="${h(formLink(entry.value.id))}" target="_blank" rel="noopener">Open the form ↗</a>` : ''}</div>
    ${tabs(entry, 'build')}
    ${editable ? statusHTML(app, name, { live: !isNew }) : '<p class="ed-note">You can view this form. Only its creator, chapter administrators and super-admins can change it.</p>'}
    <form class="ed-form ed-fb" novalidate>
      <fieldset ${editable ? '' : 'disabled'}>
        <section class="ed-fb-block">
          <h4>About the form</h4>
          <div class="ed-grid">
            <label class="ed-field ed-wide"><span class="ed-label">Title</span><input name="title" value="${h(v.title)}" maxlength="200" required></label>
            <label class="ed-field ed-wide"><span class="ed-label">Description <em>(optional)</em></span><textarea name="description" rows="3" maxlength="3000">${h(v.description)}</textarea></label>
            <label class="ed-field"><span class="ed-label">Form type</span><select name="kind">${Object.entries(formKinds)
              .map(([k, label]) => option(k, label, v.kind))
              .join('')}</select></label>
            <label class="ed-field"><span class="ed-label">For event <em>(optional)</em></span><select name="eventId"><option value="">Not linked to an event</option>${events
              .map((e) => option(e.value.id, `${e.value.title} (${e.value.date})`, v.eventId))
              .join('')}</select></label>
          </div>
        </section>

        <section class="ed-fb-block">
          <h4>Availability</h4>
          <div class="ed-grid">
            <label class="ed-field"><span class="ed-label">Status</span><select name="status">${option('draft', 'Hidden: not on the website yet', v.status)}${option('open', 'Open: accepting responses', v.status)}${option('closed', 'Closed: no more responses', v.status)}</select></label>
            <p class="ed-fb-website">${websiteLine(entry)}</p>
            <label class="ed-field"><span class="ed-label">Opens <em>(optional)</em></span><input type="datetime-local" name="opensAt" value="${h(v.opensAt)}"><small>Bangladesh time. Leave blank to open as soon as the status is Open.</small></label>
            <label class="ed-field"><span class="ed-label">Closes <em>(optional)</em></span><input type="datetime-local" name="closesAt" value="${h(v.closesAt)}"><small>Bangladesh time. Responses stop automatically at this time.</small></label>
          </div>
        </section>

        <section class="ed-fb-block">
          <h4>Questions <span class="ed-count">${v.fields.filter((f) => !answerless(f)).length}</span></h4>
          <div class="ed-fb-questions">${v.fields
            .map(
              (f, i) =>
                questionCard(f, i, v.fields, editable) +
                (editable && i < v.fields.length - 1
                  ? `<div class="ed-fb-insert" aria-label="Insert after question ${i + 1}"><button type="button" data-add="short" data-at="${i + 1}">+ Question here</button><button type="button" data-add="section" data-at="${i + 1}">+ Section here</button></div>`
                  : ''),
            )
            .join('')}
          <input type="hidden" name="payEnabled" value="${v.payment.enabled ? '1' : ''}">
          ${
            v.payment.enabled
              ? `<div class="ed-fb-q ed-fb-pay"><div class="ed-fb-q-head"><span class="ed-fb-num" aria-hidden="true">৳</span><strong>Payment section</strong><span class="ed-muted">bKash, Nagad, Rocket or bank transfer, with the transaction ID</span>${editable ? '<div class="ed-fb-q-tools"><button type="button" class="ed-icon-btn ed-icon-danger" data-remove-payment aria-label="Remove the payment section">✕</button></div>' : ''}</div>
                <div class="ed-grid">
                  <label class="ed-field"><span class="ed-label">Amount</span><input name="payAmount" value="${h(v.payment.amount)}" maxlength="120" placeholder="e.g. 300 BDT"></label>
                  <label class="ed-field ed-wide"><span class="ed-label">Instructions <em>(optional)</em></span><textarea name="payInstructions" rows="2" maxlength="1000">${h(v.payment.instructions)}</textarea></label>
                </div>
                <div class="ed-fb-accounts">
                  <span class="ed-label">Pay to</span>
                  ${v.payment.accounts
                    .map(
                      (a, i) => `<div class="ed-fb-account" data-account>
                        <label class="ed-field"><span class="ed-sr">Method</span><select data-k="method">${Object.entries(paymentMethods)
                          .map(([k, label]) => option(k, label, a.method))
                          .join('')}</select></label>
                        <label class="ed-field"><span class="ed-sr">Number or account</span><input data-k="number" value="${h(a.number)}" maxlength="120" placeholder="01XXXXXXXXX or bank account details"></label>
                        <label class="ed-field"><span class="ed-sr">Note</span><input data-k="note" value="${h(a.note)}" maxlength="200" placeholder="Personal, Merchant, branch…"></label>
                        ${editable ? `<button type="button" class="ed-icon-btn ed-icon-danger" data-remove-account="${i}" aria-label="Remove this account">✕</button>` : ''}
                      </div>`,
                    )
                    .join('')}
                  ${editable ? '<button type="button" class="ed-btn ed-btn-quiet ed-btn-small" data-add-account>+ Add a payment account</button>' : ''}
                </div>
                ${
                  choiceFields.length
                    ? `<div class="ed-grid">
                        <label class="ed-field"><span class="ed-label">No payment needed when</span><select name="paySkipField" data-rerender><option value="">Everyone pays</option>${choiceFields.map((f) => option(f.id, f.label, v.payment.skipIf?.field || '')).join('')}</select></label>
                        ${skipSource ? `<label class="ed-field"><span class="ed-label">is answered with</span><select name="paySkipEquals">${skipSource.options.map((o) => option(o, o, v.payment.skipIf?.equals || '')).join('')}</select></label>` : ''}
                      </div>`
                    : ''
                }
                <p class="ed-muted">Each transaction ID is accepted once, so the same payment cannot be used for two registrations. Mark payments as checked under Responses.</p></div>`
              : ''
          }</div>
          ${editable ? `<div class="ed-actions ed-fb-add"><button type="button" class="ed-btn" data-add="short">+ Add question</button><button type="button" class="ed-btn" data-add="section">+ Add section</button>${v.payment.enabled ? '' : '<button type="button" class="ed-btn ed-btn-quiet" data-add-payment>+ Payment section</button>'}</div>` : ''}
        </section>

        <section class="ed-fb-block">
          <h4>After submitting</h4>
          <label class="ed-field ed-wide"><span class="ed-label">Confirmation message</span><textarea name="confirmation" rows="2" maxlength="1000">${h(v.confirmation)}</textarea></label>
        </section>

        <details class="ed-advanced"${isNew ? ' open' : ''}><summary>Web address</summary>
          <label class="ed-field"><span class="ed-label">Form address</span><input name="id" value="${h(v.id)}" maxlength="80" pattern="[a-z0-9]+(-[a-z0-9]+)*" ${isNew ? '' : 'readonly'}><small>${isNew ? 'Created from the title; it cannot change after publishing.' : h(formLink(v.id))}</small></label>
        </details>

        <div class="ed-actions ed-form-actions">
          <button type="button" class="ed-btn" data-preview>Preview</button>
          ${entry ? '<button type="button" class="ed-btn" data-share>Link &amp; QR code</button>' : ''}
          ${entry && v.eventId && app.perms.events ? '<button type="button" class="ed-btn ed-btn-quiet" data-link-event>Use as the event’s registration form</button>' : ''}
          ${entry && v.kind === 'member' && app.perms.membership ? '<button type="button" class="ed-btn ed-btn-quiet" data-link-membership>Use for “Join now” on the homepage</button>' : ''}
          ${entry && app.perms.deleteForms ? '<button type="button" class="ed-btn ed-btn-danger-quiet" data-delete>Delete form</button>' : ''}
        </div>
      </fieldset>
    </form>`;

  const form = $('form', root);
  wireStatus(root, app);
  showProblem(app, name, form);
  const redraw = () => renderBuilder(root, app, entry, name);
  const save = editable
    ? autosave(form, app, name, {
        baseRevision: entry?.revision || 0,
        read: readBuilder,
        same: (value) => (live ? same(value, live) : false),
        onSave: () => refreshStatus(root, app, name, { live: !isNew }),
      })
    : () => {};

  // New forms: the address follows the title until it is edited.
  let idTouched = !isNew;
  form.elements.id.addEventListener('input', () => (idTouched = true));
  form.elements.title.addEventListener('input', () => {
    if (!idTouched) form.elements.id.value = slug(`${form.elements.title.value} ${new Date().getFullYear()}`);
  });

  /** Applies a structural change (questions added, moved, removed…) and redraws. */
  const change = (mutate) => {
    form.dataset.dirty = 'true';
    save();
    const value = readBuilder(form);
    mutate(value);
    app.drafts.set(name, value, app.drafts.get(name)?.baseRevision ?? entry?.revision ?? 0);
    redraw();
  };
  form.addEventListener('change', (e) => {
    if (e.target.matches('[data-rerender]')) change(() => {});
  });
  form.addEventListener('click', async (e) => {
    const button = e.target.closest('button');
    if (!button || !editable) return;
    const card = button.closest('[data-q]');
    const index = card ? $$('[data-q]', form).indexOf(card) : -1;
    if (button.dataset.add) {
      const section = button.dataset.add === 'section';
      const at = button.dataset.at === undefined ? -1 : Number(button.dataset.at);
      change((value) =>
        value.fields.splice(at < 0 ? value.fields.length : at, 0, {
          id: newFieldId(),
          type: section ? 'section' : 'short',
          label: section ? 'New section' : 'New question',
          help: '',
          required: !section,
          options: [],
          other: false,
          showIf: null,
        }),
      );
      $$('[data-q]', root).at(at)?.querySelector('[data-k="label"]')?.select();
    } else if (button.dataset.move) {
      const to = index + Number(button.dataset.move);
      change((value) => value.fields.splice(to, 0, value.fields.splice(index, 1)[0]));
      $$('[data-q]', root)[to]?.querySelector(`[data-move="${button.dataset.move}"]`)?.focus();
    } else if ('copyQ' in button.dataset) {
      change((value) => value.fields.splice(index + 1, 0, { ...structuredClone(value.fields[index]), id: newFieldId() }));
    } else if ('removeQ' in button.dataset) {
      change((value) => {
        const [removed] = value.fields.splice(index, 1);
        for (const f of value.fields) if (f.showIf?.field === removed.id) f.showIf = null;
        if (value.payment.skipIf?.field === removed.id) value.payment.skipIf = null;
      });
      toast('Question removed. Answers already received to it stay in the responses.', { type: 'info' });
    } else if ('removePayment' in button.dataset) {
      change((value) => (value.payment.enabled = false));
      toast('Payment section removed. Add it back with + Payment section.', { type: 'info' });
    } else if ('addPayment' in button.dataset) {
      change((value) => {
        value.payment.enabled = true;
        if (!value.payment.accounts.length) value.payment.accounts.push({ method: 'bkash', number: '', note: 'Personal' });
        if (!value.payment.instructions) value.payment.instructions = 'Send the fee with Send Money, then enter your transaction ID below.';
      });
    } else if ('addAccount' in button.dataset) {
      change((value) => value.payment.accounts.push({ method: 'nagad', number: '', note: '' }));
    } else if (button.dataset.removeAccount) {
      change((value) => value.payment.accounts.splice(Number(button.dataset.removeAccount), 1));
    }
  });

  $('[data-preview]', form).addEventListener('click', () => {
    const value = readBuilder(form);
    openDialog(
      `<h2>Preview</h2><div class="ed-dialog-body ed-fb-preview">${renderForm({ ...value, opensAt: null, closesAt: value.closesAt ? new Date(`${value.closesAt}:00+06:00`) : null }, { preview: true })}</div><div class="ed-actions"><button type="button" class="ed-btn" data-close>Close</button></div>`,
      () => {},
      { wide: true },
    );
  });
  $('[data-share]', form)?.addEventListener('click', () => shareDialog(entry.value));
  $('[data-link-event]', form)?.addEventListener('click', () => {
    const event = app.data.events.find((e) => e.value.id === entry.value.eventId);
    if (!event) return toast('The linked event no longer exists.', { type: 'error' });
    const base = app.drafts.get(`event:${event.value.id}`)?.value || formFromEvent(event.value);
    app.drafts.set(`event:${event.value.id}`, { ...base, registrationFormId: entry.value.id }, event.revision);
    app.navigate('events', [event.value.id]);
    toast('The form is chosen as the registration form in a draft of the event. Check it, then Publish.', { type: 'info' });
  });
  $('[data-link-membership]', form)?.addEventListener('click', () => {
    const base = app.drafts.get('membership')?.value || membershipValues(app.data.membership?.value || {});
    app.drafts.set('membership', { ...base, applicationFormId: entry.value.id }, app.data.membership?.revision || 0);
    app.navigate('membership');
    toast('“Join now” now points to this form in a draft. Check it, then Publish.', { type: 'info' });
  });
  $('[data-delete]', form)?.addEventListener('click', async (e) => {
    const responses = await busy(e.currentTarget, 'Checking…', () => app.cloud.formResponses(entry.value.id));
    if (responses === undefined) return;
    if (responses.length)
      return toast(`This form has ${responses.length} response(s). Download them, delete them under Responses, then delete the form.`, {
        type: 'error',
      });
    const ok = await confirmDialog({
      title: `Delete “${entry.value.title}”?`,
      body: '<p>The form is removed and its link stops working. This is recorded in the activity log.</p>',
      confirm: 'Delete form',
      danger: true,
    });
    if (!ok) return;
    await busy(null, '', async () => {
      await app.cloud.deleteForm(entry.value);
      app.drafts.remove(name);
      await app.reload();
      app.navigate('forms');
      toast('Form deleted.');
    });
  });
}

// ------------------------------------------------------------------ sharing

function qrSVG(text, size = 320) {
  const code = qrcode(0, 'M');
  code.addData(text);
  code.make();
  const n = code.getModuleCount();
  const quiet = 4;
  const cell = size / (n + quiet * 2);
  let d = '';
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (code.isDark(r, c))
        d += `M${((c + quiet) * cell).toFixed(2)} ${((r + quiet) * cell).toFixed(2)}h${cell.toFixed(3)}v${cell.toFixed(3)}h-${cell.toFixed(3)}z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="#fff"/><path fill="#251f20" d="${d}"/></svg>`;
}

function shareDialog(form) {
  const link = formLink(form.id);
  const svg = qrSVG(link);
  openDialog(
    `<h2>Share “${h(form.title)}”</h2><div class="ed-dialog-body ed-fb-share">
      <div class="ed-fb-qr">${svg}</div>
      <div><label class="ed-field"><span class="ed-label">Link</span><input readonly value="${h(link)}" data-link></label>
      <div class="ed-actions"><button type="button" class="ed-btn ed-btn-primary" data-copy-link>Copy link</button><button type="button" class="ed-btn" data-png>Download QR code (PNG)</button><button type="button" class="ed-btn ed-btn-quiet" data-svg>QR code (SVG)</button></div>
      <p class="ed-muted">Put the QR code on posters and slides. ${form.status === 'draft' ? '<strong>The form is a draft:</strong> set its status to Open and publish before sharing.' : ''}</p></div>
    </div><div class="ed-actions"><button type="button" class="ed-btn" data-close>Close</button></div>`,
    (dialog) => {
      $('[data-copy-link]', dialog).addEventListener('click', async (e) => {
        try {
          await navigator.clipboard.writeText(link);
          e.target.textContent = 'Copied';
        } catch {
          $('[data-link]', dialog).select();
        }
      });
      $('[data-svg]', dialog).addEventListener('click', () => download(`${form.id}-qr.svg`, svg, 'image/svg+xml'));
      $('[data-png]', dialog).addEventListener('click', async () => {
        const img = new Image();
        img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        await img.decode();
        const canvas = Object.assign(document.createElement('canvas'), { width: 1200, height: 1200 });
        canvas.getContext('2d').drawImage(img, 0, 0, 1200, 1200);
        canvas.toBlob((blob) => download(`${form.id}-qr.png`, blob), 'image/png');
      });
    },
  );
}

// ------------------------------------------------------------------ responses

async function renderResponses(root, app, entry) {
  const form = entry.value;
  root.innerHTML = `<a class="ed-back" href="#forms">← All forms</a><div class="ed-card-head"><h3>${h(form.title)}</h3></div>${tabs(entry, 'responses')}<p class="ed-muted" data-loading>Loading responses…</p>`;
  let responses;
  try {
    responses = await app.cloud.formResponses(form.id);
  } catch (error) {
    $('[data-loading]', root).textContent =
      error?.code === 'permission-denied'
        ? 'Only chapter administrators, super-admins and the person who created this form can read its responses.'
        : 'The responses could not load. Try again in a moment.';
    return;
  }
  if (!root.isConnected) return;
  const state = formState(form);
  const columns = responseColumns(form, responses);
  const preview = columns.slice(0, 4);
  const hasPayment = form.payment?.enabled || responses.some((r) => r.answers[PAYMENT_FIELDS.txn]);
  const sorted = [...responses].sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
  const verified = responses.filter((r) => r.verified).length;
  const summaries = summarize(form, responses).filter((s) => s.answered);

  root.innerHTML = `
    <a class="ed-back" href="#forms">← All forms</a>
    <div class="ed-card-head"><h3>${h(form.title)}</h3><a class="ed-link" href="${h(formLink(form.id))}" target="_blank" rel="noopener">Open the form ↗</a></div>
    ${tabs(entry, 'responses')}
    <div class="ed-fb-stats">
      <div><strong>${responses.length}</strong><span>response${responses.length === 1 ? '' : 's'}</span></div>
      ${hasPayment ? `<div><strong>${verified}</strong><span>payment${verified === 1 ? '' : 's'} checked</span></div>` : ''}
      <div><strong class="ed-fb-state">${h(stateLabels[state])}</strong><span>${form.closesAt ? `until ${h(bdLabel(form.closesAt))}` : 'no time limit'}</span></div>
    </div>
    <div class="ed-actions">
      <button type="button" class="ed-btn ed-btn-primary" data-export${responses.length ? '' : ' disabled'}>Download Excel (.xlsx)</button>
      <button type="button" class="ed-btn" data-share>Link &amp; QR code</button>
      <button type="button" class="ed-btn ed-btn-quiet" data-refresh>Refresh</button>
    </div>
    ${
      summaries.length
        ? `<section class="ed-fb-summary" aria-label="Summary">${summaries
            .map(
              (
                s,
              ) => `<article class="ed-fb-chart"><h4>${h(s.field.label)}</h4><p class="ed-muted">${s.answered} answer${s.answered === 1 ? '' : 's'}${s.average !== null ? ` · average <strong>${s.average.toFixed(1)}</strong> of ${s.field.max}` : ''}</p>
                <ul>${s.counts
                  .map(([label, count]) => {
                    const pct = s.answered ? Math.round((count / s.answered) * 100) : 0;
                    return `<li><span class="ed-fb-bar-label">${h(label)}</span><span class="ed-fb-bar"><span style="width:${pct}%"></span></span><span class="ed-fb-bar-n">${count}</span></li>`;
                  })
                  .join('')}</ul></article>`,
            )
            .join('')}</section>`
        : ''
    }
    ${
      responses.length
        ? `<div class="ed-table-tools"><label class="ed-field"><span class="ed-label">Search responses</span><input type="search" data-search placeholder="Name, ID, transaction…"></label></div>
          <div class="ed-table-wrap"><table class="ed-table ed-fb-table"><thead><tr><th>Submitted</th>${preview.map((c) => `<th>${h(c.label)}</th>`).join('')}${hasPayment ? '<th>Transaction</th><th>Payment</th>' : ''}<th><span class="ed-sr">Open</span></th></tr></thead><tbody>
          ${sorted
            .map(
              (r) => `<tr data-row="${h(r.id)}" data-text="${h(Object.values(r.answers).map(answerText).join(' ').toLowerCase())}">
                <td>${h(r.submittedAt ? when(r.submittedAt) : '')}</td>
                ${preview.map((c) => `<td>${h(answerText(r.answers[c.id]).slice(0, 80))}</td>`).join('')}
                ${hasPayment ? `<td class="ed-mono">${h(r.answers[PAYMENT_FIELDS.txn] || '')}</td><td>${r.answers[PAYMENT_FIELDS.txn] ? (r.verified ? '<span class="ed-tag ed-tag-open">Checked</span>' : '<span class="ed-tag ed-tag-new">To check</span>') : '<span class="ed-muted">—</span>'}</td>` : ''}
                <td><button type="button" class="ed-btn ed-btn-quiet ed-btn-small" data-open="${h(r.id)}">View</button></td>
              </tr>`,
            )
            .join('')}
          </tbody></table></div>`
        : `<div class="ed-empty"><h3>No responses yet</h3><p>${state === 'open' ? 'Share the link or QR code to start collecting answers.' : state === 'draft' ? 'Set the status to Open and publish the form to start collecting answers.' : 'This form is not accepting answers right now.'}</p></div>`
    }
    ${
      app.perms.deleteForms && responses.length
        ? `<details class="ed-danger-zone"><summary>Delete responses</summary><p>Download the Excel file first. Deleted responses cannot be recovered.</p><button type="button" class="ed-btn ed-btn-danger" data-delete-all>Delete all ${responses.length} responses</button></details>`
        : ''
    }`;

  const reload = () => renderResponses(root, app, entry);
  $('[data-refresh]', root).addEventListener('click', reload);
  $('[data-share]', root).addEventListener('click', () => shareDialog(form));
  $('[data-export]', root).addEventListener('click', (e) =>
    busy(e.currentTarget, 'Preparing…', async () => {
      const XLSX = await xlsx();
      const rows = responseRows(form, responses);
      const sheet = XLSX.utils.aoa_to_sheet(rows);
      sheet['!cols'] = rows[0].map((label, i) => ({
        wch: Math.min(48, Math.max(8, String(label).length + 2, ...rows.slice(1, 60).map((r) => String(r[i] ?? '').length + 1))),
      }));
      sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: rows[0].length - 1 } }) };
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, 'Responses');
      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(book, `${form.id}-responses-${stamp}.xlsx`);
    }),
  );
  $('[data-search]', root)?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    for (const row of $$('tr[data-row]', root)) row.hidden = !!q && !row.dataset.text.includes(q);
  });
  root.addEventListener('click', (e) => {
    const open = e.target.closest('[data-open]');
    if (open)
      responseDialog(
        app,
        form,
        columns,
        responses.find((r) => r.id === open.dataset.open),
        reload,
      );
  });
  $('[data-delete-all]', root)?.addEventListener('click', async (e) => {
    const ok = await confirmDialog({
      title: `Delete all ${responses.length} responses?`,
      body: `<p>Every answer to “${h(form.title)}” is removed permanently. Download the Excel file first if you need it.</p>`,
      confirm: 'Delete all responses',
      danger: true,
    });
    if (!ok) return;
    await busy(e.currentTarget, 'Deleting…', async () => {
      await app.cloud.deleteFormResponses(
        form.id,
        responses.map((r) => r.id),
        form.title,
      );
      toast('Responses deleted.');
      reload();
    });
  });
}

function responseDialog(app, form, columns, response, reload) {
  if (!response) return;
  const paid = !!response.answers[PAYMENT_FIELDS.txn];
  openDialog(
    `<h2>Response</h2><div class="ed-dialog-body">
      <p class="ed-muted">Submitted ${h(response.submittedAt ? bdLabel(response.submittedAt) : '')} (Bangladesh time)</p>
      <dl class="ed-fb-answers">${columns
        .filter((c) => response.answers[c.id] !== undefined)
        .map(
          (c) =>
            `<div><dt>${h(c.label)}</dt><dd>${h(c.id === PAYMENT_FIELDS.method ? paymentMethods[response.answers[c.id]] || response.answers[c.id] : answerText(response.answers[c.id]))}</dd></div>`,
        )
        .join('')}</dl>
      ${paid ? `<label class="ed-check ed-fb-verify"><input type="checkbox" data-verify${response.verified ? ' checked' : ''}> Payment checked (the transaction ID and amount match the ${h(paymentMethods[response.answers[PAYMENT_FIELDS.method]] || 'payment')} statement)</label>` : ''}
    </div><div class="ed-actions">${app.perms.deleteForms ? '<button type="button" class="ed-btn ed-btn-danger-quiet" data-delete-one>Delete response</button>' : ''}<button type="button" class="ed-btn" data-close>Close</button></div>`,
    (dialog, close) => {
      $('[data-verify]', dialog)?.addEventListener('change', async (e) => {
        const input = e.target;
        input.disabled = true;
        try {
          await app.cloud.setResponseVerified(form.id, response.id, input.checked);
          response.verified = input.checked;
          toast(input.checked ? 'Payment marked as checked.' : 'Payment marked as not checked.');
        } catch (error) {
          input.checked = !input.checked;
          toast(error?.code === 'permission-denied' ? 'You cannot change this response.' : 'The change could not be saved.', {
            type: 'error',
          });
        } finally {
          input.disabled = false;
        }
      });
      $('[data-delete-one]', dialog)?.addEventListener('click', async () => {
        close();
        const ok = await confirmDialog({
          title: 'Delete this response?',
          body: '<p>It is removed permanently. This is recorded in the activity log.</p>',
          confirm: 'Delete response',
          danger: true,
        });
        if (!ok) return;
        await busy(null, '', async () => {
          await app.cloud.deleteFormResponses(form.id, [response.id], form.title);
          toast('Response deleted.');
        });
        reload();
      });
      dialog.addEventListener('close', () => reload(), { once: true });
    },
    { wide: true },
  );
}
