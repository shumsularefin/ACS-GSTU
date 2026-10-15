import { $ } from '../ui.js';
import { field, formValues, fillForm } from '../ui.js';
import { statusHTML, wireStatus, refreshStatus, autosave, showProblem } from '../section.js';

const KEYS = ['intro', 'benefits', 'eligibility', 'general', 'premium', 'renewal', 'applicationUrl', 'renewalUrl', 'contactEmail'];
const pick = (v) => Object.fromEntries(KEYS.map((k) => [k, Array.isArray(v[k]) ? v[k].join('\n') : String(v[k] ?? '')]));

export const membershipView = {
  id: 'membership',
  title: 'Membership information',
  icon: '✦',
  allowed: (p) => p.membership,
  render(root, app) {
    const name = 'membership';
    const live = app.data.membership ? pick(app.data.membership.value) : pick({});
    root.innerHTML = `
      <section class="ed-card">
        <div class="ed-card-head"><h3>Join &amp; renew section on the homepage</h3><a class="ed-link" href="index.html#membership" target="_blank" rel="noopener">View on website ↗</a></div>
        ${statusHTML(app, name, { live: !!app.data.membership })}
        <form class="ed-form" novalidate><div class="ed-grid">
          ${field({ label: 'Introduction', name: 'intro', type: 'textarea', attrs: 'required rows="3" maxlength="5000"', wide: true })}
          ${field({ label: 'Benefits', name: 'benefits', type: 'textarea', attrs: 'rows="5"', hint: 'One benefit per line, up to 30.', wide: true })}
          ${field({ label: 'Who can join', name: 'eligibility', type: 'textarea', attrs: 'required rows="3"', wide: true })}
          ${field({ label: 'General membership', name: 'general', type: 'textarea', attrs: 'required rows="3"', hint: 'Fees and what is included.' })}
          ${field({ label: 'Premium membership', name: 'premium', type: 'textarea', attrs: 'required rows="3"', hint: 'Fees and what is included.' })}
          ${field({ label: 'Renewal instructions', name: 'renewal', type: 'textarea', attrs: 'required rows="3"', wide: true })}
          ${field({ label: 'Application form link', name: 'applicationUrl', type: 'url', optional: true, hint: 'Without a link, “Join now” opens an email to the chapter.' })}
          ${field({ label: 'Renewal form link', name: 'renewalUrl', type: 'url', optional: true })}
          ${field({ label: 'Chapter contact email', name: 'contactEmail', type: 'email', attrs: 'required' })}
        </div></form>
      </section>`;
    const form = $('form', root);
    fillForm(form, app.drafts.get(name)?.value || live);
    wireStatus(root, app);
    showProblem(app, name, form);
    autosave(form, app, name, {
      baseRevision: app.data.membership?.revision || 0,
      read: (f) => pick(formValues(f)),
      same: (v) => JSON.stringify(v) === JSON.stringify(live),
      onSave: () => refreshStatus(root, app, name, { live: !!app.data.membership }),
    });
  },
};
