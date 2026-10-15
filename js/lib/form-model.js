// Website forms: member registration, event registration and event feedback (plus blank forms).
// Shared by the Chapter Editor (building forms, reading responses) and the public form page.
//
// A form document (forms/{id}):
//   { id, title, description, kind, status, opensAt, closesAt, eventId, fields: [...], payment, confirmation }
// A field: { id, type, label, help, required, options, other, min, max, minLabel, maxLabel, showIf }
// A response (forms/{id}/responses/{responseId}): { answers: { fieldId: string | string[] }, submittedAt }
// Payment forms use the transaction ID as the response ID, so one transaction can only be submitted once.

export const FORM_SITE = 'https://acs-gstu.web.app/';
export const formLink = (id) => `${FORM_SITE}form.html?id=${encodeURIComponent(id)}`;

export const formKinds = {
  member: 'Member registration',
  event: 'Event registration',
  feedback: 'Event feedback',
  general: 'Other form',
};

export const fieldTypes = {
  short: 'Short answer',
  paragraph: 'Paragraph',
  email: 'Email',
  phone: 'Phone number',
  number: 'Number',
  date: 'Date',
  month: 'Month and year',
  choice: 'Multiple choice',
  checkboxes: 'Checkboxes',
  dropdown: 'Dropdown',
  scale: 'Linear scale',
  section: 'Section heading',
};
export const choiceTypes = ['choice', 'checkboxes', 'dropdown'];
export const answerless = (f) => f.type === 'section';

export const paymentMethods = {
  bkash: 'bKash',
  nagad: 'Nagad',
  rocket: 'Rocket',
  bank: 'Bank transfer',
};

// Answers that the website adds to every payment form.
export const PAYMENT_FIELDS = {
  method: 'payment_method',
  sender: 'payment_sender',
  txn: 'payment_txn',
};

export const LIMITS = { short: 300, paragraph: 3000, fields: 80, options: 60 };

export const departments = [
  'Applied Chemistry and Chemical Engineering (ACCE)',
  'Chemistry',
  'Pharmacy',
  'Biochemistry and Molecular Biology (BMB)',
  'Biotechnology and Genetic Engineering (BGE)',
  'Microbiology',
  'Environmental Science and Disaster Management (ESDM)',
  'Physics',
  'Mathematics',
  'Other',
];
const bloodGroups = ['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−', 'I don’t know'];

let counter = 0;
export function newFieldId() {
  counter = (counter + 1) % 1000;
  return 'q' + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 5) + counter.toString(36);
}

const q = (id, type, label, extra = {}) => ({
  id,
  type,
  label,
  help: '',
  required: true,
  options: [],
  other: false,
  ...extra,
});

/** Starting points for new forms. The editor can change every question. */
export const templates = {
  member: () => ({
    kind: 'member',
    title: 'Member registration',
    description:
      'Join the ACS International Student Chapter at GSTU. Fill in your details, pay the membership fee and enter the transaction ID. The chapter confirms your membership after checking the payment.',
    fields: [
      q('name', 'short', 'Full name'),
      q('email', 'email', 'Email address'),
      q('department', 'dropdown', 'Department', { options: departments }),
      q('student_id', 'short', 'Student ID'),
      q('session', 'short', 'Session', { help: 'For example 2022–23.' }),
      q('phone_type', 'choice', 'Phone type', { options: ['Mobile', 'WhatsApp', 'Mobile and WhatsApp'] }),
      q('phone', 'phone', 'Phone number'),
      q('gender', 'choice', 'Gender', { options: ['Male', 'Female', 'Prefer not to say'] }),
      q('dob', 'date', 'Date of birth'),
      q('blood_group', 'dropdown', 'Blood group', { options: bloodGroups }),
      q('religion', 'dropdown', 'Religion', { options: ['Islam', 'Hinduism', 'Buddhism', 'Christianity', 'Other', 'Prefer not to say'] }),
      q('marital_status', 'choice', 'Marital status', { options: ['Single', 'Married', 'Prefer not to say'] }),
      q('address_section', 'section', 'Address', { required: false }),
      q('present_address', 'paragraph', 'Present address'),
      q('permanent_address', 'paragraph', 'Permanent address', { help: 'Village or road, house, post office.' }),
      q('permanent_city', 'short', 'City or district'),
      q('permanent_ps', 'short', 'Police station (PS) or upazila'),
      q('permanent_zip', 'short', 'ZIP or postal code'),
      q('about_section', 'section', 'About you', { required: false }),
      q('experience', 'paragraph', 'Experiences (if any)', { required: false, help: 'Clubs, research, volunteering, competitions…' }),
      q('motivation', 'paragraph', 'Briefly describe why you are interested in becoming a member of the ACS Student Chapter, GSTU'),
      q('acs_id', 'short', 'ACS membership ID', { required: false, help: 'Only if you already have one.' }),
      q('graduation', 'month', 'Expected graduation (month and year)'),
    ],
    payment: {
      enabled: true,
      amount: '',
      instructions: 'Send the membership fee with Send Money, then enter your transaction ID below.',
      accounts: [{ method: 'bkash', number: '', note: 'Personal' }],
      skipIf: null,
    },
    confirmation: 'Thank you! Your registration has been received. The chapter will contact you after checking your payment.',
  }),
  event: () => ({
    kind: 'event',
    title: 'Event registration',
    description: 'Register for this event. Seats are limited, so register early.',
    fields: [
      q('name', 'short', 'Full name'),
      q('email', 'email', 'Email address'),
      q('phone', 'phone', 'Phone number'),
      q('institution', 'short', 'University or institution', { help: 'Gopalganj Science and Technology University, or your own.' }),
      q('department', 'dropdown', 'Department', { options: departments }),
      q('student_id', 'short', 'Student ID'),
      q('session', 'short', 'Session', { required: false }),
      q('membership', 'choice', 'Are you a member of the ACS Student Chapter, GSTU?', {
        options: ['Premium member', 'General member', 'Not a member'],
      }),
      q('acs_id', 'short', 'Chapter or ACS membership ID', {
        required: false,
        showIf: { field: 'membership', equals: 'Premium member' },
        help: 'Premium members: your ID is checked before the event.',
      }),
    ],
    payment: {
      enabled: true,
      amount: '',
      instructions: 'Send the registration fee with Send Money, then enter your transaction ID below.',
      accounts: [{ method: 'bkash', number: '', note: 'Personal' }],
      skipIf: { field: 'membership', equals: 'Premium member' },
    },
    confirmation: 'You are registered! We will email you the event details.',
  }),
  feedback: () => ({
    kind: 'feedback',
    title: 'Event feedback',
    description: 'Tell us how the event went. Your answers help us plan better events.',
    fields: [
      q('name', 'short', 'Name', { required: false }),
      q('overall', 'scale', 'Overall, how would you rate the event?', { min: 1, max: 5, minLabel: 'Poor', maxLabel: 'Excellent' }),
      q('content', 'scale', 'How useful was the content?', { min: 1, max: 5, minLabel: 'Not useful', maxLabel: 'Very useful' }),
      q('speakers', 'scale', 'How were the speakers or instructors?', { min: 1, max: 5, minLabel: 'Poor', maxLabel: 'Excellent' }),
      q('organization', 'scale', 'How well was the event organized?', { min: 1, max: 5, minLabel: 'Poorly', maxLabel: 'Very well' }),
      q('liked', 'paragraph', 'What did you like most?', { required: false }),
      q('improve', 'paragraph', 'What could we improve?', { required: false }),
      q('again', 'choice', 'Would you join our next event?', { options: ['Yes', 'Maybe', 'No'] }),
      q('recommend', 'scale', 'How likely are you to recommend our events to a friend?', {
        min: 0,
        max: 10,
        minLabel: 'Not likely',
        maxLabel: 'Very likely',
      }),
    ],
    payment: { enabled: false, amount: '', instructions: '', accounts: [], skipIf: null },
    confirmation: 'Thank you for your feedback!',
  }),
  general: () => ({
    kind: 'general',
    title: 'Untitled form',
    description: '',
    fields: [q('name', 'short', 'Full name'), q('email', 'email', 'Email address')],
    payment: { enabled: false, amount: '', instructions: '', accounts: [], skipIf: null },
    confirmation: 'Thank you! Your response has been recorded.',
  }),
};

export function newForm(kind = 'general') {
  return { id: '', status: 'draft', opensAt: '', closesAt: '', eventId: '', ...(templates[kind] || templates.general)() };
}

// ------------------------------------------------------------------ dates (Bangladesh time, UTC+06:00)

/** "2026-11-02T18:00" (Bangladesh time) -> Date */
export function fromLocalBD(value) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw Error('Use a complete date and time.');
  return new Date(`${value}:00+06:00`);
}
/** Date -> "2026-11-02T18:00" (Bangladesh time) */
export function toLocalBD(date) {
  if (!date) return '';
  const d = new Date(new Date(date).getTime() + 6 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
}
const bdFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dhaka',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});
export const bdLabel = (date) => (date ? bdFormat.format(new Date(date)) : '');

/** 'draft' | 'scheduled' | 'open' | 'ended' | 'closed' */
export function formState(form, now = new Date()) {
  if (form.status === 'draft') return 'draft';
  if (form.status === 'closed') return 'closed';
  const opens = form.opensAt ? new Date(form.opensAt) : null;
  const closes = form.closesAt ? new Date(form.closesAt) : null;
  if (opens && now < opens) return 'scheduled';
  if (closes && now >= closes) return 'ended';
  return 'open';
}
export const stateLabels = {
  draft: 'Draft',
  scheduled: 'Opens later',
  open: 'Accepting responses',
  ended: 'Time limit reached',
  closed: 'Closed',
};

// ------------------------------------------------------------------ validation for editors

const text = (v, max) =>
  String(v ?? '')
    .trim()
    .slice(0, max);
const lines = (v) => (Array.isArray(v) ? v : String(v ?? '').split('\n')).map((s) => text(s, 200)).filter(Boolean);

function normalizeField(raw, index) {
  const type = raw.type in fieldTypes ? raw.type : 'short';
  const label = text(raw.label, 300);
  if (!label) throw Error(`Question ${index + 1} needs a title.`);
  const f = {
    id: /^[a-z][a-z0-9_]{0,39}$/.test(raw.id || '') ? raw.id : newFieldId(),
    type,
    label,
    help: text(raw.help, 500),
    required: type === 'section' ? false : !!raw.required,
    options: [],
    other: false,
  };
  if (choiceTypes.includes(type)) {
    f.options = [...new Set(lines(raw.options))].slice(0, LIMITS.options);
    if (!f.options.length) throw Error(`Question ${index + 1} (“${label}”) needs at least one option.`);
    f.other = type !== 'dropdown' && !!raw.other;
  }
  if (type === 'scale') {
    f.min = Number(raw.min) === 0 ? 0 : 1;
    f.max = Math.min(10, Math.max(f.min + 1, Number(raw.max) || 5));
    f.minLabel = text(raw.minLabel, 60);
    f.maxLabel = text(raw.maxLabel, 60);
  }
  if (raw.showIf?.field && raw.showIf.equals) f.showIf = { field: String(raw.showIf.field), equals: text(raw.showIf.equals, 200) };
  return f;
}

/** Validates a form for publishing. Throws a readable message. */
export function normalizeForm(raw) {
  const id = String(raw.id || '').trim();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) || id.length > 80)
    throw Error('The form address may use lowercase letters, numbers and hyphens.');
  const title = text(raw.title, 200);
  if (!title) throw Error('Give the form a title.');
  const fields = (raw.fields || []).map(normalizeField);
  if (!fields.some((f) => !answerless(f))) throw Error('Add at least one question.');
  if (fields.length > LIMITS.fields) throw Error(`A form can have up to ${LIMITS.fields} questions.`);
  const ids = new Set();
  for (const f of fields) {
    if (ids.has(f.id) || Object.values(PAYMENT_FIELDS).includes(f.id)) f.id = newFieldId();
    ids.add(f.id);
  }
  for (const f of fields) if (f.showIf && !fields.some((g) => g.id === f.showIf.field && choiceTypes.includes(g.type))) delete f.showIf;
  const opensAt = raw.opensAt ? new Date(raw.opensAt) : null;
  const closesAt = raw.closesAt ? new Date(raw.closesAt) : null;
  if ((opensAt && isNaN(opensAt)) || (closesAt && isNaN(closesAt))) throw Error('Check the opening and closing times.');
  if (opensAt && closesAt && closesAt <= opensAt) throw Error('The closing time must be after the opening time.');
  const p = raw.payment || {};
  const payment = {
    enabled: !!p.enabled,
    amount: text(p.amount, 120),
    instructions: text(p.instructions, 1000),
    accounts: (p.accounts || [])
      .map((a) => ({ method: a.method in paymentMethods ? a.method : 'bkash', number: text(a.number, 120), note: text(a.note, 200) }))
      .filter((a) => a.number)
      .slice(0, 8),
    skipIf: p.skipIf?.field && p.skipIf.equals ? { field: String(p.skipIf.field), equals: text(p.skipIf.equals, 200) } : null,
  };
  if (payment.enabled && !payment.amount) throw Error('Enter the payment amount, for example “300 BDT”.');
  if (payment.enabled && !payment.accounts.length)
    throw Error('Add at least one bKash, Nagad, Rocket or bank account number for payments.');
  return {
    id,
    title,
    description: text(raw.description, 3000),
    kind: raw.kind in formKinds ? raw.kind : 'general',
    status: ['draft', 'open', 'closed'].includes(raw.status) ? raw.status : 'draft',
    opensAt,
    closesAt,
    eventId: text(raw.eventId, 100),
    fields,
    payment,
    confirmation: text(raw.confirmation, 1000) || 'Thank you! Your response has been recorded.',
  };
}

// ------------------------------------------------------------------ answering

const valueOf = (answers, id) => answers[id];
const matches = (answers, cond) => {
  if (!cond) return false;
  const v = valueOf(answers, cond.field);
  return Array.isArray(v) ? v.includes(cond.equals) : v === cond.equals;
};
export const fieldVisible = (field, answers) => !field.showIf || matches(answers, field.showIf);
export const paymentRequired = (form, answers) => !!form.payment?.enabled && !matches(answers, form.payment.skipIf);

/** Transaction IDs: letters and digits only, upper case. */
export const normalizeTxn = (v) =>
  String(v || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

/** Response document ID: the transaction ID for paid responses (one submission per transaction). */
export function responseId(form, answers) {
  if (paymentRequired(form, answers)) return 'txn_' + normalizeTxn(answers[PAYMENT_FIELDS.txn]);
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return 'r_' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Checks answers against the form. Returns { answers, errors } where errors maps field IDs to messages.
 * Hidden questions are dropped, so their answers are never stored.
 */
export function checkAnswers(form, raw) {
  const answers = {};
  const errors = {};
  for (const f of form.fields) {
    if (answerless(f) || !fieldVisible(f, raw)) continue;
    let v = raw[f.id];
    if (f.type === 'checkboxes') {
      v = (Array.isArray(v) ? v : v ? [v] : []).map((x) => text(x, 300)).filter(Boolean);
      if (!f.other) v = v.filter((x) => f.options.includes(x));
      if (f.required && !v.length) errors[f.id] = 'Choose at least one option.';
      if (v.length) answers[f.id] = [...new Set(v)].slice(0, LIMITS.options + 1);
      continue;
    }
    v = text(v, f.type === 'paragraph' ? LIMITS.paragraph : LIMITS.short);
    if (!v) {
      if (f.required) errors[f.id] = 'This question is required.';
      continue;
    }
    if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errors[f.id] = 'Enter a valid email address.';
    if (f.type === 'phone' && !/^\+?[0-9][0-9\s-]{6,18}$/.test(v)) errors[f.id] = 'Enter a valid phone number, for example 01XXXXXXXXX.';
    if (f.type === 'number' && !/^-?\d+(\.\d+)?$/.test(v)) errors[f.id] = 'Enter a number.';
    if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) errors[f.id] = 'Enter a date.';
    if (f.type === 'month' && !/^\d{4}-\d{2}$/.test(v)) errors[f.id] = 'Enter a month and year.';
    if ((f.type === 'choice' || f.type === 'dropdown') && !f.options.includes(v) && !f.other) errors[f.id] = 'Choose one of the options.';
    if (f.type === 'scale') {
      const n = Number(v);
      if (!Number.isInteger(n) || n < f.min || n > f.max) errors[f.id] = 'Choose a value on the scale.';
    }
    answers[f.id] = v;
  }
  if (paymentRequired(form, raw)) {
    const method = text(raw[PAYMENT_FIELDS.method], 40);
    const sender = text(raw[PAYMENT_FIELDS.sender], 60);
    const txn = normalizeTxn(raw[PAYMENT_FIELDS.txn]);
    const offered = [...new Set(form.payment.accounts.map((a) => a.method))];
    if (!offered.includes(method)) errors[PAYMENT_FIELDS.method] = 'Choose how you paid.';
    if (!sender) errors[PAYMENT_FIELDS.sender] = 'Enter the number or account you paid from.';
    if (txn.length < 6 || txn.length > 40)
      errors[PAYMENT_FIELDS.txn] = 'Enter the transaction ID from your payment message (6–40 letters and numbers).';
    answers[PAYMENT_FIELDS.method] = method;
    answers[PAYMENT_FIELDS.sender] = sender;
    answers[PAYMENT_FIELDS.txn] = txn;
  }
  return { answers, errors };
}

// ------------------------------------------------------------------ results

const PAYMENT_COLUMNS = [
  [PAYMENT_FIELDS.method, 'Payment method'],
  [PAYMENT_FIELDS.sender, 'Paid from'],
  [PAYMENT_FIELDS.txn, 'Transaction ID'],
];

/** Column definitions for the response table and the Excel export (current questions, then retired ones). */
export function responseColumns(form, responses = []) {
  const columns = form.fields.filter((f) => !answerless(f)).map((f) => ({ id: f.id, label: f.label }));
  if (form.payment?.enabled || responses.some((r) => r.answers?.[PAYMENT_FIELDS.txn]))
    for (const [id, label] of PAYMENT_COLUMNS) columns.push({ id, label });
  const known = new Set(columns.map((c) => c.id));
  for (const r of responses)
    for (const id of Object.keys(r.answers || {}))
      if (!known.has(id)) {
        known.add(id);
        columns.push({ id, label: `Removed question (${id})` });
      }
  return columns;
}

export const answerText = (v) => (Array.isArray(v) ? v.join(', ') : (v ?? ''));
const methodLabel = (id, v) => (id === PAYMENT_FIELDS.method ? paymentMethods[v] || v : v);

/** Rows for the Excel export: one header row, then one row per response (oldest first). */
export function responseRows(form, responses) {
  const columns = responseColumns(form, responses);
  const header = ['#', 'Submitted (Bangladesh time)', ...columns.map((c) => c.label)];
  if (form.payment?.enabled) header.push('Payment verified');
  const sorted = [...responses].sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0));
  const rows = sorted.map((r, i) => {
    const row = [
      i + 1,
      r.submittedAt ? bdLabel(r.submittedAt) : '',
      ...columns.map((c) => methodLabel(c.id, answerText(r.answers?.[c.id]))),
    ];
    if (form.payment?.enabled) row.push(r.verified ? 'Yes' : r.answers?.[PAYMENT_FIELDS.txn] ? 'No' : '');
    return row;
  });
  return [header, ...rows];
}

/** Per-question summaries for choice and scale questions: counts and (for scales) the average. */
export function summarize(form, responses) {
  return form.fields
    .filter((f) => choiceTypes.includes(f.type) || f.type === 'scale')
    .map((f) => {
      const counts = new Map();
      if (f.type === 'scale') for (let n = f.min; n <= f.max; n++) counts.set(String(n), 0);
      else for (const o of f.options) counts.set(o, 0);
      let answered = 0;
      let total = 0;
      for (const r of responses) {
        const v = r.answers?.[f.id];
        if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue;
        answered++;
        for (const x of Array.isArray(v) ? v : [v]) {
          const key = f.type === 'scale' || f.options.includes(x) ? x : 'Other';
          counts.set(key, (counts.get(key) || 0) + 1);
          if (f.type === 'scale') total += Number(x);
        }
      }
      return { field: f, answered, counts: [...counts], average: f.type === 'scale' && answered ? total / answered : null };
    });
}
