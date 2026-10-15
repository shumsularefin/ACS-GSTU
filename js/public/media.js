// Uploaded images (media:<id>) are normally baked into the site as media/<id>.jpg. Images uploaded
// after the last build are read from the database until the next rebuild.
import { buildInfo, rest } from './site-data.js';

const cache = new Map();

export async function resolveImage(value) {
  if (!value?.startsWith('media:')) return value;
  if (!/^media:[a-f0-9-]{36}$/.test(value)) throw Error('Invalid image reference');
  const baked = (await buildInfo()).media?.[value];
  if (baked) return baked;
  if (!cache.has(value)) {
    const request = (async () => {
      const doc = await (await rest()).get(`siteImages/${value.slice(6)}`);
      const src = doc?.image;
      if (!/^data:image\/(jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(src || '')) throw Error('Image unavailable');
      return src;
    })();
    cache.set(value, request);
    request.catch(() => cache.delete(value));
  }
  return cache.get(value);
}

function loadPending() {
  for (const img of document.querySelectorAll('img[data-media]:not([data-loading-media])')) {
    img.dataset.loadingMedia = 'true';
    resolveImage(img.dataset.media)
      .then((src) => {
        img.src = src;
        img.removeAttribute('data-media');
      })
      .catch(() => {
        img.alt += ' (image unavailable)';
      });
  }
}

export function setupMedia() {
  loadPending();
  new MutationObserver(loadPending).observe(document.body, { childList: true, subtree: true });
}
