// Site header: mobile menu (Escape closes, focus stays inside while open) and the scrolled style.
const mobile = matchMedia('(max-width: 1080px)');

export function setupMenu() {
  const header = document.getElementById('site-header');
  const toggle = document.getElementById('menu-toggle');
  const menu = document.getElementById('site-menu');
  if (!header || !toggle || !menu) return;
  const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';
  // The menu is only hidden (inert) while it is collapsed on small screens.
  const sync = () => {
    menu.inert = mobile.matches && !isOpen();
  };
  const setOpen = (open, { focus = true } = {}) => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menu.classList.toggle('active', open);
    header.classList.toggle('menu-open-header', open);
    document.getElementById('hamburger-menu')?.classList.toggle('open', open);
    document.body.classList.toggle('menu-open', open);
    sync();
    if (!focus) return;
    if (open) menu.querySelector('a')?.focus();
    else toggle.focus();
  };
  toggle.addEventListener('click', () => setOpen(!isOpen()));
  menu.addEventListener('click', (e) => {
    if (e.target.closest('a') && isOpen()) setOpen(false, { focus: false });
  });
  document.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape') setOpen(false);
    if (e.key === 'Tab') {
      const items = [...menu.querySelectorAll('a'), toggle];
      const index = items.indexOf(document.activeElement);
      e.preventDefault();
      items[(index + (e.shiftKey ? items.length - 1 : 1)) % items.length].focus();
    }
  });
  mobile.addEventListener('change', () => {
    if (!mobile.matches && isOpen()) setOpen(false, { focus: false });
    sync();
  });
  sync();

  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 24);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

/** Sections below the fold rise in as they scroll into view (never content that is already visible). */
export function setupReveal() {
  const items = [...document.querySelectorAll('[data-reveal]')];
  if (!items.length || matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('reveal-in');
        entry.target.classList.remove('reveal-pending');
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );
  for (const item of items) {
    if (item.getBoundingClientRect().top < innerHeight) continue;
    item.classList.add('reveal-pending');
    observer.observe(item);
  }
}
