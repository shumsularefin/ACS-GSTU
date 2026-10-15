import { h, $, $$, busy, toast } from '../ui.js';
import { statusHTML, wireStatus, showProblem } from '../section.js';
import { chooseImage, previewInto, uploadFile } from '../image-picker.js';
import { MAX_HERO_IMAGES, eventOpen } from '../../lib/content-model.js';

export const homepageView = {
  id: 'homepage',
  title: 'Homepage images',
  icon: '▣',
  allowed: (p) => p.homepage,
  render(root, app) {
    const name = 'homepage';
    const live = app.data.homepage?.value?.images || ['images/optimized/slide01-1600.webp'];
    const images = [...(app.drafts.get(name)?.value.images || live)];
    const open = app.data.events
      .map((e) => e.value)
      .filter((e) => eventOpen(e))
      .sort((a, b) => a.date.localeCompare(b.date));
    root.innerHTML = `
      <section class="ed-card">
        <div class="ed-card-head"><h3>Hero slideshow</h3><span class="ed-count">${images.length} of ${MAX_HERO_IMAGES}</span></div>
        ${statusHTML(app, name, { live: !!app.data.homepage })}
        <p>The first image appears first. Images rotate every few seconds; visitors can pause or switch them, and the slideshow stays still for people who prefer reduced motion. Wide landscape photos (at least 1600 px across) work best.</p>
        <form class="ed-form"><ol class="ed-hero-list" data-images>${images
          .map(
            (
              ref,
              i,
            ) => `<li><img alt="Homepage image ${i + 1}" width="240" height="135" data-ref="${h(ref)}"><div class="ed-hero-meta"><strong>Image ${i + 1}${i === 0 ? ' · shown first' : ''}</strong><div class="ed-actions">
              <button type="button" class="ed-btn ed-btn-small ed-btn-quiet" data-move="${i}" data-by="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move image ${i + 1} earlier">↑</button>
              <button type="button" class="ed-btn ed-btn-small ed-btn-quiet" data-move="${i}" data-by="1" ${i === images.length - 1 ? 'disabled' : ''} aria-label="Move image ${i + 1} later">↓</button>
              <button type="button" class="ed-btn ed-btn-small ed-btn-danger-quiet" data-remove="${i}" ${images.length === 1 ? 'disabled title="The slideshow needs at least one image"' : ''}>Remove</button></div></div></li>`,
          )
          .join('')}</ol>
        <div class="ed-actions"><button type="button" class="ed-btn" data-upload ${images.length >= MAX_HERO_IMAGES ? 'disabled' : ''}>Upload from device</button><button type="button" class="ed-btn ed-btn-quiet" data-library ${images.length >= MAX_HERO_IMAGES ? 'disabled' : ''}>Choose uploaded image</button><input type="file" accept="image/jpeg,image/png,image/webp" hidden></div>
        </form>
      </section>
      <section class="ed-card"><h3>Registration button on the homepage</h3>${
        open.length
          ? `<p>The hero currently shows <strong>Explore new event &amp; register</strong> for <a href="#events/${encodeURIComponent(open[0].id)}">${h(open[0].title)}</a>. It disappears automatically when the event ends.</p>`
          : '<p class="ed-muted">No event is open for registration, so the button is hidden. Set an event’s registration to Open in Events to show it.</p>'
      }</section>`;
    for (const img of $$('img[data-ref]', root)) previewInto(img, img.dataset.ref);
    wireStatus(root, app);
    showProblem(app, name, $('form', root));
    const save = (next) => {
      if (JSON.stringify(next) === JSON.stringify(live)) app.drafts.remove(name);
      else app.drafts.set(name, { images: next }, app.drafts.get(name)?.baseRevision ?? (app.data.homepage?.revision || 0));
      app.render();
    };
    root.addEventListener('click', async (e) => {
      const move = e.target.closest('[data-move]');
      const remove = e.target.closest('[data-remove]');
      if (move) {
        const i = Number(move.dataset.move);
        const j = i + Number(move.dataset.by);
        [images[i], images[j]] = [images[j], images[i]];
        save(images);
      } else if (remove) {
        images.splice(Number(remove.dataset.remove), 1);
        save(images);
      } else if (e.target.closest('[data-library]')) {
        const ref = await chooseImage(app);
        if (ref && !images.includes(ref)) save([...images, ref]);
      } else if (e.target.closest('[data-upload]')) $('input[type="file"]', root).click();
    });
    const file = $('input[type="file"]', root);
    file.addEventListener('change', () =>
      busy($('[data-upload]', root), 'Uploading…', async () => {
        const ref = await uploadFile(app, file.files[0]);
        if (ref) save([...images, ref]);
        else toast('No image was chosen.', { type: 'info' });
      }),
    );
  },
};
