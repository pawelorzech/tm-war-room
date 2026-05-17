// Characterization tests for fetchFFBulk — Sprint 2 #9 (faction-roster bulk
// migration). Locks the contract the faction-roster-overlay relies on:
//   - chunks into batches of <= 100 ids
//   - empty input → empty Map (no network call)
//   - parses { scores: { "<pid>": {...} } } into Map<number, FFScore>
//   - 503 (feature disabled) → empty Map, no throw
//   - 429 (rate limited) → one retry with backoff, then empty Map if it
//     still fails
//
// The implementation goes through the same gmRequest/plainRequest fallback
// path as every other endpoint. happy-dom doesn't provide GM_xmlhttpRequest
// so we transparently hit the plainRequest (fetch) branch in tests.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchFFBulk } from './api';
import type { CompanionAuth } from '../types';

const AUTH: CompanionAuth = { token: 'tkn', player_id: 99, player_name: 'X' };

interface MockResponse {
  status: number;
  body: unknown;
}

function mockFetchOnce(...responses: MockResponse[]): ReturnType<typeof vi.fn> {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      status: r.status,
      text: () => Promise.resolve(JSON.stringify(r.body)),
    });
  }
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

const scoreFor = (_pid: number) => ({
  score: 1.5,
  dom_stat: 'STR' as const,
  source: 'formula' as const,
  computed_at: 1700000000,
  expires_at: 1700000000 + 21600,
});

describe('fetchFFBulk', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns an empty Map for an empty id list without hitting the network', async () => {
    const fetchMock = mockFetchOnce();
    const result = await fetchFFBulk([], AUTH);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs a single batch and parses the response into a Map keyed by number', async () => {
    const fetchMock = mockFetchOnce({
      status: 200,
      body: { scores: { '101': scoreFor(101), '202': scoreFor(202) } },
    });
    const result = await fetchFFBulk([101, 202], AUTH);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/ff\/bulk$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ player_ids: [101, 202] });

    expect(result.size).toBe(2);
    const r101 = result.get(101)!;
    expect(r101.player_id).toBe(101);
    expect(r101.score).toBe(1.5);
    expect(r101.dom_stat).toBe('STR');
    expect(r101.source).toBe('formula');
  });

  it('chunks more than 100 ids into multiple sequential batches', async () => {
    const ids = Array.from({ length: 230 }, (_, i) => i + 1);
    const fetchMock = mockFetchOnce(
      { status: 200, body: { scores: Object.fromEntries(ids.slice(0, 100).map((p) => [String(p), scoreFor(p)])) } },
      { status: 200, body: { scores: Object.fromEntries(ids.slice(100, 200).map((p) => [String(p), scoreFor(p)])) } },
      { status: 200, body: { scores: Object.fromEntries(ids.slice(200).map((p) => [String(p), scoreFor(p)])) } },
    );

    const result = await fetchFFBulk(ids, AUTH);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).player_ids).toHaveLength(100);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string).player_ids).toHaveLength(100);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body as string).player_ids).toHaveLength(30);
    expect(result.size).toBe(230);
    expect(result.get(1)?.player_id).toBe(1);
    expect(result.get(230)?.player_id).toBe(230);
  });

  it('returns an empty Map when the feature is disabled (503)', async () => {
    mockFetchOnce({ status: 503, body: { detail: 'feature disabled' } });
    const result = await fetchFFBulk([1, 2, 3], AUTH);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it('retries once on 429, then succeeds', async () => {
    const fetchMock = mockFetchOnce(
      { status: 429, body: { detail: 'slow down' } },
      { status: 200, body: { scores: { '7': scoreFor(7) } } },
    );

    const promise = fetchFFBulk([7], AUTH);
    // Drain the backoff timer between attempts.
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.size).toBe(1);
    expect(result.get(7)?.player_id).toBe(7);
  });

  it('returns an empty Map when 429 persists after the retry', async () => {
    const fetchMock = mockFetchOnce(
      { status: 429, body: { detail: 'slow down' } },
      { status: 429, body: { detail: 'slow down' } },
    );

    const promise = fetchFFBulk([7], AUTH);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.size).toBe(0);
  });

  it('sends the JWT, X-Player-Id, and Companion headers on each batch', async () => {
    const fetchMock = mockFetchOnce({ status: 200, body: { scores: {} } });
    await fetchFFBulk([42], AUTH);
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer tkn',
      'X-Player-Id': '99',
      'Content-Type': 'application/json',
    });
    expect(init.headers['X-TM-Companion']).toMatch(/^userscript\//);
  });
});
