// Homepage hero: rotating feature images (editable in the dashboard) with Previous, Pause/Play
// and Next controls, plus the "Explore new event & register" button for the next open event.
import { renderOpenEvent } from '../lib/content-render.js';
import { bakedContent, renderReady } from './site-data.js';
import { resolveImage } from './media.js';

const INTERVAL = 6500;
const OVERLAY = 'linear-gradient(90deg,rgba(15,32,78,.62),rgba(15,32,78,.18))';

export function setupHomepage() {
  const hero = document.querySelector('.home-page .slide-inner');
  if (!hero) return;
  const controls = document.getElementById('hero-controls');
  const play = document.getElementById('hero-play');
  const counter = document.getElementById('hero-position');
  const feature = document.getElementById('open-events');
  let images = [];
  let position = 0;
  let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;

  async function show(index) {
    if (!images.length) return;
    position = (index + images.length) % images.length;
    const selected = position;
    let url;
    try {
      url = await resolveImage(images[position]);
      const image = new Image();
      image.src = url;
      await image.decode();
    } catch {
      return; // Keep the current slide when an image cannot load.
    }
    if (selected !== position) return;
    hero.style.backgroundImage = `${OVERLAY},url(${JSON.stringify(url)})`;
    counter.textContent = `${position + 1} / ${images.length}`;
  }

  function apply(data) {
    const next = data.homepage.images;
    if (JSON.stringify(next) !== JSON.stringify(images)) {
      images = next;
      position = 0;
      if (images.length > 1 || images[0]?.startsWith('media:')) show(0);
    }
    controls.hidden = images.length < 2;
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
    if (!paused && !document.hidden && images.length > 1 && !controls.matches(':focus-within')) show(position + 1);
  }, INTERVAL);

  window.addEventListener('chapter-content', (e) => apply(e.detail));
  // Re-check the open event against today's date (the page may be older than the event).
  Promise.all([renderReady(), bakedContent()])
    .then(([, data]) => apply(data))
    .catch(() => {});
}
