import { h, $, busy, toast, confirmDialog, download } from '../ui.js';
import { downloadWorkbook } from '../spreadsheet.js';
import { normalizeContent } from '../../lib/content-model.js';

/** Live content as one object, including private roster membership IDs. */
function snapshot(app) {
  const team = { founders: app.data.team.founders?.value.members || [], committees: {} };
  for (const [year, entry] of Object.entries(app.data.team)) if (year !== 'founders') team.committees[year] = entry.value;
  return {
    events: app.data.events.map((e) => e.value),
    homepage: app.data.homepage?.value || { images: [] },
    membership: app.data.membership?.value,
    team,
  };
}

export const backupsView = {
  id: 'backups',
  title: 'Backups',
  icon: '⇩',
  allowed: (p) => p.backups,
  render(root, app) {
    root.innerHTML = `
      <section class="ed-card"><h3>Download a backup</h3><p>A complete copy of the published website content. It includes private membership IDs, so keep it somewhere safe and never post it publicly or add it to GitHub.</p>
        <div class="ed-actions"><button type="button" class="ed-btn ed-btn-primary" data-json>Download backup (.json)</button><button type="button" class="ed-btn" data-excel>Download as Excel</button></div></section>
      <section class="ed-card"><h3>Restore from a backup</h3><p>Loads a backup file into your <strong>drafts</strong> section by section. Nothing changes on the website until you review and publish those drafts.</p>
        <label class="ed-field"><span class="ed-label">Backup file (.json)</span><input type="file" accept=".json,application/json" data-restore></label></section>
      <section class="ed-card"><h3>Browser drafts</h3><p>${app.drafts.names().length ? `You have ${app.drafts.names().length} unpublished draft(s) in this browser.` : 'You have no unpublished drafts.'} Drafts stay on this device only.</p></section>`;
    $('[data-json]', root).addEventListener('click', () => {
      download(
        `acs-gstu-backup-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify({ exportedAt: new Date().toISOString(), revision: app.data.revision, content: snapshot(app) }, null, 2),
        'application/json',
      );
      toast('Backup downloaded. It contains private membership IDs.');
    });
    $('[data-excel]', root).addEventListener('click', (e) =>
      busy(e.currentTarget, 'Preparing…', async () => {
        const c = snapshot(app);
        await downloadWorkbook(`acs-gstu-data-${new Date().toISOString().slice(0, 10)}.xlsx`, {
          Events: [
            [
              'ID',
              'Title',
              'Start date',
              'End date',
              'Category',
              'Description',
              'Location',
              'Registration status',
              'Registration URL',
              'Source URL',
            ],
            ...c.events.map((e) => [
              e.id,
              e.title,
              e.date,
              e.endsAt?.slice(0, 10) || '',
              e.category,
              e.description,
              e.location,
              e.registrationStatus,
              e.registrationUrl,
              e.sourceUrl,
            ]),
          ],
          Founders: [['Name', 'Role'], ...c.team.founders.map((m) => [m.name, m.role])],
          Committee: [
            ['Year', 'Name', 'Role'],
            ...Object.entries(c.team.committees).flatMap(([y, t]) => t.members.map((m) => [y, m.name, m.role])),
          ],
          Roster: [
            ['Year', 'Member Name', 'Membership ID', 'Tier'],
            ...Object.entries(c.team.committees).flatMap(([y, t]) => t.roster.map((m) => [y, m.name, m.memID || '', m.tier])),
          ],
        });
      }),
    );
    $('[data-restore]', root).addEventListener('change', (e) =>
      busy(null, '', async () => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) throw Error('This backup is larger than 5 MB.');
        const parsed = JSON.parse(await file.text());
        const content = normalizeContent(parsed.content || parsed, { keepPrivate: true });
        if (
          !(await confirmDialog({
            title: 'Load this backup into drafts?',
            body: `<p>${content.events.length} events, ${Object.keys(content.team.committees).length} team years, homepage images and membership information become drafts you can review. Existing drafts for the same sections are replaced.</p>`,
            confirm: 'Load into drafts',
          }))
        )
          return;
        const base = (entry) => entry?.revision || 0;
        app.drafts.set('homepage', content.homepage, base(app.data.homepage));
        app.drafts.set(
          'membership',
          { ...content.membership, benefits: content.membership.benefits.join('\n') },
          base(app.data.membership),
        );
        app.drafts.set('team:founders', { members: content.team.founders }, base(app.data.team.founders));
        for (const [year, value] of Object.entries(content.team.committees))
          app.drafts.set(`team:${year}`, value, base(app.data.team[year]));
        for (const ev of content.events) {
          const entry = app.data.events.find((x) => x.value.id === ev.id);
          app.drafts.set(
            `event:${ev.id}`,
            { ...ev, endDate: ev.endsAt && ev.endsAt.length === 10 ? ev.endsAt : '', timed: false },
            base(entry),
          );
        }
        e.target.value = '';
        toast('Backup loaded into drafts. Review them, then publish.');
        app.navigate('overview');
      }),
    );
  },
};
