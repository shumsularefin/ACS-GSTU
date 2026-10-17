// Event photo album: any photo tile opens a full-screen viewer with previous/next, arrow keys,
// swipe and Escape. Listens on the document, so it keeps working after live content repaints.
export function setupGallery() {
  let dialog, img, caption, photos = [], index = 0;

  function build() {
    dialog = document.createElement('dialog');
    dialog.className = 'gallery';
    dialog.setAttribute('aria-label', 'Event photos');
    dialog.innerHTML =
      '<button type="button" class="gallery-close" aria-label="Close">×</button>' +
      '<button type="button" class="gallery-prev" aria-label="Previous photo">‹</button>' +
      '<figure><img alt=""><figcaption></figcaption></figure>' +
      '<button type="button" class="gallery-next" aria-label="Next photo">›</button>';
    img = dialog.querySelector('img');
    caption = dialog.querySelector('figcaption');
    dialog.querySelector('.gallery-close').addEventListener('click', () => dialog.close());
    dialog.querySelector('.gallery-prev').addEventListener('click', () => show(index - 1));
    dialog.querySelector('.gallery-next').addEventListener('click', () => show(index + 1));
    dialog.addEventListener('click', (e) => e.target === dialog && dialog.close());
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') show(index - 1);
      if (e.key === 'ArrowRight') show(index + 1);
    });
    let startX = null;
    dialog.addEventListener('touchstart', (e) => (startX = e.touches[0].clientX), { passive: true });
    dialog.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - (startX ?? e.changedTouches[0].clientX);
      if (Math.abs(dx) > 40) show(index + (dx < 0 ? 1 : -1));
      startX = null;
    });
    document.body.append(dialog);
  }

  function show(i) {
    index = (i + photos.length) % photos.length;
    img.src = photos[index].href;
    img.alt = photos[index].alt;
    caption.textContent = `${index + 1} / ${photos.length}`;
    dialog.classList.toggle('gallery-single', photos.length < 2);
  }

  document.addEventListener('click', (e) => {
    const tile = e.target.closest?.('[data-gallery] [data-gallery-index]');
    if (!tile || e.metaKey || e.ctrlKey || e.shiftKey || typeof HTMLDialogElement !== 'function') return;
    e.preventDefault();
    if (!dialog) build();
    photos = [...tile.closest('[data-gallery]').querySelectorAll('[data-gallery-index]')].map((a) => ({
      href: a.getAttribute('href'),
      alt: a.dataset.alt || '',
    }));
    show(Number(tile.dataset.galleryIndex));
    dialog.showModal();
  });
}
