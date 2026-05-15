// Token bootstrap for the TM Hub Companion userscript.
//
// Storage layer: GM_getValue / GM_setValue (Tampermonkey / Violentmonkey /
// Torn PDA). For a future MV3 extension we would swap this for
// chrome.storage.local; the rest of the script reads/writes through the
// thin functions exported here, so swap is mechanical.
//
// Handoff: hub.tri.ovh/extension-auth issues a long-lived JWT and
// window.opener.postMessage()s it back. We listen for that message and
// persist the payload. If no opener (page opened directly), the user can
// copy the token manually — out of scope for the listener.

import type { CompanionAuth } from '../types';

const STORAGE_KEY = 'tm-hub-companion-auth';

declare const GM_getValue: <T>(key: string, def?: T) => T;
declare const GM_setValue: (key: string, value: unknown) => void;

export function getAuth(): CompanionAuth | null {
  try {
    const raw = GM_getValue<string>(STORAGE_KEY, '');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CompanionAuth;
    if (!parsed.token || !parsed.player_id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setAuth(auth: CompanionAuth): void {
  GM_setValue(STORAGE_KEY, JSON.stringify(auth));
}

export function clearAuth(): void {
  GM_setValue(STORAGE_KEY, '');
}

// Hub serialises tokens identically in two transports (window postMessage
// and the PDA fragment round-trip), so the shape-check + CompanionAuth
// build lives here once.
function buildAuthFromPayload(data: Record<string, unknown>): CompanionAuth | null {
  const token = data.token;
  const player_id = data.player_id;
  if (typeof token !== 'string' || typeof player_id !== 'number') return null;
  return {
    token,
    player_id,
    player_name: typeof data.player_name === 'string' ? data.player_name : undefined,
    expires_at:
      typeof data.expires_hours === 'number'
        ? Date.now() + data.expires_hours * 3600 * 1000
        : undefined,
  };
}

/**
 * Open the auth/handoff page in a way that works across hosts.
 *
 * Desktop (Tampermonkey / browsers): sized popup so it floats over torn.com
 * and the postMessage handshake keeps an `opener` to write back to.
 *
 * Torn PDA (Flutter `flutter_inappwebview`): `window.open` returns null and
 * does nothing — the embedded webview has no native tab support — so the
 * "Connect now" button appeared to do nothing for PDA users. Navigate the
 * current tab to the auth page instead. The hub side detects the missing
 * opener and bounces back to torn.com via ?returnTo, with the token in the
 * URL fragment for `consumeAuthFragment` to pick up on the next page load.
 */
export function openAuthPage(hubOrigin: string): void {
  const returnTo =
    typeof window !== 'undefined' && window.location ? window.location.href : '';
  const params = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
  const url = `${hubOrigin}/extension-auth${params}`;
  const isPDA =
    typeof navigator !== 'undefined' &&
    (/TornPDA/i.test(navigator.userAgent || '') ||
      typeof (window as unknown as { flutter_inappwebview?: unknown }).flutter_inappwebview !==
        'undefined');
  if (isPDA) {
    window.location.href = url;
    return;
  }
  const popup = window.open(
    url,
    'tm-hub-companion-auth',
    'width=520,height=720,resizable=yes,scrollbars=yes',
  );
  if (popup) return;
  // Popup blocked — try a new tab, then fall back to in-place navigation.
  const tab = window.open(url, '_blank');
  if (!tab) window.location.href = url;
}

/**
 * PDA round-trip: when the hub auth page can't postMessage back (because
 * there's no opener), it redirects to torn.com with the token packed into
 * the URL fragment as `#tm-hub-token=<json>`. Read it on bootstrap, persist
 * it, and strip the fragment so the token doesn't linger in the address
 * bar or get shared if the user copies the URL.
 *
 * Returns the parsed auth if a fragment was consumed; null otherwise.
 */
export function consumeAuthFragment(): CompanionAuth | null {
  if (typeof window === 'undefined' || !window.location) return null;
  const hash = window.location.hash || '';
  const prefix = '#tm-hub-token=';
  if (!hash.startsWith(prefix)) return null;
  try {
    const raw = decodeURIComponent(hash.slice(prefix.length));
    const data = JSON.parse(raw) as Record<string, unknown>;
    const auth = buildAuthFromPayload(data);
    if (!auth) return null;
    setAuth(auth);
    try {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch {
      // history API restricted (unlikely on torn.com) — leave the fragment;
      // it'll clear on next real navigation.
    }
    return auth;
  } catch {
    return null;
  }
}

/**
 * Listen for postMessage from hub.tri.ovh/extension-auth carrying the token.
 * Idempotent — safe to call multiple times.
 */
let _listenerInstalled = false;
export function installAuthListener(onAuth: (auth: CompanionAuth) => void): void {
  if (_listenerInstalled) return;
  _listenerInstalled = true;
  window.addEventListener('message', (event) => {
    // Origin allow-list — never trust messages from anywhere else.
    const allowedOrigins = [
      'https://hub.tri.ovh',
      'https://www.torn.com', // for same-tab broadcast fallback
    ];
    if (!allowedOrigins.includes(event.origin)) return;
    const data = event.data as Record<string, unknown> | undefined;
    if (!data || data.type !== 'tm-hub-ext-token') return;
    const auth = buildAuthFromPayload(data);
    if (!auth) return;
    setAuth(auth);
    onAuth(auth);
  });
}
