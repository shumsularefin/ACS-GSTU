// Checks the built website in public/ (npm test builds it from the seed content first).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const read = (p) => fs.readFileSync(p, 'utf8');
const pages = fs.readdirSync('public').filter((f) => f.endsWith('.html') && !f.startsWith('google'));
const build = JSON.parse(read('public/data/build.json'));
const hosting = JSON.parse(read('firebase.json')).hosting;

test('every page has the shared shell, one h1 and only local assets that exist', () => {
  for (const file of pages) {
    const html = read(`public/${file}`);
    assert.equal((html.match(/<h1\b/g) || []).length, 1, file);
    assert.equal((html.match(/<main\b/g) || []).length, 1, file);
    assert.ok(html.includes('Skip to content'), file);
    assert.ok(html.includes('<footer class="footer">'), file);
    assert.ok(!/<script(?![^>]*src=)[^>]*>/.test(html), `${file}: no inline scripts (the CSP blocks them)`);
    for (const [, url] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (/^(?:https?:|mailto:|tel:|#|data:)/.test(url) || url.includes('?')) continue;
      assert.ok(fs.existsSync(`public/${url.split('#')[0]}`), `${file}: missing ${url}`);
    }
  }
});

test('the original theme, fonts and homepage content are kept', () => {
  assert.equal(
    createHash('sha256').update(read('css/style.css').replace(/\r\n/g, '\n')).digest('hex'),
    '8476ff84c9cb5780dadf969abaa7ad6e92c23588ceafbbeee0b105942b4b65bc',
  );
  const home = read('public/index.html');
  for (const text of [
    'STUDENT<br>',
    '<span>CHAPTER</span>',
    'Elemental Ideas: Your ACS Community at GSTU',
    'id="membership"',
    'Membership benefits &amp; renewal',
    'Gopalganj Science and Technology University',
  ])
    assert.ok(home.includes(text), text);
  assert.ok(home.includes('fetchpriority="high"'));
  assert.ok(home.includes('id="hero-controls"'));
  assert.ok(!home.includes('Our Recent works and activities'));
  const fonts = read('css/original-fonts.css');
  for (const font of ['Poppins', 'Fjalla One', 'Dancing Script']) assert.ok(fonts.includes(font));
});

test('one events page and one team page replace the per-year copies; old addresses redirect', () => {
  assert.ok(!pages.some((f) => /^activities-20\d\d-|^team-20\d\d/.test(f)));
  for (const id of build.events) {
    const html = read(`public/event-${id}.html`);
    assert.ok(html.includes(`data-event="${id}"`));
    assert.ok(fs.existsSync(`public/calendar/${id}.ics`));
  }
  const events = read('public/activities.html');
  assert.ok(
    events.includes('href="activities.html?year=2025&amp;type=all"') || events.includes('href="activities.html?year=2025&type=all"'),
  );
  const team = read('public/team.html');
  assert.ok(team.includes('Md. Morshed Alam'));
  assert.ok(!team.includes('<p>President</p>'), 'founding cards hide executive titles');
  const sources = hosting.redirects.map((r) => r.regex || r.source).join('\n');
  for (const old of ['/activities-2024-outreach.html', '/team-2025.html', '/activities-single.html', '/membership.html'])
    assert.ok(
      hosting.redirects.some((r) => (r.regex ? new RegExp(r.regex.replace(/\(\?P</g, '(?<')).test(old) : r.source === old)),
      `${old} redirects (${sources})`,
    );
});

test('pages load no legacy animation bundles; every image reserves its size', () => {
  for (const file of pages) {
    const html = read(`public/${file}`);
    assert.ok(!/src="js\/(?:jquery|swiper|wow|app|scripts|three)/.test(html), file);
    assert.ok(!html.includes('class="preloader"'), file);
    for (const [, tag] of html.matchAll(/(<img\b[^>]+>)/g)) {
      assert.ok(tag.includes('width=') && tag.includes('height='), `${file}: ${tag}`);
    }
  }
});

test('no membership IDs or private data are published', () => {
  const content = read('public/data/content.json');
  assert.ok(!content.includes('memID'));
  for (const file of pages) assert.ok(!read(`public/${file}`).includes('memID'), file);
});

test('security headers and cache rules are configured', () => {
  const all = hosting.headers.find((h) => h.source === '**').headers.map((h) => h.key);
  for (const key of ['Content-Security-Policy', 'X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy'])
    assert.ok(all.includes(key), key);
  const csp = hosting.headers.find((h) => h.source === '**').headers.find((h) => h.key === 'Content-Security-Policy').value;
  assert.ok(csp.includes("frame-ancestors 'none'") && csp.includes("object-src 'none'"));
  assert.ok(!('predeploy' in hosting), 'the workflow builds once; firebase deploy does not rebuild');
  assert.ok(fs.readdirSync('public/js').some((f) => /^site\.[A-Z0-9]+\.js$/.test(f)));
});
