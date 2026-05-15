// URL matchers + selector constants for torn.com pages.
//
// Centralised so we update one file when Torn changes their DOM structure.
// Tests in the future could run against torn.com snapshots to detect
// breaking changes — for now we rely on optional chaining and graceful
// fallback (if the anchor is missing, we just skip injection rather than
// throw).

export type PageKind = 'profile' | 'attack' | 'unknown';

export interface PageMatch {
  kind: PageKind;
  player_id: number | null;
}

/**
 * Identify the current torn.com page and extract the target player id.
 *
 * - `/profile.php?XID=123` → profile, player_id=123
 * - `/profiles.php?XID=123` → profile (older URL form)
 * - `/loader.php?sid=attack&user2ID=123` → attack, player_id=123
 */
export function matchPage(url: URL = new URL(window.location.href)): PageMatch {
  const path = url.pathname.toLowerCase();
  if (path === '/profile.php' || path === '/profiles.php') {
    const xid = url.searchParams.get('XID') || url.searchParams.get('xid');
    return { kind: 'profile', player_id: xid ? parseInt(xid, 10) : null };
  }
  if (path === '/loader.php') {
    const sid = url.searchParams.get('sid');
    if (sid === 'attack' || sid === 'getInAttack') {
      const uid = url.searchParams.get('user2ID');
      return { kind: 'attack', player_id: uid ? parseInt(uid, 10) : null };
    }
  }
  return { kind: 'unknown', player_id: null };
}

// Selectors used to anchor our injected UI.
// First match wins; we try each in order.
export const PROFILE_ANCHOR_SELECTORS = [
  '#profileroot',
  '#mainContainer .profile-wrapper',
  '#mainContainer .content-wrapper',
  '#mainContainer',
];

export const ATTACK_BUTTON_SELECTORS = [
  'a[href*="loader.php?sid=attack"]',
  'button[class*="attack"]',
  '#mainContainer button:not([class*="cancel"])',
];

/**
 * Watch for SPA-style URL changes on torn.com.
 *
 * Torn loads some pages (like /loader.php?sid=...) inline without a full
 * navigation. history.pushState / popstate fire, but pages also re-render
 * the main container via XHR — we observe both signals and fire `onChange`
 * with the new URL so the router can re-inject.
 */
export function watchUrlChanges(onChange: (url: URL) => void): () => void {
  let lastHref = window.location.href;
  const fire = () => {
    const href = window.location.href;
    if (href !== lastHref) {
      lastHref = href;
      onChange(new URL(href));
    }
  };

  // Hook history API
  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    const r = origPush.apply(this, args);
    fire();
    return r;
  };
  history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
    const r = origReplace.apply(this, args);
    fire();
    return r;
  };
  window.addEventListener('popstate', fire);

  // Observe DOM mutations as a safety net (Torn occasionally re-renders
  // without touching history).
  const observer = new MutationObserver(fire);
  observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    history.pushState = origPush;
    history.replaceState = origReplace;
    window.removeEventListener('popstate', fire);
    observer.disconnect();
  };
}
