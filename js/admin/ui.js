// Small DOM helpers shared by the Chapter Editor views.
import { escapeHTML } from '../lib/content-model.js';

export const h = escapeHTML;
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function html(strings, ...values) {
  return strings.reduce((out, s, i) => out + s + (i < values.length ? values[i] : ''), '');
}

const timeFormat = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const dateTimeFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
export const clock = (date = new Date()) => timeFormat.format(date);
export const when = (date) => (date ? dateTimeFormat.format(date) : '');

// ------------------------------------------------------------------ toasts

export function toast(message, { type = 'success', timeout = 6000 } = {}) {
  const region = $('#ed-toasts');
  const item = document.createElement('div');
  item.className = `ed-toast ed-toast-${type}`;
  item.setAttribute('role', type === 'error' ? 'alert' : 'status');
  item.innerHTML = `<span>${h(message)}</span><button type="button" aria-label="Dismiss">×</button>`;
  item.querySelector('button').addEventListener('click', () => item.remove());
  region.append(item);
  if (timeout) setTimeout(() => item.remove(), type === 'error' ? timeout * 2 : timeout);
  return item;
}

export function errorMessage(error) {
  const codes = {
    'auth/network-request-failed': 'Google sign-in could not be reached. Check your connection or content blocker and try again.',
    'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.',
    'auth/popup-closed-by-user': 'The sign-in window was closed before you finished. Choose Sign in with Google to try again.',
    'auth/cancelled-popup-request': 'Another sign-in window is already open.',
    'auth/unauthorized-domain': 'This address is not allowed for sign-in. Open https://acs-gstu.web.app/admin.html instead.',
    'auth/operation-not-allowed': 'Google sign-in is turned off in Firebase Authentication.',
    'permission-denied': 'Your account does not have permission for this action. Ask the super-admin if you need access.',
    unavailable: 'The chapter database is unreachable right now. Your draft is safe; try again in a moment.',
    'resource-exhausted': 'The free daily database quota is used up. Your draft is safe; try again tomorrow.',
  };
  return codes[error?.code] || error?.message || 'Something went wrong. Please try again.';
}

// ------------------------------------------------------------------ dialogs

/** Accessible confirmation dialog. Resolves true when confirmed. */
export function confirmDialog({ title, body = '', confirm = 'Confirm', cancel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'ed-dialog';
    dialog.innerHTML = `<form method="dialog"><h2>${h(title)}</h2><div class="ed-dialog-body">${body}</div><div class="ed-actions"><button value="cancel" class="ed-btn ed-btn-quiet">${h(cancel)}</button><button value="ok" class="ed-btn ${danger ? 'ed-btn-danger' : 'ed-btn-primary'}">${h(confirm)}</button></div></form>`;
    document.body.append(dialog);
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'ok');
      dialog.remove();
    });
    dialog.showModal();
    dialog.querySelector('button[value="ok"]').focus();
  });
}

/** A dialog with custom content; `setup(dialog, close)` wires it. Resolves with the value passed to close. */
export function openDialog(content, setup = () => {}, { wide = false } = {}) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'ed-dialog' + (wide ? ' ed-dialog-wide' : '');
    dialog.innerHTML = content;
    document.body.append(dialog);
    let value;
    const close = (result) => {
      value = result;
      dialog.close();
    };
    dialog.addEventListener('close', () => {
      resolve(value);
      dialog.remove();
    });
    dialog.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) close();
    });
    setup(dialog, close);
    dialog.showModal();
  });
}

// ------------------------------------------------------------------ buttons and forms

/** Runs an async action with the button disabled and a working label; reports errors as toasts. */
export async function busy(button, label, action) {
  const original = button?.innerHTML;
  if (button) {
    button.disabled = true;
    button.dataset.busy = 'true';
    button.textContent = label;
  }
  try {
    return await action();
  } catch (error) {
    console.error(error);
    toast(errorMessage(error), { type: 'error' });
    return undefined;
  } finally {
    if (button) {
      button.disabled = false;
      delete button.dataset.busy;
      button.innerHTML = original;
    }
  }
}

export function formValues(form) {
  const values = {};
  for (const field of form.elements) {
    if (!field.name || field.type === 'file' || field.dataset.ignore !== undefined) continue;
    if (field.type === 'checkbox') values[field.name] = field.checked;
    else if (field.type === 'radio') {
      if (field.checked) values[field.name] = field.value;
    } else values[field.name] = field.value;
  }
  return values;
}

export function fillForm(form, values) {
  for (const field of form.elements) {
    if (!field.name || field.type === 'file' || !(field.name in values)) continue;
    const value = values[field.name];
    if (field.type === 'checkbox') field.checked = !!value;
    else if (field.type === 'radio') field.checked = field.value === value;
    else field.value = Array.isArray(value) ? value.join('\n') : (value ?? '');
  }
}

/** Shows a validation message next to the form and focuses the field it names, when it can find one. */
export function showFormError(form, message, fieldName) {
  let box = $('.ed-form-error', form);
  if (!box) {
    box = document.createElement('div');
    box.className = 'ed-form-error';
    box.setAttribute('role', 'alert');
    form.prepend(box);
  }
  box.textContent = message;
  box.hidden = !message;
  if (!message) return;
  const field = form.elements ? (fieldName && form.elements[fieldName]) || guessField(form, message) : null;
  field?.setAttribute('aria-invalid', 'true');
  (field || box).focus?.({ preventScroll: true });
  (field || box).scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function guessField(form, message) {
  const text = message.toLowerCase();
  for (const field of form.elements) {
    const label = field.closest('label')?.querySelector('.ed-label')?.textContent?.toLowerCase();
    if (label && text.includes(label.replace(/\s*\(optional\)/, '').trim())) return field;
  }
  return null;
}

export function clearFormError(form) {
  const box = $('.ed-form-error', form);
  if (box) box.hidden = true;
  for (const field of $$('[aria-invalid]', form)) field.removeAttribute('aria-invalid');
}

export function download(name, body, type) {
  const url = URL.createObjectURL(body instanceof Blob ? body : new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const field = ({ label, name, type = 'text', value = '', hint = '', optional = false, attrs = '', wide = false }) =>
  `<label class="ed-field${wide ? ' ed-wide' : ''}"><span class="ed-label">${h(label)}${optional ? ' <em>(optional)</em>' : ''}</span>${
    type === 'textarea'
      ? `<textarea name="${name}" ${attrs}>${h(value)}</textarea>`
      : `<input name="${name}" type="${type}" value="${h(value)}" ${attrs}>`
  }${hint ? `<small>${hint}</small>` : ''}</label>`;

export const select = ({ label, name, options, value = '', hint = '', attrs = '' }) =>
  `<label class="ed-field"><span class="ed-label">${h(label)}</span><select name="${name}" ${attrs}>${options
    .map(([v, text]) => `<option value="${h(v)}"${v === value ? ' selected' : ''}>${h(text)}</option>`)
    .join('')}</select>${hint ? `<small>${hint}</small>` : ''}</label>`;

export const debounce = (fn, wait = 400) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
};

export function slug(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/, '');
}
