import { h, $, $$, busy, toast, confirmDialog, openDialog, formValues, field, select } from '../ui.js';
import { statusHTML, wireStatus, showProblem } from '../section.js';
import { imageFieldHTML, wireImageFields, previewInto } from '../image-picker.js';
import { importWizard } from '../import-wizard.js';
import { newRosterKey, normalizePerson, normalizeMembershipID } from '../../lib/content-model.js';

const yearsOf = (app) =>
  [
    ...new Set([
      ...Object.keys(app.data.team),
      ...app.drafts
        .names()
        .filter((n) => n.startsWith('team:'))
        .map((n) => n.slice(5)),
    ]),
  ]
    .filter((y) => y !== 'founders')
    .sort();

let showIds = false;

export const teamView = {
  id: 'team',
  title: 'Team & rosters',
  icon: '◉',
  allowed: (p) => p.team,
  render(root, app, [selected]) {
    const years = yearsOf(app);
    const year = selected === 'founders' || years.includes(selected) ? selected : 'founders';
    const name = `team:${year}`;
    const live = app.data.team[year];
    const value = structuredClone(app.drafts.get(name)?.value || live?.value || { members: [], roster: [] });
    const founders = year === 'founders';

    const update = (mutate) => {
      mutate(value);
      const same = live && JSON.stringify(value) === JSON.stringify(live.value);
      if (same) app.drafts.remove(name);
      else app.drafts.set(name, value, app.drafts.get(name)?.baseRevision ?? (live?.revision || 0));
      app.render();
    };

    const general = value.roster.filter((m) => m.tier === 'general').length;
    root.innerHTML = `
      <nav class="ed-tabs" aria-label="Team years">
        <a href="#team/founders"${founders ? ' aria-current="page"' : ''}>Founding members</a>
        ${years.map((y) => `<a href="#team/${y}"${y === year ? ' aria-current="page"' : ''}>${y}${app.drafts.has(`team:${y}`) ? ' •' : ''}</a>`).join('')}
        <button type="button" class="ed-btn ed-btn-small ed-btn-quiet" data-add-year>+ Add year</button>
      </nav>
      ${statusHTML(app, name, { live: !!live })}
      <section class="ed-card">
        <div class="ed-card-head"><h3>${founders ? 'Founding members' : `Executive committee ${h(year)}`} <span class="ed-count">${value.members.length}</span></h3>
          <button type="button" class="ed-btn ed-btn-small ed-btn-quiet" data-import-committee>Import from spreadsheet</button></div>
        ${year === '2024' && !value.members.length ? '<p class="ed-note">While this list is empty, the website shows the founding officers as the 2024 committee.</p>' : ''}
        <ul class="ed-people">${value.members
          .map(
            (
              m,
              i,
            ) => `<li><img alt="" width="56" height="56" data-ref="${h(m.image || '')}"${m.image ? '' : ' hidden'}><span class="ed-avatar"${m.image ? ' hidden' : ''} aria-hidden="true">${h(m.name.slice(0, 1))}</span>
              <div><strong>${h(m.name)}</strong><span>${h(m.role)}</span></div>
              <div class="ed-actions">
                <button type="button" class="ed-btn ed-btn-small ed-btn-quiet" data-member-move="${i}" data-by="-1" ${i ? '' : 'disabled'} aria-label="Move ${h(m.name)} up">↑</button>
                <button type="button" class="ed-btn ed-btn-small ed-btn-quiet" data-member-move="${i}" data-by="1" ${i < value.members.length - 1 ? '' : 'disabled'} aria-label="Move ${h(m.name)} down">↓</button>
                <button type="button" class="ed-btn ed-btn-small" data-member-edit="${i}">Edit</button>
                <button type="button" class="ed-btn ed-btn-small ed-btn-danger-quiet" data-member-remove="${i}">Remove</button></div></li>`,
          )
          .join('')}</ul>
        <button type="button" class="ed-btn" data-member-add>+ Add ${founders ? 'founding member' : 'committee member'}</button>
      </section>
      ${
        founders
          ? ''
          : `<section class="ed-card">
        <div class="ed-card-head"><h3>General &amp; premium roster ${h(year)} <span class="ed-count">${value.roster.length}</span></h3>
          <div class="ed-actions"><button type="button" class="ed-btn ed-btn-small" data-import-roster>Import members from a spreadsheet</button></div></div>
        <p>Only names and tiers appear on the Team page. Membership IDs are private: they are used to match spreadsheet updates and are visible to super-admins only.</p>
        <p class="ed-muted">${general} general · ${value.roster.length - general} premium</p>
        <form class="ed-inline-form" data-roster-add novalidate>
          ${field({ label: 'Member name', name: 'name', attrs: 'required maxlength="150"' })}
          ${field({ label: 'Membership ID', name: 'memID', attrs: 'required maxlength="100" autocomplete="off"' })}
          ${select({
            label: 'Tier',
            name: 'tier',
            options: [
              ['general', 'General'],
              ['premium', 'Premium'],
            ],
          })}
          <button type="submit" class="ed-btn">Add member</button>
        </form>
        ${
          value.roster.length
            ? `<div class="ed-table-tools"><label class="ed-field"><span class="ed-label">Find a member</span><input type="search" data-roster-search data-ignore></label><label class="ed-check"><input type="checkbox" data-show-ids data-ignore ${showIds ? 'checked' : ''}> Show membership IDs</label></div>
        <div class="ed-table-wrap"><table class="ed-table"><thead><tr><th>Name</th><th>Tier</th><th>Membership ID</th><th><span class="ed-sr">Actions</span></th></tr></thead><tbody>${value.roster
          .map(
            (m, i) =>
              `<tr data-text="${h(m.name.toLowerCase())}"><td>${h(m.name)}</td><td><select data-roster-tier="${i}" aria-label="Tier for ${h(m.name)}"><option value="general"${m.tier === 'general' ? ' selected' : ''}>General</option><option value="premium"${m.tier === 'premium' ? ' selected' : ''}>Premium</option></select></td><td class="ed-mono">${m.memID ? (showIds ? h(m.memID) : '••••' + h(m.memID.slice(-2))) : '<span class="ed-muted">Not recorded</span>'}</td><td><button type="button" class="ed-btn ed-btn-small ed-btn-danger-quiet" data-roster-remove="${i}">Remove</button></td></tr>`,
          )
          .join('')}</tbody></table></div>`
            : '<p class="ed-muted">No roster members yet. Add them one by one or import a spreadsheet.</p>'
        }
      </section>`
      }
      ${!founders && live ? `<section class="ed-card ed-danger-zone"><h3>Remove ${h(year)}</h3><p>Removes this year’s committee and roster from the website. Use this only for a year added by mistake.</p><button type="button" class="ed-btn ed-btn-danger-quiet" data-delete-year>Remove year ${h(year)}</button></section>` : ''}`;

    for (const img of $$('img[data-ref]', root)) if (img.dataset.ref) previewInto(img, img.dataset.ref);
    wireStatus(root, app);
    showProblem(app, name, $('.ed-card', root));

    root.addEventListener('click', async (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if ('addYear' in t.dataset) return addYear(app, years);
      if ('memberAdd' in t.dataset) {
        const member = await memberDialog(app, null, founders);
        if (member) update((v) => v.members.push(member));
      }
      if (t.dataset.memberEdit) {
        const i = Number(t.dataset.memberEdit);
        const member = await memberDialog(app, value.members[i], founders);
        if (member) update((v) => (v.members[i] = member));
      }
      if (t.dataset.memberMove) {
        const i = Number(t.dataset.memberMove);
        const j = i + Number(t.dataset.by);
        update((v) => ([v.members[i], v.members[j]] = [v.members[j], v.members[i]]));
      }
      if (t.dataset.memberRemove) {
        const i = Number(t.dataset.memberRemove);
        if (
          await confirmDialog({
            title: `Remove ${value.members[i].name}?`,
            body: '<p>They are removed from this list in your draft. Publish to update the website.</p>',
            confirm: 'Remove',
            danger: true,
          })
        )
          update((v) => v.members.splice(i, 1));
      }
      if (t.dataset.rosterRemove) {
        const i = Number(t.dataset.rosterRemove);
        if (
          await confirmDialog({
            title: `Remove ${value.roster[i].name}?`,
            body: '<p>They are removed from this roster in your draft.</p>',
            confirm: 'Remove',
            danger: true,
          })
        )
          update((v) => v.roster.splice(i, 1));
      }
      if ('importRoster' in t.dataset || 'importCommittee' in t.dataset) {
        importWizard(app, {
          title: `Import into ${founders ? 'founding members' : year}`,
          kinds: founders ? ['founders'] : 'importRoster' in t.dataset ? ['roster', 'committee'] : ['committee', 'roster'],
          context: founders
            ? ''
            : `Rows are added to <strong>${h(year)}</strong>. Existing members are matched by membership ID (roster) or name (committee) and updated.`,
          existing: (kind) => (kind === 'roster' ? value.roster : value.members),
          apply: (kind, plan) => {
            update((v) => {
              if (kind === 'roster')
                v.roster = plan.result.map((m) => ({ key: m.key || newRosterKey(), name: m.name, tier: m.tier, memID: m.memID || '' }));
              else v.members = plan.result.map((m) => ({ name: m.name, role: m.role, image: m.image || '' }));
            });
            toast(
              `${plan.added.length} added and ${plan.updated.length} updated in your draft for ${founders ? 'founding members' : year}. Publish when ready.`,
            );
          },
        });
      }
      if ('deleteYear' in t.dataset) {
        if (
          !(await confirmDialog({
            title: `Remove ${year} from the website?`,
            body: `<p>The ${h(year)} committee and roster (${value.roster.length} members) are removed. This is recorded in the activity log.</p>`,
            confirm: `Remove ${year}`,
            danger: true,
          }))
        )
          return;
        await busy(t, 'Removing…', async () => {
          await app.cloud.deleteTeamYear(year);
          app.drafts.remove(name);
          await app.reload();
          app.navigate('team', ['founders']);
          toast(`${year} removed.`);
        });
      }
    });
    root.addEventListener('change', (e) => {
      if (e.target.dataset.rosterTier) update((v) => (v.roster[Number(e.target.dataset.rosterTier)].tier = e.target.value));
      if ('showIds' in e.target.dataset) {
        showIds = e.target.checked;
        app.render();
      }
    });
    $('[data-roster-search]', root)?.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      for (const row of $$('tr[data-text]', root)) row.hidden = q && !row.dataset.text.includes(q);
    });
    $('[data-roster-add]', root)?.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = formValues(e.target);
      const memID = normalizeMembershipID(v.memID);
      if (!v.name.trim() || !memID) return toast('Enter the member name and membership ID.', { type: 'error' });
      if (value.roster.some((m) => normalizeMembershipID(m.memID) === memID))
        return toast(`Membership ID ${memID} is already on this roster.`, { type: 'error' });
      update((draft) => draft.roster.push({ key: newRosterKey(), name: v.name.trim(), tier: v.tier, memID }));
      toast(`${v.name.trim()} added to your draft.`);
    });
  },
};

function memberDialog(app, member, founders) {
  return openDialog(
    `<h2>${member ? 'Edit member' : founders ? 'Add founding member' : 'Add committee member'}</h2><form class="ed-dialog-body ed-form" novalidate><div class="ed-grid">
      ${field({ label: 'Name', name: 'name', value: member?.name || '', attrs: 'required maxlength="150"' })}
      ${field({ label: 'Role', name: 'role', value: member?.role || '', attrs: 'required maxlength="150" placeholder="e.g. President"' })}
      ${imageFieldHTML({ name: 'image', value: member?.image || '', label: 'Photo', hint: 'Optional. A square portrait works best.' })}
    </div><p class="ed-form-error" role="alert" hidden></p></form><div class="ed-actions"><button type="button" class="ed-btn ed-btn-quiet" data-close>Cancel</button><button type="button" class="ed-btn ed-btn-primary" data-save>${member ? 'Save to draft' : 'Add to draft'}</button></div>`,
    (dialog, close) => {
      const form = $('form', dialog);
      wireImageFields(form, app);
      $('[data-save]', dialog).addEventListener('click', () => {
        try {
          close(normalizePerson(formValues(form)));
        } catch (error) {
          const box = $('.ed-form-error', dialog);
          box.textContent = error.message;
          box.hidden = false;
        }
      });
      form.elements.name.focus();
    },
  );
}

async function addYear(app, years) {
  const next = String(
    Math.max(new Date().getFullYear(), ...years.map(Number)) + (years.includes(String(new Date().getFullYear())) ? 1 : 0),
  );
  const year = await openDialog(
    `<h2>Add a team year</h2><form class="ed-dialog-body"><label class="ed-field"><span class="ed-label">Year</span><input name="year" type="number" min="2020" max="2099" value="${next}" required></label></form><div class="ed-actions"><button type="button" class="ed-btn ed-btn-quiet" data-close>Cancel</button><button type="button" class="ed-btn ed-btn-primary" data-ok>Add year</button></div>`,
    (dialog, close) => $('[data-ok]', dialog).addEventListener('click', () => close($('input', dialog).value)),
  );
  if (!year) return;
  if (!/^20\d{2}$/.test(year)) return toast('Enter a four-digit year.', { type: 'error' });
  if (years.includes(year)) return app.navigate('team', [year]);
  app.drafts.set(`team:${year}`, { members: [], roster: [] }, 0);
  app.navigate('team', [year]);
  toast(`${year} added as a draft. Add members, then publish it.`);
}
