// Facebook Page posts for the News section. Runs in Node only: the build and the scheduled
// freshness check (scripts/build.mjs, scripts/needs-rebuild.mjs) with the Page access token from
// GitHub secrets. The token travels in a header, never in a URL, and is never printed.
import { createHash } from 'node:crypto';

const FIELDS = 'id,message,created_time,permalink_url,full_picture';

/** Reads FACEBOOK_PAGE_ID and FACEBOOK_PAGE_TOKEN; null when News is not connected. */
export function facebookConfig(env = process.env) {
  const pageId = String(env.FACEBOOK_PAGE_ID || '').trim();
  const token = String(env.FACEBOOK_PAGE_TOKEN || '').trim();
  if (!pageId || !token) return null;
  return { pageId, token, version: String(env.FACEBOOK_GRAPH_VERSION || '').trim() };
}

/** The latest posts of the Page, newest first, as { id, text, createdAt, link, picture }. */
export async function fetchPagePosts({ pageId, token, version = '' }, { limit = 24, fetchImpl = fetch } = {}) {
  if (!/^[0-9A-Za-z._-]{1,100}$/.test(pageId)) throw Error('FACEBOOK_PAGE_ID is not a valid Page ID.');
  const url = `https://graph.facebook.com/${version ? `${version}/` : ''}${pageId}/posts?fields=${FIELDS}&limit=${limit}`;
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(`Facebook refused the request (${response.status}): ${body.error?.message || 'no details'}`);
  return (body.data || []).map(normalizePost).filter(Boolean);
}

function normalizePost(raw) {
  const id = String(raw.id || '');
  const link = String(raw.permalink_url || '');
  const text = String(raw.message || '')
    .trim()
    .slice(0, 5000);
  const picture = /^https:\/\//.test(raw.full_picture || '') ? raw.full_picture : '';
  const created = new Date(raw.created_time);
  if (!/^[0-9_]{3,80}$/.test(id) || isNaN(created) || (!text && !picture)) return null;
  return {
    id,
    text,
    createdAt: created.toISOString(),
    link: /^https:\/\/(www\.|m\.|web\.)?facebook\.com\//.test(link) ? link : `https://www.facebook.com/${id}`,
    picture,
  };
}

/** Changes when posts are added, edited or removed (pictures excluded: their URLs change daily). */
export const postsSignature = (posts) =>
  createHash('sha256')
    .update(JSON.stringify(posts.map((p) => [p.id, p.text, p.createdAt])))
    .digest('hex')
    .slice(0, 16);
