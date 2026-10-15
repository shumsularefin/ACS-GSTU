// Homepage hero: a collage of shaped photo tiles. The photos rotate through the tiles (homepage images
// from the dashboard first, then event and member photos), with Previous, Pause/Play and Next controls.
// Also keeps the "Explore new event & register" button current.
import { renderOpenEvent, heroPhotos } from '../lib/content-render.js';
import { bakedContent, renderReady } from './site-data.js';
import { resolveImage } from './media.js';

const INTERVAL = 6500;

export function setupHomepage() {
  const collage = document.getElementById('hero-collage');
  if (!collage) return;
  const tiles = [...collage.querySelectorAll('.hero-tile')];
  const controls = document.getElementById('hero-controls');
  const play = document.getElementById('hero-play');
  const counter = document.getElementById('hero-position');
  const feature = document.getElementById('open-events');
  let photos = [];
  let position = 0;
  let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let request = 0;

  async function swap(img, src) {
    if (img.getAttribute('src') === src) return;
    const next = new Image();
    next.src = src;
    try {
      await next.decode();
    } catch {
      return; // Keep the current photo when one cannot load.
    }
    img.classList.add('fading');
    await new Promise((resolve) => setTimeout(resolve, paused ? 0 : 450));
    img.removeAttribute('srcset');
    img.src = src;
    img.classList.remove('fading');
  }

  async function show(index) {
    if (photos.length < 2) return;
    position = (index + photos.length) % photos.length;
    const current = ++request;
    counter.textContent = `${position + 1} / ${photos.length}`;
    await Promise.all(
      tiles.map(async (tile, i) => {
        const img = tile.querySelector('img');
        if (!img) return;
        let src;
        try {
          src = await resolveImage(photos[(position + i) % photos.length]);
        } catch {
          return;
        }
        if (current === request) await swap(img, src);
      }),
    );
  }

  function apply(data) {
    const next = heroPhotos(data);
    if (JSON.stringify(next) !== JSON.stringify(photos)) {
      // The build already placed the first photos; only newer content (after a publish) redraws them.
      const redraw = photos.length > 0;
      photos = next;
      position = 0;
      if (redraw) show(0);
    }
    // Rotation only makes sense when there are more photos than tiles.
    controls.hidden = photos.length <= tiles.length;
    counter.textContent = `${position + 1} / ${photos.length}`;
    const button = renderOpenEvent(data);
    feature.hidden = !button;
    if (feature.innerHTML !== button) feature.innerHTML = button;
  }

  const label = () => {
    play.textContent = paused ? 'Play' : 'Pause';
    play.setAttribute('aria-label', paused ? 'Play slideshow' : 'Pause slideshow');
  };
  label();
  play.addEventListener('click', () => {
    paused = !paused;
    label();
  });
  document.getElementById('hero-previous').addEventListener('click', () => show(position - 1));
  document.getElementById('hero-next').addEventListener('click', () => show(position + 1));
  setInterval(() => {
    if (!paused && !document.hidden && photos.length > tiles.length && !controls.matches(':focus-within')) show(position + 1);
  }, INTERVAL);

  window.addEventListener('chapter-content', (e) => apply(e.detail));
  // Re-check the open event against today's date (the page may be older than the event).
  Promise.all([renderReady(), bakedContent()])
    .then(([, data]) => apply(data))
    .catch(() => {});
}
