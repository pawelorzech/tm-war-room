// URL matchers + selector constants for torn.com pages.
//
// Centralised so we update one file when Torn changes their DOM structure.
// Tests in the future could run against torn.com snapshots to detect
// breaking changes — for now we rely on optional chaining and graceful
// fallback (if the anchor is missing, we just skip injection rather than
// throw).

export type PageKind = 'profile' | 'attack' | 'bounties' | 'stocks' | 'faction' | 'hospital' | 'armoury' | 'retals' | 'travel' | 'ambient' | 'imarket' | 'unknown';

export interface PageMatch {
  kind: PageKind;
  player_id: number | null;
  faction_id?: number | null;
}

/**
 * Identify the current torn.com page and extract the target player id.
 *
 * - `/profile.php?XID=123` → profile, player_id=123
 * - `/profiles.php?XID=123` → profile (older URL form)
 * - `/page.php?sid=attack&user2ID=123` → attack (current router, post-2026-05)
 * - `/loader.php?sid=attack&user2ID=123` → attack (legacy router, kept for old tabs)
 * - `/factions.php?step=profile&ID=123` → faction, faction_id=123
 */
export function matchPage(url: URL = new URL(window.location.href)): PageMatch {
  const path = url.pathname.toLowerCase();
  if (path === '/profile.php' || path === '/profiles.php') {
    const xid = url.searchParams.get('XID') || url.searchParams.get('xid');
    return { kind: 'profile', player_id: xid ? parseInt(xid, 10) : null };
  }
  if (path === '/loader.php' || path === '/page.php') {
    const sid = url.searchParams.get('sid');
    if (sid === 'attack' || sid === 'getInAttack') {
      const uid = url.searchParams.get('user2ID');
      return { kind: 'attack', player_id: uid ? parseInt(uid, 10) : null };
    }
    if (sid === 'bounties') {
      return { kind: 'bounties', player_id: null };
    }
    if (sid === 'stocks') {
      return { kind: 'stocks', player_id: null };
    }
    if (sid === 'hospitalView' || sid === 'hospital') {
      return { kind: 'hospital', player_id: null };
    }
    if (sid === 'imarket' || sid === 'iMarket') {
      return { kind: 'imarket', player_id: null };
    }
  }
  if (path === '/bounties.php') {
    return { kind: 'bounties', player_id: null };
  }
  if (path === '/hospitalview.php') {
    return { kind: 'hospital', player_id: null };
  }
  if (path === '/imarket.php') {
    return { kind: 'imarket', player_id: null };
  }
  if (path === '/travelagency.php') {
    return { kind: 'travel', player_id: null };
  }
  if (path === '/index.php' && url.searchParams.get('page') === 'travel') {
    return { kind: 'travel', player_id: null };
  }
  // "Ambient" pages — anywhere a player name appears as a /profiles.php?XID=
  // link, sprinkle pills via the row-decorator helper. These pages don't have
  // a dedicated overlay; we just decorate whoever we know on the page.
  if (
    path === '/messages.php' ||
    path === '/forums.php' ||
    path === '/friendlist.php' ||
    path === '/searchresults.php'
  ) {
    return { kind: 'ambient', player_id: null };
  }
  if (path === '/factions.php') {
    const step = url.searchParams.get('step');
    const id = url.searchParams.get('ID') || url.searchParams.get('id');
    if (step === 'profile' && id && /^\d+$/.test(id)) {
      return { kind: 'faction', player_id: null, faction_id: parseInt(id, 10) };
    }
    const type = url.searchParams.get('type');
    if (step === 'armoury' || (step === 'your' && type === '1')) {
      return { kind: 'armoury', player_id: null };
    }
    if (step === 'retals' || step === 'retaliations') {
      return { kind: 'retals', player_id: null };
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
  'a[href*="page.php?sid=attack"]',
  'a[href*="loader.php?sid=attack"]',
  'button[class*="attack"]',
  '#mainContainer button:not([class*="cancel"])',
];

export const STOCKS_ANCHOR_SELECTORS = [
  '#stockmarketroot',
  '#mainContainer .content-wrapper',
  '#mainContainer',
];

export const ARMOURY_ANCHOR_SELECTORS = [
  '#faction-armoury-root',
  '#mainContainer .content-wrapper',
  '#mainContainer',
];

export const TRAVEL_ANCHOR_SELECTORS = [
  '#travel-root',
  '#mainContainer .content-wrapper',
  '#mainContainer',
];

/**
 * Watch for SPA-style URL changes on torn.com.
 *
 * Torn loads some pages (like /page.php?sid=... or legacy /loader.php?sid=...) inline without a full
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
