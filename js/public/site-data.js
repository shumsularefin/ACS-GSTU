// Site configuration, build information and published content for public pages.
import { firestoreREST } from '../lib/firestore-rest.js';
import { loadPublished } from '../lib/content-store.js';
import { normalizeContent } from '../lib/content-model.js';
import { configureRender } from '../lib/content-render.js';

const once = (fn) => {
  let value;
  return () => (value ??= fn());
};
const fetchJSON = (url) =>
  fetch(url, { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw Error(`${url} unavailable`);
    return r.json();
  });

export const siteConfig = once(() => fetchJSON('data/site-config.json'));
export const buildInfo = once(() => fetchJSON('data/build.json').catch(() => ({ revision: '', events: [], media: {} })));

export const rest = once(async () => {
  const config = await siteConfig();
  return firestoreREST(config.firebase.projectId, { origin: config.emulators?.firestore || undefined, timeout: 8000 });
});

/** Prepares renderers with the image manifest and the list of baked event pages. */
export const renderReady = once(async () => {
  const [manifest, build] = await Promise.all([fetchJSON('data/image-manifest.json').catch(() => ({})), buildInfo()]);
  configureRender({ manifest, media: build.media, events: build.events });
});

/** The content baked into this build (no database reads). */
export const bakedContent = once(() => fetchJSON('data/content.json').then((raw) => normalizeContent(raw)));

const CACHE_KEY = 'acs-live-content';
const CACHE_AGE = 5 * 60 * 1000;

function cached() {
  try {
    const value = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
    return value && Date.now() - value.time < CACHE_AGE ? value : null;
  } catch {
    return null;
  }
}

/**
 * Content published after this build, or null when the build is current.
 * Costs one database read per visitor every five minutes; more only right after a publish.
 */
export const freshContent = once(async () => {
  const config = await siteConfig();
  if (!config.cloudEnabled) return null;
  const baked = document.body.dataset.revision;
  const hit = cached();
  if (hit) return hit.revision === baked || !hit.content ? null : normalizeContent(hit.content);
  try {
    const client = await rest();
    const meta = await client.get('site/meta');
    if (!meta || String(meta.revision) === baked) {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ time: Date.now(), revision: baked }));
      return null;
    }
    const published = await loadPublished(client);
    if (!published) return null;
    try {
      sessionStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ time: Date.now(), revision: String(published.revision), content: published.content }),
      );
    } catch {
      /* Storage may be full or disabled; the page still shows the fresh content. */
    }
    return published.content;
  } catch {
    return null; // Offline or over quota: the baked content stays on screen.
  }
});
