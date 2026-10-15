// One-time move from the retired single-document storage to one document per section.
import { h, busy, toast } from '../ui.js';
import { normalizeContent } from '../../lib/content-model.js';

export const upgradeView = {
  id: 'upgrade',
  title: 'One-time storage upgrade',
  icon: '↻',
  allowed: () => false,
  render(root, app) {
    const legacy = app.data.legacy;
    if (!app.perms.migrate) {
      root.innerHTML = `<section class="ed-card"><h3>Waiting for a one-time upgrade</h3><p>The super-admin needs to sign in once to move the website to the new storage. After that, this dashboard opens normally. The public website keeps working in the meantime.</p></section>`;
      return;
    }
    const content = legacy?.content;
    const rosterCount = content ? Object.values(content.team.committees).reduce((n, c) => n + c.roster.length, 0) : 0;
    root.innerHTML = `
      <section class="ed-card">
        <h3>${legacy ? 'Move the website to the new storage' : 'Set up website storage'}</h3>
        <p>${
          legacy
            ? 'The website content is still stored in one large record. This upgrade copies it into one record per section, so editors no longer block each other and membership IDs stay private.'
            : 'No published content was found. This sets up the storage from the content currently on the website.'
        }</p>
        ${
          content
            ? `<ul class="ed-summary"><li><strong>${content.events.length}</strong> events</li><li><strong>${content.team.founders.length}</strong> founding members and <strong>${Object.keys(content.team.committees).length}</strong> committee years</li><li><strong>${rosterCount}</strong> roster members (membership IDs move to private storage)</li><li>Homepage images and membership information</li></ul>`
            : ''
        }
        <p class="ed-muted">The old record is kept unchanged as a backup. The upgrade is recorded in the activity log.</p>
        <button type="button" class="ed-btn ed-btn-primary" data-upgrade>${legacy ? 'Upgrade storage now' : 'Set up storage'}</button>
      </section>`;
    root.querySelector('[data-upgrade]').addEventListener('click', (e) =>
      busy(e.currentTarget, 'Upgrading…', async () => {
        const source = legacy || {
          content: normalizeContent(await fetch('data/content.json').then((r) => r.json())),
          certificateArchive: [],
        };
        await app.cloud.migrate(source);
        await app.reload();
        toast('Storage upgraded. Everything is ready to edit.');
        app.navigate('overview');
      }),
    );
  },
};
