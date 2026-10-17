// Keeps Firebase Hosting storage small for years: only the newest releases are kept (older ones are
// deleted by Firebase, which also frees their files). Run by the deploy job after each deploy with
// the deploy credentials; a failure only prints a warning.
import { GoogleAuth } from 'google-auth-library';

const SITE = 'acs-gstu';
const KEEP = 10;

try {
  const client = await new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/firebase'] }).getClient();
  const url = `https://firebasehosting.googleapis.com/v1beta1/sites/${SITE}/config?updateMask=maxVersions`;
  const { data } = await client.request({ url, method: 'PATCH', data: { maxVersions: String(KEEP) } });
  console.log(`Hosting keeps the newest ${data.maxVersions} releases.`);
} catch (error) {
  const message = error.response?.data?.error?.message || error.message;
  console.log(`::warning title=Release retention::Could not set Hosting to keep ${KEEP} releases (${message}). Set it in the Firebase Console: Hosting → Release storage settings.`);
}
