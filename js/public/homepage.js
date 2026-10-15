// Homepage hero: the violet gradient and doodle, with the homepage images from the Chapter Editor shown as
// full-width slides (Previous, Pause/Play and Next controls appear when there are two or more).
// Also keeps the "Explore new event & register" button current.
import { renderOpenEvent, renderHeroSlides, heroSlides } from '../lib/content-render.js';
import { bakedContent, renderReady } from './site-data.js';

const INTERVAL = 6500;

export function setupHomepage() {
  const hero = document.querySelector('.hero');
  const slides = document.getElementById('hero-slides');
  if (!hero || !slides) return;
  const controls = document.getElementById('hero-controls');
  const play = document.getElementById('hero-play');
  const counter = document.getElementById('hero-position');
  const feature = document.getElementById('open-events');
  let sources = [];
  let position = 0;
  let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const images = () => [...slides.querySelectorAll('img')];
  function show(index) {
    const list = images();
    if (list.length < 2) return;
    position = (index + list.length) % list.length;
    list.forEach((img, i) => {
      img.classList.toggle('active', i === position);
      if (i === position) img.loading = 'eager';
    });
    counter.textContent = `${position + 1} / ${list.length}`;
  }

  function apply(data) {
    const next = heroSlides(data);
    if (JSON.stringify(next) !== JSON.stringify(sources)) {
      // The build already placed the slides; only newer content (after a publish) redraws them.
      if (sources.length || images().length !== next.length) {
        slides.innerHTML = renderHeroSlides(data);
        position = 0;
      }
      sources = next;
    }
    hero.classList.toggle('has-slides', sources.length > 0);
    controls.hidden = sources.length < 2;
    counter.textContent = `${position + 1} / ${sources.length}`;
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
    if (!paused && !document.hidden && !controls.matches(':focus-within')) show(position + 1);
  }, INTERVAL);

  window.addEventListener('chapter-content', (e) => apply(e.detail));
  // Re-check the open event against today's date (the page may be older than the event).
  Promise.all([renderReady(), bakedContent()])
    .then(([, data]) => apply(data))
    .catch(() => {});
}
