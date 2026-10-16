# Connecting News to the Facebook Page

The website's **News** page and the homepage's **Latest news** strip show posts from the chapter's
Facebook Page automatically. Every 15 minutes the GitHub job checks the Page; when there are new,
edited or deleted posts, it rebuilds the site with them, photos included. Editors can hide any post
in the Chapter Editor under **News**.

You set this up **once**. It needs a free Meta developer app and a Page access token, which is saved
as a GitHub secret. The token can only *read* the Page. It never goes into the code, and it never
appears in logs.

You need to be an **admin of the Facebook Page** and an **owner of the GitHub repository**.

---

## 1. Create a Meta developer app

1. Go to <https://developers.facebook.com/> and log in with the Facebook account that manages the
   chapter Page. If asked, register as a developer (free).
2. Open **My Apps → Create app**.
3. When asked what the app is for, choose the option for managing a Page or reading Page content.
   The wording changes over time; "Other", then type **Business**, also works.
4. Name it, for example `ACS GSTU Website`, add your email and create the app.
5. Leave the app in **Development** mode. You don't need App Review, because only you (an app admin
   who also manages the Page) use it.

## 2. Get a Page access token that does not expire

1. Open the **Graph API Explorer**: <https://developers.facebook.com/tools/explorer/>.
2. At the top right, choose your new app under **Meta App**.
3. Under **User or Page**, choose **Get User Access Token**, and tick these permissions:
   - `pages_show_list`
   - `pages_read_engagement`
4. Click **Generate Access Token**. Facebook asks you to log in and choose the Pages to allow.
   **Select the ACS Student Chapter, GSTU Page** and confirm.
5. Make the token long-lived:
   1. Click the **ⓘ** next to the token, then **Open in Access Token Tool**. You can also paste it at
      <https://developers.facebook.com/tools/debug/accesstoken/>.
   2. At the bottom, click **Extend Access Token** and confirm.
   3. Copy the new token. It is a long-lived *user* token, valid for about 60 days.
6. Back in the Graph API Explorer, paste the long-lived token into the **Access Token** box. Run this
   query (GET):

   ```
   me/accounts?fields=id,name,access_token
   ```

7. In the result, find the chapter Page and copy:
   - its **`id`**: the **Page ID**
   - its **`access_token`**: the **Page access token**
8. Check it: paste the Page access token into the
   [Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/). It should say
   **Type: Page** and **Expires: Never**.

Keep the token private. Don't send it in chat or email, and don't put it in any file.

## 3. Save the two values in GitHub

1. Open the repository on GitHub, then **Settings → Secrets and variables → Actions**.
2. Click **New repository secret** twice:

   | Name                  | Value                     |
   | --------------------- | ------------------------- |
   | `FACEBOOK_PAGE_ID`    | the Page ID from step 2.7 |
   | `FACEBOOK_PAGE_TOKEN` | the Page access token     |

## 4. Turn it on

1. In the repository, go to **Actions → Website checks and Firebase deployment → Run workflow**
   (branch `main`).
2. When the run finishes, the latest posts are on <https://acs-gstu.web.app/news.html> and on the
   homepage, and a **News** link appears in the menu.
3. From then on, new posts appear within about 15 minutes.

## Hiding a post

Chapter Editor → **News** → **Hide** next to the post. It disappears from the website straight away.
**Show** brings it back.

## If News stops updating

The Page token stops working if you change your Facebook password, lose admin rights on the Page,
or remove the app's access to the Page. The website then keeps the News it already has. The GitHub
run log shows a line starting with `warning: Facebook posts unavailable`. Repeat step 2, then
replace the `FACEBOOK_PAGE_TOKEN` secret.

Optional: to pin a Graph API version, add a repository secret `FACEBOOK_GRAPH_VERSION`, for example
`v23.0`. Without it, Facebook uses the app's default version.
