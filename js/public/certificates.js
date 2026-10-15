// Certificate Center: find a certificate by event + membership ID, or verify a credential ID.
// Shows only what is needed to verify: name, event, category, status and the certificate itself.
import { normalizeCertificate, validCredential, certificateURL, membershipLookupID } from '../lib/certificate-model.js';
import { certificateSVG, downloadCertificate } from '../lib/certificate-render.js';
import { escapeHTML as h } from '../lib/content-model.js';
import { dateLabel } from '../lib/content-render.js';
import { rest, buildInfo } from './site-data.js';

const $ = (id) => document.getElementById(id);
const result = $('result');
const display = $('certificate-display');
const input = $('certId');
let request = 0;

const typeLabel = (type) => type.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const failure = (error) =>
  error.status === 403
    ? 'This certificate is being moved to the new verification system. Please try again in a few minutes.'
    : error.name === 'AbortError' || error.status === 0
      ? 'The certificate service did not respond. Please try again.'
      : 'The certificate service is unavailable. Please try again later.';

async function loadCatalog() {
  const select = $('member-event');
  const status = $('catalog-status');
  try {
    const hidden = new Set((await buildInfo()).hiddenCertificateEvents || []);
    const events = (await (await rest()).list('certificateEvents', { pageSize: 300, max: 1000 }))
      .map((d) => d.data)
      .filter((e) => !e.archived && !hidden.has(e.id))
      .sort((a, b) => b.date.localeCompare(a.date));
    select.innerHTML =
      '<option value="">Select an event or service term</option>' +
      events.map((e) => `<option value="${h(e.id)}">${h(e.title)} · ${h(dateLabel(e.date))}</option>`).join('');
    if (!events.length)
      status.textContent = 'Events appear here once their certificates are issued. You can still use a credential ID below.';
  } catch {
    select.innerHTML = '<option value="">Events unavailable</option>';
    status.textContent = 'Event lookup is temporarily unavailable. You can still verify a credential ID below.';
  }
}

$('member-certificate-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const current = ++request;
  const event = $('member-event').value;
  const member = $('member-id').value;
  const matches = $('member-matches');
  matches.innerHTML = '';
  display.innerHTML = '';
  result.textContent = 'Finding your issued certificates…';
  try {
    const client = await rest();
    const entry = await client.get('certificateLookup/' + (await membershipLookupID(event, member)));
    if (current !== request) return;
    if (!entry?.ids?.length) {
      result.textContent = 'No issued certificate matches this event and membership ID. Check the ID or contact the chapter.';
      return;
    }
    // The lookup key is derived from the membership ID, so a match proves the ID without storing it publicly.
    const records = await Promise.all(
      entry.ids.map(async (id) => {
        try {
          const doc = await client.get('certificates/' + id);
          return doc ? normalizeCertificate(doc, { id, legacy: true }) : null;
        } catch {
          return null;
        }
      }),
    );
    if (current !== request) return;
    const found = records.filter((c) => c && (!c.eventId || c.eventId === event));
    if (!found.length) {
      result.textContent = 'No matching certificate could be loaded. Please try again in a few minutes or contact the chapter.';
      return;
    }
    result.textContent = `${found.length} certificate${found.length === 1 ? '' : 's'} found. Select one to view its status and download it.`;
    matches.innerHTML = found
      .map(
        (c) =>
          `<button type="button" class="certificate-match" data-credential="${h(c.id)}">${h(c.name)} · ${h(typeLabel(c.type))} · ${h(c.status)}<br><small>${h(c.id)}</small></button>`,
      )
      .join('');
  } catch (error) {
    if (current === request) result.textContent = error.message?.startsWith('Select an event') ? error.message : failure(error);
  }
});

$('member-matches').addEventListener('click', (e) => {
  const button = e.target.closest('[data-credential]');
  if (!button) return;
  history.replaceState(null, '', certificateURL(button.dataset.credential, location.origin));
  verify(button.dataset.credential);
});

async function verify(id) {
  const current = ++request;
  display.innerHTML = '';
  result.textContent = 'Checking the official certificate record…';
  if (!validCredential(id)) {
    result.textContent = 'Enter a valid credential ID (letters, numbers, hyphens and underscores).';
    return;
  }
  input.value = id;
  try {
    const doc = await (await rest()).get('certificates/' + id);
    if (current !== request) return;
    if (!doc) {
      result.innerHTML = `<div class="credential-revoked"><h2>Certificate not found</h2><p>No certificate has been issued with this credential ID. Check the ID or contact the chapter.</p><p>${h(id)}</p></div>`;
      return;
    }
    const c = normalizeCertificate(doc, { id, legacy: true });
    if (c.status === 'revoked') {
      result.innerHTML = `<div class="credential-revoked"><h2>Certificate revoked</h2><p>This credential is no longer valid. Contact the chapter for assistance.</p><p>Credential ID: ${h(id)}</p></div>`;
      return;
    }
    const svg = await certificateSVG(c);
    if (current !== request) return;
    result.innerHTML = `<div class="credential-valid"><h2>Certificate verified</h2><p><strong>${h(c.name)}</strong> · ${h(c.event)}</p><p>${h(typeLabel(c.type))} · Issued ${h(c.dateIssued ? dateLabel(c.dateIssued) : 'date not recorded')}</p><p>Credential ID: ${h(id)}</p><a href="${h(certificateURL(id))}">Permanent verification link</a></div>`;
    display.innerHTML = `${svg}<button type="button" class="button" id="download-certificate">Download certificate PDF</button><p class="editor-note">The online record is the source of validity. Recheck this link when confirming a certificate.</p>`;
    $('download-certificate').addEventListener('click', async (event) => {
      event.target.disabled = true;
      try {
        await downloadCertificate(c);
      } catch {
        result.textContent = 'The PDF could not be generated. Please try again.';
      } finally {
        event.target.disabled = false;
      }
    });
  } catch (error) {
    if (current === request) result.textContent = failure(error);
  }
}

$('verify-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const id = input.value.trim();
  history.replaceState(null, '', certificateURL(id, location.origin));
  verify(id);
});

loadCatalog();
const initial = new URLSearchParams(location.search).get('certId');
if (initial) {
  document.querySelector('.credential-id-option')?.setAttribute('open', '');
  verify(initial);
}
