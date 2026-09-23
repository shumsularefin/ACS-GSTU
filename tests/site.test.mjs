import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const read = p => fs.readFileSync(p,'utf8');
const pages = JSON.parse(read('data/generated-pages.json'));
const events = JSON.parse(read('data/events.json'));
test('all generated pages have local assets, accessible shell, and synchronized output', () => {
  for (const filename of pages) {
    const html = read(`public/${filename}`);
    assert.equal(html, read(filename),filename);
    assert.equal((html.match(/<h1\b/g)||[]).length,1,filename);
    assert.equal((html.match(/<main\b/g)||[]).length,1,filename);
    assert.ok(html.includes('Skip to content'),filename);
    assert.ok(html.includes('<footer class="footer">'),filename);
    for (const [,url] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (/^(?:https?:|mailto:|tel:|#|\$)/.test(url)) continue;
      assert.ok(fs.existsSync(`public/${url.split(/[?#]/)[0]}`), `${filename}: missing ${url}`);
    }
  }
});
test('original design and fonts are retained',()=>{
  assert.equal(createHash('sha256').update(read('css/style.css').replace(/\r\n/g,'\n')).digest('hex'),'8476ff84c9cb5780dadf969abaa7ad6e92c23588ceafbbeee0b105942b4b65bc');
  const home=read('index.html');
  assert.ok(home.includes('STUDENT<br>'));
  assert.ok(home.includes('<span>CHAPTER</span>'));
  assert.ok(home.includes('Elemental Ideas: Your ACS Community at GSTU'));
  const fonts=read('css/original-fonts.css');
  for(const font of ['Poppins','Fjalla One','Dancing Script'])assert.ok(fonts.includes(font));
  assert.ok(!read('css/site.css').includes('Arial'));
  assert.ok(home.includes('id="membership"'));
  assert.ok(home.includes('Membership benefits &amp; renewal'));
  assert.ok(!fs.existsSync('public/membership.html'));
});
test('events have unique detail pages and categories preserve selected year', () => {
  for (const event of events) {
    const html = read(`public/event-${event.id}.html`);
    assert.ok(html.includes(event.title.replaceAll('&','&amp;')));
    assert.ok(html.includes(`datetime="${event.date}"`));
  }
  const outreach = read('public/activities-2024-outreach.html');
  assert.equal((outreach.match(/class="event-card"/g)||[]).length,2);
  assert.ok(outreach.includes('href="activities-2025-outreach.html"'));
  assert.ok(!outreach.includes('href="event-green-and-clean.html"'));
  assert.ok(read('public/activities-2026-outreach.html').includes('No events have been published'));
});
test('founders are the default; all years provide native expandable rosters and placeholders', () => {
  assert.ok(read('public/team.html').includes('Md. Morshed Alam'));
  for (const year of [2024,2025,2026]) {
    const html = read(`public/team-${year}.html`);
    assert.ok(html.includes('<details class="roster">'));
    assert.ok(html.includes('General members'));
    assert.ok(html.includes('Premium members'));
    assert.ok(html.includes('Placeholder committee'));
  }
});
test('performance: no animation bundles, blocking preloader, or homepage activity section', () => {
  const home = read('public/index.html');
  assert.ok(!home.includes('Our Recent works and activities'));
  for (const file of pages) {
    const html = read(`public/${file}`);
    assert.ok(!/src="js\/(?:jquery|swiper|wow|app|scripts)/.test(html));
    assert.ok(!html.includes('class="preloader"'));
    for (const [,tag] of html.matchAll(/(<img\b[^>]+>)/g)) {
      assert.ok(tag.includes('width='));
      assert.ok(tag.includes('height='));
      assert.ok(tag.includes('decoding="async"'));
    }
  }
  assert.ok(home.includes('fetchpriority="high"'));
});
