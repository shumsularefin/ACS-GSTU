// Chapter Editor: sign-in, navigation, drafts and publishing.
import { connect, ConflictError } from './cloud.js';
import { createDrafts } from './drafts.js';
import { flushAutosaves } from './section.js';
import { permissions, roleInfo } from './permissions.js';
import { $, $$, h, toast, confirmDialog, openDialog, errorMessage, busy, when } from './ui.js';
import { normalizeEvent, normalizeHomepage, normalizeMembership, normalizeCommittee, normalizePerson } from '../lib/content-model.js';
import { overviewView } from './views/overview.js';
import { eventsView } from './views/events.js';
import { homepageView } from './views/homepage.js';
import { membershipView } from './views/membership.js';
import { teamView } from './views/team.js';
import { certificatesView } from './views/certificates.js';
import { editorsView } from './views/editors.js';
import { backupsView } from './views/backups.js';
import { accountView } from './views/account.js';
import { upgradeView } from './views/upgrade.js';

const views = [overviewView, eventsView, homepageView, membershipView, teamView, certificatesView, editorsView, backupsView, accountView];

const app = {
  config: null,
  cloud: null,
  user: null,
  role: '',
  perms: permissions(''),
  data: null,
  drafts: null,
  route: { view: 'overview', params: [] },
};
window.chapterEditor = app; // Handy when debugging in the browser console.

// ------------------------------------------------------------------ drafts and publishing

app.draftLabel = (name) => {
  const [kind, id] = name.split(':');
  if (kind === 'homepage') return 'Homepage images';
  if (kind === 'membership') return 'Membership information';
  if (kind === 'team') return id === 'founders' ? 'Founding members' : `Team & roster ${id}`;
  if (kind === 'event') {
    const draft = app.drafts.get(name);
    return `Event “${draft?.value?.title || id}”`;
  }
  return name;
};
app.draftView = (name) => {
  const [kind, id] = name.split(':');
  return kind === 'event' ? ['events', id] : kind === 'team' ? ['team', id] : [kind];
};

/** Validates a draft and returns the value that will be written. Throws a readable message. */
app.prepareDraft = (name) => {
  const draft = app.drafts.get(name);
  const [kind, id] = name.split(':');
  if (kind === 'homepage') return normalizeHomepage(draft.value);
  if (kind === 'membership') return normalizeMembership(draft.value);
  if (kind === 'event') {
    const v = draft.value;
    const event = normalizeEvent({ ...v, id: v.id || id, startTime: v.timed ? v.startTime : '', endTime: v.timed ? v.endTime : '' });
    if (id === 'new' && app.data.events.some((e) => e.value.id === event.id))
      throw Error('An event with this web address already exists. Change the title, or the Event ID under “Web address”.');
    return event;
  }
  if (kind === 'team')
    return id === 'founders'
      ? { members: draft.value.members.map(normalizePerson) }
      : normalizeCommittee(draft.value, { keepPrivate: true });
  throw Error('Unknown draft.');
};

async function write(name, value, baseRevision) {
  const [kind, id] = name.split(':');
  if (kind === 'homepage' || kind === 'membership') return app.cloud.savePage(kind, value, baseRevision);
  if (kind === 'event') return app.cloud.saveEvent(value, baseRevision);
  if (kind === 'team') return app.cloud.saveTeam(id, value, baseRevision);
  throw Error('Unknown draft.');
}

/**
 * Publishes one draft. On a validation problem the section opens with the message shown.
 * Returns true when the draft is live.
 */
app.publish = async (name, { reload = true, quiet = false } = {}) => {
  flushAutosaves();
  const draft = app.drafts.get(name);
  if (!draft) return true;
  let value;
  try {
    value = app.prepareDraft(name);
  } catch (error) {
    app.showProblem(name, error.message);
    return false;
  }
  try {
    await write(name, value, draft.baseRevision);
  } catch (error) {
    if (!(error instanceof ConflictError)) throw error;
    if (name.startsWith('event:') && !draft.baseRevision) {
      app.showProblem(name, 'An event with this web address already exists. Change the title or the Event ID under “Web address”.');
      return false;
    }
    const choice = await openDialog(
      `<h2>Someone else changed ${h(app.draftLabel(name))}</h2><div class="ed-dialog-body"><p>Another editor published this section after you started your draft.</p><p><strong>Publish mine</strong> replaces their version with yours. <strong>Use theirs</strong> discards your draft and loads the live version.</p></div><div class="ed-actions"><button type="button" class="ed-btn ed-btn-quiet" data-close>Cancel</button><button type="button" class="ed-btn" data-choice="theirs">Use theirs</button><button type="button" class="ed-btn ed-btn-primary" data-choice="mine">Publish mine</button></div>`,
      (dialog, close) => dialog.addEventListener('click', (e) => e.target.dataset.choice && close(e.target.dataset.choice)),
    );
    if (choice === 'theirs') {
      app.drafts.remove(name);
      await app.reload();
      toast(`Loaded the live version of ${app.draftLabel(name)}.`, { type: 'info' });
      return false;
    }
    if (choice !== 'mine') return false;
    await write(name, value, error.revision);
  }
  const label = app.draftLabel(name);
  app.drafts.remove(name);
  if (app.problem?.name === name) app.problem = null;
  if (reload) await app.reload();
  if (name === 'event:new' && app.route.view === 'events') navigate('events', [value.id]);
  if (!quiet) toast(`${label} is live. Visitors see it now; search engines see it after the automatic rebuild (within about 15 minutes).`);
  return true;
};

/** Publishes every draft (each section separately, so one problem never blocks the others). */
app.publishAll = async () => {
  flushAutosaves();
  const names = app.drafts.names();
  if (!names.length) return;
  const ok = await confirmDialog({
    title: `Publish ${names.length} section${names.length === 1 ? '' : 's'}?`,
    body: `<p>These drafts will go live on the website:</p><ul>${names.map((n) => `<li>${h(app.draftLabel(n))}</li>`).join('')}</ul>`,
    confirm: 'Publish now',
  });
  if (!ok) return;
  const published = [];
  for (const name of names) {
    try {
      if (await app.publish(name, { reload: false, quiet: true })) published.push(app.draftLabel(name));
      else break; // The section with the problem is open now.
    } catch (error) {
      toast(`${app.draftLabel(name)}: ${errorMessage(error)}`, { type: 'error' });
      break;
    }
  }
  await app.reload();
  if (published.length) toast(`Published: ${published.join(', ')}.`);
};

app.discard = async (name) => {
  if (
    !(await confirmDialog({
      title: 'Discard this draft?',
      body: `<p>Your unpublished changes to ${h(app.draftLabel(name))} will be removed. The live website does not change.</p>`,
      confirm: 'Discard draft',
      danger: true,
    }))
  )
    return false;
  app.drafts.remove(name);
  if (app.problem?.name === name) app.problem = null;
  render();
  toast('Draft discarded.', { type: 'info' });
  return true;
};

/** Opens the section of a draft and shows what must be fixed. */
app.showProblem = (name, message) => {
  const [view, param] = app.draftView(name);
  navigate(view, param ? [param] : []);
  // Kept until the editor leaves this view, so later re-renders (e.g. after Publish all) still show it.
  app.problem = { name, message };
  render();
  toast(`${app.draftLabel(name)}: ${message}`, { type: 'error' });
};

app.reload = async () => {
  app.data = await app.cloud.load(app.role);
  render();
};

// ------------------------------------------------------------------ navigation

function navigate(view, params = []) {
  const target = '#' + [view, ...params].map(encodeURIComponent).join('/');
  if (location.hash !== target) history.pushState(null, '', target);
  route();
}
app.navigate = navigate;

function parseRoute() {
  const [view = 'overview', ...params] = location.hash.slice(1).split('/').map(decodeURIComponent);
  return { view: views.some((v) => v.id === view) ? view : 'overview', params };
}

function route() {
  flushAutosaves();
  app.problem = null;
  app.route = parseRoute();
  render();
  $('#ed-main')?.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

function currentView() {
  const allowed = views.filter((v) => v.allowed(app.perms));
  if (app.data.layout !== 'split') return { view: upgradeView, allowed };
  return { view: allowed.find((v) => v.id === app.route.view) || overviewView, allowed };
}

/** Navigation, draft counters and the account card. Cheap; runs after every draft autosave. */
function renderChrome() {
  if (!app.data) return;
  const { view, allowed } = currentView();
  const needsUpgrade = view === upgradeView;
  const counts = {};
  for (const name of app.drafts.names()) counts[app.draftView(name)[0]] = (counts[app.draftView(name)[0]] || 0) + 1;
  $('#ed-nav').innerHTML = allowed
    .map(
      (v) =>
        `<a href="#${v.id}" class="ed-nav-item"${v === view ? ' aria-current="page"' : ''}><span class="ed-nav-icon" aria-hidden="true">${v.icon}</span><span>${h(v.title)}</span>${counts[v.id] ? `<span class="ed-badge" title="Unpublished drafts">${counts[v.id]}</span>` : ''}</a>`,
    )
    .join('');
  $('#ed-view-title').textContent = view.title;
  const drafts = app.drafts.names().length;
  const pill = $('#ed-drafts-pill');
  pill.hidden = !drafts || needsUpgrade;
  pill.innerHTML = `<span class="ed-dot" aria-hidden="true"></span>${drafts} unpublished draft${drafts === 1 ? '' : 's'}`;
  $('#ed-publish-all').hidden = !drafts || needsUpgrade;
  $('#ed-publish-all').textContent = drafts > 1 ? `Publish all (${drafts})` : 'Publish';
  $('#ed-user').innerHTML =
    `<strong>${h(app.user.displayName || app.user.email)}</strong><span>${h(app.user.email)}</span><span class="ed-role">${h(roleInfo[app.role].label)}</span>`;
}

function render() {
  if (!app.data) return;
  renderChrome();
  const { view } = currentView();
  // A fresh container each time, so listeners from the previous render never pile up.
  const main = document.createElement('div');
  main.className = 'ed-view';
  main.id = 'ed-view';
  main.dataset.view = view.id;
  $('#ed-view').replaceWith(main);
  view.render(main, app, app.route.params);
}
app.render = render;

// ------------------------------------------------------------------ drafts drawer

function showDraftsDrawer() {
  const names = app.drafts.names();
  openDialog(
    `<h2>Unpublished drafts</h2><div class="ed-dialog-body"><p>Drafts are saved in this browser as you type. Nothing changes on the website until you publish.</p><ul class="ed-draft-list">${names
      .map((n) => {
        const d = app.drafts.get(n);
        return `<li><div><strong>${h(app.draftLabel(n))}</strong><small>Saved ${h(when(new Date(d.savedAt)))}</small></div><div class="ed-actions"><button type="button" class="ed-btn ed-btn-quiet" data-open="${h(n)}">Open</button><button type="button" class="ed-btn ed-btn-quiet" data-discard="${h(n)}">Discard</button><button type="button" class="ed-btn ed-btn-primary" data-publish="${h(n)}">Publish</button></div></li>`;
      })
      .join(
        '',
      )}</ul></div><div class="ed-actions"><button type="button" class="ed-btn ed-btn-quiet" data-close>Close</button>${names.length > 1 ? '<button type="button" class="ed-btn ed-btn-primary" data-publish-all>Publish all</button>' : ''}</div>`,
    (dialog, close) =>
      dialog.addEventListener('click', async (e) => {
        const t = e.target.closest('button');
        if (!t) return;
        if (t.dataset.open) {
          close();
          const [view, param] = app.draftView(t.dataset.open);
          navigate(view, param ? [param] : []);
        } else if (t.dataset.discard) {
          close();
          await app.discard(t.dataset.discard);
        } else if (t.dataset.publish) {
          close();
          await busy(null, '', () => app.publish(t.dataset.publish));
        } else if ('publishAll' in t.dataset) {
          close();
          await busy(null, '', () => app.publishAll());
        }
      }),
  );
}

// ------------------------------------------------------------------ sign-in

function showSignedOut(message = '') {
  $('#ed-signin').hidden = false;
  $('#ed-shell').hidden = true;
  $('#ed-signin-status').textContent = message;
  $('#ed-sign-in').hidden = false;
  $('#ed-signin-out').hidden = true;
}

async function activate(user) {
  app.user = user;
  $('#ed-signin-status').textContent = 'Checking your access…';
  app.role = await app.cloud.role(user);
  app.perms = permissions(app.role);
  if (!app.role) {
    $('#ed-signin-status').innerHTML =
      `Signed in as <strong>${h(user.email)}</strong>, but this account has no editor access. Ask the chapter super-admin to add it.`;
    $('#ed-sign-in').hidden = true;
    $('#ed-signin-out').hidden = false;
    return;
  }
  app.drafts = createDrafts(user.uid, () => renderChrome());
  $('#ed-signin-status').textContent = 'Loading chapter content…';
  app.data = await app.cloud.load(app.role);
  $('#ed-signin').hidden = true;
  $('#ed-shell').hidden = false;
  route();
  if (!app.drafts.storageWorks)
    toast('This browser is not keeping drafts between visits (private window?). Publish before closing the tab.', { type: 'info' });
}

async function start() {
  try {
    app.config = await fetch('data/site-config.json', { cache: 'no-cache' }).then((r) => r.json());
    app.cloud = connect(app.config);
    if (app.cloud.testSignIn) app.testSignIn = async (email) => activate(await app.cloud.testSignIn(email));
    const user = await app.cloud.currentUser();
    if (user) await activate(user);
    else showSignedOut();
  } catch (error) {
    showSignedOut(errorMessage(error));
  }
}

$('#ed-sign-in').addEventListener('click', (e) =>
  busy(e.currentTarget, 'Opening Google sign-in…', async () => {
    const user = await app.cloud.signIn();
    await activate(user);
  }),
);
for (const id of ['#ed-sign-out', '#ed-signin-out'])
  $(id).addEventListener('click', async () => {
    if (
      app.drafts?.names().length &&
      !(await confirmDialog({
        title: 'Sign out?',
        body: '<p>Your unpublished drafts stay saved in this browser for your next visit.</p>',
        confirm: 'Sign out',
      }))
    )
      return;
    await app.cloud.signOut();
    app.data = null;
    showSignedOut('You are signed out.');
  });
$('#ed-drafts-pill').addEventListener('click', () => {
  flushAutosaves();
  showDraftsDrawer();
});
$('#ed-publish-all').addEventListener('click', (e) => busy(e.currentTarget, 'Publishing…', () => app.publishAll()));
$('#ed-nav-toggle').addEventListener('click', () => {
  const open = $('#ed-shell').classList.toggle('ed-nav-open');
  $('#ed-nav-toggle').setAttribute('aria-expanded', String(open));
});
$('#ed-nav').addEventListener('click', (e) => {
  if (e.target.closest('a')) {
    $('#ed-shell').classList.remove('ed-nav-open');
    $('#ed-nav-toggle').setAttribute('aria-expanded', 'false');
  }
});
window.addEventListener('popstate', route);
window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', (e) => {
  if ($$('form[data-dirty="true"]').length) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// Back to top on long pages.
const top = $('#ed-top');
window.addEventListener('scroll', () => (top.hidden = window.scrollY < 600), { passive: true });
top.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  $('#ed-main').focus({ preventScroll: true });
});

start();
