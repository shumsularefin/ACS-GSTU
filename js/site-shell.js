const toggle = document.getElementById('menu-toggle');
const menu = document.getElementById('site-menu');
const setOpen = open => {
  toggle.setAttribute('aria-expanded', String(open));
  menu.inert = !open;
  menu.classList.toggle('active',open);
  document.getElementById('hamburger-menu').classList.toggle('open',open);
  document.body.classList.toggle('menu-open',open);
  if(open) menu.querySelector('a')?.focus(); else toggle.focus();
};
toggle?.addEventListener('click',()=>setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
document.addEventListener('keydown',e=>{
  if(toggle?.getAttribute('aria-expanded') !== 'true') return;
  if(e.key === 'Escape') setOpen(false);
  if(e.key === 'Tab') {
    const items = [...menu.querySelectorAll('a'),toggle];
    const index = items.indexOf(document.activeElement);
    e.preventDefault(); items[(index + (e.shiftKey ? items.length - 1 : 1)) % items.length].focus();
  }
});
