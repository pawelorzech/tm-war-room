// Thin fetch wrapper that goes through GM_xmlhttpRequest when available
// (Tampermonkey / PDA — bypasses page CORS) and falls back to plain fetch()
// for environments that don't grant GM_xmlhttpRequest (some browser extension
// content scripts after Manifest V3 changes).
//
// All requests carry the extension JWT in Authorization + X-Player-Id, and
// X-TM-Companion so the backend can identify companion traffic separately
// from the webapp.

import type { CompanionAuth, CurrentWar, WarOffLimitsResponse } from '../types';

declare const GM_xmlhttpRequest: ((details: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  timeout?: number;
  onload: (r: { status: number; responseText: string }) => void;
  onerror: () => void;
  ontimeout: () => void;
}) => void) | undefined;

const HUB_ORIGIN: string =
  (typeof process !== 'undefined' && process.env && (process.env as Record<string, string>).TM_HUB_ORIGIN) ||
  'https://hub.tri.ovh';
const VERSION: string =
  (typeof process !== 'undefined' && process.env && (process.env as Record<string, string>).TM_COMPANION_VERSION) ||
  '0.0.0';

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function gmFetch(url: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    if (typeof GM_xmlhttpRequest !== 'function') {
      reject(new Error('GM_xmlhttpRequest unavailable'));
      return;
    }
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      headers,
      timeout: 15000,
      onload: (r) => resolve({ status: r.status, body: r.responseText }),
      onerror: () => reject(new Error('GM_xmlhttpRequest network error')),
      ontimeout: () => reject(new Error('GM_xmlhttpRequest timeout')),
    });
  });
}

async function plainFetch(url: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  const res = await fetch(url, { method: 'GET', headers, credentials: 'omit' });
  const body = await res.text();
  return { status: res.status, body };
}

async function get<T>(path: string, auth: CompanionAuth): Promise<T> {
  const url = `${HUB_ORIGIN}${path}`;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${auth.token}`,
    'X-Player-Id': String(auth.player_id),
    'X-TM-Companion': `userscript/${VERSION}`,
  };
  let res: { status: number; body: string };
  try {
    res = await gmFetch(url, headers);
  } catch {
    res = await plainFetch(url, headers);
  }
  if (res.status === 401 || res.status === 403) {
    throw new ApiError('unauthorized', res.status);
  }
  if (res.status < 200 || res.status >= 300) {
    throw new ApiError(`HTTP ${res.status}`, res.status);
  }
  return JSON.parse(res.body) as T;
}

export async function fetchCurrentWar(auth: CompanionAuth): Promise<CurrentWar> {
  return get<CurrentWar>('/api/wars/current', auth);
}

export async function fetchOffLimits(auth: CompanionAuth, warId: number): Promise<WarOffLimitsResponse> {
  return get<WarOffLimitsResponse>(`/api/war-off-limits/${warId}`, auth);
}

export { ApiError };
