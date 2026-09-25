# ACS Student Chapter, GSTU

Static chapter website for Firebase Spark. Main site: https://acs-gstu.web.app/

## Build and preview

Use Node.js 24. No npm dependencies are needed to build.

```sh
npm run build
npm test
npm run preview
```

Open http://127.0.0.1:4173/. Edit `src/pages`, `src/partials`, `css/site.css` and the modules in `js`. `public`, root HTML pages and hashed stylesheets are generated; the build recreates the deployment directory. Fonts and active browser libraries are bundled with their licenses.

## Editing and permissions

Sign in with Google at `/admin.html`. The verified account `muhammadshamsularefin01@gmail.com` is the permanent super-admin. It can assign or disable access by email, manage executive members and rosters, homepage images, membership information, all events and certificate categories, and view activity logs.

Outreach editors can add new events and issue participant certificates. Chapter administrators can add events and issue all categories except executive-service recognition. Super-admins can edit existing events, executive rosters, editor access and revoke certificates. Outreach and chapter administrators can also update homepage images and membership/renewal information. Additional super-admins can be assigned; the permanent owner remains protected. Firestore rules enforce these restrictions. Audit entries use server timestamps and are immutable through the application. Old UID-based grants are replaced by email-based grants; assign existing editors again in the access panel.

The super-admin's first login upgrades the existing content document to role-aware storage without discarding published content. Browser drafts are separate from published data: save forms, review, then publish. Export backups before clearing browser storage. Open upcoming events are highlighted automatically on Home. Add up to five hosted image paths or HTTPS URLs to the homepage image list.

## Certificates

Enter one recipient directly, or import participant lists as Excel, CSV or JSON. Preview the certificate, confirm the details, then Save and issue certificates. A recovery copy is kept in this browser before issuance; downloading a backup JSON is optional. Issued records show individual shareable download links. Keep batch exports private. Retries skip identical issued records; conflicting IDs are rejected. Batches are committed in groups of 40, so an interrupted batch can be resumed using the exported IDs.

Categories include participant, champion, runner-up, second-runner-up, instructor, teacher, guest, delegate, organization, institution, executive and achievement. The participant template retains the original blue ACS header and pointed QR ribbon. Competition awards use that layout with prominent gold/silver/bronze placement badges, without an outer frame. Formal recognition uses the supplied executive SVG artwork with dynamically rendered names and service details. Every issued certificate renders its own name, event, issue date, credential ID and scannable verification QR. Executive recognition includes a fiscal-year/service-term field and is restricted to the super-admin. Advisor and Co Advisor names and reproduced signatures follow the supplied chapter references.

Each QR encodes the certificate's unique credential URL. Scanning opens the online status record; it does not invent or independently authenticate an unissued certificate. Preview PDFs are marked SAMPLE. The Certificate Center verifies new issued records and preserves existing certificate IDs and `verify.html` links. Revoked records display their status. PDF generation runs in the visitor's browser. The database does not allow visitors to list participant records.

## Deployment and collaboration

See [UPDATE-GUIDE.md](UPDATE-GUIDE.md) for everyday editing and [PROJECT-BRIEF.md](PROJECT-BRIEF.md) for the consolidated requirements. See [DEPLOYMENT.md](DEPLOYMENT.md) for automatic GitHub deployment, developer access, backups and rollback. The repository must never contain private spreadsheets, credential exports, secrets or service-account keys. `scripts/package-source.py` produces a clean source ZIP; `scripts/package-deploy.py` produces an offline Hosting bundle after building.

The website uses Firebase Hosting, Authentication and Firestore. It requires no paid Cloud Functions, App Hosting or Cloud Storage. Free-tier quotas still apply. Image files can be added to `images/` through GitHub; event registration uses links to chapter-approved external forms.

## Checks

`npm test` runs model, transaction and generated-page checks. Browser scripts in `scripts/check-*.cjs` use Playwright and a running local preview; they use mocked database responses and never issue production certificates. `scripts/check-firestore-rules.mjs` must run only with a Firestore emulator and tests permissions, immutable audits, category restrictions and batch issuance. Rules changes are reviewed and deployed separately from Hosting.

## Import an annual member roster

Sign in as the super-admin. In People & annual rosters, select General / premium roster, the year, and membership tier. Download the member template, fill Members Name and Membership ID, then upload it. Check the preview and click Add these members to changes. Finally click Publish website. Role and photo fields apply only to executive/founding records. Membership IDs retain leading zeroes when stored as spreadsheet text, and are stored in the private roster document, not on the public Team page.

Live content loads automatically after sign-in. Save each edited form, then click Publish website. Backups and saved drafts are optional recovery tools. A publication conflict requires reloading live content and reapplying your changes. Exported backups contain private IDs: do not commit them to GitHub.
