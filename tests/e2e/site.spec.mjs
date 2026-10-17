// The whole flow an editor and a visitor go through, against the emulators and the real security rules.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, setDoc } from 'firebase/firestore';

const PROJECT = 'demo-acs-e2e';
const OWNER = 'muhammadshamsularefin01@gmail.com';
const OUTREACH = 'outreach@example.com';
const jsqrPath = createRequire(import.meta.url).resolve('jsqr/dist/jsQR.js');
const seed = (name) => JSON.parse(readFileSync(`data/seed/${name}.json`, 'utf8'));

test.describe.configure({ mode: 'serial' });

let owner;
let credential;
let formId;

/** Empties the emulators and stores the retired single-document layout, as production has it now. */
async function resetEmulators() {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  const app = initializeApp({ projectId: PROJECT }, 'e2e-setup');
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080, { mockUserToken: 'owner' });
  const team = seed('team');
  team.committees['2026'].roster = [{ name: 'Existing Member', tier: 'general' }];
  const events = seed('events');
  await setDoc(doc(db, 'siteContent', 'published'), {
    schemaVersion: 2,
    revision: 30,
    payload: JSON.stringify({ schemaVersion: 1, team, certificateArchive: [] }),
    events: Object.fromEntries(events.map((e) => [e.id, e])),
    homepage: { images: ['images/optimized/slide01-1600.webp'] },
    membership: seed('membership'),
  });
  await setDoc(doc(db, 'privateRosters', 'members'), { years: { 2026: [{ name: 'Existing Member', tier: 'general', memID: '00007' }] } });
  await deleteApp(app);
}

async function signIn(page, email) {
  await page.goto('/admin.html');
  await page.waitForFunction(() => window.chapterEditor?.testSignIn);
  await page.evaluate((e) => window.chapterEditor.testSignIn(e), email);
}

const toast = (page, text) => expect(page.locator('.ed-toast', { hasText: text }).first()).toBeVisible();

test.beforeAll(async ({ browser }) => {
  await resetEmulators();
  owner = await browser.newPage();
});

test('the super-admin upgrades storage once', async () => {
  await signIn(owner, OWNER);
  await expect(owner.getByRole('heading', { name: 'Move the website to the new storage' })).toBeVisible();
  await expect(owner.getByText('roster members (membership IDs move to private storage)')).toBeVisible();
  await owner.getByRole('button', { name: 'Upgrade storage now' }).click();
  await toast(owner, 'Storage upgraded');
  await expect(owner.getByRole('heading', { name: /^Welcome/ })).toBeVisible();
});

test('a multi-day event with open registration and no registration link is promoted on the homepage', async ({ browser }) => {
  await owner.goto('/admin.html#events/new');
  const form = owner.locator('form.ed-form');
  await form.locator('[name="title"]').fill('Science Fair');
  await form.locator('[name="date"]').fill('2027-03-10');
  await form.locator('[name="endDate"]').fill('2027-03-12');
  await form.locator('[name="registrationStatus"]').selectOption('open');
  await form.locator('[name="description"]').fill('A three-day science fair for school students.');
  await expect(owner.locator('.ed-chip-draft')).toBeVisible();
  await owner.locator('[data-publish-draft]').click();
  await toast(owner, 'is live');
  await expect(owner).toHaveURL(/#events\/science-fair-2027$/);

  // Visitors see it immediately, before any rebuild.
  const visitor = await browser.newPage();
  await visitor.goto('/index.html');
  const button = visitor.locator('.hero-registration');
  await expect(button).toBeVisible();
  await expect(visitor.locator('.slide-btn b')).toBeVisible();
  await button.click();
  await expect(visitor.getByRole('heading', { name: 'Science Fair', level: 1 })).toBeVisible();
  await expect(visitor.locator('.event-detail .eyebrow')).toContainText('10 March 2027 – 12 March 2027');
  await expect(visitor.getByText('Registration details will be announced here.')).toBeVisible();
  await visitor.close();
});

test('an annual report collects the fiscal year events by ACS section and downloads as a PDF', async () => {
  await owner.goto('/admin.html#reports');
  await expect(owner.getByRole('heading', { name: 'Create the report for a fiscal year' })).toBeVisible();
  await owner.locator('input[name="fiscalYear"][value="2025"]').check();
  // 1 May 2024 – 31 May 2025: the four seed events, three of them held in May 2024.
  const items = owner.locator('.ed-report-events li');
  await expect(items).toHaveCount(4);
  await expect(owner.locator('.ed-report-warn')).toHaveCount(3);
  await expect(owner.locator('.ed-report-service strong')).toHaveText('2');
  await expect(owner.locator('.ed-report-green-chemistry strong')).toHaveText('1');
  const webinar = items.filter({ hasText: 'Membership Outreach Offline Webinar' });
  await webinar.locator('[data-include]').uncheck();
  await expect(owner.locator('.ed-report-service strong')).toHaveText('1');
  await items.filter({ hasText: 'BSMRSTU' }).locator('[data-green]').check();
  await expect(owner.locator('.ed-report-green-chemistry strong')).toHaveText('2');
  await expect(owner.locator('[data-total]')).toHaveText('3 of 4 included');
  const download = owner.waitForEvent('download');
  await owner.getByRole('button', { name: 'Download PDF report' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('ACS-GSTU-Annual-Report-2024-2025.pdf');
  expect(
    readFileSync(await file.path())
      .subarray(0, 5)
      .toString(),
  ).toBe('%PDF-');
  // Choices are remembered for the report.
  await owner.reload();
  await expect(owner.locator('[data-total]')).toHaveText('3 of 4 included');
});

test('Publish all publishes what is valid and opens the section that needs fixing', async () => {
  await owner.goto('/admin.html#events/science-fair-2027');
  await owner.locator('form.ed-form [name="location"]').fill('GSTU Auditorium');
  await expect(owner.locator('.ed-chip-draft')).toBeVisible();
  await owner.goto('/admin.html#membership');
  await owner.locator('[name="intro"]').fill('');
  await expect(owner.locator('.ed-chip-draft')).toBeVisible();
  await expect(owner.locator('#ed-drafts-pill')).toContainText('2 unpublished drafts');

  await owner.locator('#ed-publish-all').click();
  await expect(owner.locator('dialog')).toContainText('Membership information');
  await owner.getByRole('button', { name: 'Publish now' }).click();
  await expect(owner).toHaveURL(/#membership$/);
  await expect(owner.locator('.ed-form-error')).toContainText('Introduction is required');
  await expect(owner.locator('#ed-drafts-pill')).toContainText('1 unpublished draft');
  await owner.getByRole('button', { name: 'Discard draft' }).click();
  await owner.getByRole('button', { name: 'Discard draft' }).last().click();
  await expect(owner.locator('#ed-drafts-pill')).toBeHidden();
});

test('roster members show by name only; membership IDs stay private', async ({ browser }) => {
  await owner.goto('/admin.html#team/2026');
  await expect(owner.getByText('Existing Member')).toBeVisible();
  const add = owner.locator('[data-roster-add]');
  await add.getByLabel('Member name').fill('Test Member');
  await add.getByLabel('Membership ID').fill('00042');
  await add.getByRole('button', { name: 'Add member' }).click();
  await owner.locator('[data-publish-draft]').click();
  await toast(owner, 'is live');

  const visitor = await browser.newPage();
  await visitor.goto('/team.html?year=2026');
  await visitor.waitForLoadState('networkidle');
  await visitor.getByText('Show chapter roster · 2026').click();
  await expect(visitor.locator('.roster-body')).toContainText('Test Member');
  expect(await visitor.content()).not.toContain('00042');
  const publicTeam = await (await fetch(`http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/team/2026`)).text();
  expect(publicTeam).not.toContain('00042');
  expect(publicTeam).not.toContain('00007');
  await visitor.close();
});

test('a participant certificate is issued, found by membership ID, verified, and its QR code opens the verification page', async ({
  browser,
}) => {
  await owner.goto('/admin.html#certificates');
  await owner.locator('label', { hasText: 'Participation' }).click();
  await owner.getByRole('button', { name: 'Continue' }).click();
  await owner.locator('[name="eventId"]').selectOption('science-fair-2027');
  await owner.getByRole('button', { name: 'Continue' }).click();
  await owner.getByLabel('Recipient name').fill('Ayesha Rahman');
  await owner.getByLabel('ACS membership ID').fill('00042');
  await owner.getByRole('button', { name: 'Review certificates' }).click();
  await expect(owner.locator('[data-preview] svg')).toBeVisible();
  await owner.getByLabel(/I checked the names/).check();
  await owner.getByRole('button', { name: 'Issue 1 certificate' }).click();
  await expect(owner.getByRole('heading', { name: /1 certificate issued/ })).toBeVisible();
  credential = (await owner.locator('.ed-issued .ed-mono').first().textContent()).trim();
  expect(credential).toMatch(/^ACS-[A-F0-9]{32}$/);

  const visitor = await browser.newPage();
  await visitor.goto('/certificates.html');
  await visitor.locator('#member-event').selectOption('science-fair-2027');
  await visitor.getByLabel('ACS membership ID').fill('00042');
  await visitor.getByRole('button', { name: 'Find my certificate' }).click();
  await visitor.locator('.certificate-match').click();
  await expect(visitor.getByRole('heading', { name: 'Certificate verified' })).toBeVisible();
  await expect(visitor.locator('.credential-valid')).not.toContainText('00042');

  // Decode the QR code at the resolution used for the PDF (2400 × 1700).
  await visitor.evaluate(readFileSync(jsqrPath, 'utf8'));
  const decoded = await visitor.evaluate(async () => {
    const svg = document.querySelector('#certificate-display svg').outerHTML;
    const img = new Image();
    img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    await img.decode();
    const canvas = Object.assign(document.createElement('canvas'), { width: 2400, height: 1700 });
    const context = canvas.getContext('2d');
    context.drawImage(img, 0, 0, 2400, 1700);
    const data = context.getImageData(0, 0, 2400, 1700);
    return window.jsQR(data.data, data.width, data.height)?.data || null;
  });
  expect(decoded).toBe(`https://acs-gstu.web.app/certificates.html?certId=${credential}`);
  const download = visitor.waitForEvent('download');
  await visitor.getByRole('button', { name: 'Download certificate PDF' }).click();
  expect((await download).suggestedFilename()).toBe(`${credential}.pdf`);

  const publicRecord = await (
    await fetch(`http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/certificates/${credential}`)
  ).text();
  expect(publicRecord).toContain('Ayesha Rahman');
  expect(publicRecord).not.toContain('00042');
  await visitor.close();
});

test('the super-admin revokes a certificate and the verification page says so', async ({ browser }) => {
  await owner.goto('/admin.html#certificates/find');
  await owner.getByLabel('Credential ID').fill(credential);
  await owner.getByRole('button', { name: 'Look up' }).click();
  await expect(owner.locator('[data-found]')).toContainText('00042');
  await owner.getByRole('button', { name: 'Revoke certificate' }).click();
  await owner.getByRole('button', { name: 'Revoke', exact: true }).click();
  await toast(owner, 'Certificate revoked');
  const visitor = await browser.newPage();
  await visitor.goto(`/certificates.html?certId=${credential}`);
  await expect(visitor.getByRole('heading', { name: 'Certificate revoked' })).toBeVisible();
  await visitor.close();
});

test('an event registration form is built, answered once per transaction, checked and exported to Excel', async ({ browser }) => {
  test.setTimeout(120_000); // The longest flow: build, link, three answers, payment check and export.
  await owner.goto('/admin.html#forms');
  await owner.getByRole('button', { name: '+ New form' }).click();
  await owner.getByRole('button', { name: /Event registration/ }).click();
  await expect(owner).toHaveURL(/#forms\/new$/);
  const builder = owner.locator('form.ed-fb');
  await builder.locator('[name="title"]').fill('Lab Safety Workshop registration');
  await builder.locator('[name="status"]').selectOption('open');
  await builder.locator('[name="payAmount"]').fill('150 BDT');
  await builder.locator('[data-account] [data-k="number"]').fill('01700000000');
  // A section can go anywhere, not only at the end.
  await builder.getByRole('button', { name: '+ Section here' }).first().click();
  await expect(builder.locator('[data-q]').nth(1).locator('[data-k="type"]')).toHaveValue('section');
  await builder.getByRole('button', { name: '+ Add question' }).click();
  await builder.locator('[data-q]').last().locator('[data-k="label"]').fill('T-shirt size');
  await builder.locator('[data-q]').last().locator('[data-k="type"]').selectOption('dropdown');
  await builder.locator('[data-q]').last().locator('[data-k="options"]').fill('S\nM\nL');
  await expect(owner.locator('.ed-chip-draft')).toBeVisible();
  await owner.locator('[data-publish-draft]').click();
  await toast(owner, 'is live');
  await expect(owner).toHaveURL(/#forms\/lab-safety-workshop-registration-\d{4}$/);
  formId = decodeURIComponent(owner.url().split('#forms/')[1]);

  // The event chooses the form from a dropdown; the form, not the event, decides when registration is open.
  await owner.goto('/admin.html#events/science-fair-2027');
  await owner.locator('form.ed-form [name="registrationFormId"]').selectOption(formId);
  await expect(owner.locator('[data-outside]')).toBeHidden();
  await owner.locator('[data-publish-draft]').click();
  await toast(owner, 'is live');

  const visitor = await browser.newPage();
  const register = async (txn, membership = 'General member', { popup = false } = {}) => {
    if (popup) {
      await visitor.goto('/event.html?id=science-fair-2027');
      await visitor.getByRole('link', { name: 'Register now' }).click();
      await expect(visitor.locator('dialog.form-dialog')).toBeVisible();
    } else await visitor.goto(`/form.html?id=${formId}`);
    await expect(visitor.getByRole('heading', { name: 'Lab Safety Workshop registration' })).toBeVisible();
    await visitor.getByLabel('Full name').fill('Visitor One');
    await visitor.getByLabel('Email address').fill('visitor@example.com');
    await visitor.getByLabel('Phone number').fill('01711111111');
    await visitor.getByLabel('University or institution').fill('GSTU');
    await visitor.getByLabel('Department').selectOption('Chemistry');
    await visitor.getByLabel('Student ID').fill('20CHEM042');
    await visitor.getByLabel(membership).check();
    await visitor.getByLabel('T-shirt size').selectOption('M');
    if (txn) {
      await visitor.getByLabel('bKash', { exact: true }).check();
      await visitor.getByLabel(/^Paid from/).fill('01722222222');
      await visitor.getByLabel('Transaction ID').fill(txn);
    } else await expect(visitor.locator('[data-payment]')).toBeHidden();
    await visitor.getByRole('button', { name: 'Submit' }).click();
  };
  await register('9AB7CD3EF1', 'General member', { popup: true });
  await expect(visitor.locator('dialog.form-dialog').getByText('You are registered!')).toBeVisible();
  await visitor.locator('dialog.form-dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(visitor.locator('dialog.form-dialog')).toHaveCount(0);
  await register('9ab7-cd3ef1');
  await expect(visitor.locator('#payment_txn-error')).toContainText('already been used');
  await register('', 'Premium member');
  await expect(visitor.getByText('You are registered!')).toBeVisible();

  // "Join now" opens the chosen website form instead of the old outside link.
  await owner.goto('/admin.html#membership');
  await owner.locator('[name="applicationFormId"]').selectOption(formId);
  await owner.locator('[data-publish-draft]').click();
  await toast(owner, 'is live');
  await visitor.close();
  // A new visitor (pages keep the published content for five minutes per browser session).
  const newcomer = await (await browser.newContext()).newPage();
  await newcomer.goto('/index.html#membership');
  await expect(newcomer.locator('.hero-registration-member')).toBeVisible();
  await newcomer.getByRole('link', { name: 'Join now →' }).click();
  await expect(newcomer.locator('dialog.form-dialog').getByRole('heading', { name: 'Lab Safety Workshop registration' })).toBeVisible();
  await newcomer.context().close();

  await owner.goto(`/admin.html#forms/${formId}/responses`);
  await expect(owner.locator('.ed-fb-stats')).toContainText('2responses');
  await owner.locator('tr', { hasText: '9AB7CD3EF1' }).getByRole('button', { name: 'View' }).click();
  await owner.getByLabel(/Payment checked/).check();
  await toast(owner, 'Payment marked as checked');
  await owner.locator('dialog').getByRole('button', { name: 'Close' }).click();
  await expect(owner.locator('tr', { hasText: '9AB7CD3EF1' })).toContainText('Checked');
  const download = owner.waitForEvent('download');
  await owner.getByRole('button', { name: 'Download Excel (.xlsx)' }).click();
  expect((await download).suggestedFilename()).toMatch(new RegExp(`^${formId}-responses-.*\.xlsx$`));
});

test('an outreach editor gets only the tools of that role', async ({ browser }) => {
  await owner.goto('/admin.html#editors');
  const form = owner.locator('[data-editor-form]');
  await form.getByLabel('Google account email').fill(OUTREACH);
  await form.getByLabel('Role').selectOption('outreach');
  await form.getByRole('button', { name: 'Save access' }).click();
  await toast(owner, 'outreach editor');
  await expect(owner.locator('[data-log]')).toContainText('Issued certificates');

  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, OUTREACH);
  const nav = page.locator('#ed-nav');
  await expect(nav).toContainText('Events');
  await expect(nav).toContainText('Homepage images');
  await expect(nav).not.toContainText('Team & rosters');
  await expect(nav).not.toContainText('Manage editors');
  await page.goto('/admin.html#certificates');
  await expect(page.locator('input[value="participant"]')).toBeEnabled();
  await expect(page.locator('input[value="champion"]')).toBeDisabled();
  await expect(page.locator('input[value="executive"]')).toBeDisabled();
  await page.goto('/admin.html#events/science-fair-2027');
  await expect(page.getByText('You can view this event.')).toBeVisible();
  await context.close();
});

test('the dashboard and public pages fit a phone screen', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  for (const path of [
    '/index.html',
    '/activities.html',
    '/team.html?year=2026',
    '/certificates.html',
    '/event-green-and-clean.html',
    `/form.html?id=${formId}`,
  ]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
  }
  await signIn(page, OWNER);
  await expect(page.locator('#ed-nav-toggle')).toBeVisible();
  for (const hash of [
    '#overview',
    '#news',
    '#events/science-fair-2027',
    '#reports',
    `#forms/${formId}`,
    `#forms/${formId}/responses`,
    '#team/2026',
    '#certificates',
    '#editors',
  ]) {
    await page.goto('/admin.html' + hash);
    await expect(page.locator('#ed-view')).not.toBeEmpty();
    const wide = await page.evaluate(() =>
      [...document.querySelectorAll('body *')]
        .filter(
          (el) =>
            el.getBoundingClientRect().right > innerWidth + 1 &&
            !el.closest('.ed-table-wrap, .ed-toasts') &&
            // Decorations clipped by an ancestor do not widen the page.
            !(function clipped(node) {
              for (let p = node.parentElement; p; p = p.parentElement)
                if (/hidden|clip|auto|scroll/.test(getComputedStyle(p).overflowX)) return true;
              return false;
            })(el),
        )
        .slice(0, 5)
        .map((el) => `${el.tagName}.${el.className} ${Math.round(el.getBoundingClientRect().right)}`),
    );
    expect(wide, hash).toEqual([]);
  }
  await context.close();
});
