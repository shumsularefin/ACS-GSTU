// Annual reports: the ACS student chapter report for a fiscal year (May to the 31 May deadline),
// built from the published events and downloaded as a PDF (or Excel, for copying into the ACS portal).
import { h, $, busy, toast, download } from '../ui.js';
import { downloadWorkbook } from '../spreadsheet.js';
import { categories, todayInBangladesh } from '../../lib/content-model.js';
import { dateLabel, eventDateLabel } from '../../lib/content-render.js';
import { loadPdfLib } from '../../lib/certificate-render.js';
import {
  ADVISORS,
  CHAPTER,
  SECTIONS,
  buildReport,
  currentReportYear,
  daysUntil,
  fiscalYear,
  fiscalYears,
  inPeriod,
  overlapsPrevious,
  reportPDF,
  reportRows,
} from '../../lib/annual-report.js';

// Choices for each report (left-out events, sections, cross-listing, details) are remembered in this
// browser so an editor can come back to a report; the events themselves always come from the website.
const STORE = 'acs-annual-report:';
const remembered = (id) => {
  try {
    return JSON.parse(localStorage.getItem(STORE + id)) || {};
  } catch {
    return {};
  }
};
const remember = (id, value) => {
  try {
    localStorage.setItem(STORE + id, JSON.stringify(value));
  } catch {
    /* Private browsing: choices last until the page is closed. */
  }
};

const deadlineTag = (fy, today) => {
  const days = daysUntil(fy.due, today);
  if (days < 0) return '<span class="ed-tag">Deadline passed</span>';
  if (days === 0) return '<span class="ed-tag ed-tag-update">Due today</span>';
  return `<span class="ed-tag ${days <= 45 ? 'ed-tag-update' : 'ed-tag-new'}">Due in ${days} day${days === 1 ? '' : 's'}</span>`;
};

export const reportsView = {
  id: 'reports',
  title: 'Annual reports',
  icon: '▤',
  allowed: (p) => p.reports,
  // #reports/2026 opens the 2025–2026 report; #reports opens the one being worked on now.
  render(root, app, [param = '']) {
    const today = todayInBangladesh();
    const events = app.data.events.map((e) => e.value);
    const years = fiscalYears(events, today);
    let selectedYear = Number(param) || currentReportYear(today);
    if (!years.some((y) => y.endYear === selectedYear)) selectedYear = years[0].endYear;
    const fy = fiscalYear(selectedYear);
    const saved = remembered(fy.id);
    const state = {
      start: saved.start || fy.start,
      end: saved.end || fy.end,
      excluded: saved.excluded || [],
      category: saved.category || {},
      green: saved.green || [],
      committee: saved.committee,
      preparedBy: saved.preparedBy ?? (app.user.displayName || ''),
      chapter: saved.chapter || CHAPTER,
    };
    const committees = Object.keys(app.data.team || {})
      .filter((k) => /^20\d{2}$/.test(k) && app.data.team[k].value.members.length)
      .sort()
      .reverse();
    if (state.committee === undefined)
      state.committee = [String(fy.endYear - 1), String(fy.endYear)].find((y) => committees.includes(y)) || '';
    const save = () => remember(fy.id, state);
    const unpublished = app.drafts.names().filter((n) => n.startsWith('event:')).length;

    root.innerHTML = `
      <section class="ed-card ed-report-intro">
        <div><p class="ed-eyebrow">ACS Student Chapter annual report</p>
        <h3>Create the report for a fiscal year</h3>
        <p>The ACS fiscal year runs from May of one year to the end of May the next, and the report is due on <strong>31 May</strong>. Choose a year, check the events and download the report as a PDF.</p></div>
      </section>

      <section class="ed-card">
        <div class="ed-card-head"><h3><span class="ed-step-num">1</span>Fiscal year</h3></div>
        <div class="ed-choices ed-report-years" role="radiogroup" aria-label="Fiscal year">${years
          .map(
            (y) =>
              `<label class="ed-choice"><input type="radio" name="fiscalYear" value="${y.endYear}" ${y.endYear === selectedYear ? 'checked' : ''}><strong>${h(y.label)}</strong><span>${y.count} event${y.count === 1 ? '' : 's'} · ${h(dateLabel(y.start))} – ${h(dateLabel(y.end))}</span><span>${deadlineTag(y, today)}</span></label>`,
          )
          .join('')}</div>
        <details class="ed-report-period"${state.start !== fy.start || state.end !== fy.end ? ' open' : ''}>
          <summary>Adjust the reporting period</summary>
          <p class="ed-muted">The ${h(fy.label)} report normally covers ${h(dateLabel(fy.start))} to ${h(dateLabel(fy.end))}. Change the dates only if ACS asks for a different period.</p>
          <div class="ed-grid">
            <label class="ed-field"><span class="ed-label">From</span><input type="date" name="start" value="${state.start}" data-ignore></label>
            <label class="ed-field"><span class="ed-label">To</span><input type="date" name="end" value="${state.end}" data-ignore></label>
          </div>
          <button type="button" class="ed-btn ed-btn-quiet ed-btn-small" data-reset-period>Use the standard period</button>
        </details>
      </section>

      <section class="ed-card">
        <div class="ed-card-head"><h3><span class="ed-step-num">2</span>Events in this report</h3><span class="ed-muted" data-total></span></div>
        <div class="ed-report-counts" data-counts></div>
        ${unpublished ? `<p class="ed-note">${unpublished} event draft${unpublished === 1 ? ' is' : 's are'} not published yet, so ${unpublished === 1 ? 'it is' : 'they are'} not in the report. <a href="#overview">Publish drafts</a></p>` : ''}
        <div data-events></div>
      </section>

      <section class="ed-card">
        <div class="ed-card-head"><h3><span class="ed-step-num">3</span>Report details</h3></div>
        <form class="ed-form" novalidate data-details><div class="ed-grid">
          <label class="ed-field"><span class="ed-label">Chapter officers</span><select name="committee" data-ignore>
            <option value="">Don’t list officers</option>
            ${committees.map((y) => `<option value="${y}"${y === state.committee ? ' selected' : ''}>Executive committee ${y}</option>`).join('')}
          </select><small>From Team &amp; rosters. Faculty advisors are always listed.</small></label>
          <label class="ed-field"><span class="ed-label">Prepared by <em>(optional)</em></span><input name="preparedBy" maxlength="120" value="${h(state.preparedBy)}" data-ignore></label>
          <label class="ed-field ed-wide"><span class="ed-label">Chapter name</span><input name="chapter" maxlength="200" value="${h(state.chapter)}" data-ignore></label>
        </div></form>
        <div class="ed-report-officers" data-officers></div>
        <p class="ed-form-error" role="alert" hidden></p>
        <div class="ed-actions ed-form-actions">
          <button type="button" class="ed-btn" data-excel>Download Excel</button>
          <button type="button" class="ed-btn ed-btn-primary" data-pdf>Download PDF report</button>
        </div>
        <p class="ed-muted">The PDF follows the ACS submission layout: chapter information, an activity summary, then each section’s events with their date, location, category and description. The Excel file lists the same events for copying into the ACS reporting portal.</p>
      </section>`;

    const officers = () =>
      state.committee ? (app.data.team[state.committee]?.value.members || []).map((m) => ({ role: m.role, name: m.name })) : [];
    const report = () => buildReport(events, { start: state.start, end: state.end, label: fy.label, choices: state });

    // ------------------------------------------------------------ step 2: events
    const drawEvents = () => {
      const valid = state.start && state.end && state.end >= state.start;
      const list = $('[data-events]', root);
      if (!valid) {
        list.innerHTML = '<p class="ed-error-text">Choose a start date before the end date.</p>';
        $('[data-counts]', root).innerHTML = '';
        $('[data-total]', root).textContent = '';
        return;
      }
      const inRange = events.filter((e) => inPeriod(e, state.start, state.end)).sort((a, b) => a.date.localeCompare(b.date));
      const r = report();
      $('[data-total]', root).textContent = `${r.total} of ${inRange.length} included`;
      $('[data-counts]', root).innerHTML = r.sections
        .map((s) => `<div class="ed-report-count ed-report-${s.key}"><strong>${s.events.length}</strong><span>${h(s.label)}</span></div>`)
        .join('');
      if (!inRange.length) {
        list.innerHTML = `<div class="ed-empty"><h3>No events in this period</h3><p>No published event starts between ${h(dateLabel(state.start))} and ${h(dateLabel(state.end))}. Add events under <a href="#events">Events</a>; they appear here automatically.</p></div>`;
        return;
      }
      const excluded = new Set(state.excluded);
      const green = new Set(state.green);
      const previous = fiscalYear(fy.endYear - 1).label;
      list.innerHTML = `<p class="ed-muted">Untick an event to leave it out. Changing an event’s section here affects only this report; to change it on the website, edit the event.</p>
        <ul class="ed-report-events">${inRange
          .map((e) => {
            const section = state.category[e.id] || e.category;
            const out = excluded.has(e.id);
            const overlap = state.start === fy.start && overlapsPrevious(e, state.start);
            return `<li class="${out ? 'is-out' : ''}" data-id="${h(e.id)}">
              <label class="ed-check ed-report-include"><input type="checkbox" data-include ${out ? '' : 'checked'} aria-label="Include ${h(e.title)}"></label>
              <div class="ed-report-event"><strong>${h(e.title)}</strong>
                <small>${h(eventDateLabel(e))}${e.location ? ' · ' + h(e.location) : ''}</small>
                ${overlap ? `<small class="ed-report-warn">Held in May, so it also falls in the ${h(previous)} period. Leave it out if it was in that report.</small>` : ''}
                <span class="ed-item-tags"><a class="ed-link" href="#events/${encodeURIComponent(e.id)}">Edit event</a></span></div>
              <div class="ed-report-controls">
                <label class="ed-field"><span class="ed-label">Section</span><select data-section data-ignore ${out ? 'disabled' : ''}>${SECTIONS.map(
                  (k) => `<option value="${k}"${k === section ? ' selected' : ''}>${h(categories[k])}</option>`,
                ).join('')}</select></label>
                ${section === 'green-chemistry' ? '' : `<label class="ed-check"><input type="checkbox" data-green ${green.has(e.id) ? 'checked' : ''} ${out ? 'disabled' : ''}> Also list under Green Chemistry</label>`}
              </div>
            </li>`;
          })
          .join('')}</ul>
        <div class="ed-actions"><button type="button" class="ed-btn ed-btn-quiet ed-btn-small" data-include-all>Include all</button><button type="button" class="ed-btn ed-btn-quiet ed-btn-small" data-reset-choices>Use the website categories</button></div>`;
    };

    const drawOfficers = () => {
      const list = officers();
      $('[data-officers]', root).innerHTML = `<dl class="ed-details">${
        list.length
          ? list.map((o) => `<dt>${h(o.role)}</dt><dd>${h(o.name)}</dd>`).join('')
          : '<dt>Chapter officers</dt><dd>Not listed</dd>'
      }${ADVISORS.map((a) => `<dt>${h(a.role)}</dt><dd>${h(a.name)}</dd>`).join('')}</dl>`;
    };

    drawEvents();
    drawOfficers();

    root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.name === 'fiscalYear') {
        location.hash = `#reports/${t.value}`;
        return;
      }
      if (t.name === 'start' || t.name === 'end') {
        state[t.name] = t.value;
        save();
        return drawEvents();
      }
      if (t.name === 'committee') {
        state.committee = t.value;
        save();
        return drawOfficers();
      }
      if (t.name === 'preparedBy' || t.name === 'chapter') {
        state[t.name] = t.value.trim();
        return save();
      }
      const id = t.closest('[data-id]')?.dataset.id;
      if (!id) return;
      if ('include' in t.dataset) state.excluded = t.checked ? state.excluded.filter((x) => x !== id) : [...state.excluded, id];
      if ('section' in t.dataset) {
        const event = events.find((x) => x.id === id);
        if (t.value === event.category) delete state.category[id];
        else state.category[id] = t.value;
        if (t.value === 'green-chemistry') state.green = state.green.filter((x) => x !== id);
      }
      if ('green' in t.dataset) state.green = t.checked ? [...state.green, id] : state.green.filter((x) => x !== id);
      save();
      drawEvents();
      // Keep keyboard focus on the same control after the list is redrawn.
      const control = Object.keys(t.dataset).find((k) => ['include', 'section', 'green'].includes(k));
      $(`[data-id="${CSS.escape(id)}"] [data-${control}]`, root)?.focus({ preventScroll: true });
    });
    root.addEventListener('input', (e) => {
      if (e.target.name === 'preparedBy' || e.target.name === 'chapter') {
        state[e.target.name] = e.target.value.trim();
        save();
      }
    });
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-reset-period]')) {
        state.start = fy.start;
        state.end = fy.end;
        $('input[name="start"]', root).value = fy.start;
        $('input[name="end"]', root).value = fy.end;
        save();
        drawEvents();
      }
      if (e.target.closest('[data-include-all]')) {
        state.excluded = [];
        save();
        drawEvents();
      }
      if (e.target.closest('[data-reset-choices]')) {
        state.category = {};
        state.green = [];
        save();
        drawEvents();
      }
    });

    const fail = (message) => {
      const box = $('.ed-form-error', root);
      box.textContent = message;
      box.hidden = !message;
      if (message) box.scrollIntoView({ block: 'center' });
    };
    const ready = () => {
      fail('');
      if (!state.start || !state.end || state.end < state.start)
        throw Error('Check the reporting period: the start date must come before the end date.');
      const r = report();
      if (!r.total) throw Error('There are no events to report. Include at least one event, or choose another fiscal year.');
      return r;
    };
    const fileName = (ext) => `ACS-GSTU-Annual-Report-${fy.id}.${ext}`;

    $('[data-pdf]', root).addEventListener('click', (e) =>
      busy(e.currentTarget, 'Preparing PDF…', async () => {
        let r;
        try {
          r = ready();
        } catch (error) {
          return fail(error.message);
        }
        const [lib, logo] = await Promise.all([loadPdfLib(), chapterLogo().catch(() => null)]);
        const bytes = await reportPDF(lib, r, {
          chapter: state.chapter || CHAPTER,
          officers: officers(),
          preparedBy: state.preparedBy,
          generatedOn: dateLabel(todayInBangladesh()),
          due: fy.due,
          logo,
        });
        download(fileName('pdf'), new Blob([bytes], { type: 'application/pdf' }));
        toast(`Annual report ${fy.label} downloaded with ${r.total} event${r.total === 1 ? '' : 's'}.`);
      }),
    );
    $('[data-excel]', root).addEventListener('click', (e) =>
      busy(e.currentTarget, 'Preparing…', async () => {
        let r;
        try {
          r = ready();
        } catch (error) {
          return fail(error.message);
        }
        await downloadWorkbook(fileName('xlsx'), {
          Events: reportRows(r),
          Summary: [
            ['Annual report', fy.label],
            ['Reporting period', `${r.start} to ${r.end}`],
            ['Submission deadline', fy.due],
            [],
            ['Section', 'Events'],
            ...r.sections.map((s) => [s.label, s.events.length]),
            ['Total', r.total],
          ],
        });
      }),
    );
  },
};

/** The chapter lockup as a PNG for the PDF header (drawn from the SVG at print resolution). */
async function chapterLogo() {
  const img = new Image();
  img.src = 'images/brand/acs-chapter-lockup.svg';
  await img.decode();
  const scale = 4;
  const canvas = document.createElement('canvas');
  canvas.width = (img.naturalWidth || 332) * scale;
  canvas.height = (img.naturalHeight || 104) * scale;
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}
