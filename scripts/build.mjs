// Builds the static website into public/.
//
// Content source (CONTENT_SOURCE):
//   firestore  read the published content from Firestore and fail if it is unavailable (deployments)
//   seed       use data/seed/*.json only (tests and offline work)
//   auto       try Firestore, fall back to the seed with a warning (default)
// FIRESTORE_ORIGIN and FIREBASE_PROJECT point the build at the Firestore emulator for end-to-end tests.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { normalizeContent, publicContent, escapeHTML as h, calendarICS, contentSignature } from '../js/lib/content-model.js';
import {
  configureRender,
  renderEvents,
  renderEvent,
  renderTeam,
  renderMembership,
  renderOpenEvent,
  renderEventHighlights,
} from '../js/lib/content-render.js';
import { firestoreREST } from '../js/lib/firestore-rest.js';
import { loadPublished } from '../js/lib/content-store.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const read = (p) => fs.readFileSync(p, 'utf8');
const json = (p) => JSON.parse(read(p));
const config = json('data/site-config.json');
const source = process.argv.includes('--seed') ? 'seed' : process.env.CONTENT_SOURCE || 'auto';
const projectId = process.env.FIREBASE_PROJECT || config.firebase.projectId;
const firestoreOrigin = process.env.FIRESTORE_ORIGIN || 'https://firestore.googleapis.com';
const warnings = [];
const warn = (message) => {
  warnings.push(message);
  console.warn('warning: ' + message);
};

// ------------------------------------------------------------------ content

function seedContent() {
  return normalizeContent({
    events: json('data/seed/events.json'),
    team: json('data/seed/team.json'),
    membership: json('data/seed/membership.json'),
    homepage: { images: ['images/optimized/slide01-1600.webp'] },
  });
}

async function loadContent() {
  const seed = seedContent();
  if (source === 'seed') return { content: seed, layout: 'seed', revision: 'seed' };
  const rest = firestoreREST(projectId, { origin: firestoreOrigin });
  try {
    const published = await loadPublished(rest, { warn, fallback: seed });
    if (published) return { ...published, rest };
    if (source === 'firestore') throw Error('No published content was found in Firestore.');
    warn('No published content in Firestore yet; using the seed content.');
  } catch (error) {
    if (source === 'firestore') throw error;
    warn(`Firestore unavailable (${error.message}); using the seed content.`);
  }
  return { content: seed, layout: 'seed', revision: 'seed' };
}

const { content: loaded, layout, revision, rest, hiddenCertificateEvents = [] } = await loadContent();
const data = publicContent(loaded);

// ------------------------------------------------------------------ output folder

const publicRoot = path.resolve('public');
if (path.dirname(publicRoot) !== root || path.basename(publicRoot) !== 'public') throw Error('Unexpected output directory');
fs.rmSync(publicRoot, { recursive: true, force: true });
for (const dir of ['css', 'js', 'data', 'calendar', 'media']) fs.mkdirSync(path.join(publicRoot, dir), { recursive: true });
const write = (file, body) => fs.writeFileSync(path.join(publicRoot, file), body);

// Uploaded images are baked into the site so visitors do not spend database reads on them.
const media = {};
const references = new Set(JSON.stringify(data).match(/media:[a-f0-9-]{36}/g) || []);
for (const reference of references) {
  const id = reference.slice(6);
  try {
    const doc = rest && (await rest.get(`siteImages/${id}`));
    const match = doc?.image?.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw Error('not found');
    write(`media/${id}.jpg`, Buffer.from(match[1], 'base64'));
    media[reference] = `media/${id}.jpg`;
  } catch (error) {
    warn(`Uploaded image ${id} could not be baked (${error.message}); it will load from the database.`);
  }
}
const images = json('data/image-manifest.json');
configureRender({ manifest: images, media, events: data.events.map((e) => e.id) });

// ------------------------------------------------------------------ styles and scripts

const hashed = (name, body, ext) => `${name}.${createHash('sha256').update(body).digest('hex').slice(0, 12)}.${ext}`;
// Poppins font faces plus the site theme (ACS brand colours).
const siteCSS = read('css/original-fonts.css') + '\n' + read('css/theme.css');
const cssName = hashed('site', siteCSS, 'css');
write(`css/${cssName}`, siteCSS);
const adminCSS = read('css/admin.css');
const adminCSSName = hashed('admin', adminCSS, 'css');
write(`css/${adminCSSName}`, adminCSS);

const bundles = await esbuild.build({
  entryPoints: { site: 'js/public/site.js', certificates: 'js/public/certificates.js', admin: 'js/admin/main.js' },
  bundle: true,
  minify: true,
  format: 'esm',
  target: ['es2022'],
  sourcemap: 'linked',
  outdir: path.join(publicRoot, 'js'),
  entryNames: '[name].[hash]',
  metafile: true,
  legalComments: 'linked',
  logLevel: 'warning',
});
const script = {};
for (const [file, info] of Object.entries(bundles.metafile.outputs))
  if (info.entryPoint && file.endsWith('.js')) script[path.basename(file).split('.')[0]] = 'js/' + path.basename(file);
fs.copyFileSync('js/excel-worker.js', path.join(publicRoot, 'js/excel-worker.js'));
fs.cpSync('js/vendor', path.join(publicRoot, 'js/vendor'), { recursive: true, filter: (f) => !/\.(mjs|md)$/.test(f) });

// ------------------------------------------------------------------ pages

const navItems = [
  ['index', 'Home'],
  ['activities', 'Activities'],
  ['team', 'Team'],
  ['certificates', 'Certificate Center'],
  ['about', 'About'],
  ['contactus', 'Contact Us'],
];
const pages = [];

// Swap bundled images for responsive, optimized variants.
function optimize(html) {
  return html.replace(/<img\b([^>]*?)src="([^"]+)"([^>]*?)>/g, (tag, before, src, after) => {
    const variants = images[src];
    if (!variants) return tag;
    const v = variants[Math.min(1, variants.length - 1)];
    const logo = tag.includes('ACS Student Chapter');
    const attrs = (before + after).replace(/\s(?:width|height|loading|decoding)="[^"]*"/g, '');
    const srcset = [...new Map(variants.map((x) => [x.width, x])).values()].map((x) => `${x.src} ${x.width}w`).join(', ');
    return `<img${attrs} src="${v.src}" srcset="${srcset}" sizes="${logo ? '200px' : '(max-width: 640px) 100vw, 600px'}" width="${v.width}" height="${v.height}" loading="${logo ? 'eager' : 'lazy'}" decoding="async">`;
  });
}

function firstHeroImage() {
  const first = data.homepage.images[0];
  return media[first] || (first.startsWith('media:') ? 'images/optimized/slide01-1600.webp' : first);
}

/**
 * view: the live-content view this page renders ('events', 'event', 'team', 'membership') so that
 * js/public/site.js can refresh it after a publish, before the next scheduled rebuild.
 */
const SITE = 'https://acs-gstu.web.app/';
const DEFAULT_SHARE_IMAGE = 'images/optimized/slide01-1600.webp';
/** Absolute share-image URL for link previews (uploaded or bundled images only). */
function shareImage(src) {
  if (!src) return SITE + DEFAULT_SHARE_IMAGE;
  if (src.startsWith('media:')) return media[src] ? SITE + media[src] : SITE + DEFAULT_SHARE_IMAGE;
  if (/^https:/.test(src)) return src;
  const v = images[src];
  return SITE + (v ? v[v.length - 1].src : src);
}

function page(filename, { title, description, body, active, view, attrs = {}, admin = false, image = '' }) {
  const navigation = navItems
    .map(([id, label]) => `<li><a href="${id}.html"${id === active ? ' aria-current="page"' : ''}>${label}</a></li>`)
    .join('');
  const header = read('src/partials/header.html').replaceAll('{{navigation}}', navigation);
  if (view) {
    const dataAttrs = Object.entries({ view, ...attrs })
      .map(([k, v]) => ` data-${k}="${h(v)}"`)
      .join('');
    body = `<div id="editable-content"${dataAttrs}>${body}</div>`;
  }
  const scripts = admin
    ? `<link rel="stylesheet" href="css/${adminCSSName}"><script type="module" src="${script.admin}"></script>`
    : `<script type="module" src="${script.site}"></script>${active === 'certificates' ? `<script type="module" src="${script.certificates}"></script>` : ''}`;
  const canonical = `https://acs-gstu.web.app/${filename === 'index.html' ? '' : filename}`;
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${h(title)} | ACS Student Chapter, GSTU</title>`,
    `<meta name="description" content="${h(description)}">`,
    '<meta name="theme-color" content="#323fa0">',
    `<link rel="canonical" href="${canonical}">`,
    `<meta property="og:title" content="${h(title)}">`,
    `<meta property="og:description" content="${h(description)}">`,
    `<meta property="og:url" content="${canonical}">`,
    '<meta property="og:site_name" content="ACS Student Chapter, GSTU">',
    `<meta property="og:type" content="${view === 'event' ? 'article' : 'website'}">`,
    `<meta property="og:image" content="${h(shareImage(image))}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    admin || filename === '404.html' ? '<meta name="robots" content="noindex,nofollow">' : '',
    '<link rel="icon" href="ico/favicon.png">',
    `<link rel="stylesheet" href="css/${cssName}">`,
    active === 'index' ? `<link rel="preload" as="image" href="${h(firstHeroImage())}" fetchpriority="high">` : '',
    scripts,
  ].join('');
  const bodyClass = `page-loaded ${active === 'index' ? 'home-page' : 'inner-page'}${admin ? ' editor-body' : ''}`;
  const html = optimize(
    `<!doctype html>\n<html lang="en"><head>${head}</head><body class="${bodyClass}" data-revision="${h(revision)}">${header}<main id="main">${body}</main>${read('src/partials/footer.html')}</body></html>`,
  );
  write(filename, html);
  pages.push(filename);
}

const sourcePage = (name) => read(`src/pages/${name}.html`);

// Home: hero images, the open-event button and membership details are baked in and refreshed live.
const openEvent = renderOpenEvent(data);
page('index.html', {
  title: 'ACS Student Chapter, GSTU',
  description: 'The ACS Student Chapter at GSTU: connect, learn, and grow.',
  active: 'index',
  body: sourcePage('index')
    .replace('{{heroImage}}', h(firstHeroImage()))
    .replace('{{openEventHidden}}', openEvent ? '' : ' hidden')
    .replace('{{openEvent}}', openEvent)
    .replace('{{membership}}', `<div id="editable-content" data-view="membership">${renderMembership(data)}</div>`)
    .replace('{{eventHighlights}}', renderEventHighlights(data))
    .replace('{{eventCount}}', String(data.events.length))
    .replace('{{teamYears}}', String(Object.keys(data.team.committees).length)),
});
page('about.html', {
  title: 'Our story',
  description: 'Discover our chapter story and vision.',
  active: 'about',
  body: sourcePage('about'),
});
page('contactus.html', {
  title: 'Contact us',
  description: 'Contact the chapter for membership, events and collaboration.',
  active: 'contactus',
  body: sourcePage('contactus'),
});
page('admin.html', {
  title: 'Chapter Editor',
  description: 'Authorized chapter content editor.',
  active: 'admin',
  body: sourcePage('admin'),
  admin: true,
});
for (const name of ['certificates', 'verify'])
  page(`${name}.html`, {
    title: 'Certificate Center',
    description: 'Find, verify and download official ACS Student Chapter certificates.',
    active: 'certificates',
    body: sourcePage('verify'),
  });

// Events: one archive page filtered by ?year=&type=, and one page per event for sharing and search.
page('activities.html', {
  title: 'Events',
  description: 'Chapter events and activities.',
  active: 'activities',
  view: 'events',
  body: renderEvents(data),
});
for (const e of data.events) {
  page(`event-${e.id}.html`, {
    title: e.title,
    description: e.description.slice(0, 300),
    active: 'activities',
    view: 'event',
    attrs: { event: e.id },
    image: e.image,
    body: renderEvent(data, e.id),
  });
  write(`calendar/${e.id}.ics`, calendarICS(e));
}
page('event.html', {
  title: 'Event details',
  description: 'Chapter event information and registration.',
  active: 'activities',
  view: 'event',
  body: renderEvent(data, ''),
});

// Team: founders by default; ?year= shows an annual committee and its roster.
page('team.html', {
  title: 'Team',
  description: 'Meet our founding members and annual executive committees.',
  active: 'team',
  view: 'team',
  body: renderTeam(data),
});
page('404.html', {
  title: 'Page not found',
  description: 'Find your way back to the chapter.',
  active: '',
  body: '<section class="archive"><h1>Page not found</h1><a href="index.html">Return home</a></section>',
});

// ------------------------------------------------------------------ assets and data

for (const dir of ['images', 'ico', 'fonts'])
  fs.cpSync(dir, path.join(publicRoot, dir), { recursive: true, filter: (f) => !path.basename(f).startsWith('.') });
fs.copyFileSync('google3d74b2f79116caad.html', path.join(publicRoot, 'google3d74b2f79116caad.html'));
// End-to-end tests point the browser code at the local emulators instead of the live project.
const siteConfig = process.env.FIRESTORE_ORIGIN
  ? {
      ...config,
      firebase: { ...config.firebase, projectId },
      emulators: { firestore: firestoreOrigin, auth: process.env.AUTH_EMULATOR_ORIGIN || '' },
    }
  : config;
write('data/site-config.json', JSON.stringify(siteConfig, null, 2));
fs.copyFileSync('data/image-manifest.json', path.join(publicRoot, 'data/image-manifest.json'));
write('data/content.json', JSON.stringify(data));
// Search engines: every public page, never the dashboard.
const listed = pages.filter((f) => !['admin.html', '404.html', 'event.html', 'verify.html'].includes(f));
const years = [...new Set(data.events.map((e) => e.date.slice(0, 4)))];
const urls = [
  ...listed.map((f) => SITE + (f === 'index.html' ? '' : f)),
  ...years.map((y) => `${SITE}activities.html?year=${y}&amp;type=all`),
  ...Object.keys(data.team.committees).map((y) => `${SITE}team.html?year=${y}`),
];
write(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`,
);
write(
  'robots.txt',
  `User-agent: *
Disallow: /admin.html
Sitemap: ${SITE}sitemap.xml
`,
);
// Until the storage upgrade, Certificate Center entries hidden in the retired layout stay hidden.
const build = {
  revision,
  layout,
  signature: contentSignature(data),
  events: data.events.map((e) => e.id),
  media,
  hiddenCertificateEvents,
  warnings,
};
write('data/build.json', JSON.stringify(build, null, 2));
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `revision=${revision}\nlayout=${layout}\n`);

console.log(`Built ${pages.length} pages from ${layout} content (revision ${revision}) with ${warnings.length} warning(s).`);
