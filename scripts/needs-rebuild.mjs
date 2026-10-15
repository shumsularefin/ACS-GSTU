// Scheduled check: is the published content newer than the deployed build?
// Compares the revision baked into https://acs-gstu.web.app/data/build.json with Firestore.
// Writes changed=true|false to $GITHUB_OUTPUT. Costs one or two database reads.
import fs from 'node:fs';
import { firestoreREST } from '../js/lib/firestore-rest.js';

const config = JSON.parse(fs.readFileSync('data/site-config.json', 'utf8'));
const rest = firestoreREST(config.firebase.projectId);

async function publishedRevision() {
  const meta = await rest.get('site/meta').catch((error) => (error.status === 403 ? null : Promise.reject(error)));
  if (meta) return String(meta.revision);
  const legacy = await rest.get('siteContent/published');
  return legacy ? `legacy-${legacy.revision}` : 'seed';
}

const [live, published] = await Promise.all([
  fetch('https://acs-gstu.web.app/data/build.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : {}))
    .then((b) => String(b.revision ?? ''))
    .catch(() => ''),
  publishedRevision(),
]);
const changed = live !== published;
console.log(`Deployed revision: ${live || 'unknown'} · published revision: ${published} · rebuild ${changed ? 'needed' : 'not needed'}`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
