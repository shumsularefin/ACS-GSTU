// Image fields: upload from the device (optimized in the browser) or choose a previously uploaded
// image. The stored reference (media:<id>) is managed automatically; nobody types image paths.
import { resolveImage } from '../public/media.js';
import { h, $, $$, toast, openDialog, busy, confirmDialog, errorMessage } from './ui.js';

const MAX_BYTES = 280000;

/** Resizes to at most 1400 px and compresses to a JPEG data URL under the database limit. */
export async function prepareImage(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw Error('Choose a JPG, PNG or WebP image.');
  if (file.size > 15 * 1024 * 1024) throw Error('Choose an image smaller than 15 MB.');
  const bitmap = await createImageBitmap(file);
  for (const longest of [1400, 1100, 900]) {
    const scale = Math.min(1, longest / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.7, 0.58, 0.45]) {
      const data = canvas.toDataURL('image/jpeg', quality);
      if (data.length <= MAX_BYTES) {
        bitmap.close();
        return data;
      }
    }
  }
  bitmap.close();
  throw Error('This image is too detailed to store. Crop it or choose a smaller image.');
}

export async function previewInto(img, reference) {
  img.removeAttribute('src');
  img.hidden = !reference;
  if (!reference) return;
  try {
    img.src = await resolveImage(reference);
  } catch {
    img.alt = 'Image unavailable';
  }
}

export const imageFieldHTML = ({ name, value = '', label = 'Image', hint = '' }) => `
  <div class="ed-field ed-image-field" data-image-field="${h(name)}">
    <span class="ed-label">${h(label)}</span>
    <input type="hidden" name="${h(name)}" value="${h(value)}">
    <div class="ed-image-box"><img alt="Selected image" width="160" height="120"${value ? '' : ' hidden'}><span class="ed-image-empty"${value ? ' hidden' : ''}>No image selected</span></div>
    <div class="ed-actions">
      <button type="button" class="ed-btn ed-btn-small" data-upload>Upload from device</button>
      <button type="button" class="ed-btn ed-btn-small ed-btn-quiet" data-library>Choose uploaded image</button>
      <button type="button" class="ed-btn ed-btn-small ed-btn-quiet" data-clear${value ? '' : ' hidden'}>Remove image</button>
    </div>
    <input type="file" accept="image/jpeg,image/png,image/webp" hidden data-ignore>
    ${hint ? `<small>${hint}</small>` : ''}
  </div>`;

/** Wires every image field inside root. onChange is called after the stored reference changes. */
export function wireImageFields(root, app, onChange = () => {}) {
  for (const box of $$('[data-image-field]', root)) {
    const input = $('input[type="hidden"]', box);
    const file = $('input[type="file"]', box);
    const img = $('img', box);
    const empty = $('.ed-image-empty', box);
    const clear = $('[data-clear]', box);
    const set = (reference) => {
      input.value = reference;
      empty.hidden = !!reference;
      clear.hidden = !reference;
      previewInto(img, reference);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      onChange(reference);
    };
    previewInto(img, input.value);
    $('[data-upload]', box).addEventListener('click', () => file.click());
    file.addEventListener('change', () =>
      busy($('[data-upload]', box), 'Uploading…', async () => {
        const reference = await uploadFile(app, file.files[0]);
        file.value = '';
        if (reference) set(reference);
      }),
    );
    $('[data-library]', box).addEventListener('click', async () => {
      const reference = await chooseImage(app);
      if (reference) set(reference);
    });
    clear.addEventListener('click', () => set(''));
  }
}

export async function uploadFile(app, file) {
  if (!file) return '';
  const data = await prepareImage(file);
  const reference = await app.cloud.uploadImage(data, file.name || 'image.jpg');
  app.imageCache = null;
  toast('Image uploaded and optimized. Publish the section to use it on the website.');
  return reference;
}

/** All image references used by live content or by drafts. */
function usedReferences(app) {
  const text = JSON.stringify([app.data, app.drafts.all()]);
  return new Set(text.match(/media:[a-f0-9-]{36}/g) || []);
}

/** Image library dialog. Resolves with the chosen reference, or undefined. */
export function chooseImage(app, { multiple = false } = {}) {
  return openDialog(
    `<h2>Uploaded images</h2><div class="ed-dialog-body"><p>Choose an image, or upload a new one. Unused images can be deleted.</p><div class="ed-actions"><button type="button" class="ed-btn ed-btn-small" data-upload-new>Upload from device</button><input type="file" accept="image/jpeg,image/png,image/webp" hidden ${multiple ? 'multiple' : ''}></div><div class="ed-library" role="list"><p class="ed-muted">Loading images…</p></div></div><div class="ed-actions"><button type="button" class="ed-btn ed-btn-quiet" data-close>Close</button></div>`,
    async (dialog, close) => {
      const grid = $('.ed-library', dialog);
      const file = $('input[type="file"]', dialog);
      async function load() {
        try {
          app.imageCache ??= await app.cloud.images();
        } catch (error) {
          grid.innerHTML = `<p class="ed-error-text">${h(errorMessage(error))}</p>`;
          return;
        }
        const used = usedReferences(app);
        grid.innerHTML = app.imageCache.length
          ? app.imageCache
              .map(
                (img) =>
                  `<figure role="listitem"><button type="button" class="ed-library-pick" data-pick="${h(img.reference)}"><img src="${h(img.image)}" alt="${h(img.name)}" loading="lazy"></button><figcaption>${h(img.name)}</figcaption>${used.has(img.reference) ? '<small>In use</small>' : `<button type="button" class="ed-link ed-danger-text" data-delete="${h(img.id)}">Delete</button>`}</figure>`,
              )
              .join('')
          : '<p class="ed-muted">No images uploaded yet.</p>';
      }
      dialog.addEventListener('click', async (e) => {
        const pick = e.target.closest('[data-pick]');
        const remove = e.target.closest('[data-delete]');
        if (pick) close(pick.dataset.pick);
        if (e.target.closest('[data-upload-new]')) file.click();
        if (remove) {
          const image = app.imageCache.find((i) => i.id === remove.dataset.delete);
          if (
            !(await confirmDialog({
              title: 'Delete this image?',
              body: `<p>${h(image.name)} is not used anywhere on the website. It will be removed permanently.</p>`,
              confirm: 'Delete image',
              danger: true,
            }))
          )
            return;
          await busy(remove, 'Deleting…', async () => {
            await app.cloud.deleteImage(image.id, image.name);
            app.imageCache = null;
            await load();
            toast('Image deleted.');
          });
        }
      });
      file.addEventListener('change', () =>
        busy($('[data-upload-new]', dialog), 'Uploading…', async () => {
          let last;
          for (const f of file.files) last = await uploadFile(app, f);
          file.value = '';
          if (last && !multiple) close(last);
          else await load();
        }),
      );
      await load();
    },
    { wide: true },
  );
}
