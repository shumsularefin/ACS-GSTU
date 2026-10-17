// ACS student chapter annual reports: fiscal years, choosing and grouping events, and the PDF.
// The report follows the sections of the ACS Student Chapters submission (Service, Professional
// Development, Chapter Development, Green Chemistry). Runs in Node (tests) and the browser.
import { categories, currentCategory, todayInBangladesh, validDate } from './content-model.js';

export const SECTIONS = ['service', 'professional-development', 'chapter-development', 'green-chemistry'];
export const CHAPTER = 'Gopalganj Science and Technology University Student Chapter';

/** Self-assessment questions of the ACS Student Chapters submission, by section (from the 2025–2026 report). */
export function selfAssessment(label = 'this') {
  return [
    {
      section: 'Self-Assessment',
      questions: [
        `Describe two broad goals that your Student Chapter had for the ${label} academic year. Describe how you accomplished them. If you did not accomplish them, what were the barriers to achieving these goals?`,
        'Describe an activity that best exemplifies your Student Chapter’s strengths and how you used available resources to accomplish that activity.',
        'What are one or two goals your Student Chapter has for next year and, using the SMART goals strategy, how do you plan to accomplish them?',
      ],
    },
    {
      section: 'Service',
      questions: [
        'Describe how your group’s outreach and service efforts align with your student chapter’s strengths and/or goals.',
        'How did your service activities encourage the audience towards a passion for safe and ethical science and chemistry?',
        'When necessary, how did you assess chemical safety needs for the outreach activities you performed?',
      ],
    },
    {
      section: 'Professional Development',
      questions: [
        'What area of professional development was most important to your Student Chapter and why? Describe one event you held that impacted your growth in this area.',
      ],
    },
    {
      section: 'Chapter Development',
      questions: [
        'In what ways has your student chapter made the experiences better for members and students at your institution, and what types of events have been the most influential in accomplishing this?',
        'How did your student chapter ensure an inclusive environment where attendees had a sense of belonging?',
        'Did your student chapter have opportunities to work with any other ACS groups (local sections, international chemical sciences chapters, or other student communities)? If so, describe your engagement.',
        'What succession planning have you put in place to make sure that your student chapter will continue to be active for years to come?',
      ],
    },
    {
      section: 'Finances',
      questions: [
        'Is your uploaded financial report in USD? Please answer Yes or No only. If No, what currency are you using?',
        'Is your student chapter able to fundraise (sell food, t-shirts, lab books, goggles, or other items)? Please answer Yes or No only.',
        'Is your student chapter able to apply for grants (from ACS or other organizations)? Please answer Yes or No only.',
        'How does your student chapter use fundraising and budget management to develop professional skills?',
        'What sources of funding did your student chapter utilize to accomplish its goals for the year? Is this a sustainable model to follow in future years? If so, why? If not, how might you work to develop a solid financial plan moving forward?',
      ],
    },
    {
      section: 'Green Chemistry',
      questions: [
        'If you wish to be considered for a Green Chemistry Student Chapter Award, please provide the following: a detailed summary of at least 3 events and explain why each event qualifies as an example of green chemistry, and one or more of the 12 principles of green chemistry that directly relate to each activity.',
      ],
    },
  ];
}

// ------------------------------------------------------------------ fiscal years

/**
 * The report year ending in May of `endYear`: it runs from 1 May of the year before to 31 May,
 * which is also the submission deadline. 2026 → the 2025–2026 report (1 May 2025 – 31 May 2026).
 */
export function fiscalYear(endYear) {
  const y = Number(endYear);
  if (!Number.isInteger(y) || y < 2000 || y > 2200) throw Error('Choose a fiscal year.');
  return { id: `${y - 1}-${y}`, label: `${y - 1}–${y}`, endYear: y, start: `${y - 1}-05-01`, end: `${y}-05-31`, due: `${y}-05-31` };
}

/** The report being worked on today: until 31 May it is the one due that day, from June the next one. */
export function currentReportYear(today = todayInBangladesh()) {
  const [y, m] = today.split('-').map(Number);
  return m >= 6 ? y + 1 : y;
}

/** Days from `today` until the deadline (negative once it has passed). */
export function daysUntil(date, today = todayInBangladesh()) {
  return Math.round((Date.parse(date) - Date.parse(today)) / 86400000);
}

export const inPeriod = (e, start, end) => e.date >= start && e.date <= end;

/** Every report year from the first event to the current one, newest first, with its event count. */
export function fiscalYears(events, today = todayInBangladesh()) {
  const current = currentReportYear(today);
  const first = events.reduce((y, e) => Math.min(y, currentReportYear(e.date)), current);
  const years = [];
  for (let y = current; y >= first; y--) {
    const fy = fiscalYear(y);
    years.push({ ...fy, count: events.filter((e) => inPeriod(e, fy.start, fy.end)).length });
  }
  return years;
}

// ------------------------------------------------------------------ building the report

/**
 * Report choices (all optional), kept per fiscal year in the dashboard:
 *   excluded: [eventId]          events left out of this report
 *   category: { eventId: key }   section used in this report (the website keeps its own category)
 *   green:    [eventId]          also listed under Green Chemistry, as the ACS form allows
 */
export function buildReport(events, { start, end, label, choices = {} }) {
  if (!validDate(start) || !validDate(end) || end < start) throw Error('Check the reporting period dates.');
  const excluded = new Set(choices.excluded || []);
  const green = new Set(choices.green || []);
  const chosen = events
    .filter((e) => inPeriod(e, start, end) && !excluded.has(e.id))
    .map((e) => {
      const picked = currentCategory(choices.category?.[e.id] || e.category);
      return { ...e, category: SECTIONS.includes(picked) ? picked : 'service' };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  const sections = SECTIONS.map((key) => ({
    key,
    label: categories[key],
    events: chosen.filter((e) => e.category === key || (key === 'green-chemistry' && green.has(e.id))),
  }));
  return { label, start, end, total: chosen.length, events: chosen, sections };
}

/** Events in the period that also fall inside the previous report's period (its final May). */
export function overlapsPrevious(e, start) {
  const y = Number(start.slice(0, 4));
  return e.date >= start && e.date <= `${y}-05-31`;
}

/** Rows for the Excel copy of the report. */
export function reportRows(report) {
  const rows = [['Section', 'Event title', 'Date', 'End date', 'Location', 'Category', 'Description']];
  for (const s of report.sections)
    for (const e of s.events) rows.push([s.label, e.title, e.date, endDate(e), e.location || '', categories[e.category], e.description]);
  return rows;
}

const endDate = (e) => {
  const end = (e.endsAt || '').slice(0, 10);
  return end && end !== e.date ? end : '';
};

// ------------------------------------------------------------------ PDF

const A4 = [595.28, 841.89];
const MARGIN = { x: 50, top: 54, bottom: 58 };
const INK = [0.09, 0.075, 0.25];
const MUTED = [0.35, 0.37, 0.48];
const BLUE = [0.255, 0.169, 0.992]; // ACS blue #412bfd
const TINT = [0.925, 0.918, 1]; // section bars
const SOFT = [0.96, 0.96, 0.975];
const RULE = [0.1, 0.1, 0.12];

// Standard PDF fonts cover Western European text; anything else becomes a close ASCII form.
const REPLACE = { '−': '-', '‐': '-', '‑': '-', ' ': ' ', ' ': ' ', '​': '', '→': '->', '←': '<-', '✓': 'v', '­': '' };

/**
 * Draws the report as an A4 PDF and returns its bytes.
 * `lib` is pdf-lib; `details` = { chapter, due, generatedOn, logo (PNG bytes) }.
 */
export async function reportPDF(lib, report, details = {}) {
  const { PDFDocument, StandardFonts, rgb } = lib;
  const pdf = await PDFDocument.create();
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
  };
  const color = (c) => rgb(...c);
  const encodable = new Map();
  const clean = (s) =>
    [...String(s ?? '')]
      .map((ch) => {
        if (ch in REPLACE) return REPLACE[ch];
        if (ch === '\n' || ch === '\t') return ch;
        if (!encodable.has(ch)) {
          try {
            fonts.regular.encodeText(ch);
            encodable.set(ch, true);
          } catch {
            encodable.set(ch, false);
          }
        }
        if (encodable.get(ch)) return ch;
        const plain = ch.normalize('NFKD').replace(/[^\x20-\x7e]/g, '');
        return plain || '';
      })
      .join('');
  const width = (s, font, size) => font.widthOfTextAtSize(s, size);

  /**
   * Splits text into lines that fit `max` points (the first line `firstMax`, leaving room for a label);
   * keeps paragraph breaks and splits very long words.
   */
  const wrap = (s, font, size, max, firstMax = max) => {
    const lines = [];
    const limit = () => (lines.length ? max : firstMax);
    for (const para of clean(s).replace(/\t/g, ' ').split('\n')) {
      let line = '';
      for (let word of para.trim().split(/ +/)) {
        while (width(word, font, size) > limit()) {
          let cut = word.length - 1;
          while (cut > 1 && width(word.slice(0, cut), font, size) > limit()) cut--;
          if (line) {
            lines.push(line);
            line = '';
            continue;
          }
          lines.push(word.slice(0, cut));
          word = word.slice(cut);
        }
        const next = line ? `${line} ${word}` : word;
        if (width(next, font, size) <= limit()) line = next;
        else {
          lines.push(line);
          line = word;
        }
      }
      lines.push(line);
    }
    while (lines.length > 1 && !lines.at(-1)) lines.pop();
    return lines;
  };

  const [W, H] = A4;
  const inner = W - MARGIN.x * 2;
  let page;
  let y;
  const pages = [];
  const newPage = () => {
    page = pdf.addPage(A4);
    pages.push(page);
    y = H - MARGIN.top;
  };
  const room = (h) => y - h >= MARGIN.bottom;
  const ensure = (h) => {
    if (!room(h)) newPage();
  };
  const text = (s, x, size, font = fonts.regular, c = INK) => page.drawText(clean(s), { x, y, size, font, color: color(c) });
  const rect = (x, top, w, h, fill, border) =>
    page.drawRectangle({
      x,
      y: top - h,
      width: w,
      height: h,
      color: fill ? color(fill) : undefined,
      borderColor: border ? color(border) : undefined,
      borderWidth: border ? 0.75 : 0,
    });
  const line = (x1, x2, at, c = RULE, thickness = 0.75) =>
    page.drawLine({ start: { x: x1, y: at }, end: { x: x2, y: at }, thickness, color: color(c) });

  // ---------------------------------------------------------------- title block
  newPage();
  if (details.logo) {
    const image = await pdf.embedPng(details.logo);
    const h = 54;
    const w = (image.width / image.height) * h;
    page.drawImage(image, { x: (W - w) / 2, y: y - h, width: w, height: h });
    y -= h + 26;
  }
  const centered = (s, size, font, c = INK) => {
    const t = clean(s);
    page.drawText(t, { x: (W - width(t, font, size)) / 2, y, size, font, color: color(c) });
  };
  y -= 4;
  centered('American Chemical Society', 19, fonts.bold);
  y -= 24;
  centered('Student Chapter Annual Report', 14, fonts.regular, MUTED);
  y -= 38;

  const facts = [
    ['Chapter:', details.chapter || CHAPTER],
    ['Academic Year:', report.label.replace('–', '-')],
    ['Reporting period:', `${report.start} to ${report.end}`],
    ['Submission deadline:', details.due || report.end],
    ['Events reported:', String(report.total)],
  ];
  for (const [k, v] of facts) {
    const lines = wrap(v, fonts.regular, 11.5, inner - 190);
    text(k, MARGIN.x + 10, 11.5, fonts.bold);
    lines.forEach((l, i) => {
      text(l, MARGIN.x + 190, 11.5);
      if (i < lines.length - 1) y -= 14;
    });
    y -= 20;
  }
  y -= 18;

  // ---------------------------------------------------------------- sections
  const colLeft = inner * 0.47;
  const colRight = inner - colLeft - 8;
  const size = 8.6;
  const lead = 10.3;
  for (const s of report.sections) {
    // Keep the section heading with its first event.
    ensure(s.events.length ? 150 : 80);
    rect(MARGIN.x, y + 15, inner, 21, TINT);
    text(s.label, MARGIN.x + 5, 12.5, fonts.bold);
    y -= 26;
    rect(MARGIN.x, y + 12, inner, 16, SOFT);
    text(`${s.label} Events`, MARGIN.x + 5, 9.5, fonts.italic);
    y -= 6;
    line(MARGIN.x, MARGIN.x + inner, y);
    y -= 16;
    if (!s.events.length) {
      text('No events were recorded in this category for this reporting period.', MARGIN.x + 5, 9, fonts.italic, MUTED);
      y -= 26;
      continue;
    }
    for (const e of s.events) {
      const titleLines = wrap(e.title, fonts.italic, 12, inner - 10);
      const meta = [
        ['Date:', endDate(e) ? `${e.date} to ${endDate(e)}` : e.date],
        ['Location:', e.location || 'Not recorded'],
        ['Category:', categories[e.category]],
      ];
      const label = 'Description: ';
      const labelWidth = width(label, fonts.bold, size);
      const desc = wrap(e.description, fonts.regular, size, colRight, colRight - labelWidth);
      // Keep the title with the start of the event's details.
      ensure(titleLines.length * 14 + 6 + Math.min(desc.length, 4) * lead + 8);
      for (const t of titleLines) {
        text(t, MARGIN.x + 4, 12, fonts.italic);
        y -= 14;
      }
      y -= 6;
      const blockTop = y;
      // Left column: date, location and category.
      for (const [k, v] of meta) {
        const kw = width(k, fonts.bold, size) + 3;
        const vLines = wrap(v, fonts.regular, size, colLeft - kw - 8);
        text(k, MARGIN.x + 4, size, fonts.bold);
        vLines.forEach((l, i) => {
          page.drawText(l, { x: MARGIN.x + 4 + kw, y, size, font: fonts.regular, color: color(INK) });
          if (i < vLines.length - 1) y -= lead;
        });
        y -= lead;
      }
      const leftBottom = y;
      // Right column: the description, continuing on the next page when needed.
      y = blockTop;
      const x = MARGIN.x + colLeft + 8;
      let onFirstPage = true;
      text(label, x, size, fonts.bold);
      page.drawText(desc[0] || '', { x: x + labelWidth, y, size, font: fonts.regular, color: color(INK) });
      y -= lead;
      for (const l of desc.slice(1)) {
        if (!room(lead)) {
          newPage();
          onFirstPage = false;
          text(`${clean(e.title)} (continued)`, MARGIN.x + 4, 8.5, fonts.italic, MUTED);
          y -= 16;
        }
        page.drawText(l, { x, y, size, font: fonts.regular, color: color(INK) });
        y -= lead;
      }
      if (onFirstPage) y = Math.min(y, leftBottom);
      y += lead - 6;
      line(MARGIN.x, MARGIN.x + inner, y);
      y -= 22;
    }
    y -= 8;
  }

  // ---------------------------------------------------------------- self-assessment questions
  // The questions of the ACS submission, for the executives to answer in the reporting portal.
  newPage();
  rect(MARGIN.x, y + 15, inner, 21, TINT);
  text('Self-Assessment Questions', MARGIN.x + 5, 12.5, fonts.bold);
  y -= 26;
  for (const l of wrap(
    `The ACS Student Chapters submission asks these questions. Prepare the answers for the ${report.label} report and enter them in the ACS reporting portal by ${details.due || report.end}.`,
    fonts.italic,
    9,
    inner - 10,
  )) {
    text(l, MARGIN.x + 5, 9, fonts.italic, MUTED);
    y -= 12;
  }
  y -= 12;
  let number = 0;
  for (const group of selfAssessment(report.label)) {
    ensure(70);
    rect(MARGIN.x, y + 12, inner, 17, SOFT);
    text(group.section, MARGIN.x + 5, 10.5, fonts.bold);
    y -= 22;
    for (const question of group.questions) {
      const mark = `${++number}.`;
      const lines = wrap(question, fonts.regular, 9.5, inner - 34);
      ensure(lines.length * 12.5 + 6);
      text(mark, MARGIN.x + 5, 9.5, fonts.bold, BLUE);
      for (const l of lines) {
        text(l, MARGIN.x + 26, 9.5);
        y -= 12.5;
      }
      y -= 5;
    }
    y -= 6;
  }

  // ---------------------------------------------------------------- footer on every page
  const footer = `ACS Student Chapter, GSTU  ·  Annual Report ${report.label.replace('–', '-')}`;
  const generated = details.generatedOn ? `Generated ${details.generatedOn}` : '';
  pages.forEach((p, i) => {
    const at = 30;
    p.drawLine({
      start: { x: MARGIN.x, y: at + 12 },
      end: { x: W - MARGIN.x, y: at + 12 },
      thickness: 0.5,
      color: color([0.8, 0.8, 0.85]),
    });
    p.drawText(clean(footer), { x: MARGIN.x, y: at, size: 7.5, font: fonts.regular, color: color(MUTED) });
    const n = `${generated ? generated + '  ·  ' : ''}Page ${i + 1} of ${pages.length}`;
    p.drawText(n, { x: W - MARGIN.x - width(n, fonts.regular, 7.5), y: at, size: 7.5, font: fonts.regular, color: color(MUTED) });
  });

  pdf.setTitle(`ACS Student Chapter Annual Report ${report.label.replace('–', '-')}`);
  pdf.setAuthor(details.chapter || CHAPTER);
  pdf.setSubject(`Events from ${report.start} to ${report.end}`);
  pdf.setCreator('ACS Student Chapter, GSTU website');
  return pdf.save();
}
