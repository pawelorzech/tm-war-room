// SWR feature-flags cache contract — Plan item #15 from
// Plans/chc-zadba-bardoz-snazzy-wave.md.
//
// The Companion bootstrap renders overlays before the network round-trip to
// /api/extension/feature-flags returns, so getCachedFeatureFlags() has to
// give a useful answer synchronously. To make "useful" mean "the last value
// the user actually saw" we persist the payload in GM_setValue and hydrate
// the in-memory cache the first time getCachedFeatureFlags() is called.
//
// The background refresh (fetchFeatureFlags) runs every tick, updates both
// in-memory and GM storage, and dispatches `tm-companion-refresh` ONLY when
// the new value differs from the previous one — otherwise every 60s tick
// would needlessly invalidate war-id + off-limits caches downstream.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'tm-companion:feature-flags-cache';

const ALL_FALSE = {
  ff_score: false,
  flights: false,
  activity: false,
  hit_calling: false,
} as const;

// GM_* shim — happy-dom doesn't ship a Tampermonkey runtime, so we install a
// tiny in-memory store on globalThis before importing the module under test.
// The shim has to exist *before* the module loads because the module reads
// GM_getValue lazily on first access; the import itself is harmless but any
// test that resets module state with vi.resetModules() needs the shim re-
// installed before the re-import.
interface GMStore {
  data: Map<string, unknown>;
}

function installGmShim(): GMStore {
  const store: GMStore = { data: new Map() };
  vi.stubGlobal('GM_getValue', <T,>(key: string, def?: T): T => {
    return store.data.has(key) ? (store.data.get(key) as T) : (def as T);
  });
  vi.stubGlobal('GM_setValue', (key: string, value: unknown): void => {
    store.data.set(key, value);
  });
  return store;
}

// Module-under-test handle. We re-import per test (after vi.resetModules) so
// the module-level cache singleton doesn't bleed between cases.
type ApiModule = typeof import('./api');

async function loadFreshApi(): Promise<ApiModule> {
  vi.resetModules();
  return import('./api');
}

describe('feature-flags SWR cache', () => {
  let gm: GMStore;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    gm = installGmShim();
    // rawGetFlags() uses GM_xmlhttpRequest first, then falls back to fetch.
    // We leave GM_xmlhttpRequest undefined so it always uses fetch — easier
    // to control from tests.
    vi.stubGlobal('GM_xmlhttpRequest', undefined);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('first boot (no cached value) returns all-false synchronously', async () => {
    const api = await loadFreshApi();
    // Storage empty — the sync accessor must not throw, must not hit fetch,
    // and must give defaults.
    const flags = api.getCachedFeatureFlags();
    expect(flags).toEqual(ALL_FALSE);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('warm boot (cached value exists) returns cached value synchronously, no await', async () => {
    // Seed GM storage as if a previous session wrote it.
    gm.data.set(STORAGE_KEY, {
      value: { ff_score: true, flights: true, activity: false, hit_calling: true },
      savedAt: '2026-05-17T11:00:00.000Z',
    });
    const api = await loadFreshApi();
    const flags = api.getCachedFeatureFlags();
    expect(flags).toEqual({
      ff_score: true,
      flights: true,
      activity: false,
      hit_calling: true,
    });
    // Crucially: no network was triggered by the sync read.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('background refresh persists fresh flags to GM_setValue', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ff_score: true,
          flights: false,
          activity: true,
          hit_calling: false,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const api = await loadFreshApi();
    const value = await api.fetchFeatureFlags();
    expect(value).toEqual({
      ff_score: true,
      flights: false,
      activity: true,
      hit_calling: false,
    });
    const persisted = gm.data.get(STORAGE_KEY) as { value: unknown; savedAt: string };
    expect(persisted).toBeDefined();
    expect(persisted.value).toEqual(value);
    expect(typeof persisted.savedAt).toBe('string');
    // ISO-8601 sanity — Date should be able to round-trip it.
    expect(Number.isNaN(Date.parse(persisted.savedAt))).toBe(false);
  });

  it('flag value changes during refresh fires tm-companion-refresh', async () => {
    // Seed cache with a known-good baseline.
    gm.data.set(STORAGE_KEY, {
      value: { ...ALL_FALSE },
      savedAt: '2026-05-17T11:00:00.000Z',
    });
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ff_score: true, flights: false, activity: false, hit_calling: false }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const api = await loadFreshApi();
    // Prime the in-memory cache via the sync accessor so the "previous value"
    // comparison has something to compare against.
    api.getCachedFeatureFlags();
    const events: Event[] = [];
    window.addEventListener('tm-companion-refresh', (e) => events.push(e));
    await api.fetchFeatureFlags();
    expect(events).toHaveLength(1);
  });

  it('flag value unchanged during refresh fires NO event', async () => {
    const stable = { ff_score: true, flights: false, activity: false, hit_calling: false };
    gm.data.set(STORAGE_KEY, { value: stable, savedAt: '2026-05-17T11:00:00.000Z' });
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(stable), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const api = await loadFreshApi();
    api.getCachedFeatureFlags();
    const events: Event[] = [];
    window.addEventListener('tm-companion-refresh', (e) => events.push(e));
    await api.fetchFeatureFlags();
    expect(events).toHaveLength(0);
  });

  it('corrupted GM_getValue payload falls back to all-false without throwing', async () => {
    // Two flavours of corruption: legacy string-shaped payload and a wrong
    // type for the inner value field. Both must be tolerated.
    gm.data.set(STORAGE_KEY, 'this is not the new schema');
    const api = await loadFreshApi();
    expect(() => api.getCachedFeatureFlags()).not.toThrow();
    expect(api.getCachedFeatureFlags()).toEqual(ALL_FALSE);
  });

  it('corrupted GM_getValue payload (partial fields) still falls back safely', async () => {
    gm.data.set(STORAGE_KEY, { value: { ff_score: 'yes' }, savedAt: 42 });
    const api = await loadFreshApi();
    expect(() => api.getCachedFeatureFlags()).not.toThrow();
    expect(api.getCachedFeatureFlags()).toEqual(ALL_FALSE);
  });
});
