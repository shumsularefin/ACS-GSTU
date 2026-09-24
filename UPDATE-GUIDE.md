# Updating the ACS GSTU website

## Everyday editing

Open https://acs-gstu.web.app/admin.html and choose Sign in with Google. Use an account granted access by a super-admin. The latest published records load automatically.

- **New event:** click New event, enter a permanent lowercase Event ID, title, date, category and description. Upload a thumbnail from your device if desired. The registration URL is optional. Super-admins click Save event changes, then Publish website. Outreach/administrator editors use Publish new event.
- **Homepage images:** upload images from your device or add existing URLs. Each line is one slide, up to five. Remove a line to remove a slide. Super-admins save the section then Publish website; other editors save the section directly to the live site. Visitors get automatic rotation and Pause/Play controls.
- **Membership information:** edit the Home page benefits and renewal fields, then save. Super-admins also click Publish website.
- **Annual roster:** select General / premium roster, choose year and tier, upload a spreadsheet with Members Name and Membership ID, inspect the preview, then Add these members to changes and Publish website. Store IDs as text in Excel to preserve leading zeroes. Public names and tiers appear on Team; IDs remain private.
- **Committee/founder:** select the record type and year, enter name, role and optional photo, then save and publish. Edit/Remove actions are beside existing records.

A notification confirms each action. If a form does not save, the notification identifies the invalid field. Saving an administrative draft is separate from publishing it. If another editor published first, export your changes, Reload live website, and reapply your changes.

## Issue one certificate

1. In Digital certificates, select One recipient.
2. Enter the recipient name, optional membership ID and designation. Select a saved event, or enter an event/service title and date.
3. Choose the category. For executive recognition, enter the fiscal year/service term and optional executive role.
4. Click Preview certificates and check the spelling, date, category and signatories.
5. Check the confirmation and click Save and issue certificates. A recovery JSON downloads automatically before issuing. Keep it privately.
6. Download credential links and share the relevant link. The recipient opens that link or uses Certificate Center, then downloads the issued PDF.

No separate Publish website action is needed for certificates. Download sample PDF creates a marked preview, not a verified certificate. To issue a batch, choose Upload a participant list and upload the Excel/CSV/JSON list instead. If interrupted, reload the recovery JSON and retry: the existing credential IDs are preserved. Use Look up or revoke a certificate to invalidate an issued record; revocation keeps its history and prevents a valid download.

## Editor access

Super-admins use Editor access & activity to add an email, select the role, and Save editor access. The person signs in with that Google account. Edit access changes the role or disables the grant; Delete access removes it. Neither deletes their Google account or activity history. The permanent owner is protected. Only give Super-admin to people trusted to manage chapter administration and other editors.

## Images and free hosting

The upload control compresses JPG, PNG and WebP images and stores small image records in Firestore, avoiding paid Cloud Storage. Uploaded images are public website assets; do not upload private documents. The image library can reuse uploads or delete unused ones. Remove an image from published content before deleting it. Firestore storage, read and transfer quotas still apply; monitor Firebase Usage as traffic grows. Original full-resolution files should be kept separately.

## Code and design changes

Invite developers in GitHub repository Settings → Collaborators. This is separate from dashboard access. A developer clones https://github.com/shumsularefin/ACS-GSTU, uses Node.js 24, runs npm run build and npm test, and previews with npm run preview. Edit src/pages, src/partials, css/site.css and js modules. Do not edit generated public files directly. Push reviewed changes to main; GitHub Actions runs checks and deploys Hosting. Check the Actions tab for the green deployment result. Do not commit member spreadsheets, private backups or credentials.

Dashboard content lives in Firestore and is not replaced by a normal Hosting deployment. Security-rule changes are reviewed and deployed separately. Keep private content backups and certificate batch exports. Use Firebase Hosting release history to roll back a design/code release if necessary; that does not roll back database edits.

## Facebook

The site can link to Facebook event posts. Automatic Facebook-to-site publishing is not connected. A reliable integration requires chapter Page access, the applicable Meta API permissions and a securely managed token/refresh process; do not place a Page access token in public JavaScript. Continue entering event details in the dashboard unless a separate authorized integration is set up.
