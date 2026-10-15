// Dropdowns that connect website forms (built under Forms) to events and the membership section.
import { h } from './ui.js';
import { normalizeForms } from '../lib/content-model.js';
import { formKinds, formState, stateLabels } from '../lib/form-model.js';

/** Form summaries from the dashboard data, as public pages see them. */
export const formSummaries = (app) => normalizeForms((app.data.forms || []).map((f) => f.value));

/**
 * A <select> listing every form; forms of type `prefer` come first.
 * keepMissing() keeps a linked form selectable even after it was deleted.
 */
export function formSelect(app, { label, name, none, prefer = '', hint = '' }) {
  const forms = formSummaries(app).sort(
    (a, b) => (a.kind === prefer ? 0 : 1) - (b.kind === prefer ? 0 : 1) || a.title.localeCompare(b.title),
  );
  const options = forms
    .map((f) => {
      const state = f.status === 'draft' ? 'hidden' : stateLabels[formState(f)].toLowerCase();
      return `<option value="${h(f.id)}">${h(f.title)} (${h(formKinds[f.kind] || 'Form')} · ${h(state)})</option>`;
    })
    .join('');
  return `<label class="ed-field"><span class="ed-label">${h(label)}</span><select name="${name}"><option value="">${h(none)}</option>${options}</select>${hint ? `<small>${hint}</small>` : ''}</label>`;
}

/** Adds an entry for a linked form that no longer exists, so the editor can see and change it. */
export function keepMissing(select, value) {
  if (value && ![...select.options].some((o) => o.value === value)) select.add(new Option(`Deleted form (${value})`, value), 1);
  select.value = value || '';
}
