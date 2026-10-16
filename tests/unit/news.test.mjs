import test from 'node:test';
import assert from 'node:assert/strict';
import { facebookConfig, fetchPagePosts, postsSignature } from '../../js/lib/facebook.js';
import { normalizeContent, normalizeNews, visibleNews } from '../../js/lib/content-model.js';
import { renderNews, renderNewsHighlights, videoEmbedURL, renderEvent } from '../../js/lib/content-render.js';
import { normalizeEvent } from '../../js/lib/content-model.js';

const graphPosts = {
  data: [
    {
      id: '1001_2002',
      message: 'Lab safety workshop\n\nThanks to everyone who joined, and to Shumsul Arefin.',
      created_time: '2026-10-10T08:00:00+0000',
      permalink_url: 'https://www.facebook.com/acs.gstu/posts/2002',
      full_picture: 'https://scontent.example/photo.jpg',
    },
    { id: '1001_2003', created_time: '2026-10-12T08:00:00+0000', permalink_url: 'https://www.facebook.com/acs.gstu/posts/2003' },
    { id: 'bad id', message: 'x', created_time: '2026-10-12T08:00:00+0000' },
  ],
};

test('Page posts are fetched with the token in a header, never in the address', async () => {
  assert.equal(facebookConfig({}), null);
  const config = facebookConfig({ FACEBOOK_PAGE_ID: '1001', FACEBOOK_PAGE_TOKEN: 'secret-token' });
  let request;
  const posts = await fetchPagePosts(config, {
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => graphPosts };
    },
  });
  assert.ok(!request.url.includes('secret-token'));
  assert.equal(request.options.headers.Authorization, 'Bearer secret-token');
  assert.equal(posts.length, 1, 'posts without text or photo, and malformed ones, are skipped');
  assert.equal(posts[0].createdAt, '2026-10-10T08:00:00.000Z');
  // Photo links change every day; only real changes to posts trigger a rebuild.
  assert.equal(postsSignature(posts), postsSignature([{ ...posts[0], picture: 'https://other.example/new-url.jpg' }]));
  await assert.rejects(
    fetchPagePosts(config, {
      fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'Session expired' } }) }),
    }),
    /Session expired/,
  );
});

test('News shows the latest posts, hides what editors hid, and links names', () => {
  const news = normalizeNews([
    { id: '1_1', text: 'Older post', createdAt: '2026-09-01T00:00:00Z', link: 'https://www.facebook.com/acs.gstu/posts/1', image: '' },
    {
      id: '1_2',
      text: 'Lab safety workshop\n\nThanks, Shumsul Arefin.',
      createdAt: '2026-10-10T00:00:00Z',
      link: 'https://www.facebook.com/acs.gstu/posts/2',
      image: 'media/news/1_2.jpg',
    },
    { id: '1_3', text: 'Not from Facebook', createdAt: '2026-10-11T00:00:00Z', link: 'https://example.com/x', image: '' },
    { id: '1_4', text: 'Bad image', createdAt: '2026-10-11T00:00:00Z', link: 'https://www.facebook.com/x', image: '../secret.jpg' },
  ]);
  assert.deepEqual(
    news.map((p) => p.id),
    ['1_2', '1_1'],
  );
  const page = renderNews({ news, newsHidden: [] });
  assert.ok(page.indexOf('Lab safety workshop') < page.indexOf('Older post'), 'newest first');
  assert.ok(page.includes('<h3>Lab safety workshop</h3>'));
  assert.ok(!page.includes('Thanks, Shumsul'), 'cards show only the date and the first line');
  assert.ok(page.includes('<a class="news-card"') && page.includes('href="https://www.facebook.com/acs.gstu/posts/2"'));
  assert.ok(page.includes('View on Facebook'));
  // Photos reserve their space (the site check requires width and height on every image).
  for (const [tag] of page.matchAll(/<img\b[^>]+>/g)) assert.ok(tag.includes('width=') && tag.includes('height='), tag);
  assert.deepEqual(
    visibleNews({ news, newsHidden: ['1_2'] }).map((p) => p.id),
    ['1_1'],
  );
  assert.equal(renderNewsHighlights({ news: [], newsHidden: [] }), '');
  assert.ok(renderNews({ news: [], newsHidden: [] }).includes('News will appear here soon'));
});

test('baked content keeps its News and hidden list', () => {
  const content = normalizeContent({
    events: [],
    team: { founders: [], committees: {} },
    membership: { intro: 'a', eligibility: 'b', general: 'c', premium: 'd', renewal: 'e', benefits: [], contactEmail: 'a@b.co' },
    news: [{ id: '1_2', text: 'Hi', createdAt: '2026-10-10T00:00:00Z', link: 'https://www.facebook.com/acs.gstu/posts/2', image: '' }],
    newsHidden: ['1_9', 'not valid!'],
  });
  assert.equal(content.news.length, 1);
  assert.deepEqual(content.newsHidden, ['1_9']);
});

test('YouTube and Facebook coverage videos play on the event page; other links stay links', () => {
  assert.equal(videoEmbedURL('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.equal(videoEmbedURL('https://youtu.be/dQw4w9WgXcQ'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.equal(videoEmbedURL('https://www.youtube.com/shorts/abcDEF12345'), 'https://www.youtube-nocookie.com/embed/abcDEF12345');
  assert.match(
    videoEmbedURL('https://www.facebook.com/acs.gstu/videos/1234567890/'),
    /^https:\/\/www\.facebook\.com\/plugins\/video\.php\?href=/,
  );
  assert.match(videoEmbedURL('https://fb.watch/abc123/'), /plugins\/video\.php/);
  assert.match(videoEmbedURL('https://www.facebook.com/reel/987654321'), /plugins\/video\.php/);
  assert.equal(videoEmbedURL('https://www.facebook.com/acs.gstu/posts/1'), '');
  assert.equal(videoEmbedURL('https://example.com/watch?v=dQw4w9WgXcQ'), '');
  const base = { id: 'fair', title: 'Fair', date: '2026-01-02', category: 'outreach', description: 'Fun.' };
  const withVideo = normalizeEvent({ ...base, sourceUrl: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.ok(
    renderEvent({ events: [withVideo], forms: [] }, 'fair').includes('<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"'),
  );
  const album = normalizeEvent({ ...base, sourceUrl: 'https://www.facebook.com/media/set/?set=a.1' });
  const page = renderEvent({ events: [album], forms: [] }, 'fair');
  assert.ok(!page.includes('<iframe') && page.includes('View event coverage'));
});
