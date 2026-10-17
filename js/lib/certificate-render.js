// Draws chapter certificates as self-contained SVG (all text converted to outlines, so they look the
// same everywhere) and exports them as PDF. Two designs:
//  - participation (and achievement) and placement awards, drawn on the chapter's Illustrator artwork
//  - formal: instructors, teachers, guests, delegates, institutions and executive service
import { certificateTypes, signatories, certificateURL, formalTypes } from './certificate-model.js';
import { escapeHTML as h } from './content-model.js';
import qrcode from '../vendor/qrcode.mjs';
import { parse } from '../vendor/opentype.min.mjs';

export const WIDTH = 1200;
export const HEIGHT = 849; // A4 landscape proportions

const BLUE = '#412bfd';
const BLUE_2 = '#056bf3';
const AQUA = '#6fedee';
const AQUA_2 = '#08e8de';
const YELLOW = '#f8cd31';
const INK = '#16133f';
const MUTED = '#5a5f7a';

const FONTS = {
  regular: 'fonts/original/original-2.ttf',
  semibold: 'fonts/original/original-3.ttf',
  extrabold: 'fonts/original/original-4.ttf',
  blackletter: 'fonts/certificates/UnifrakturMaguntia-Book.ttf',
  serif: 'fonts/certificates/LibreBaskerville.ttf',
  serifItalic: 'fonts/certificates/LibreBaskerville-Italic.ttf',
  cinzel: 'fonts/certificates/Cinzel.ttf',
  script: 'fonts/certificates/GreatVibes-Regular.ttf',
  poppins: 'fonts/certificates/Poppins-Regular.ttf',
  poppinsLight: 'fonts/certificates/Poppins-Light.ttf',
  poppinsMedium: 'fonts/certificates/Poppins-Medium.ttf',
  poppinsSemiBold: 'fonts/certificates/Poppins-SemiBold.ttf',
  poppinsItalic: 'fonts/certificates/Poppins-Italic.ttf',
  poppinsMediumItalic: 'fonts/certificates/Poppins-MediumItalic.ttf',
  bebas: 'fonts/certificates/BebasNeue-Regular.ttf',
};
const ART = {
  lockup: 'images/brand/acs-chapter-lockup.svg',
  lockupWhite: 'images/brand/acs-chapter-lockup-white.svg',
  globe: 'images/brand/acs-globe.svg',
  gstu: 'images/brand/gstu-logo.png',
  advisor: 'images/brand/advisor-signature.png',
  coadvisor: 'images/brand/coadvisor-signature.png',
  participation: 'images/brand/certificate-participation.svg',
  award: 'images/brand/certificate-award.svg',
};

const AWARDS = {
  champion: { label: 'Champion', rank: '1', light: '#fff1b8', mid: YELLOW, dark: '#b8860b', text: INK },
  'runner-up': { label: 'First Runner-up', rank: '2', light: '#f4f6fa', mid: '#b9c3d1', dark: '#7d899b', text: INK },
  'second-runner-up': { label: 'Second Runner-up', rank: '3', light: '#f3c9a6', mid: '#cf8f5f', dark: '#8a4d24', text: INK },
};

const FORMAL_TITLES = {
  instructor: 'Certificate of Appreciation',
  teacher: 'Certificate of Appreciation',
  guest: 'Certificate of Honour',
  delegate: 'Certificate of Recognition',
  institution: 'Certificate of Partnership',
  organization: 'Certificate of Partnership',
  executive: 'Certificate of Executive Service',
};

// ------------------------------------------------------------------ loading

const cache = new Map();
function once(key, load) {
  if (!cache.has(key))
    cache.set(
      key,
      load().catch((error) => {
        cache.delete(key);
        throw error;
      }),
    );
  return cache.get(key);
}
const fetchOk = (path) =>
  fetch(path).then((r) => {
    if (!r.ok) throw Error('Certificate artwork is unavailable. Please try again.');
    return r;
  });
const loadFont = (path) =>
  once(path, () =>
    fetchOk(path)
      .then((r) => r.arrayBuffer())
      .then(parse),
  );
const loadArt = (path) =>
  once(`art:${path}`, () =>
    fetchOk(path)
      .then((r) => r.blob())
      .then(
        (blob) =>
          new Promise((resolve) => Object.assign(new FileReader(), { onload: (e) => resolve(e.target.result) }).readAsDataURL(blob)),
      ),
  );
const load = (map) => Promise.all(Object.entries(map).map(async ([k, v]) => [k, await v])).then(Object.fromEntries);

// ------------------------------------------------------------------ drawing helpers

// Text is laid out glyph by glyph from advance widths, without OpenType shaping: some of these fonts use
// substitution tables that opentype.js cannot apply, and kerning in others yields invalid outlines.
const advance = (font, s, size) => {
  let width = 0;
  for (const ch of String(s)) width += (font.charToGlyph(ch).advanceWidth * size) / font.unitsPerEm;
  return width;
};
const glyphs = (font, s, x, y, size) => {
  const commands = [];
  let cursor = x;
  for (const ch of String(s)) {
    const glyph = font.charToGlyph(ch);
    commands.push(...glyph.getPath(cursor, y, size).commands);
    cursor += (glyph.advanceWidth * size) / font.unitsPerEm;
  }
  return { commands };
};

/** Path data with explicit separators (opentype.js can run numbers together, e.g. "M-4.010Q"). */
function pathData(path) {
  const n = (v) => (Math.abs(v) < 0.005 ? '0' : v.toFixed(2));
  let d = '';
  for (const c of path.commands) {
    if (c.type === 'M' || c.type === 'L') d += `${c.type}${n(c.x)} ${n(c.y)}`;
    else if (c.type === 'Q') d += `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
    else if (c.type === 'C') d += `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
    else if (c.type === 'Z') d += 'Z';
  }
  return d;
}

/** Outline for a run of text; a glyph with invalid coordinates is redrawn a hair to the side. */
function outline(font, s, x, y, size) {
  const clean = (d) => !/NaN|Infinity/.test(d);
  const d = pathData(glyphs(font, s, x, y, size));
  if (clean(d)) return d;
  let out = '';
  let cursor = x;
  for (const ch of s) {
    for (let i = 0; i < 12; i++) {
      const g = pathData(glyphs(font, ch, cursor + i * 0.011, y + i * 0.007, size));
      if (clean(g)) {
        out += g;
        break;
      }
    }
    cursor += advance(font, ch, size);
  }
  return out;
}

/** Text as an outline path. Shrinks to fit maxWidth; anchor is start, middle or end. */
function text(font, value, x, y, size, { fill = INK, anchor = 'start', maxWidth = Infinity, spacing = 0, attrs = '' } = {}) {
  const s = String(value ?? '');
  if (!s) return '';
  // Kerning in some of these fonts yields invalid outlines (NaN), so letters are spaced by advance widths only.
  const measure = (sz) => advance(font, s, sz) + spacing * (sz / size) * Math.max(0, [...s].length - 1);
  if (measure(size) > maxWidth) {
    const scale = maxWidth / measure(size);
    size *= scale;
    spacing *= scale;
  }
  let start = anchor === 'middle' ? x - measure(size) / 2 : anchor === 'end' ? x - measure(size) : x;
  let d;
  if (!spacing) d = outline(font, s, start, y, size);
  else {
    d = '';
    for (const ch of s) {
      d += outline(font, ch, start, y, size);
      start += advance(font, ch, size) + spacing;
    }
  }
  return `<path fill="${fill}" ${attrs} d="${d}"/>`;
}

function wrap(font, value, width, size) {
  const rows = [];
  let row = '';
  for (const word of String(value ?? '')
    .split(/\s+/)
    .filter(Boolean)) {
    const next = row ? `${row} ${word}` : word;
    if (row && advance(font, next, size) > width) {
      rows.push(row);
      row = word;
    } else row = next;
  }
  if (row) rows.push(row);
  return rows;
}

/** A paragraph that shrinks until it fits maxLines. */
function paragraph(font, value, x, y, width, size, { maxLines = 2, lineHeight = 1.45, minSize = size * 0.7, ...options } = {}) {
  let rows = wrap(font, value, width, size);
  while (rows.length > maxLines && size > minSize) {
    size -= 0.5;
    rows = wrap(font, value, width, size);
  }
  return {
    svg: rows.map((row, i) => text(font, row, x, y + i * size * lineHeight, size, { maxWidth: width, ...options })).join(''),
    height: rows.length * size * lineHeight,
  };
}

function qr(url, size, color) {
  const code = qrcode(0, 'M');
  code.addData(url);
  code.make();
  const n = code.getModuleCount();
  const cell = size / n;
  let d = '';
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (code.isDark(r, c))
        d += `M${(c * cell).toFixed(2)} ${(r * cell).toFixed(2)}h${cell.toFixed(3)}v${cell.toFixed(3)}h-${cell.toFixed(3)}z`;
  return `<path fill="${color}" d="${d}"/>`;
}

const labelDate = (s) =>
  s
    ? new Date(s + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    : 'Not recorded';

const ONES = [
  '',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const ORDINAL = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };
const words = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : ''));
function ordinalWords(n) {
  const w = words(n);
  const parts = w.split('-');
  const last = parts.pop();
  const ord = ORDINAL[last] || (last.endsWith('y') ? last.slice(0, -1) + 'ieth' : last + 'th');
  return [...parts, ord].join('-');
}
const yearWords = (y) => `two thousand${y % 1000 ? ' and ' + words(y % 1000) : ''}`;

/** "this sixteenth day of October, two thousand and twenty-six" */
export function formalDate(iso) {
  if (!iso) return 'on the date shown below';
  const d = new Date(iso + 'T12:00:00Z');
  const month = d.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
  return `this ${ordinalWords(d.getUTCDate())} day of ${month}, ${yearWords(d.getUTCFullYear())}`;
}

const shortCode = (id) => (id.replace(/^ACS-/, '').match(/.{1,4}/g) || []).slice(0, 3).join('-');
const svgOpen = (label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${h(label)}">`;

// ------------------------------------------------------------------ formal design

function guilloche(paper) {
  let lines = '';
  for (let i = 0; i < 52; i++) {
    const y0 = 34 + i * 15.6;
    let d = '';
    for (let x = 30; x <= 1170; x += 10) {
      const y = y0 + 5.5 * Math.sin(x / 34 + i * 0.6) + 2.2 * Math.sin(x / 9.5 + i * 1.3);
      d += `${x === 30 ? 'M' : 'L'}${x} ${y.toFixed(1)}`;
    }
    lines += `<path d="${d}"/>`;
  }
  return `<rect width="${WIDTH}" height="${HEIGHT}" fill="${paper}"/><g fill="none" stroke="#c8d2ee" stroke-width=".55" opacity=".55">${lines}</g>`;
}

async function formalSVG(c, { preview }) {
  const f = await load(
    Object.fromEntries(['regular', 'semibold', 'blackletter', 'serif', 'serifItalic'].map((k) => [k, loadFont(FONTS[k])])),
  );
  const art = await load({
    globe: loadArt(ART.globe),
    lockup: loadArt(ART.lockup),
    gstu: loadArt(ART.gstu),
    advisor: loadArt(ART.advisor),
    coadvisor: loadArt(ART.coadvisor),
  });
  const PAPER = '#fbf8ee';
  const GOLD = '#b8913a';
  const cx = WIDTH / 2;
  const title = FORMAL_TITLES[c.type] || 'Certificate of Recognition';
  const citation = c.achievement || `${certificateTypes[c.type]?.[1] || 'in recognition of distinguished service to'} ${c.event}`;
  const cite = paragraph(f.serif, citation, cx, 486, 780, 18, { anchor: 'middle', fill: '#2c2a3a', maxLines: 2, lineHeight: 1.5 });
  const given = paragraph(
    f.serif,
    `Given under the seal of the ACS Student Chapter, GSTU, ${formalDate(c.dateIssued)}.`,
    cx,
    486 + cite.height + 10,
    860,
    13,
    {
      anchor: 'middle',
      fill: '#4a4858',
      maxLines: 2,
    },
  );
  const corner = (x, y) =>
    `<rect x="${x - 7}" y="${y - 7}" width="14" height="14" rx="3.5" transform="rotate(45 ${x} ${y})" fill="${BLUE}"/>`;
  const signature = (s, i, x) =>
    `<image href="${i ? art.coadvisor : art.advisor}" x="${x - 80}" y="642" width="160" height="50" preserveAspectRatio="xMidYMid meet"/>
     <line x1="${x - 130}" y1="700" x2="${x + 130}" y2="700" stroke="${INK}" stroke-width=".8"/>
     ${text(f.serif, s.name, x, 722, 15.5, { anchor: 'middle', fill: INK })}
     ${text(f.semibold, `${s.role.toUpperCase()}, ACS STUDENT CHAPTER, GSTU`, x, 741, 9, { anchor: 'middle', fill: BLUE, spacing: 0.6 })}
     ${text(f.regular, s.title, x, 757, 10, { anchor: 'middle', fill: MUTED })}`;
  // The chapter lockup and the GSTU emblem sit together under the heading, divided by a fine gold rule.
  const logos = `<g transform="translate(-24 0)">
    <image href="${art.lockup}" x="${cx - 196}" y="206" width="208" height="65"/>
    <line x1="${cx + 30}" y1="210" x2="${cx + 30}" y2="268" stroke="${GOLD}" stroke-width="1"/>
    <clipPath id="gstuEmblem"><circle cx="${cx + 80}" cy="238" r="29"/></clipPath>
    <image href="${art.gstu}" x="${cx + 46}" y="202" width="68" height="72" clip-path="url(#gstuEmblem)" preserveAspectRatio="xMidYMid slice"/>
    <circle cx="${cx + 80}" cy="238" r="29.5" fill="none" stroke="${GOLD}" stroke-width="1"/>
    ${text(f.semibold, 'GOPALGANJ SCIENCE AND', cx + 120, 234, 8.5, { fill: '#14713a', spacing: 0.8 })}
    ${text(f.semibold, 'TECHNOLOGY UNIVERSITY', cx + 120, 247, 8.5, { fill: '#14713a', spacing: 0.8 })}
  </g>`;
  const name = (dx, dy, fill) => text(f.blackletter, c.name, cx + dx, 414 + dy, 58, { anchor: 'middle', fill, maxWidth: 820 });
  const heading = (dx, dy, fill) =>
    text(f.blackletter, 'American Chemical Society', cx + dx, 128 + dy, 76, { anchor: 'middle', fill, maxWidth: 940 });

  return `${svgOpen(`${title} for ${c.name}`)}<title>${h(`${c.name} — ${c.event} — ${c.id}`)}</title>
    ${guilloche(PAPER)}
    <image href="${art.globe}" x="${cx - 235}" y="185" width="470" height="470" opacity=".06"/>
    <rect x="20" y="20" width="${WIDTH - 40}" height="${HEIGHT - 40}" fill="none" stroke="${INK}" stroke-width="1.8"/>
    <rect x="28" y="28" width="${WIDTH - 56}" height="${HEIGHT - 56}" fill="none" stroke="${GOLD}" stroke-width=".9"/>
    ${corner(28, 28)}${corner(WIDTH - 28, 28)}${corner(28, HEIGHT - 28)}${corner(WIDTH - 28, HEIGHT - 28)}

    <g transform="translate(78 70)"><circle r="17" fill="none" stroke="${BLUE}" stroke-width="1.2" stroke-dasharray="1.5 2.2"/><path d="M-7 0l5 5 9-10" fill="none" stroke="${BLUE}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></g>
    ${text(f.semibold, shortCode(c.id), 58, 108, 10.5, { fill: INK, spacing: 1.6 })}

    <g transform="translate(0 24)">
    ${heading(3, 3, BLUE).replace('<path', '<path opacity=".5"')}${heading(0, 0, INK)}
    ${text(f.serif, 'By the authority of its International Student Chapter at Gopalganj Science and Technology University', cx, 166, 14, { anchor: 'middle', fill: '#3a3848', maxWidth: 820 })}
    ${text(f.serif, 'and upon the recommendation of the Chapter Advisors', cx, 188, 14, { anchor: 'middle', fill: '#3a3848' })}
    ${logos}
    ${text(f.serif, title, cx, 318, 30, { anchor: 'middle', fill: INK, maxWidth: 760 })}
    ${text(f.serifItalic, 'is presented to', cx, 350, 14, { anchor: 'middle', fill: '#4a4858' })}
    ${name(2.5, 2.5, BLUE).replace('<path', '<path opacity=".45"')}${name(0, 0, INK)}
    ${c.designation ? text(f.serifItalic, c.designation, cx, 446, 16, { anchor: 'middle', fill: '#3a3848', maxWidth: 640 }) : ''}
    ${cite.svg}${given.svg}
    </g>

    ${signatories.map((s, i) => signature(s, i, i ? WIDTH - 250 : 250)).join('')}
    <rect x="${cx - 62}" y="602" width="124" height="124" rx="8" fill="${PAPER}"/>
    <g transform="translate(${cx - 50} 612)">${qr(certificateURL(c.id), 100, INK)}</g>
    ${text(f.semibold, `Credential ID ${c.id}`, cx, 744, 9.5, { anchor: 'middle', fill: INK, maxWidth: 300 })}
    ${text(f.regular, `Issued ${labelDate(c.dateIssued)} · Verify at acs-gstu.web.app`, cx, 760, 9.5, { anchor: 'middle', fill: MUTED, maxWidth: 300 })}
    ${preview ? text(f.semibold, 'SAMPLE — NOT ISSUED', cx, 780, 10.5, { anchor: 'middle', fill: '#b3261e', spacing: 1.2 }) : ''}
  </svg>`;
}

// ------------------------------------------------------------------ participation and award designs
// Both draw on the chapter's own artwork (exported from the Illustrator files without text), in the
// artwork's 842 × 595 pt coordinate space. Text positions follow the original layouts.

const PAGE_W = 842;
const PAGE_H = 595;
const art842 = (body, label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${PAGE_W} ${PAGE_H}" preserveAspectRatio="none" role="img" aria-label="${h(label)}">${body}</svg>`;

const signatoryLines = (s) => [s.name, `${s.role}, ACS Student Chapter, GSTU`, s.title];

async function participationSVG(c, { preview }) {
  const f = await load({
    title: loadFont(FONTS.cinzel),
    medium: loadFont(FONTS.poppinsMedium),
    regular: loadFont(FONTS.poppins),
    italic: loadFont(FONTS.poppinsMediumItalic),
    light: loadFont(FONTS.poppinsLight),
    script: loadFont(FONTS.script),
  });
  const template = await loadArt(ART.participation);
  const cx = 421;
  const INKP = '#171c27';
  const achievement = c.type === 'achievement';
  const intro = achievement ? 'In recognition of outstanding achievement in' : 'Has successfully participated in';
  const lines = [
    text(f.regular, intro, cx, 327, 11.9, { anchor: 'middle', fill: INKP }),
    text(f.italic, `“${c.event}”`, cx, 345, 11.9, { anchor: 'middle', fill: INKP, maxWidth: 640 }),
  ];
  let y = 366;
  lines.push(text(f.regular, 'Organized by the ACS Student Chapter, GSTU.', cx, y, 10.9, { anchor: 'middle', fill: INKP }));
  if (c.achievement) {
    const p = paragraph(f.regular, c.achievement, cx, y + 15, 640, 10.9, { anchor: 'middle', fill: INKP, maxLines: 2, lineHeight: 1.38 });
    lines.push(p.svg);
    y += p.height;
  }
  lines.push(text(f.regular, `Date: ${labelDate(c.eventDate || c.dateIssued)}`, cx, y + 15, 10.9, { anchor: 'middle', fill: INKP }));
  const signature = (s, x) =>
    signatoryLines(s)
      .map((line, i) =>
        i
          ? text(f.light, line, x, 520 + (i - 1) * 13, 10.5, { anchor: 'middle', fill: INKP })
          : text(f.medium, line, x, 505, 11.9, { anchor: 'middle', fill: INKP }),
      )
      .join('');
  return art842(
    `<title>${h(`${c.name} — ${c.event} — ${c.id}`)}</title>
    <image href="${template}" width="${PAGE_W}" height="${PAGE_H}"/>
    ${text(f.title, 'Certificate', cx + 1.6, 153.6, 81.7, { anchor: 'middle', fill: '#eebe7b' })}
    ${text(f.title, 'Certificate', cx, 152, 81.7, { anchor: 'middle', fill: '#143c66' })}
    ${text(f.medium, achievement ? 'OF ACHIEVEMENT' : 'OF PARTICIPATION', 417, 191, 25.8, { anchor: 'middle', fill: INKP, maxWidth: 232 })}
    ${text(f.regular, 'THIS CERTIFICATE IS PROUDLY PRESENTED TO', cx, 221, 11.5, { anchor: 'middle', fill: INKP })}
    ${text(f.script, c.name, cx, 293, 56.4, { anchor: 'middle', fill: '#1058a5', maxWidth: 560 })}
    ${lines.join('')}
    ${signature(signatories[0], 211)}${signature(signatories[1], 634.5)}
    <g transform="translate(398.5 471)">${qr(certificateURL(c.id), 58, '#0d1b33')}</g>
    ${text(f.regular, `Credential ID: ${c.id}`, 427.5, 546, 8.4, { anchor: 'middle', fill: '#030405', maxWidth: 240 })}
    ${text(f.regular, `Issued ${labelDate(c.dateIssued)} · Verify at acs-gstu.web.app`, 427.5, 557, 7.2, { anchor: 'middle', fill: MUTED, maxWidth: 240 })}
    ${preview ? text(f.medium, 'SAMPLE — NOT ISSUED', 427.5, 569, 8.5, { anchor: 'middle', fill: '#b3261e', spacing: 1 }) : ''}`,
    `Certificate of ${achievement ? 'Achievement' : 'Participation'} for ${c.name}`,
  );
}

async function awardSVG(c, { preview }) {
  const f = await load({
    semibold: loadFont(FONTS.poppinsSemiBold),
    medium: loadFont(FONTS.poppinsMedium),
    regular: loadFont(FONTS.poppins),
    light: loadFont(FONTS.poppinsLight),
    italic: loadFont(FONTS.poppinsItalic),
    label: loadFont(FONTS.bebas),
    script: loadFont(FONTS.script),
  });
  const template = await loadArt(ART.award);
  const award = AWARDS[c.type];
  const right = 786;
  const INKA = '#171c27';
  // "in the <event>" is right-aligned, with the event title in bold, as in the original artwork.
  const eventSize = 12;
  const eventWidth = Math.min(advance(f.semibold, c.event, eventSize), 440);
  const description = paragraph(
    f.light,
    `Organized by the ACS Student Chapter, GSTU.${c.achievement ? ' ' + c.achievement : ''}`,
    right,
    392,
    500,
    12,
    {
      anchor: 'end',
      fill: INKA,
      maxLines: 2,
      lineHeight: 1.65,
    },
  );
  // Champion uses the artwork's yellow bar; runners-up get silver or bronze over it.
  const bar = c.type === 'champion' ? '' : `<rect x="574.5" y="311.7" width="211.4" height="37.6" fill="url(#medal)"/>`;
  const signature = (s, x, anchor) =>
    signatoryLines(s)
      .map((line, i) =>
        i
          ? text(f.light, line, x, 517 + (i - 1) * 15.5, 12.6, { anchor, fill: '#353535' })
          : text(f.semibold, line, x, 502, 13, { anchor, fill: '#0b1931', spacing: 1.6 }),
      )
      .join('');
  return art842(
    `<title>${h(`${c.name} — ${award.label} — ${c.event} — ${c.id}`)}</title>
    <defs><linearGradient id="medal" x2="1"><stop offset="0" stop-color="${award.mid}"/><stop offset=".55" stop-color="${award.light}"/><stop offset="1" stop-color="${award.mid}"/></linearGradient></defs>
    <image href="${template}" width="${PAGE_W}" height="${PAGE_H}"/>
    ${text(f.medium, 'American', 156, 112, 8.1, { fill: '#ffffff' })}${text(f.medium, 'Chemical Society', 156, 118.6, 5.4, { fill: '#ffffff' })}
    ${text(f.italic, 'Gopalganj Science and Technology University', 156.5, 140.6, 4.3, { anchor: 'middle', fill: '#ffffff' })}
    ${text(f.semibold, 'OF APPRECIATION', right, 181, 21.3, { anchor: 'end', fill: '#293a4a', spacing: 6.9 })}
    ${text(f.light, 'THIS CERTIFICATE IS PROUDLY PRESENTED TO', right, 219, 11.9, { anchor: 'end', fill: INKA })}
    ${text(f.script, c.name, right - 4, 294, 56.4, { anchor: 'end', fill: '#1058a5', maxWidth: 440 })}
    ${bar}
    ${text(f.label, award.label.toUpperCase(), 680.2, 339.5, 25, { anchor: 'middle', fill: '#030404', spacing: 5, maxWidth: 196 })}
    ${text(f.light, 'in the ', right - eventWidth, 372, eventSize, { anchor: 'end', fill: INKA })}
    ${text(f.semibold, c.event, right, 372, eventSize, { anchor: 'end', fill: INKA, maxWidth: 440 })}
    ${description.svg}
    ${text(f.light, `Date: ${labelDate(c.eventDate || c.dateIssued)}`, right, 392 + description.height + 3, 12, { anchor: 'end', fill: INKA })}
    ${signature(signatories[0], 229, 'start')}${signature(signatories[1], 784, 'end')}
    <g transform="translate(132 301)">${qr(certificateURL(c.id), 46, '#0d1b33')}</g>
    ${text(f.regular, `Credential ID: ${c.id}`, 28, 556, 8.6, { fill: '#030405', maxWidth: 260 })}
    ${text(f.regular, `Issued ${labelDate(c.dateIssued)} · Verify at acs-gstu.web.app`, 28, 567, 7.2, { fill: MUTED, maxWidth: 260 })}
    ${preview ? text(f.semibold, 'SAMPLE — NOT ISSUED', right, 567, 8.5, { anchor: 'end', fill: '#b3261e', spacing: 1 }) : ''}`,
    `${award.label} certificate for ${c.name}`,
  );
}

// ------------------------------------------------------------------ public API

export async function certificateSVG(c, { preview = false } = {}) {
  if (formalTypes.includes(c.type)) return formalSVG(c, { preview });
  return AWARDS[c.type] ? awardSVG(c, { preview }) : participationSVG(c, { preview });
}

/** pdf-lib, loaded on first use (it is large and only needed for downloads). */
export function loadPdfLib() {
  return once('pdf-lib', async () => {
    if (!window.PDFLib)
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'js/vendor/pdf-lib.min.js';
        s.onload = resolve;
        s.onerror = () => reject(Error('The PDF tools could not load. Check your connection and try again.'));
        document.head.append(s);
      });
    return window.PDFLib;
  });
}

export async function downloadCertificate(c, { preview = false } = {}) {
  const svg = await certificateSVG(c, { preview });
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    // 2× the artboard keeps text and the QR code crisp in print.
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH * 2;
    canvas.height = HEIGHT * 2;
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const PDFLib = await loadPdfLib();
    const pdf = await PDFLib.PDFDocument.create();
    const page = pdf.addPage([841.89, 595.28]);
    const image = await pdf.embedPng(canvas.toDataURL('image/png'));
    page.drawImage(image, { x: 0, y: 0, width: 841.89, height: 595.28 });
    pdf.setTitle(`${preview ? 'Sample - ' : ''}${c.name} - ${c.event}`);
    pdf.setAuthor('ACS Student Chapter, GSTU');
    // The whole page links to the verification record.
    const link = pdf.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [0, 0, 841.89, 595.28],
      Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFLib.PDFString.of(certificateURL(c.id)) },
    });
    page.node.set(PDFLib.PDFName.of('Annots'), pdf.context.obj([pdf.context.register(link)]));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([await pdf.save()], { type: 'application/pdf' }));
    a.download = `${preview ? 'SAMPLE-' : ''}${c.id}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } finally {
    URL.revokeObjectURL(url);
  }
}
