// News: posts from the chapter's Facebook Page appear on the website automatically (scripts/build.mjs).
// Editors choose which ones to hide; the change shows on the website straight away.
import { h, busy, toast } from '../ui.js';
import { empty } from '../section.js';

const GUIDE = 'https://github.com/shumsularefin/ACS-GSTU/blob/main/FACEBOOK.md';
const dateFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short', year: 'numeric' });
const headline = (text) => (text.split(/\r?\n/).find((l) => l.trim()) || 'Photo post').trim().slice(0, 140);

export const newsView = {
  id: 'news',
  title: 'News',
  icon: '✉',
  allowed: (p) => p.news,
  async render(root, app) {
    root.innerHTML = '<section class="ed-card"><p class="ed-muted">Loading the latest Facebook posts…</p></section>';
    let feed;
    try {
      feed = await fetch('data/news.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : { posts: [] }));
    } catch {
      feed = { posts: [] };
    }
    if (!root.isConnected) return;
    const hidden = new Set(app.data.newsSettings.hidden);
    const posts = feed.posts || [];
    const row = (p) => {
      const off = hidden.has(p.id);
      return `<li class="${off ? 'is-hidden' : ''}">
        ${p.image ? `<img src="${h(p.image)}" alt="" loading="lazy">` : '<span class="ed-news-blank" aria-hidden="true">ACS</span>'}
        <div><strong>${h(headline(p.text))}</strong><small>${h(dateFormat.format(new Date(p.createdAt)))} · <a href="${h(p.link)}" target="_blank" rel="noopener">Facebook ↗</a></small></div>
        <span class="ed-tag ${off ? '' : 'ed-tag-open'}">${off ? 'Hidden' : 'On the website'}</span>
        <button type="button" class="ed-btn ed-btn-small ${off ? 'ed-btn-primary' : 'ed-btn-quiet'}" data-toggle="${h(p.id)}">${off ? 'Show' : 'Hide'}</button>
      </li>`;
    };
    const intro = feed.connected
      ? '<p class="ed-muted">New posts on the chapter’s Facebook Page appear on the website within about 15 minutes. Hide any post you do not want on the website; hiding takes effect straight away.</p>'
      : `<div class="ed-note"><p><strong>News is not connected to Facebook yet.</strong> The super-admin sets this up once: a free Meta app and a Page token saved in GitHub. Follow the <a href="${GUIDE}" target="_blank" rel="noopener">Facebook setup guide ↗</a>.</p></div>`;
    root.innerHTML = `
      <section class="ed-card">
        <div class="ed-card-head"><h3>Posts from the Facebook Page <span class="ed-count">${posts.length}</span></h3>${posts.length ? '<a class="ed-link" href="news.html" target="_blank" rel="noopener">View News ↗</a>' : ''}</div>
        ${intro}
        ${posts.length ? `<ul class="ed-news">${posts.map(row).join('')}</ul>` : feed.connected ? empty('No posts yet', 'Posts appear here after the next automatic update.') : ''}
      </section>`;
    root.addEventListener('click', async (e) => {
      const button = e.target.closest('[data-toggle]');
      if (!button) return;
      const id = button.dataset.toggle;
      const next = new Set(app.data.newsSettings.hidden);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      await busy(button, 'Saving…', async () => {
        await app.cloud.savePage('news', { hidden: [...next] }, app.data.newsSettings.revision);
        await app.reload();
        toast(next.has(id) ? 'Post hidden on the website.' : 'Post shown on the website.');
      });
    });
  },
};
