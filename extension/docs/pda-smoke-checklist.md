# Torn PDA — Companion Smoke Checklist

Run this checklist after every Companion release that ships changes to: boot sequence, UI overlays, chat dock, notification toasts, settings popover, GM_* storage shape, or any `inject/*` module. Mobile users on PDA are likely a majority of the install base; PDA has no DevTools, so manual smoke is the only realistic regression net we have until automated Playwright PDA support lands in Sprint 2+.

Mark each row pass/fail in the table at the bottom and date it. File a regression issue if any row fails.

## Test device matrix

Pick at least one of each at every release.

| OS | App | Notes |
|----|-----|-------|
| iOS 17+ | Torn PDA from App Store | iPhone or iPad |
| Android 13+ | Torn PDA from Play Store | Pixel / Samsung |

If you only have one device, run the checklist on that and note "iOS only" / "Android only" — partial coverage is better than none.

## Pre-flight

- [ ] Latest Companion installed in PDA (Greasy Fork sync done — check version in status chip).
- [ ] Logged into TM Hub at `hub.tri.ovh` on the device.
- [ ] Token connected via `hub.tri.ovh/extension-auth` callback (status chip shows green/connected).
- [ ] Tab visibility behaviour: switching out of PDA and back must NOT crash the userscript.

## Page-by-page checklist (5 baseline pages)

### 1. Profile (`www.torn.com/profiles.php?XID=<friend>`)

- [ ] Status chip renders bottom-right within 2 s of page paint.
- [ ] If profile is a known enemy/mate, the OFF-LIMITS / friendly badge appears next to the player name.
- [ ] Faction intel card (spy estimates, targets, claims) renders below the profile header.
- [ ] No layout shift after card paints — CLS visually under 0.1.
- [ ] No `console.error` visible if you have a remote console shim active.

### 2. Attack (`www.torn.com/page.php?sid=attack&user2ID=<enemy>`)

- [ ] OFF-LIMITS confirmation modal appears BEFORE the attack proceeds if target is flagged.
- [ ] FF chip and flight pill render where applicable.
- [ ] Modal "Cancel" closes cleanly; "Continue" passes through to the original attack flow.

### 3. Faction roster (`www.torn.com/factions.php?step=profile&ID=11559`)

- [ ] Row tinting by threat tier applied to all visible members within 3 s.
- [ ] Heavy DOM page — no jank scrolling.
- [ ] Companion does not double-bind on the table if the page re-renders (e.g. you click sort).

### 4. Market (`www.torn.com/imarket.php`)

- [ ] Fair-price pills appear on listings.
- [ ] No duplicate pills if you switch item categories rapidly.

### 5. Bounties (`www.torn.com/bounties.php`)

- [ ] Bounties list loads with threat coloring within 3 s.
- [ ] No flashing / re-paint loop.

## Companion-wide checks (do once per release across the device matrix)

- [ ] Chat dock (bottom-right) opens, sends a message, receives reply, closes cleanly.
- [ ] Notification toast appears for a new TM Hub inbox message.
- [ ] Status chip → Settings popover opens. Toggling "Show TM Hub pins overlay" off hides the pins panel within 1 s.
- [ ] Switching apps (background PDA, foreground a different app, come back) — pollers must NOT spawn duplicates.
- [ ] Leaving PDA in background for 10 min: when you return, status chip is still green and message poll resumes within one cadence.

## Known-PDA-specific gotchas to spot-check

- [ ] `GM_xmlhttpRequest` path used (no CORS errors). The fallback `fetch()` path on PDA fails silently in some versions.
- [ ] Notification permission prompt does NOT spam after first install (we ask only on the first explicit Connect action).
- [ ] `document.visibilityState` correctly returns "hidden" when the app is backgrounded — required for the polling visibility gate landed in Sprint 1.

## Regression filing

If anything fails, capture:

1. PDA version (Settings → About).
2. Companion version (status chip).
3. Page URL.
4. What you did (one line).
5. What broke (one line).
6. Screenshot if possible.

Open an issue in the repo with `pda-regression` label, or DM `@Bombel` in TM if it blocks the release.

## Sign-off log

| Date | Release version | Tester | iOS pass? | Android pass? | Notes / regressions |
|------|------------------|--------|-----------|---------------|--------------------|
| YYYY-MM-DD | 0.27.x | @____ | ☐ | ☐ | |
