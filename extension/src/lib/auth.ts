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

/**
 * Open the auth/handoff page in a way that works across hosts.
 *
 * Desktop (Tampermonkey / browsers): sized popup so it floats over torn.com
 * and the postMessage handshake keeps an `opener` to write back to.
 *
 * Torn PDA (Flutter `flutter_inappwebview`): a sized popup is rendered as a
 * full-screen modal overlay that users instinctively dismiss by tapping the
 * edge — and once dismissed there is no obvious way to reopen it. Use a
 * normal new-tab `window.open` instead, so the user can swipe back to
 * torn.com and re-tap Connect in the chip if they need to.
 */
export function openAuthPage(hubOrigin: string): void {
  const url = `${hubOrigin}/extension-auth`;
  const isPDA =
    typeof navigator !== 'undefined' &&
    (/TornPDA/i.test(navigator.userAgent || '') ||
      typeof (window as unknown as { flutter_inappwebview?: unknown }).flutter_inappwebview !==
        'undefined');
  if (isPDA) {
    window.open(url, '_blank');
    return;
  }
  const popup = window.open(
    url,
    'tm-hub-companion-auth',
    'width=520,height=720,resizable=yes,scrollbars=yes',
  );
  if (!popup) window.open(url, '_blank');
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
    const token = data.token;
    const player_id = data.player_id;
    if (typeof token !== 'string' || typeof player_id !== 'number') return;
    const auth: CompanionAuth = {
      token,
      player_id,
      player_name: typeof data.player_name === 'string' ? data.player_name : undefined,
      expires_at:
        typeof data.expires_hours === 'number'
          ? Date.now() + data.expires_hours * 3600 * 1000
          : undefined,
    };
    setAuth(auth);
    onAuth(auth);
  });
}
