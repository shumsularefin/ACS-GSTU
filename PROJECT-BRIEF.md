# Consolidated website project prompt

This is a cleaned, consolidated brief of the requested final website, not a verbatim transcript. Superseded requests and troubleshooting messages have been omitted. Use it to review the delivered project.

Build and maintain the ACS Student Chapter, Gopalganj Science and Technology University website as a complete, responsive website on Firebase's free Spark plan. Use https://acs-gstu.web.app as the main address, with working navigation from the firebaseapp.com alias. Keep the established layout, Poppins typography and character of the original site, while applying the later requested ACS branding changes. Use modern semantic HTML, shared header/footer templates, optimized images and lightweight JavaScript. Avoid blocking preloaders, unnecessary animation libraries, flickering filters, overlapping text and avoidable page reloads.

## Identity and public pages

Use the supplied American_Chemical_Society_logo_2026.svg for the main navigation logo. Use the official full ACS GSTU chapter lockup in the footer, aligned with the footer heading and text. Use the separate university logo on certificates. Draw the primary palette and visual direction from the ACS Strategic Plan 2025–2029 poster: ACS blues/indigo with suitable aqua accents. Preserve readable contrast and a consistent visual theme across pages.

Use the supplied chemistry texture.svg as a faint watermark across white content areas on Home, About, Events, Team and the Certificate Center. The About story title must sit clearly outside its cover image without overlap. Make the homepage hero images editable in the dashboard, with automatic rotation plus Previous, Next and Pause/Play controls. Respect reduced-motion preferences. Keep slides stable while images load.

Remove the redundant recent-work/activity section from Home because the Events page serves that purpose. Include membership benefits, eligibility, renewal and application information on Home instead of a separate membership page. Highlight open upcoming events on Home and link each to its detail page. Registration links are optional; do not prevent an event from saving when no registration link exists. Provide appropriate calendar links for events.

## Events

Provide categories such as Outreach, Development, Sustainability and Community at the top. Place year navigation below the event grid, using previous/next and year links. Display events as square image cards with title and date on hover, with accessible equivalents for touch and keyboard users. Cards open a dedicated event detail page. Category changes must not cause screen flashing, page reloads or unstable animations. Preserve event links and show sensible empty states.

## Team and annual rosters

Show founding members first. Provide annual executive committees with previous/next and year navigation. Each year has a button or expandable section for its general and premium members. Clearly label years without supplied data; do not invent real members.

In the dashboard, separate committee/founder records from general/premium roster records. Committee/founder records have a name, role and optional photo. Roster records have a member name and membership ID, with year and General/Premium tier selected in the dashboard. Roster records have no role or photo field. Provide a dedicated XLSX/XLS/CSV member upload inside the roster section, a two-column template (Members Name, Membership ID), a readable preview and a simple save/publish action. Keep leading zeroes in IDs. Updates match existing membership IDs. Public rosters display names and tiers, while membership IDs remain protected.

## Dashboard and access

Use Google sign-in only. The verified account muhammadshamsularefin01@gmail.com is the permanent owner/super-admin. Never introduce a public fixed password or a client-only authentication bypass. Unauthorized visitors may view public pages but cannot edit content, issue credentials or read private rosters/logs. Enforce permissions in Firebase security rules, not just by hiding controls.

Super-admins can manage website content, executive committees, annual rosters, certificates and editor access. The owner can assign another verified Google account to a supported role, including Super-admin, change or disable access, and remove an editor grant. Keep the permanent owner protected from accidental removal. Outreach editors can add new events, issue participant certificates, and edit homepage feature images and homepage membership/renewal information. Administrative records and access management remain restricted to super-admins. Retain the supported intermediate chapter-administrator role with its documented certificate permissions.

Provide a super-admin activity log recording who changed what and when, using server timestamps. Preserve activity history when an editor grant is removed. Include delete/remove controls for editable records where appropriate, with confirmation. Preserve credential history through revocation instead of silently erasing issued certificates.

Use consistent spacing for headings, forms, tables and sections. Make the dashboard easy for non-developers: load published content automatically after sign-in, save section changes, and provide one clear Publish website action for administrative drafts. Show immediate visible success/error feedback, explain incomplete required fields and protect against overwriting a newer publication. Put advanced imports and backup tools behind clearly labeled expandable sections. Allow images to be uploaded directly from a device, with automatic optimization and an image library; users should not need GitHub to upload a photo.

## Digital certificates

Replace paper distribution with downloadable digital certificates. The admin selects or enters an event title and date, then either enters one recipient manually or imports a participant list from Excel/CSV/JSON. Individual executive-recognition certificates must not require a spreadsheet. Support participant, champion, runner-up, second-runner-up, instructor, teacher, guest, delegate, organization/institution, executive service and general achievement categories. Executive certificates include a fiscal year/service term and optional office held.

Use a universal premium, restrained ACS certificate design based on the supplied ACS poster and Illustrator samples, with Poppins typography. Use the official chapter logo at a balanced size, the separate GSTU logo, a faint chemistry texture covering the entire body down to the footer, and the supplied Advisor/Co Advisor signatures. Dr. Md. Kamruzzaman is Professor and Advisor; S. M. Fazle Rabbi is Co Advisor. Use gold/silver/bronze accents for competition placements and an understated formal treatment for academic, guest, institutional and executive recognition, retaining the same ACS identity.

Use the supplied pointed verification-ribbon concept containing the status heading, real QR code, scan instruction, issue date and unique credential ID. Avoid the rejected cartoon-style seal and unnecessary border around the QR itself. Preview certificates must be clearly marked SAMPLE/not issued. Every issued certificate has a unique stable ID and its own QR-linked verification URL. A QR is not proof unless the corresponding record was issued and remains valid.

Rename the public entry point Certificate Center. Members can select an event and enter their ACS membership ID to retrieve issued certificates, or verify with a credential ID. Download the verified certificate as a PDF from the website. Preserve working older credential links when compatible with the new system. Prevent public participant-directory listing, allow authorized revocation, and show revoked/not-found states clearly. Provide a clearly labeled final Save and issue certificates action, recovery backups and shareable credential links. Repeated submissions must not duplicate or overwrite conflicting issued IDs.

## Hosting, collaboration and handover

Keep the implementation compatible with Firebase Spark, without requiring paid Cloud Functions or Cloud Storage. Explain any applicable free-tier limits. Keep the code in https://github.com/shumsularefin/ACS-GSTU and deploy Firebase Hosting automatically after successful checks on pushes to main. Use short-lived GitHub-to-Google credentials rather than committing service-account keys. Deploy permission rules separately with explicit review.

Provide a clean source package, setup and deployment documentation, a practical update guide for editors and developers, and this consolidated brief for verification. Explain how to grant dashboard access and how to invite developers to GitHub separately. Explain the feasibility and prerequisites of automatic Facebook event updates without promising an integration that has not been connected. Test mobile layouts, navigation, saving/publishing, spreadsheet validation, certificates, permission boundaries and the deployment pipeline. Clearly distinguish completed live features from configuration that still needs to be applied.
