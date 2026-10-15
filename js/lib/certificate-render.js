// Draws chapter certificates as self-contained SVG (all text converted to outlines, so they look the
// same everywhere) and exports them as PDF. Two designs:
//  - modern: participation, achievement and placement awards (ACS brand colours)
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
};
const ART = {
  lockup: 'images/brand/acs-chapter-lockup.svg',
  lockupWhite: 'images/brand/acs-chapter-lockup-white.svg',
  globe: 'images/brand/acs-globe.svg',
  gstu: 'images/brand/gstu-logo.png',
  advisor: 'images/brand/advisor-signature.png',
  coadvisor: 'images/brand/coadvisor-signature.png',
  texture: 'images/brand/texture.svg',
};

const AWARDS = {
  champion: { label: 'Champion', rank: '1', light: '#fff1b8', mid: YELLOW, dark: '#b8860b', text: INK },
  'runner-up': { label: 'First Runner-up', rank: '2', light: '#ffffff', mid: '#c9d1dd', dark: '#7d899b', text: INK },
  'second-runner-up': { label: 'Second Runner-up', rank: '3', light: '#ffd9bd', mid: '#d08a55', dark: '#8a4d24', text: '#ffffff' },
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

const NOKERN = { kerning: false };

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
  const d = pathData(font.getPath(s, x, y, size, NOKERN));
  if (clean(d)) return d;
  let out = '';
  let cursor = x;
  for (const ch of s) {
    for (let i = 0; i < 12; i++) {
      const g = pathData(font.getPath(ch, cursor + i * 0.011, y + i * 0.007, size, NOKERN));
      if (clean(g)) {
        out += g;
        break;
      }
    }
    cursor += font.getAdvanceWidth(ch, size, NOKERN);
  }
  return out;
}

/** Text as an outline path. Shrinks to fit maxWidth; anchor is start, middle or end. */
function text(font, value, x, y, size, { fill = INK, anchor = 'start', maxWidth = Infinity, spacing = 0, attrs = '' } = {}) {
  const s = String(value ?? '');
  if (!s) return '';
  // Kerning in some of these fonts yields invalid outlines (NaN), so letters are spaced by advance widths only.
  const measure = (sz) => font.getAdvanceWidth(s, sz, NOKERN) + spacing * (sz / size) * Math.max(0, [...s].length - 1);
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
      start += font.getAdvanceWidth(ch, size) + spacing;
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
    if (row && font.getAdvanceWidth(next, size, NOKERN) > width) {
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

/** Letters placed around a circle (for seals). Text is spread evenly around the full ring. */
function ringText(font, value, cx, cy, r, size, fill) {
  const chars = [...value];
  const widths = chars.map((ch) => font.getAdvanceWidth(ch, size));
  const gap = (2 * Math.PI * r - widths.reduce((a, b) => a + b, 0)) / chars.length;
  let angle = 0;
  let out = '';
  chars.forEach((ch, i) => {
    const a = angle + widths[i] / 2 / r;
    const x = cx + r * Math.sin(a);
    const y = cy - r * Math.cos(a);
    if (ch.trim())
      out += `<path fill="${fill}" transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${((a * 180) / Math.PI).toFixed(2)})" d="${outline(font, ch, -widths[i] / 2, size * 0.35, size)}"/>`;
    angle += (widths[i] + gap) / r;
  });
  return out;
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

function seal({ cx, cy, r, ring, band, label, inner, font }) {
  return `<g>
    <circle cx="${cx}" cy="${cy}" r="${r + 6}" fill="none" stroke="${ring}" stroke-width="1.4"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${band}"/>
    <circle cx="${cx}" cy="${cy}" r="${r - 3}" fill="none" stroke="${ring}" stroke-width="1" stroke-dasharray="1.2 2.4"/>
    ${ringText(font, label, cx, cy, r - 13, 11.5, '#ffffff')}
    <circle cx="${cx}" cy="${cy}" r="${r - 25}" fill="#fffdf6" stroke="${ring}" stroke-width="1.6"/>
    ${inner}
  </g>`;
}

async function formalSVG(c, { preview }) {
  const f = await load(Object.fromEntries(Object.entries(FONTS).map(([k, v]) => [k, loadFont(v)])));
  const art = await load({
    globe: loadArt(ART.globe),
    gstu: loadArt(ART.gstu),
    advisor: loadArt(ART.advisor),
    coadvisor: loadArt(ART.coadvisor),
  });
  const PAPER = '#fbf8ee';
  const GOLD = '#b8913a';
  const cx = WIDTH / 2;
  const title = FORMAL_TITLES[c.type] || 'Certificate of Recognition';
  const citation = c.achievement || `${certificateTypes[c.type]?.[1] || 'in recognition of distinguished service to'} ${c.event}`;
  const cite = paragraph(f.serif, citation, cx, 424, 760, 19, { anchor: 'middle', fill: '#2c2a3a', maxLines: 3, lineHeight: 1.5 });
  const given = paragraph(
    f.serif,
    `Given under the seal of the ACS Student Chapter, GSTU, ${formalDate(c.dateIssued)}.`,
    cx,
    424 + cite.height + 14,
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
  const name = (dx, dy, fill) => text(f.blackletter, c.name, cx + dx, 350 + dy, 60, { anchor: 'middle', fill, maxWidth: 820 });
  const heading = (dx, dy, fill) =>
    text(f.blackletter, 'American Chemical Society', cx + dx, 128 + dy, 76, { anchor: 'middle', fill, maxWidth: 940 });

  return `${svgOpen(`${title} for ${c.name}`)}<title>${h(`${c.name} — ${c.event} — ${c.id}`)}</title>
    ${guilloche(PAPER)}
    <image href="${art.globe}" x="${cx - 235}" y="165" width="470" height="470" opacity=".06"/>
    <rect x="20" y="20" width="${WIDTH - 40}" height="${HEIGHT - 40}" fill="none" stroke="${INK}" stroke-width="1.8"/>
    <rect x="28" y="28" width="${WIDTH - 56}" height="${HEIGHT - 56}" fill="none" stroke="${GOLD}" stroke-width=".9"/>
    ${corner(28, 28)}${corner(WIDTH - 28, 28)}${corner(28, HEIGHT - 28)}${corner(WIDTH - 28, HEIGHT - 28)}

    <g transform="translate(78 70)"><circle r="17" fill="none" stroke="${BLUE}" stroke-width="1.2" stroke-dasharray="1.5 2.2"/><path d="M-7 0l5 5 9-10" fill="none" stroke="${BLUE}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></g>
    ${text(f.semibold, shortCode(c.id), 58, 108, 10.5, { fill: INK, spacing: 1.6 })}

    ${heading(3, 3, BLUE).replace('<path', '<path opacity=".5"')}${heading(0, 0, INK)}
    ${text(f.serif, 'By the authority of its International Student Chapter at Gopalganj Science and Technology University', cx, 166, 14, { anchor: 'middle', fill: '#3a3848', maxWidth: 820 })}
    ${text(f.serif, 'and upon the recommendation of the Chapter Advisors', cx, 188, 14, { anchor: 'middle', fill: '#3a3848' })}
    ${text(f.serif, title, cx, 246, 31, { anchor: 'middle', fill: INK, maxWidth: 760 })}
    ${text(f.serifItalic, 'is presented to', cx, 282, 14, { anchor: 'middle', fill: '#4a4858' })}
    ${name(2.5, 2.5, BLUE).replace('<path', '<path opacity=".45"')}${name(0, 0, INK)}
    ${c.designation ? text(f.serifItalic, c.designation, cx, 384, 16, { anchor: 'middle', fill: '#3a3848', maxWidth: 640 }) : ''}
    ${cite.svg}${given.svg}

    ${seal({ cx: 165, cy: 548, r: 70, ring: GOLD, band: BLUE, label: 'AMERICAN CHEMICAL SOCIETY • INTERNATIONAL STUDENT CHAPTER • ', font: f.semibold, inner: `<image href="${art.globe}" x="${165 - 34}" y="${548 - 34}" width="68" height="68"/>` })}
    ${seal({ cx: WIDTH - 165, cy: 548, r: 70, ring: GOLD, band: '#14713a', label: 'GOPALGANJ SCIENCE AND TECHNOLOGY UNIVERSITY • GSTU • ', font: f.semibold, inner: `<clipPath id="gstuSeal"><circle cx="${WIDTH - 165}" cy="548" r="42"/></clipPath><image href="${art.gstu}" x="${WIDTH - 165 - 46}" y="${548 - 48}" width="92" height="100" clip-path="url(#gstuSeal)" preserveAspectRatio="xMidYMid slice"/>` })}

    ${signatories.map((s, i) => signature(s, i, i ? WIDTH - 250 : 250)).join('')}
    <rect x="${cx - 62}" y="602" width="124" height="124" rx="8" fill="${PAPER}"/>
    <g transform="translate(${cx - 50} 612)">${qr(certificateURL(c.id), 100, INK)}</g>
    ${text(f.semibold, `Credential ID ${c.id}`, cx, 744, 9.5, { anchor: 'middle', fill: INK, maxWidth: 300 })}
    ${text(f.regular, `Issued ${labelDate(c.dateIssued)} · Verify at acs-gstu.web.app`, cx, 760, 9.5, { anchor: 'middle', fill: MUTED, maxWidth: 300 })}
    ${preview ? text(f.semibold, 'SAMPLE — NOT ISSUED', cx, 780, 10.5, { anchor: 'middle', fill: '#b3261e', spacing: 1.2 }) : ''}
  </svg>`;
}

// ------------------------------------------------------------------ modern design (participation and awards)

function medal(award, x, y, f) {
  return `<g transform="translate(${x} ${y})">
    <path d="M-20 22 -28 52 -17 47 -10 57 2 30Z" fill="${BLUE}"/><path d="M20 22 28 52 17 47 10 57-2 30Z" fill="${BLUE_2}"/>
    <circle r="38" fill="url(#metal)" stroke="${award.dark}" stroke-width="1.5"/>
    <circle r="30" fill="none" stroke="#ffffff" stroke-opacity=".7" stroke-width="1.5" stroke-dasharray="2 3"/>
    ${text(f.extrabold, award.rank, 0, 13, 35, { anchor: 'middle', fill: award.text === '#ffffff' ? '#ffffff' : INK })}
  </g>`;
}

async function modernSVG(c, { preview }) {
  const f = await load({ regular: loadFont(FONTS.regular), semibold: loadFont(FONTS.semibold), extrabold: loadFont(FONTS.extrabold) });
  const art = await load({
    lockup: loadArt(ART.lockupWhite),
    globe: loadArt(ART.globe),
    gstu: loadArt(ART.gstu),
    advisor: loadArt(ART.advisor),
    coadvisor: loadArt(ART.coadvisor),
    texture: loadArt(ART.texture),
  });
  const award = AWARDS[c.type];
  const type = certificateTypes[c.type] || certificateTypes.participant;
  const accent = award ? award.mid : AQUA;
  const left = 64;
  // Everything above the signatures (y 680): awards leave room for the medal.
  const eventY = award ? 606 : 548;
  const event = paragraph(f.semibold, c.event, left, eventY, 760, 25, {
    fill: BLUE,
    maxLines: award ? 1 : 2,
    lineHeight: 1.3,
    minSize: 15,
  });
  const noteY = eventY + event.height + (award ? 4 : 12);
  const note = paragraph(
    f.regular,
    c.achievement || 'Organized by the ACS Student Chapter, Gopalganj Science and Technology University.',
    left,
    noteY,
    760,
    13.5,
    {
      fill: MUTED,
      maxLines: award || event.height > 40 ? 1 : 2,
    },
  );
  const ribbonX = 1005;
  const idLines = c.id.match(/.{1,20}/g) || [''];
  const signature = (s, i) => {
    const x = left + i * 470;
    return `<image href="${i ? art.coadvisor : art.advisor}" x="${x}" y="690" width="160" height="50" preserveAspectRatio="xMinYMid meet"/>
      <line x1="${x}" y1="744" x2="${x + 380}" y2="744" stroke="#cdd3ef" stroke-width="1.2"/>
      ${text(f.semibold, s.name, x, 768, 16, { fill: INK })}
      ${text(f.regular, `${s.role}, ACS Student Chapter, GSTU`, x, 787, 11.5, { fill: BLUE })}
      ${text(f.regular, s.title, x, 803, 11, { fill: MUTED })}`;
  };
  const shapes = [
    [700, -40, 240, 0.08],
    [930, 60, 120, 0.1],
    [560, 100, 70, 0.07],
  ]
    .map(
      ([x, y, s, o]) =>
        `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s * 0.24}" transform="rotate(45 ${x + s / 2} ${y + s / 2})" fill="#ffffff" opacity="${o}"/>`,
    )
    .join('');

  return `${svgOpen(`${type[0]} certificate for ${c.name}`)}<title>${h(`${c.name} — ${c.event} — ${c.id}`)}</title>
    <defs>
      <linearGradient id="band" x2="1"><stop offset="0" stop-color="${BLUE_2}"/><stop offset=".8" stop-color="${BLUE}"/></linearGradient>
      <linearGradient id="aqua" x2="1"><stop offset="0" stop-color="${award ? award.dark : '#c1f5f5'}"/><stop offset=".5" stop-color="${accent}"/><stop offset="1" stop-color="${award ? award.light : AQUA_2}"/></linearGradient>
      ${award ? `<radialGradient id="metal" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="${award.light}"/><stop offset=".55" stop-color="${award.mid}"/><stop offset="1" stop-color="${award.dark}"/></radialGradient>` : ''}
      <clipPath id="page"><rect width="${WIDTH}" height="${HEIGHT}"/></clipPath>
    </defs>
    <g clip-path="url(#page)">
    <rect width="${WIDTH}" height="${HEIGHT}" fill="#ffffff"/>
    <image href="${art.texture}" x="0" y="160" width="${WIDTH}" height="660" preserveAspectRatio="xMidYMid slice" opacity=".16"/>
    <image href="${art.globe}" x="-150" y="430" width="420" height="420" opacity=".05"/>
    <rect width="${WIDTH}" height="156" fill="url(#band)"/>${shapes}
    <image href="${art.lockup}" x="56" y="28" width="320" height="100"/>
    <rect x="1060" y="26" width="104" height="104" rx="14" fill="#ffffff"/>
    <image href="${art.gstu}" x="1066" y="30" width="92" height="96" preserveAspectRatio="xMidYMid meet"/>
    <rect y="156" width="${WIDTH}" height="7" fill="url(#aqua)"/>

    ${text(f.semibold, award ? 'EXCELLENCE · ACHIEVEMENT · DISTINCTION' : 'CHEMISTRY · COMMUNITY · IMPACT', left, 216, 12.5, { fill: BLUE, spacing: 2.4 })}
    ${text(f.extrabold, 'Certificate', left - 3, 292, 66, { fill: INK })}
    ${text(f.semibold, `of ${type[0]}`, left, 334, 28, { fill: BLUE })}
    <rect x="${left}" y="354" width="84" height="6" rx="3" fill="url(#aqua)"/>
    <rect x="${left + 96}" y="351" width="12" height="12" rx="3" transform="rotate(45 ${left + 102} 357)" fill="${YELLOW}"/>
    ${text(f.regular, 'This certificate is proudly presented to', left, 404, 15.5, { fill: MUTED })}
    ${text(f.extrabold, c.name, left - 2, 462, 50, { fill: INK, maxWidth: 770 })}
    ${
      award
        ? `${medal(award, left + 40, 514, f)}
           <rect x="${left + 100}" y="497" width="${f.semibold.getAdvanceWidth(award.label, 19, NOKERN) + 44}" height="44" rx="22" fill="url(#metal)" stroke="${award.dark}" stroke-width="1"/>
           ${text(f.semibold, award.label, left + 122, 526, 19, { fill: award.text })}
           ${text(f.regular, 'awarded in', left + 112 + f.semibold.getAdvanceWidth(award.label, 19, NOKERN) + 60, 526, 15.5, { fill: MUTED })}`
        : text(f.regular, type[1], left, 506, 15.5, { fill: MUTED })
    }
    ${event.svg}${note.svg}
    ${text(f.regular, `Event date: ${labelDate(c.eventDate || c.dateIssued)}`, left, Math.min(noteY + note.height + 4, 680), 12.5, { fill: MUTED })}

    <path d="M880 163V560L${ribbonX} 646 1130 560V163Z" fill="#ffffff" fill-opacity=".96" stroke="url(#band)" stroke-width="2.5"/>
    <rect x="880" y="163" width="250" height="8" fill="url(#aqua)"/>
    ${text(f.extrabold, preview ? 'Preview' : 'Verified', ribbonX, 222, 25, { anchor: 'middle', fill: BLUE })}
    ${text(f.semibold, preview ? 'not issued' : 'certificate', ribbonX, 247, 15, { anchor: 'middle', fill: INK })}
    <rect x="${ribbonX - 80}" y="270" width="160" height="160" rx="12" fill="#ffffff" stroke="#e3e6f6"/>
    <g transform="translate(${ribbonX - 68} 282)">${qr(certificateURL(c.id), 136, INK)}</g>
    ${text(f.semibold, 'Scan to verify', ribbonX, 462, 14, { anchor: 'middle', fill: INK })}
    ${text(f.regular, `Issued ${labelDate(c.dateIssued)}`, ribbonX, 484, 12, { anchor: 'middle', fill: MUTED })}
    ${idLines.map((line, i) => text(f.semibold, line, ribbonX, 508 + i * 13, 9, { anchor: 'middle', fill: BLUE, maxWidth: 200 })).join('')}

    ${signatories.map(signature).join('')}
    <rect y="${HEIGHT - 32}" width="${WIDTH}" height="32" fill="url(#band)"/>
    ${text(f.semibold, preview ? 'SAMPLE — NOT ISSUED' : 'Digitally issued by ACS Student Chapter, GSTU · Verify at acs-gstu.web.app', left, HEIGHT - 11, 10.5, { fill: '#ffffff' })}
    ${text(f.regular, 'Gopalganj-8100, Bangladesh', WIDTH - left, HEIGHT - 11, 10.5, { anchor: 'end', fill: '#ffffff' })}
    </g>
  </svg>`;
}

// ------------------------------------------------------------------ public API

export async function certificateSVG(c, { preview = false } = {}) {
  return formalTypes.includes(c.type) ? formalSVG(c, { preview }) : modernSVG(c, { preview });
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
    if (!window.PDFLib)
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'js/vendor/pdf-lib.min.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.append(s);
      });
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
