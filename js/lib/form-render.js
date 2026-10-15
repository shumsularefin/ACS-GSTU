// HTML for a website form. Used by the public form page and the Chapter Editor preview.
import { escapeHTML as h } from './content-model.js';
import { answerless, formKinds, paymentMethods, PAYMENT_FIELDS, bdLabel, formState } from './form-model.js';

const req = (f) => (f.required ? '<span class="pf-req" aria-hidden="true">*</span>' : '');
const help = (f) => (f.help ? `<p class="pf-help" id="${h(f.id)}-help">${h(f.help)}</p>` : '');
const described = (f) => (f.help ? ` aria-describedby="${h(f.id)}-help"` : '');

const inputTypes = { short: 'text', email: 'email', phone: 'tel', number: 'text', date: 'date', month: 'month' };
const extras = {
  short: 'maxlength="300"',
  email: 'maxlength="300" autocomplete="email" inputmode="email"',
  phone: 'maxlength="20" autocomplete="tel" inputmode="tel" placeholder="01XXXXXXXXX"',
  number: 'maxlength="40" inputmode="decimal"',
  date: '',
  month: 'placeholder="YYYY-MM"',
};

function control(f) {
  const id = h(f.id);
  const required = f.required ? ' required' : '';
  if (f.type === 'paragraph') return `<textarea id="pf-${id}" name="${id}" rows="4" maxlength="3000"${required}${described(f)}></textarea>`;
  if (f.type in inputTypes) {
    const autocomplete = f.id === 'name' ? ' autocomplete="name"' : '';
    return `<input id="pf-${id}" name="${id}" type="${inputTypes[f.type]}" ${extras[f.type]}${autocomplete}${required}${described(f)}>`;
  }
  if (f.type === 'dropdown')
    return `<select id="pf-${id}" name="${id}"${required}${described(f)}><option value="">Choose…</option>${f.options
      .map((o) => `<option>${h(o)}</option>`)
      .join('')}</select>`;
  if (f.type === 'scale') {
    const steps = [];
    for (let n = f.min; n <= f.max; n++)
      steps.push(`<label class="pf-scale-step"><input type="radio" name="${id}" value="${n}"${required}><span>${n}</span></label>`);
    return `<div class="pf-scale"><span class="pf-scale-end">${h(f.minLabel || '')}</span><div class="pf-scale-steps">${steps.join('')}</div><span class="pf-scale-end">${h(f.maxLabel || '')}</span></div>`;
  }
  // Multiple choice and checkboxes.
  const type = f.type === 'checkboxes' ? 'checkbox' : 'radio';
  const options = f.options.map(
    (o) =>
      `<label class="pf-option"><input type="${type}" name="${id}" value="${h(o)}"${type === 'radio' ? required : ''}><span>${h(o)}</span></label>`,
  );
  if (f.other)
    options.push(
      `<label class="pf-option pf-other"><input type="${type}" name="${id}" value="__other"${type === 'radio' ? required : ''}><span>Other:</span><input type="text" name="${id}__other" maxlength="300" aria-label="${h(f.label)}: other answer"></label>`,
    );
  return `<div class="pf-options">${options.join('')}</div>`;
}

function question(f) {
  if (answerless(f))
    return `<div class="pf-section" data-field="${h(f.id)}"><h2>${h(f.label)}</h2>${f.help ? `<p>${h(f.help)}</p>` : ''}</div>`;
  const group = ['choice', 'checkboxes', 'scale'].includes(f.type);
  const condition = f.showIf ? ` data-show-field="${h(f.showIf.field)}" data-show-equals="${h(f.showIf.equals)}" hidden` : '';
  const title = group
    ? `<legend class="pf-label">${h(f.label)}${req(f)}</legend>`
    : `<label class="pf-label" for="pf-${h(f.id)}">${h(f.label)}${req(f)}</label>`;
  const tag = group ? 'fieldset' : 'div';
  return `<${tag} class="pf-q" data-field="${h(f.id)}"${condition}>${title}${help(f)}${control(f)}<p class="pf-error" id="${h(f.id)}-error" hidden></p></${tag}>`;
}

function payment(form) {
  const p = form.payment;
  if (!p?.enabled) return '';
  const methods = [...new Set(p.accounts.map((a) => a.method))];
  const skip = p.skipIf ? ` data-skip-field="${h(p.skipIf.field)}" data-skip-equals="${h(p.skipIf.equals)}"` : '';
  return `<section class="pf-pay" data-payment${skip} aria-labelledby="pf-pay-title">
    <div class="pf-pay-head"><h2 id="pf-pay-title">Payment</h2><p class="pf-amount">${h(p.amount)}</p></div>
    ${p.instructions ? `<p class="pf-pay-note">${h(p.instructions)}</p>` : ''}
    ${p.skipIf ? `<p class="pf-pay-note">Not needed if you answered “${h(p.skipIf.equals)}”.</p>` : ''}
    <ul class="pf-accounts">${p.accounts
      .map(
        (a) =>
          `<li class="pf-account pf-${h(a.method)}"><span class="pf-method">${h(paymentMethods[a.method])}</span><strong class="pf-number">${h(a.number)}</strong>${a.note ? `<small>${h(a.note)}</small>` : ''}<button type="button" class="pf-copy" data-copy="${h(a.number)}">Copy</button></li>`,
      )
      .join('')}</ul>
    <fieldset class="pf-q" data-field="${PAYMENT_FIELDS.method}"><legend class="pf-label">How did you pay?<span class="pf-req" aria-hidden="true">*</span></legend>
      <div class="pf-options">${methods
        .map(
          (m) =>
            `<label class="pf-option"><input type="radio" name="${PAYMENT_FIELDS.method}" value="${m}" required><span>${h(paymentMethods[m])}</span></label>`,
        )
        .join('')}</div><p class="pf-error" id="${PAYMENT_FIELDS.method}-error" hidden></p></fieldset>
    <div class="pf-q" data-field="${PAYMENT_FIELDS.sender}"><label class="pf-label" for="pf-${PAYMENT_FIELDS.sender}">Paid from (your bKash, Nagad or Rocket number, or bank account name)<span class="pf-req" aria-hidden="true">*</span></label>
      <input id="pf-${PAYMENT_FIELDS.sender}" name="${PAYMENT_FIELDS.sender}" maxlength="60" required><p class="pf-error" id="${PAYMENT_FIELDS.sender}-error" hidden></p></div>
    <div class="pf-q" data-field="${PAYMENT_FIELDS.txn}"><label class="pf-label" for="pf-${PAYMENT_FIELDS.txn}">Transaction ID<span class="pf-req" aria-hidden="true">*</span></label>
      <p class="pf-help">From the confirmation SMS or app, for example 8N7A6B5C4D. Each transaction ID can be used once.</p>
      <input id="pf-${PAYMENT_FIELDS.txn}" name="${PAYMENT_FIELDS.txn}" maxlength="60" autocomplete="off" spellcheck="false" required><p class="pf-error" id="${PAYMENT_FIELDS.txn}-error" hidden></p></div>
  </section>`;
}

/** Notice shown instead of the questions when a form is not accepting answers. */
export function closedNotice(form, now = new Date()) {
  const state = formState(form, now);
  if (state === 'open') return '';
  if (state === 'scheduled') return `This form opens on ${bdLabel(form.opensAt)} (Bangladesh time).`;
  if (state === 'draft') return 'This form is not published yet.';
  return 'This form is no longer accepting responses.';
}

export function renderForm(form, { now = new Date(), preview = false } = {}) {
  const notice = preview ? '' : closedNotice(form, now);
  const closes = form.closesAt ? `<p class="pf-deadline">Open until ${h(bdLabel(form.closesAt))} (Bangladesh time)</p>` : '';
  const head = `<header class="pf-head"><p class="eyebrow">${h(formKinds[form.kind] || 'Form')}</p><h1>${h(form.title)}</h1>${form.description
    .split(/\n+/)
    .filter(Boolean)
    .map((p) => `<p>${h(p)}</p>`)
    .join('')}${closes}${notice ? '' : '<p class="pf-required-note"><span class="pf-req">*</span> Required</p>'}</header>`;
  if (notice) return `<div class="pf">${head}<p class="pf-closed" role="status">${h(notice)}</p></div>`;
  return `<form class="pf" novalidate data-form="${h(form.id)}">${head}
    ${form.fields.map(question).join('')}
    ${payment(form)}
    <div class="pf-hp" aria-hidden="true"><label>Leave this empty <input name="pf_website" tabindex="-1" autocomplete="off"></label></div>
    <div class="pf-submit"><button type="submit" class="btn btn-primary"${preview ? ' disabled' : ''}>Submit</button><p class="pf-status" role="status" aria-live="polite"></p></div>
  </form>`;
}
