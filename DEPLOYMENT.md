# Deployment, access and maintenance

Main website: https://acs-gstu.web.app/ (https://acs-gstu.firebaseapp.com serves the same site; pages point search engines to web.app).
Repository: https://github.com/shumsularefin/ACS-GSTU

## What happens automatically

| Event | Workflow | Result |
| --- | --- | --- |
| Pull request to `main` | Website checks | Unit, site, security-rules and end-to-end tests. Nothing is deployed. |
| Push to `main` | Website checks → deploy | After all checks pass, the site is built from the published Firestore content and deployed to Hosting. |
| Every 15 minutes | Freshness → deploy | When editors published something since the last deploy, the site is rebuilt and redeployed (no code checks; the code has not changed). |
| Manual (Actions tab) | Deploy Firestore security rules | Runs the rules tests, waits for approval, then deploys `firestore.rules` only. |

Hosting deployment uses short-lived Google credentials (Workload Identity Federation). No key is stored in GitHub. The Hosting account cannot change Firestore rules or data, and the rules account cannot change Hosting.

GitHub pauses scheduled workflows in public repositories after 60 days without commits. If the site stops picking up published changes for search engines, open the Actions tab and re-enable the workflow. Visitors still see published changes right away regardless.

## One-time setup for the rules workflow

These steps need your Google Cloud and GitHub owner accounts.

1. **Service account for rules.** In Google Cloud Console → IAM → Service accounts (project `acs-gstu`), create `github-rules`. Grant it **Firebase Rules Admin** (`roles/firebaserules.admin`) and **Service Usage Consumer** only.
2. **Let the repository use it.** On the `github-rules` service account → Permissions, grant **Workload Identity User** to the same repository principal already used for `github-hosting`:
   `principalSet://iam.googleapis.com/projects/492197583844/locations/global/workloadIdentityPools/github-deploy/attribute.repository/shumsularefin/ACS-GSTU`
   (copy the exact member string from the existing `github-hosting` binding).
3. **Approval gate.** In GitHub → Settings → Environments, create `firestore-rules`. Add yourself as a required reviewer and allow only the `main` branch.
4. Recommended: under Settings → Branches, protect `main`: require pull requests and the "check" status.

## Rolling out this version (one time, in this order)

1. Merge the pull request. The site deploys and keeps working on the current data.
2. Deploy the new rules: Actions → **Deploy Firestore security rules** → Run workflow → approve. (Before the rules workflow is set up, an owner can run `npx firebase deploy --only firestore:rules --project acs-gstu` locally instead.)
   From this moment, public certificate records that still contain a membership ID stop being publicly readable. That closes the privacy gap. Their verification pages say "being moved" until step 4.
3. The super-admin signs in at `/admin.html` and clicks **Upgrade storage now**. This copies events, pages, teams and private roster IDs into the new layout. The old record is kept unchanged as a backup.
4. In **Certificates → Issued records**, click **Update N certificates**. This moves membership IDs from older certificates into private storage. Every credential ID, link and QR code keeps working.
5. Within 15 minutes the scheduled build picks up the new layout (or run the website workflow by hand).

## Editor access

The super-admin manages access in **Manage editors & activity**. Enter a Google account email, choose a role, and save. Disable or remove access when a term ends; the activity log keeps the history.

| Role | Can do |
| --- | --- |
| Super-admin | Everything: content, committees and rosters, all certificates, revocation, Certificate Center list, editors, activity log, backups |
| Chapter administrator | Events (any), annual reports, homepage images, membership information, certificates except executive recognition |
| Outreach editor | Homepage images, membership information, add events and edit their own, annual reports, participant certificates |

`muhammadshamsularefin01@gmail.com` is the permanent super-admin and cannot be changed or removed. Only Google sign-in is accepted; the rules check this on the server.

## Developer access

GitHub collaborators are separate from dashboard editors. Add developers in GitHub → Settings → Collaborators. Ask them to work on branches and open pull requests; a merge to `main` deploys.

## Free-tier limits (Spark plan)

Firestore allows 50,000 reads and 20,000 writes per day for free. A visitor usually costs one read every five minutes (the freshness check). Uploaded images are baked into the site, so they cost nothing after the next build. Each uploaded image is stored at up to about 280 KB.

## Backups and rollback

- Content backups: Chapter Editor → Backups → Download backup. This includes private membership IDs, so keep it private and never commit it.
- Restoring a backup loads it into drafts for review; nothing goes live until it is published.
- Hosting rollback: Firebase Console → Hosting → Release history → Roll back. This restores the website files only, not Firestore content.
- Certificates are never deleted. Revocation is permanent and shown on the verification page.
