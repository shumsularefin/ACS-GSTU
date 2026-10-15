import { h, $, $$, busy, toast, confirmDialog, formValues, field, select, when } from '../ui.js';
import { SUPER_ADMIN_EMAIL } from '../cloud.js';
import { roleInfo } from '../permissions.js';

const ACTIONS = {
  'content.migrate': 'Upgraded storage',
  'content.publish': 'Published website',
  'content.update': 'Updated section',
  'event.add': 'Added event',
  'event.create': 'Added event',
  'event.update': 'Edited event',
  'event.delete': 'Deleted event',
  'page.update': 'Updated page',
  'team.update': 'Updated team',
  'team.delete': 'Removed team year',
  'image.add': 'Uploaded image',
  'image.delete': 'Deleted image',
  'access.set': 'Changed editor access',
  'access.delete': 'Removed editor',
  'certificate.issue': 'Issued certificates',
  'certificate.revoke': 'Revoked certificate',
  'certificate.migrate': 'Moved certificate IDs to private storage',
  'certificate.catalog': 'Changed Certificate Center list',
  'certificate.delete': 'Deleted revoked certificate',
};

export const editorsView = {
  id: 'editors',
  title: 'Manage editors & activity',
  icon: '⚑',
  allowed: (p) => p.editors,
  render(root, app) {
    root.innerHTML = `
      <section class="ed-card">
        <div class="ed-card-head"><h3>Editors</h3></div>
        <p>Editors sign in with their own Google account. Give each person the smallest role they need, and disable access when their term ends.</p>
        <dl class="ed-roles">${Object.entries(roleInfo)
          .map(([id, r]) => `<div><dt>${h(r.label)}</dt><dd>${h(r.summary)}</dd></div>`)
          .join('')}</dl>
        <form class="ed-inline-form" data-editor-form novalidate>
          ${field({ label: 'Google account email', name: 'email', type: 'email', attrs: 'required maxlength="200" autocomplete="off"' })}
          ${select({ label: 'Role', name: 'role', options: Object.entries(roleInfo).map(([id, r]) => [id, r.label]), value: 'outreach' })}
          ${select({
            label: 'Access',
            name: 'active',
            options: [
              ['true', 'Active'],
              ['false', 'Disabled'],
            ],
          })}
          <button type="submit" class="ed-btn ed-btn-primary">Save access</button>
        </form>
        <div class="ed-table-wrap" data-editors><p class="ed-muted">Loading editors…</p></div>
      </section>
      <section class="ed-card">
        <div class="ed-card-head"><h3>Activity log</h3><button type="button" class="ed-btn ed-btn-small ed-btn-quiet" data-refresh>Refresh</button></div>
        <p>Every change is recorded with the editor’s account and the server time. Entries cannot be edited or deleted.</p>
        <label class="ed-field"><span class="ed-label">Filter</span><input type="search" data-filter data-ignore placeholder="Editor, action or item"></label>
        <div class="ed-table-wrap"><table class="ed-table"><thead><tr><th>When</th><th>Editor</th><th>What</th><th>Details</th></tr></thead><tbody data-log></tbody></table></div>
        <button type="button" class="ed-btn ed-btn-quiet" data-older hidden>Show older activity</button>
      </section>`;

    const form = $('[data-editor-form]', root);
    let editors = [];
    async function loadEditors() {
      editors = await app.cloud.editors();
      const list = [
        { email: SUPER_ADMIN_EMAIL, role: 'super-admin', active: true, permanent: true },
        ...editors.filter((e) => e.email !== SUPER_ADMIN_EMAIL),
      ];
      $('[data-editors]', root).innerHTML =
        `<table class="ed-table"><thead><tr><th>Account</th><th>Role</th><th>Status</th><th>Last change</th><th><span class="ed-sr">Actions</span></th></tr></thead><tbody>${list
          .map(
            (e) =>
              `<tr><td>${h(e.email)}</td><td>${h(roleInfo[e.role]?.label || e.role)}</td><td><span class="ed-tag ${e.active ? 'ed-tag-open' : ''}">${e.active ? 'Active' : 'Disabled'}</span></td><td>${e.permanent ? 'Permanent owner' : h(when(e.updatedAt))}</td><td>${
                e.permanent
                  ? ''
                  : `<div class="ed-actions"><button type="button" class="ed-btn ed-btn-small" data-edit="${h(e.email)}">Edit</button><button type="button" class="ed-btn ed-btn-small ed-btn-danger-quiet" data-remove="${h(e.email)}">Remove</button></div>`
              }</td></tr>`,
          )
          .join('')}</tbody></table>`;
    }

    let cursor = null;
    const log = $('[data-log]', root);
    async function loadActivity(older = false) {
      const page = await app.cloud.activity(older ? cursor : null);
      cursor = page.cursor;
      const rows = page.entries
        .map(
          (e) =>
            `<tr data-text="${h(`${e.actorEmail} ${e.action} ${e.target} ${e.detail}`.toLowerCase())}"><td>${h(when(e.createdAt))}</td><td>${h(e.actorEmail)}</td><td>${h(ACTIONS[e.action] || e.action)}<br><small class="ed-mono">${h(e.target)}</small></td><td>${h(e.detail)}</td></tr>`,
        )
        .join('');
      if (older) log.insertAdjacentHTML('beforeend', rows);
      else log.innerHTML = rows || '<tr><td colspan="4">No activity yet.</td></tr>';
      $('[data-older]', root).hidden = page.entries.length < 50;
      applyFilter();
    }
    const applyFilter = () => {
      const q = $('[data-filter]', root).value.trim().toLowerCase();
      for (const row of $$('tr[data-text]', log)) row.hidden = q && !row.dataset.text.includes(q);
    };

    busy(null, '', () => Promise.all([loadEditors(), loadActivity()]));
    $('[data-filter]', root).addEventListener('input', applyFilter);
    $('[data-refresh]', root).addEventListener('click', (e) => busy(e.currentTarget, 'Refreshing…', () => loadActivity()));
    $('[data-older]', root).addEventListener('click', (e) => busy(e.currentTarget, 'Loading…', () => loadActivity(true)));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = formValues(form);
      busy($('button[type="submit"]', form), 'Saving…', async () => {
        await app.cloud.setEditor(v.email, v.role, v.active === 'true');
        toast(`${v.email.trim().toLowerCase()} is now ${v.active === 'true' ? roleInfo[v.role].label.toLowerCase() : 'disabled'}.`);
        form.reset();
        await Promise.all([loadEditors(), loadActivity()]);
      });
    });
    $('[data-editors]', root).addEventListener('click', async (e) => {
      const edit = e.target.closest('[data-edit]');
      const remove = e.target.closest('[data-remove]');
      if (edit) {
        const record = editors.find((x) => x.email === edit.dataset.edit);
        form.elements.email.value = record.email;
        form.elements.role.value = record.role;
        form.elements.active.value = String(record.active);
        form.elements.role.focus();
      }
      if (remove) {
        const email = remove.dataset.remove;
        if (
          !(await confirmDialog({
            title: `Remove ${email}?`,
            body: '<p>They lose dashboard access immediately. Their past activity stays in the log.</p>',
            confirm: 'Remove access',
            danger: true,
          }))
        )
          return;
        await busy(remove, 'Removing…', async () => {
          await app.cloud.deleteEditor(email);
          toast(`${email} removed.`);
          await Promise.all([loadEditors(), loadActivity()]);
        });
      }
    });
  },
};
