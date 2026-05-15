# TM Hub Companion

Userscript that injects TM Hub faction intel directly into torn.com pages.

Phase 1 ships **war-scoped OFF-LIMITS badges** on enemy profile and attack
pages, with a confirmation modal that prevents accidentally breaking a
med-out / dip agreement set by a faction member.

## Local development

```bash
cd extension
npm install
npm run typecheck         # static type check
npm run build             # → dist/tm-hub-companion.user.js
npm run build:watch       # rebuild on save
```

Build emits a single `dist/tm-hub-companion.user.js` with a Tampermonkey
metadata banner. Drop the file into Tampermonkey via "Create a new script
→ paste" and save, or load via "File → Local file" depending on your
extension.

## How it integrates

1. User installs Tampermonkey (Chrome / Firefox / Edge / Safari) or Torn PDA
2. Installs this userscript from `https://hub.tri.ovh/companion.user.js`
3. First load on torn.com shows a "Connect to TM Hub" banner
4. Banner links to `https://hub.tri.ovh/extension-auth` — that page mints
   a 90-day extension JWT and posts it back via `window.opener.postMessage`
5. Userscript stores token in `GM_setValue`, fetches `/api/wars/current` +
   `/api/war-off-limits/{war_id}` and renders OFF-LIMITS UI on relevant
   torn.com pages

Backend pieces:
- `POST /api/extension/issue-token` — mints the long-lived token
- `GET /api/wars/current` — lightweight current-war lookup
- `GET /api/war-off-limits/{war_id}` — flagged players

## Permissions / TOS

The userscript talks **only** to `hub.tri.ovh`. It never calls the Torn API
directly — TM Hub pools faction API keys server-side and stays under Torn's
100 req/min limit. Faction war extensions are explicitly allowed by Torn
TOS.

## Promote to MV3 extension (Phase 3)

The same source can be packaged as a Chrome / Firefox extension when
ready — content script entrypoint stays identical, we add manifest.json
plus options/popup pages. Defer until userscript adoption proves value.
