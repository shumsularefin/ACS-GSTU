# Website ownership and deployment

Main website: https://acs-gstu.web.app/
Repository: https://github.com/shumsularefin/ACS-GSTU

## Everyday editing

Use `/admin.html` to edit events, committees, public rosters, membership information and certificate batches. Sign in with an authorized Google account. Save form changes, review, and publish. Published content and issued certificates are stored in Firestore; a GitHub deployment does not overwrite that database.

The `firebaseapp.com` address serves the same site; `web.app` is the public canonical address. Sign in with Google uses a popup. Allow popups for the site. Browser drafts and login sessions are separate per domain; export drafts before switching domains. Never put credentials into source files.

To invite chapter editors, sign in as the super-admin, open Editor access & activity, enter their Google email, choose a role and save. They can then use Sign in with Google. Disable access in the same form when their term ends.

To invite developers, open GitHub repository Settings > Collaborators > Add people. Give access only to trusted developers; changes pushed to main publish the website. Prefer feature branches and pull requests, review changes before merging, and configure branch protection if available for the repository. Developer repository access and chapter-editor access are separate. GitHub collaborators do not need Firebase console access for the configured Hosting deployment.

## Change the website

Use Node 24. No dependency installation is required to build this static site.

```sh
npm run build
npm test
npm run preview
```

Edit `src/pages/`, `src/partials/`, `css/site.css`, and the active modules in `js/`. `data/` contains the initial public content. Images and fonts are bundled locally. `public/`, root HTML pages and hashed CSS are generated. The build recreates `public/` and excludes old deployment files.

Push source changes to `main`. GitHub Actions builds and tests the site, then deploys Hosting to Firebase project `acs-gstu`. Pull requests run checks only. Failed tests prevent deployment. See the repository's Actions tab for the result. The deployment uses short-lived Google credentials scoped to this repository's main branch; no service-account key is stored in GitHub.

Firestore rules are intentionally not changed by website pushes. Review and separately test permission changes before deploying them. The Hosting deployment account has no Firestore editing permission.

## Free-tier operation

This is Firebase Hosting, Authentication and Firestore, not App Hosting. It uses no Cloud Functions or Cloud Storage. PDF generation and Excel imports run in the browser. Free-tier quotas still apply. Registration uses external form links supplied by chapter editors.

## Backup and recovery

Keep source history in GitHub. Export dashboard content backups and certificate batch JSON before issuing; retain these privately, outside this public repository. The source ZIP contains no private participant workbook or database export. Existing credential links and `verify.html` remain supported.

For a Hosting rollback, use Firebase Console > Hosting > release history > Roll back. This restores website files only, not Firestore content. To restore public content, import an exported dashboard backup and publish it. Revoked certificates cannot be silently reissued with the same credential ID.

## One-time GitHub trust setup

The workflow expects pool `github-deploy`, provider `github-repository`, and service account `github-hosting@acs-gstu.iam.gserviceaccount.com` in project number `492197583844`. The provider must restrict access to repository ID `1383031064`, repository `shumsularefin/ACS-GSTU`, and ref `refs/heads/main`. Grant only Firebase Hosting Admin and Service Usage Consumer to the deployment account. Grant Workload Identity User to the matching repository principal.

Reference: https://github.com/google-github-actions/auth and https://firebase.google.com/docs/hosting/github-integration

## Import an annual member roster

Sign in as the super-admin. In People & annual rosters, select General / premium roster, the year, and membership tier. Download the member template, fill Members Name and Membership ID, then upload it. Check the preview and click Add these members to changes. Finally click Publish website. Role and photo fields apply only to executive/founding records. Membership IDs retain leading zeroes when stored as spreadsheet text, and are stored in the private roster document, not on the public Team page.

Live content loads automatically after sign-in. Save each edited form, then click Publish website. Backups and saved drafts are optional recovery tools. A publication conflict requires reloading live content and reapplying your changes. Exported backups contain private IDs: do not commit them to GitHub.
