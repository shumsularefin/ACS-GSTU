// Register, Join and feedback buttons open their website form in a pop-up on the same page.
// The link still points to form.html?id=…, so it works without JavaScript and in a new tab.
import { mountForm } from './form-app.js';

export function setupFormPopups() {
  const page = document.getElementById('form-root');
  if (page) mountForm(page, new URLSearchParams(location.search).get('id') || '');

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-form]');
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    open(link.dataset.form, link);
  });
}

function open(id, opener) {
  const dialog = document.createElement('dialog');
  dialog.className = 'form-dialog';
  dialog.setAttribute('aria-label', 'Form');
  dialog.innerHTML = `<div class="form-dialog-bar"><a class="form-dialog-tab" href="form.html?id=${encodeURIComponent(id)}" target="_blank" rel="noopener">Open in a new tab ↗</a><button type="button" class="form-dialog-close" data-close-form aria-label="Close the form">✕</button></div><div class="form-dialog-body"><div class="pf pf-loading"><p>Loading the form…</p></div></div>`;
  document.body.append(dialog);
  document.documentElement.classList.add('form-dialog-open');
  const close = () => dialog.close();
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.closest('[data-close-form]')) close();
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    document.documentElement.classList.remove('form-dialog-open');
    opener?.focus({ preventScroll: true });
  });
  dialog.showModal();
  mountForm(dialog.querySelector('.form-dialog-body'), id, { inDialog: true });
}
