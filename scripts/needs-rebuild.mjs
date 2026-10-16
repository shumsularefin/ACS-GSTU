// Scheduled check: is the published content newer than the deployed build?
// Compares the revision baked into https://acs-gstu.web.app/data/build.json with Firestore, and
// (when News is connected) the Facebook Page posts with https://acs-gstu.web.app/data/news.json.
// Writes changed=true|false to $GITHUB_OUTPUT. Costs one or two database reads and one Facebook request.
import fs from 'node:fs';
import { firestoreREST } from '../js/lib/firestore-rest.js';
import { facebookConfig, fetchPagePosts, postsSignature } from '../js/lib/facebook.js';

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

// New, edited or deleted Facebook posts.
let newsChanged = false;
const facebook = facebookConfig();
if (facebook) {
  try {
    const [posts, deployed] = await Promise.all([
      fetchPagePosts(facebook),
      fetch('https://acs-gstu.web.app/data/news.json', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({})),
    ]);
    newsChanged = postsSignature(posts) !== deployed.signature;
    console.log(`Facebook: ${posts.length} post(s) · News ${newsChanged ? 'changed' : 'unchanged'}`);
  } catch (error) {
    console.log(`Facebook check skipped: ${error.message}`);
  }
}
const changed = live !== published || newsChanged;
console.log(`Deployed revision: ${live || 'unknown'} · published revision: ${published} · rebuild ${changed ? 'needed' : 'not needed'}`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
