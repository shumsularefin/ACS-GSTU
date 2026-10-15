# ACS Student Chapter, GSTU

The chapter website (https://acs-gstu.web.app) and its Chapter Editor dashboard (`/admin.html`).
It runs on the free Firebase Spark plan: static Hosting, Google sign-in and Firestore. There are no Cloud Functions and no Cloud Storage.

- Editors: see [UPDATE-GUIDE.md](UPDATE-GUIDE.md).
- Deployment, access and one-time setup: see [DEPLOYMENT.md](DEPLOYMENT.md).
- Original requirements: see [PROJECT-BRIEF.md](PROJECT-BRIEF.md).

## How it fits together

```
Chapter Editor (admin.html) ──writes──▶ Firestore (one document per section, audited)
                                              │
            GitHub Actions (push to main, or every 15 min when content changed)
                                              │ reads published content (public API, no keys)
                                              ▼
                                    static pages in public/ ──▶ Firebase Hosting
                                              ▲
Visitors ── load baked pages, then one small read of site/meta; newer content is swapped in at once
```

- **Firestore is the single source of truth for content.** `data/seed/*.json` only seeds an empty project and feeds the tests.
- **Firestore layout:** one document per area: `events/{id}`, `pages/homepage`, `pages/membership`, `team/{founders|year}`, private `rosterPrivate/{year}`, `certificates/{id}` (public, no membership ID), private `certificatePrivate/{id}`, `certificateLookup/{hash}`, `certificateEvents/{id}`, `siteImages/{id}`, `chapterEditors/{email}`, append-only `auditLogs`. See the header of [firestore.rules](firestore.rules).
- **Static build:** `scripts/build.mjs` bakes the content into `public/`. That includes one page per event (`event-<id>.html`), `activities.html?year=&type=`, `team.html?year=`, and uploaded images as files in `media/`. Old per-year addresses redirect (see `firebase.json`).

## Source layout

| Path | What it is |
| --- | --- |
| `js/lib/` | Shared by the build, public pages and dashboard: content model, renderers, certificate model and drawing, Firestore REST reader |
| `js/public/` | Public page scripts (`site.js` bundle; `certificates.js` for the Certificate Center) |
| `js/admin/` | Chapter Editor: `main.js` (shell, drafts, publishing), `cloud.js` (all Firestore writes), `views/` (one file per section) |
| `src/pages`, `src/partials` | Page bodies and the shared header/footer |
| `css/style.css` | Original theme (unchanged; a test pins it). `css/site.css` holds chapter overrides; `css/admin.css` styles the dashboard |
| `js/vendor/` | pdf-lib, SheetJS, QR code and font libraries, with their licenses |

Source is plain, readable ES modules. esbuild bundles and minifies them into hashed files at build time.

## Commands

Use Node.js 22 or newer. Run `npm ci` once.

```sh
npm run build        # build from Firestore (falls back to the seed when offline)
npm run build:seed   # build from data/seed only
npm run preview      # http://127.0.0.1:4173 with the same redirects and headers as Hosting
npm test             # seed build + unit and site checks
npm run test:rules   # security rules against the Firestore emulator (needs Java 21)
npm run test:e2e     # dashboard and website end to end against the emulators (Playwright)
npm run format       # Prettier
```

`test:rules` drives the real dashboard data layer (`js/admin/cloud.js`) against the real rules for every role. `test:e2e` builds the site for the emulators, signs in test accounts, and runs the full flow. That covers the storage upgrade, multi-day events, Publish all, private rosters, certificate issue, member lookup, QR decoding, PDF download, revocation, outreach limits and phone layouts. CI runs all of them on every pull request.
