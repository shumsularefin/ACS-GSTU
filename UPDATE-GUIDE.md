# Chapter Editor guide

Open https://acs-gstu.web.app/admin.html and choose **Sign in with Google** with the account the super-admin added. Allow pop-ups if the Google window does not appear.

## The two steps

1. **Edit** a section. Your changes are saved as a **draft in this browser** as you type ("Draft saved 12:03 · not live yet").
2. **Publish** that section. Each section publishes on its own, so one unfinished form never blocks another.

The orange **unpublished drafts** button at the top lists every draft by name, with Open, Discard and Publish. **Publish all** publishes them one by one. If one has a problem, its section opens with the message shown and the others still go live.

Visitors see published changes immediately. Search engines and link previews follow within about 15 minutes.

If someone else published the same section while you were editing, you are asked whether to keep your version or load theirs.

## Events

- **Events → + New event.** Give it a title, category, start date, and an **end date** for events that run over several days. Times are optional and use Bangladesh time.
- The **registration link is optional.** Set Registration to **Open** to show the "Explore new event & register" button on the homepage. It disappears by itself after the event ends.
- **Upload from device** adds a photo; it is resized and optimized automatically. **Choose uploaded image** reuses one. You never type file paths.
- **Preview** shows the event page before publishing.
- Outreach editors can edit the events they added. Only a super-admin can delete events.
- Super-admins can import many events from a spreadsheet: each becomes a draft to review and publish.

## Homepage images and membership

- **Homepage images:** up to five slides. Reorder them with ↑ ↓, remove, upload or choose from the library, then Publish.
- **Membership information:** the Join & renew section on the homepage. Put one benefit per line.

## Team & rosters (super-admin)

- Choose **Founding members** or a year, or **+ Add year**.
- **Executive committee:** add members with a name, role and photo, reorder them, then Publish.
- **General & premium roster:** add members one at a time, or **Import members from a spreadsheet**:
  1. Download the template. It has two columns: Member Name and Membership ID. Type IDs as text to keep leading zeroes.
  2. Choose the file, then the worksheet if there is more than one, and the tier.
  3. Review: the wizard tells you how many members will be added and which will be updated (matched by membership ID).
  4. **Add to draft**, then Publish.
- Membership IDs are private. The Team page shows names and tiers only.

## Certificates

**Issue certificates** walks you through four steps:

1. **Category:** participation, champion, first or second runner-up, achievement, formal recognition (instructor, teacher, guest, delegate, institution, organization), or executive service. Your role decides which are available.
2. **Details:** only the fields that apply. Event certificates ask for the event. **Executive service asks for the fiscal year** (and optionally the office) and needs no event or membership ID.
3. **Recipients:** one person, or a spreadsheet with Name and optional Membership ID, Designation and Achievement (download the template).
4. **Review & issue:** check the table and the preview, tick the confirmation, then **Issue**.

When it finishes you get each recipient's link, a Copy link button, a PDF download, and a CSV of all links. Recipients with a membership ID can also find their certificate in the **Certificate Center** by choosing the event and entering their ID. Every certificate has its own credential ID and a QR code that opens its verification page.

- **Find or revoke:** look up a credential ID. Super-admins can revoke; the verification page then says "revoked".
- **Certificate Center list** (super-admin): hide test or temporary events from the public list.
- **Issued records** (super-admin): every certificate issued, with its status.

## Your account, editors and backups

- **Your account & sign-in:** shows your role and exactly what you can do. Signing out keeps your drafts in this browser.
- **Manage editors & activity** (super-admin): add, change, disable or remove editors, and read the activity log: who changed what and when, with server times.
- **Backups** (super-admin): download all published content as JSON or Excel. It includes private IDs, so keep it safe. Restoring a backup loads it into drafts for review.
