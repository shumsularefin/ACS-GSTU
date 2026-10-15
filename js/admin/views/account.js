import { h, $ } from '../ui.js';
import { roleInfo } from '../permissions.js';

export const accountView = {
  id: 'account',
  title: 'Your account & sign-in',
  icon: '☺',
  allowed: (p) => p.editor,
  render(root, app) {
    const p = app.perms;
    const can = [
      ['Add events', p.events],
      [p.editAnyEvent ? 'Edit and remove any event' : 'Edit the events you added', p.events],
      ['Homepage images', p.homepage],
      ['Membership information', p.membership],
      ['Executive committees and rosters', p.team],
      [
        p.superAdmin
          ? 'All certificate categories'
          : app.role === 'administrator'
            ? 'Certificates (except executive recognition)'
            : 'Participant certificates',
        p.certificates,
      ],
      ['Revoke certificates', p.revoke],
      ['Manage editors and read the activity log', p.editors],
    ];
    root.innerHTML = `
      <section class="ed-card"><h3>Signed in</h3><dl class="ed-details"><dt>Google account</dt><dd>${h(app.user.email)}</dd><dt>Role</dt><dd>${h(roleInfo[app.role].label)}</dd></dl>
        <p>${h(roleInfo[app.role].summary)}</p>
        <ul class="ed-can">${can.map(([label, ok]) => `<li class="${ok ? 'yes' : 'no'}"><span aria-hidden="true">${ok ? '✓' : '–'}</span> ${h(label)}<span class="ed-sr">${ok ? ' (allowed)' : ' (not allowed)'}</span></li>`).join('')}</ul>
        <p class="ed-muted">Access is managed by the chapter super-admin. Signing out keeps your drafts in this browser.</p>
        <button type="button" class="ed-btn" data-sign-out>Sign out</button></section>`;
    $('[data-sign-out]', root).addEventListener('click', () => document.getElementById('ed-sign-out').click());
  },
};
