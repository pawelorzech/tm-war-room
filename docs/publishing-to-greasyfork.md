# Publishing TM Hub Companion to Greasy Fork

Greasy Fork is the canonical userscript host. Tampermonkey trusts Greasy Fork
natively, so installs from there **bypass the Chrome 130+ "Developer Mode
required" prompt** that has been blocking new TM Hub members. This is the
single biggest install-funnel fix available — one-time setup, then every push
to master auto-syncs.

## One-time setup (~5 minutes)

### 1. Create a Greasy Fork account

1. Open https://greasyfork.org/users/sign_up
2. Sign up with GitHub OAuth (recommended — keeps the publisher identity
   linked to the same account as the source repo).
3. Confirm the email.

### 2. Post the script

1. Click **Post a script you wrote** (top right) → https://greasyfork.org/scripts/new
2. **Source code field:** leave empty for now (we will switch to remote sync in
   step 3).
3. **Sync URL:** paste `https://hub.tri.ovh/companion.user.js`
4. Pick a license (MIT is the existing repo license — pick the same).
5. Tags: `torn`, `the-masters`, `faction`, `companion`.
6. Submit.

Greasy Fork validates that the URL serves a valid `// ==UserScript==` header
(it does — verified with `curl -I https://hub.tri.ovh/companion.user.js`
returning `content-type: application/javascript` and the script starting with
the UserScript banner).

### 3. Enable automatic sync

1. On the published script page, click **Administration** → **Sync from URL**.
2. Confirm the source URL is `https://hub.tri.ovh/companion.user.js`.
3. Set sync frequency to **every hour** (or the highest GF allows).
4. Save.

From now on, every time we ship a new Companion version (the `@version` field
in the userscript header changes), Greasy Fork picks it up within an hour and
notifies installed Tampermonkey clients on their next 24h check.

### 4. Wire the URL into the install page

The install page already has a placeholder constant:

```ts
// frontend/src/app/install/page.tsx
const GREASYFORK_URL = '';
```

Replace the empty string with the published script URL, e.g.:

```ts
const GREASYFORK_URL = 'https://greasyfork.org/scripts/XXXXXX-tm-hub-companion';
```

Commit, push to master, and the install page automatically promotes Greasy
Fork to the recommended path (with a green primary card above the Tampermonkey
fallback). When `GREASYFORK_URL` is empty the card is hidden, so it is safe to
ship with the placeholder in place.

## Why this matters

| Install path                                  | What the user sees                                  |
| --------------------------------------------- | --------------------------------------------------- |
| Direct link to `hub.tri.ovh/companion.user.js`| "Tampermonkey cannot install scripts from this website" on Chrome 130+ without Developer Mode |
| Manual paste into Tampermonkey Utilities      | Works — but 3 extra clicks and copy/paste          |
| Greasy Fork install button                    | 1 click → Tampermonkey install prompt → done       |

Greasy Fork is the only path that gives new members a frictionless 1-click
install on stock Chrome.

## What is *not* covered by this

- **Safari** still needs the paid Tampermonkey Safari extension, or Torn PDA.
- **iOS / iPadOS** has no userscript support in any browser — Torn PDA only.
- **Firefox / Edge** already work with the direct link, but Greasy Fork is
  still the smoother UX (it gives an updates page, reviews, install count).

## Ongoing maintenance

- Every Companion release: nothing to do. Greasy Fork polls
  `hub.tri.ovh/companion.user.js` and updates the listing automatically.
- If we ever rename the script's `@name` field or change the namespace, Greasy
  Fork may reject the sync — at that point we have to update the listing
  metadata to match.
- Greasy Fork reviews are public. If a user files a report, it shows up on the
  script's Admin tab — worth checking once a month.
