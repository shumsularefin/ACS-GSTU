// Public form page (form.html?id=…): shows a form built in the Chapter Editor and stores the answers.
import { rest } from './site-data.js';
import { renderForm } from '../lib/form-render.js';
import { checkAnswers, responseId, fieldVisible, paymentRequired, PAYMENT_FIELDS, formState } from '../lib/form-model.js';
import { escapeHTML as h } from '../lib/content-model.js';

const root = document.getElementById('form-root');

function readRaw(form) {
  const raw = {};
  const data = new FormData(form);
  for (const [name, value] of data) {
    if (name.endsWith('__other') || name === 'pf_website') continue;
    const v = value === '__other' ? String(data.get(`${name}__other`) || '').trim() : String(value);
    const input = form.elements[name];
    const many = input instanceof RadioNodeList ? [...input].some((i) => i.type === 'checkbox') : input?.type === 'checkbox';
    if (many) (raw[name] ||= []).push(v);
    else raw[name] = v;
  }
  return raw;
}

function syncVisibility(form, definition) {
  const raw = readRaw(form);
  for (const box of form.querySelectorAll('[data-show-field]')) {
    const field = definition.fields.find((f) => f.id === box.dataset.field);
    const visible = field ? fieldVisible(field, raw) : true;
    box.hidden = !visible;
    for (const input of box.querySelectorAll('input, select, textarea')) input.disabled = !visible;
  }
  const pay = form.querySelector('[data-payment]');
  if (pay) {
    const needed = paymentRequired(definition, raw);
    pay.hidden = !needed;
    for (const input of pay.querySelectorAll('input')) input.disabled = !needed;
  }
}

function showErrors(form, errors) {
  for (const p of form.querySelectorAll('.pf-error')) {
    p.hidden = true;
    p.textContent = '';
  }
  for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
  let first = null;
  for (const [id, message] of Object.entries(errors)) {
    const p = form.querySelector(`#${CSS.escape(id)}-error`);
    if (!p) continue;
    p.hidden = false;
    p.textContent = message;
    const box = p.closest('.pf-q');
    for (const input of box.querySelectorAll('input, select, textarea')) input.setAttribute('aria-invalid', 'true');
    first ||= box;
  }
  if (first) {
    first.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    first.querySelector('input:not([type=hidden]), select, textarea')?.focus({ preventScroll: true });
  }
}

function done(definition) {
  root.innerHTML = `<div class="pf pf-done" tabindex="-1"><span class="pf-done-icon" aria-hidden="true">✓</span><h1>${h(definition.title)}</h1><p>${h(definition.confirmation)}</p><a class="btn btn-outline" href="index.html">Back to the website</a></div>`;
  root.firstElementChild.focus();
  window.scrollTo({ top: 0 });
}

async function start() {
  const id = new URLSearchParams(location.search).get('id') || '';
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
    root.innerHTML = '<div class="pf"><h1>Form not found</h1><p>Check the link you were given.</p></div>';
    return;
  }
  let definition;
  try {
    definition = await (await rest()).get(`forms/${id}`);
  } catch {
    root.innerHTML = '<div class="pf"><h1>This form could not load</h1><p>Check your connection and reload the page.</p></div>';
    return;
  }
  if (!definition || definition.status === 'draft') {
    root.innerHTML = '<div class="pf"><h1>Form not found</h1><p>It may have been removed. Check the link you were given.</p></div>';
    return;
  }
  document.title = `${definition.title} | ACS Student Chapter, GSTU`;
  root.innerHTML = renderForm(definition);
  const form = root.querySelector('form');
  if (!form) return;
  syncVisibility(form, definition);
  form.addEventListener('change', () => syncVisibility(form, definition));
  form.addEventListener('input', (e) => {
    if (e.target.name?.endsWith('__other')) {
      const choice = form.querySelector(`input[name="${CSS.escape(e.target.name.slice(0, -7))}"][value="__other"]`);
      if (choice && e.target.value) choice.checked = true;
    }
  });
  root.addEventListener('click', async (e) => {
    const copy = e.target.closest('[data-copy]');
    if (!copy) return;
    try {
      await navigator.clipboard.writeText(copy.dataset.copy);
      copy.textContent = 'Copied';
      setTimeout(() => (copy.textContent = 'Copy'), 1800);
    } catch {
      /* Clipboard blocked: the number is on screen. */
    }
  });

  const status = form.querySelector('.pf-status');
  const button = form.querySelector('button[type=submit]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.textContent = '';
    if (formState(definition) !== 'open') {
      status.textContent = 'This form is no longer accepting responses.';
      return;
    }
    const raw = readRaw(form);
    const { answers, errors } = checkAnswers(definition, raw);
    showErrors(form, errors);
    if (Object.keys(errors).length) {
      status.textContent = 'Please check the highlighted questions.';
      return;
    }
    // Automated sign-ups fill the hidden field; they get the normal message and nothing is stored.
    if (form.elements.pf_website.value) return done(definition);
    button.disabled = true;
    button.textContent = 'Submitting…';
    try {
      const rid = responseId(definition, answers);
      const result = await (await rest()).create(`forms/${id}/responses/${rid}`, { answers }, { timeField: 'submittedAt' });
      if (result === 'exists') {
        showErrors(form, { [PAYMENT_FIELDS.txn]: 'This transaction ID has already been used. Check it, or contact the chapter if you paid once.' });
        status.textContent = 'This transaction ID has already been used.';
        return;
      }
      done(definition);
    } catch (error) {
      if (error.status === 403 && paymentRequired(definition, raw) && formState(definition) === 'open') {
        // The database may report a reused transaction ID as a refusal rather than a duplicate.
        showErrors(form, { [PAYMENT_FIELDS.txn]: 'This transaction ID may already have been used. Check it, or contact the chapter.' });
        status.textContent = 'Your answers could not be accepted. Check the transaction ID, or reload the page if the form has closed.';
      } else
        status.textContent =
          error.status === 403
            ? 'Your answers could not be accepted. The form may have just closed. Reload the page to check.'
            : 'Your answers could not be sent. Check your connection and try again.';
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = 'Submit';
      }
    }
  });
}

if (root) start();
