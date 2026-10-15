import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newForm,
  normalizeForm,
  checkAnswers,
  responseId,
  responseRows,
  responseColumns,
  summarize,
  formState,
  fromLocalBD,
  toLocalBD,
  normalizeTxn,
  departments,
} from '../../js/lib/form-model.js';
import { renderForm } from '../../js/lib/form-render.js';

const paidForm = (kind) => {
  const t = newForm(kind);
  return normalizeForm({
    ...t,
    id: `${kind}-2026`,
    status: 'open',
    payment: {
      ...t.payment,
      amount: '300 BDT',
      accounts: [
        { method: 'bkash', number: '01700000000', note: '' },
        { method: 'nagad', number: '01800000000' },
      ],
    },
  });
};

test('every template is a valid form; paid templates need an amount and an account', () => {
  for (const kind of ['member', 'event', 'feedback', 'general']) {
    const t = newForm(kind);
    if (t.payment.enabled) assert.throws(() => normalizeForm({ ...t, id: 'x' }), /amount/);
    else assert.equal(normalizeForm({ ...t, id: 'x' }).kind, kind);
  }
  const member = paidForm('member');
  for (const label of [
    'Department',
    'Student ID',
    'Session',
    'Blood group',
    'Religion',
    'Marital status',
    'Date of birth',
    'Police station (PS) or upazila',
  ])
    assert.ok(
      member.fields.some((f) => f.label === label),
      label,
    );
  assert.ok(member.fields.find((f) => f.id === 'department').options.includes('Pharmacy'));
});

test('editors get readable messages for incomplete forms', () => {
  const t = newForm('general');
  assert.throws(() => normalizeForm({ ...t, id: 'Bad ID' }), /address/);
  assert.throws(() => normalizeForm({ ...t, id: 'ok', title: ' ' }), /title/);
  assert.throws(() => normalizeForm({ ...t, id: 'ok', fields: [{ type: 'choice', label: 'Pick', options: [] }] }), /option/);
  assert.throws(
    () => normalizeForm({ ...t, id: 'ok', opensAt: new Date('2026-11-02T10:00:00Z'), closesAt: new Date('2026-11-01T10:00:00Z') }),
    /closing time/,
  );
  // Conditions that point at a missing question are dropped.
  const f = normalizeForm({ ...t, id: 'ok', fields: [{ id: 'a', type: 'short', label: 'A', showIf: { field: 'gone', equals: 'x' } }] });
  assert.equal(f.fields[0].showIf, undefined);
});

test('answers are checked, hidden questions dropped, and premium members skip payment', () => {
  const form = paidForm('event');
  const base = {
    name: 'A',
    email: 'not-an-email',
    phone: '12',
    institution: 'GSTU',
    department: departments[1],
    student_id: '1',
    membership: 'General member',
    acs_id: 'P-1',
  };
  const first = checkAnswers(form, base);
  assert.equal(first.errors.email, 'Enter a valid email address.');
  assert.match(first.errors.phone, /phone/);
  assert.ok(first.errors.payment_method && first.errors.payment_txn);
  assert.equal(first.answers.acs_id, undefined, 'only shown to premium members');
  const ok = checkAnswers(form, {
    ...base,
    email: 'a@b.co',
    phone: '01711111111',
    payment_method: 'nagad',
    payment_sender: '018',
    payment_txn: ' ab-12 cd34 ',
  });
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.answers.payment_txn, 'AB12CD34');
  assert.equal(responseId(form, ok.answers), 'txn_AB12CD34');
  const premium = checkAnswers(form, { ...base, email: 'a@b.co', phone: '01711111111', membership: 'Premium member' });
  assert.deepEqual(premium.errors, {});
  assert.equal(premium.answers.acs_id, 'P-1');
  assert.match(responseId(form, premium.answers), /^r_[a-f0-9]{24}$/);
  assert.equal(normalizeTxn('8n7a-6b'), '8N7A6B');
});

test('feedback summaries, Excel rows and retired questions', () => {
  const form = normalizeForm({ ...newForm('feedback'), id: 'feedback' });
  const responses = [
    { id: 'r1', submittedAt: new Date('2026-11-02T04:00:00Z'), answers: { overall: '5', again: 'Yes', old_question: 'kept' } },
    { id: 'r2', submittedAt: new Date('2026-11-01T04:00:00Z'), answers: { overall: '3', again: 'Maybe' } },
  ];
  const overall = summarize(form, responses).find((s) => s.field.id === 'overall');
  assert.equal(overall.average, 4);
  assert.equal(overall.answered, 2);
  const rows = responseRows(form, responses);
  assert.equal(rows[0][1], 'Submitted (Bangladesh time)');
  assert.equal(rows.length, 3);
  assert.equal(rows[1][0], 1);
  assert.equal(rows[1][rows[0].indexOf('Overall, how would you rate the event?')], '3', 'oldest first');
  assert.ok(responseColumns(form, responses).some((c) => c.label === 'Removed question (old_question)'));
});

test('times are Bangladesh time and the form state follows them', () => {
  const opens = fromLocalBD('2026-11-02T18:00');
  assert.equal(opens.toISOString(), '2026-11-02T12:00:00.000Z');
  assert.equal(toLocalBD(opens), '2026-11-02T18:00');
  const form = { status: 'open', opensAt: opens, closesAt: fromLocalBD('2026-11-03T18:00') };
  assert.equal(formState(form, new Date('2026-11-02T11:59:00Z')), 'scheduled');
  assert.equal(formState(form, new Date('2026-11-02T12:00:00Z')), 'open');
  assert.equal(formState(form, new Date('2026-11-03T12:00:00Z')), 'ended');
  assert.equal(formState({ ...form, status: 'closed' }, new Date('2026-11-02T13:00:00Z')), 'closed');
});

test('the public form shows payment accounts and escapes text', () => {
  const form = paidForm('member');
  form.title = '<b>Join</b>';
  const html = renderForm(form);
  assert.ok(html.includes('&lt;b&gt;Join&lt;/b&gt;'));
  assert.ok(html.includes('01700000000') && html.includes('Nagad'));
  assert.ok(html.includes('name="payment_txn"'));
  assert.ok(renderForm({ ...form, status: 'closed' }).includes('no longer accepting'));
});
