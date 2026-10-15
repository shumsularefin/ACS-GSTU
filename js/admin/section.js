// Draft-backed sections: edits autosave as a draft in this browser; Publish makes them live.
import { $, h, busy, clock, showFormError, clearFormError } from './ui.js';

/** The status strip at the top of an editable section. */
export function statusHTML(app, name, { live = true } = {}) {
  const draft = app.drafts.get(name);
  const state = draft
    ? `<span class="ed-chip ed-chip-draft">Draft saved ${h(clock(new Date(draft.savedAt)))} · not live yet</span>`
    : live
      ? '<span class="ed-chip ed-chip-live">Live · no unpublished changes</span>'
      : '<span class="ed-chip">Not published yet</span>';
  return `<div class="ed-status" data-status="${h(name)}">${state}<div class="ed-actions">${draft ? `<button type="button" class="ed-btn ed-btn-quiet ed-btn-small" data-discard-draft="${h(name)}">Discard draft</button>` : ''}<button type="button" class="ed-btn ed-btn-primary" data-publish-draft="${h(name)}"${draft ? '' : ' disabled'}>Publish</button></div></div>`;
}

/** Wires publish/discard buttons inside root. */
export function wireStatus(root, app) {
  root.addEventListener('click', async (e) => {
    const publish = e.target.closest('[data-publish-draft]');
    if (publish || e.target.closest('[data-discard-draft]')) flushAutosaves();
    const discard = e.target.closest('[data-discard-draft]');
    if (publish) await busy(publish, 'Publishing…', () => app.publish(publish.dataset.publishDraft));
    if (discard) await app.discard(discard.dataset.discardDraft);
  });
}

/** Refreshes only the status strip (no full re-render while typing). */
export function refreshStatus(root, app, name, options) {
  const box = $(`[data-status="${CSS.escape(name)}"]`, root);
  if (box) box.outerHTML = statusHTML(app, name, options);
}

/**
 * Autosaves a form as a draft.
 *   read(form) -> draft value; same(value) -> true when equal to the live version
 */
// Saves waiting for their debounce timer. They are flushed before publishing or leaving a view,
// so the last keystrokes are never lost and a published draft is never recreated afterwards.
const pending = new Map();
export function flushAutosaves() {
  for (const save of [...pending.values()]) save();
}

export function autosave(form, app, name, { baseRevision, read, same, onSave = () => {} }) {
  let timer;
  const save = () => {
    clearTimeout(timer);
    pending.delete(form);
    if (!form.isConnected || form.dataset.dirty !== 'true') return;
    clearFormError(form);
    const value = read(form);
    if (same(value)) app.drafts.remove(name);
    else app.drafts.set(name, value, app.drafts.get(name)?.baseRevision ?? baseRevision);
    form.dataset.dirty = 'false';
    onSave(value);
  };
  const later = () => {
    form.dataset.dirty = 'true';
    clearTimeout(timer);
    pending.set(form, save);
    timer = setTimeout(save, 350);
  };
  form.addEventListener('input', later);
  form.addEventListener('change', later);
  form.addEventListener('submit', (e) => e.preventDefault());
  window.addEventListener('pagehide', save, { once: true });
  return save;
}

/** Shows the message of a failed publish inside the section that has the problem. */
export function showProblem(app, name, form) {
  if (app.problem?.name === name && form) showFormError(form, app.problem.message);
}

export const empty = (title, body = '') => `<div class="ed-empty"><h3>${h(title)}</h3>${body ? `<p>${body}</p>` : ''}</div>`;
