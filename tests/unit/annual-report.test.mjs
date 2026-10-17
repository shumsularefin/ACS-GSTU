import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildReport,
  currentReportYear,
  daysUntil,
  fiscalYear,
  fiscalYears,
  overlapsPrevious,
  reportPDF,
  reportRows,
} from '../../js/lib/annual-report.js';

const pdfLib = () => {
  const m = { exports: {} };
  new Function('exports', 'module', fs.readFileSync('js/vendor/pdf-lib.min.js', 'utf8'))(m.exports, m);
  return m.exports;
};
const ev = (id, date, category, extra = {}) => ({
  id,
  title: `Event ${id}`,
  date,
  category,
  description: `About ${id}.`,
  location: 'GSTU',
  startsAt: '',
  endsAt: '',
  ...extra,
});
const events = [
  ev('before', '2025-04-30', 'service'),
  ev('first-day', '2025-05-01', 'service'),
  ev('conference', '2025-12-13', 'professional-development', { startsAt: '2025-12-13', endsAt: '2025-12-14' }),
  ev('meeting', '2025-09-14', 'chapter-development'),
  ev('cleanup', '2026-03-01', 'green-chemistry'),
  ev('last-day', '2026-05-31', 'chapter-development'),
  ev('after', '2026-06-01', 'service'),
];

test('annual report: the fiscal year runs from May of the previous year to the 31 May deadline', () => {
  assert.deepEqual(fiscalYear(2026), {
    id: '2025-2026',
    label: '2025–2026',
    endYear: 2026,
    start: '2025-05-01',
    end: '2026-05-31',
    due: '2026-05-31',
  });
  assert.equal(currentReportYear('2026-05-31'), 2026, 'May is still the report due that month');
  assert.equal(currentReportYear('2026-06-01'), 2027, 'from June the next report is in progress');
  assert.equal(daysUntil('2026-05-31', '2026-05-01'), 30);
  const years = fiscalYears(events, '2026-10-17');
  assert.deepEqual(
    years.map((y) => [y.id, y.count]),
    [
      ['2026-2027', 2],
      ['2025-2026', 5],
      ['2024-2025', 2],
    ],
    'May events fall inside two periods (the report due 31 May, and the next one)',
  );
});

test('annual report: only events in the period, grouped by the ACS sections in date order', () => {
  const report = buildReport(events, fiscalYear(2026));
  assert.equal(report.total, 5);
  assert.deepEqual(
    report.sections.map((s) => [s.label, s.events.map((e) => e.id)]),
    [
      ['Service', ['first-day']],
      ['Professional Development', ['conference']],
      ['Chapter Development', ['meeting', 'last-day']],
      ['Green Chemistry', ['cleanup']],
    ],
  );
  assert.ok(overlapsPrevious(events[1], '2025-05-01'), 'May events can also belong to the previous report');
  assert.ok(!overlapsPrevious(events[3], '2025-05-01'));
});

test('annual report: leave events out, change their section, or also list them under Green Chemistry', () => {
  const report = buildReport(events, {
    ...fiscalYear(2026),
    choices: { excluded: ['meeting'], category: { 'first-day': 'chapter-development' }, green: ['conference'] },
  });
  assert.equal(report.total, 4);
  assert.deepEqual(report.sections[0].events, []);
  assert.deepEqual(
    report.sections[2].events.map((e) => e.id),
    ['first-day', 'last-day'],
  );
  assert.deepEqual(
    report.sections[3].events.map((e) => e.id),
    ['conference', 'cleanup'],
  );
  assert.equal(events[1].category, 'service', 'the website event is unchanged');
  const rows = reportRows(report);
  assert.deepEqual(rows[0], ['Section', 'Event title', 'Date', 'End date', 'Location', 'Category', 'Description']);
  assert.deepEqual(rows.find((r) => r[1] === 'Event conference').slice(2, 4), ['2025-12-13', '2025-12-14']);
  assert.throws(() => buildReport(events, { start: '2026-05-31', end: '2025-05-01' }), /period/);
});

test('annual report: the PDF is drawn, long descriptions continue on new pages, and any text is safe', async () => {
  const long = {
    ...ev('long', '2025-08-01', 'service'),
    title: 'Bangla বাংলা “quoted” — title',
    description: 'Word '.repeat(2500) + 'x'.repeat(400),
  };
  const report = buildReport([...events, long], fiscalYear(2026));
  const bytes = await reportPDF(pdfLib(), report, {
    officers: [{ role: 'Chapter President', name: 'Shumsul Arefin' }],
    generatedOn: '17 October 2026',
  });
  const pdf = await pdfLib().PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() >= 3);
  assert.equal(pdf.getTitle(), 'ACS Student Chapter Annual Report 2025-2026');
});
