// Thin fetch wrapper that goes through GM_xmlhttpRequest when available
// (Tampermonkey / PDA — bypasses page CORS) and falls back to plain fetch()
// for environments that don't grant GM_xmlhttpRequest.
//
// All requests carry the extension JWT in Authorization + X-Player-Id, and
// X-TM-Companion so the backend can identify companion traffic separately
// from the webapp.

import type {
  CompanionAuth,
  CurrentWar,
  WarOffLimitsResponse,
  NotificationsUnread,
  MentionsRecentResponse,
  ChatChannel,
  ChatMessage,
  ChatUnreadResponse,
  SpyEstimate,
  FactionSpiesResponse,
  KeysResponse,
  EnemyResponse,
  ArmouryCompetitionsResponse,
  ArmouryLeaderboardResponse,
  KnownSpiesResponse,
  TravelResponse,
  MarketPricesResponse,
  OcResponse,
  TargetsResponse,
  StakeoutsResponse,
  BountiesResponse,
  LootResponse,
  StockPortfolioResponse,
  StockRoiResponse,
  ClaimRow,
  ClaimActiveResponse,
} from '../types';

declare const GM_xmlhttpRequest: ((details: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  data?: string;
  timeout?: number;
  onload: (r: { status: number; responseText: string }) => void;
  onerror: () => void;
  ontimeout: () => void;
}) => void) | undefined;

import { HUB_ORIGIN, COMPANION_VERSION as VERSION } from '../env';

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

interface RawResponse {
  status: number;
  body: string;
}

function gmRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    if (typeof GM_xmlhttpRequest !== 'function') {
      reject(new Error('GM_xmlhttpRequest unavailable'));
      return;
    }
    GM_xmlhttpRequest({
      method,
      url,
      headers,
      data: body,
      timeout: 15000,
      onload: (r) => resolve({ status: r.status, body: r.responseText }),
      onerror: () => reject(new Error('GM_xmlhttpRequest network error')),
      ontimeout: () => reject(new Error('GM_xmlhttpRequest timeout')),
    });
  });
}

async function plainRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
): Promise<RawResponse> {
  const res = await fetch(url, { method, headers, body, credentials: 'omit' });
  return { status: res.status, body: await res.text() };
}

function authHeaders(auth: CompanionAuth, withJson = false): Record<string, string> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${auth.token}`,
    'X-Player-Id': String(auth.player_id),
    'X-TM-Companion': `userscript/${VERSION}`,
  };
  if (withJson) headers['Content-Type'] = 'application/json';
  return headers;
}

async function request<T>(
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH',
  path: string,
  auth: CompanionAuth,
  body?: unknown,
): Promise<T> {
  const url = `${HUB_ORIGIN}${path}`;
  const headers = authHeaders(auth, body !== undefined);
  const serialized = body !== undefined ? JSON.stringify(body) : undefined;
  let res: RawResponse;
  try {
    res = await gmRequest(method, url, headers, serialized);
  } catch {
    res = await plainRequest(method, url, headers, serialized);
  }
  if (res.status === 401 || res.status === 403) {
    throw new ApiError('unauthorized', res.status);
  }
  if (res.status === 404) {
    // Treat 404 as a soft-fail so the caller can graceful-fallback (used by
    // mention polling against a backend that hasn't deployed the new
    // endpoint yet).
    throw new ApiError('not found', 404);
  }
  if (res.status < 200 || res.status >= 300) {
    throw new ApiError(`HTTP ${res.status}`, res.status);
  }
  if (res.status === 204 || !res.body) return undefined as T;
  return JSON.parse(res.body) as T;
}

// ── GET helpers ──────────────────────────────────────────────

export function get<T>(path: string, auth: CompanionAuth): Promise<T> {
  return request<T>('GET', path, auth);
}

export function post<T>(path: string, body: unknown, auth: CompanionAuth): Promise<T> {
  return request<T>('POST', path, auth, body);
}

export function del<T>(path: string, auth: CompanionAuth): Promise<T> {
  return request<T>('DELETE', path, auth);
}

// ── Concrete endpoints ──────────────────────────────────────

export function fetchCurrentWar(auth: CompanionAuth): Promise<CurrentWar> {
  return get<CurrentWar>('/api/wars/current', auth);
}

export function fetchOffLimits(auth: CompanionAuth, warId: number): Promise<WarOffLimitsResponse> {
  return get<WarOffLimitsResponse>(`/api/war-off-limits/${warId}`, auth);
}

export function fetchNotificationsUnread(auth: CompanionAuth): Promise<NotificationsUnread> {
  return get<NotificationsUnread>('/api/notifications/unread', auth);
}

export function markAllNotificationsRead(auth: CompanionAuth): Promise<{ status: string }> {
  return post<{ status: string }>('/api/notifications/read-all', {}, auth);
}

export function fetchRecentMentions(
  auth: CompanionAuth,
  since: number,
  limit = 20,
): Promise<MentionsRecentResponse> {
  return get<MentionsRecentResponse>(
    `/api/chat/mentions/recent?since=${since}&limit=${limit}`,
    auth,
  );
}

export function sendHeartbeat(auth: CompanionAuth): Promise<{ ok: boolean }> {
  return post<{ ok: boolean }>('/api/heartbeat', {}, auth);
}

// ── Chat ────────────────────────────────────────────────────

export function fetchChatChannels(auth: CompanionAuth): Promise<{ channels: ChatChannel[] }> {
  return get<{ channels: ChatChannel[] }>('/api/chat/channels', auth);
}

export function fetchChatMessages(
  auth: CompanionAuth,
  channelId: number,
  opts: { after?: number; before?: number; limit?: number } = {},
): Promise<{ messages: ChatMessage[] }> {
  const params = new URLSearchParams();
  if (opts.after !== undefined) params.set('after', String(opts.after));
  if (opts.before !== undefined) params.set('before', String(opts.before));
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  const qs = params.toString() ? `?${params.toString()}` : '';
  return get<{ messages: ChatMessage[] }>(`/api/chat/channels/${channelId}/messages${qs}`, auth);
}

export function sendChatMessage(
  auth: CompanionAuth,
  channelId: number,
  content: string,
  mentions: number[] = [],
): Promise<ChatMessage> {
  return post<ChatMessage>(
    `/api/chat/channels/${channelId}/messages`,
    { content, mentions },
    auth,
  );
}

export function fetchChatUnread(auth: CompanionAuth): Promise<ChatUnreadResponse> {
  return get<ChatUnreadResponse>('/api/chat/unread', auth);
}

export function markChatRead(
  auth: CompanionAuth,
  channelId: number,
  messageId: number,
): Promise<{ status: string }> {
  return post<{ status: string }>(
    '/api/chat/read',
    { channel_id: channelId, message_id: messageId, thread_id: 0 },
    auth,
  );
}

// ── Intel (Phase 3) ─────────────────────────────────────────

export function fetchSpyEstimate(auth: CompanionAuth, playerId: number): Promise<SpyEstimate> {
  return get<SpyEstimate>(`/api/spy/${playerId}`, auth);
}

export function fetchFactionSpies(auth: CompanionAuth, factionId: number): Promise<FactionSpiesResponse> {
  return get<FactionSpiesResponse>(`/api/spy/faction/${factionId}`, auth);
}

export function fetchKnownSpies(auth: CompanionAuth): Promise<KnownSpiesResponse> {
  return get<KnownSpiesResponse>('/api/spy/known', auth);
}

export function fetchKeys(auth: CompanionAuth): Promise<KeysResponse> {
  return get<KeysResponse>('/api/keys', auth);
}

export interface OverviewMember {
  id: number;
  name: string;
}

export interface OverviewResponse {
  members: OverviewMember[];
}

export function fetchOverview(auth: CompanionAuth): Promise<OverviewResponse> {
  return get<OverviewResponse>('/api/overview', auth);
}

export function fetchEnemy(auth: CompanionAuth): Promise<EnemyResponse> {
  return get<EnemyResponse>('/api/enemy', auth);
}

export function fetchTargets(auth: CompanionAuth): Promise<TargetsResponse> {
  return get<TargetsResponse>('/api/targets', auth);
}

export function fetchStakeouts(auth: CompanionAuth): Promise<StakeoutsResponse> {
  return get<StakeoutsResponse>('/api/stakeout', auth);
}

export function fetchBounties(auth: CompanionAuth): Promise<BountiesResponse> {
  return get<BountiesResponse>('/api/bounties', auth);
}

export function fetchLoot(auth: CompanionAuth): Promise<LootResponse> {
  return get<LootResponse>('/api/loot', auth);
}

export function fetchStockPortfolio(auth: CompanionAuth): Promise<StockPortfolioResponse> {
  return get<StockPortfolioResponse>('/api/stocks/portfolio', auth);
}

export function fetchStockRoi(auth: CompanionAuth): Promise<StockRoiResponse> {
  return get<StockRoiResponse>('/api/stocks/roi', auth);
}

export function fetchArmouryCompetitions(auth: CompanionAuth): Promise<ArmouryCompetitionsResponse> {
  return get<ArmouryCompetitionsResponse>('/api/armoury/competitions', auth);
}

export function fetchArmouryLeaderboard(
  auth: CompanionAuth,
  compId: number,
): Promise<ArmouryLeaderboardResponse> {
  return get<ArmouryLeaderboardResponse>(`/api/armoury/competitions/${compId}/leaderboard`, auth);
}

export function fetchTravel(auth: CompanionAuth): Promise<TravelResponse> {
  return get<TravelResponse>('/api/travel', auth);
}

export function fetchMarketPrices(auth: CompanionAuth): Promise<MarketPricesResponse> {
  return get<MarketPricesResponse>('/api/market/prices', auth);
}

export function submitSpyReport(
  auth: CompanionAuth,
  body: { player_id: number; strength: number; defense: number; speed: number; dexterity: number },
): Promise<{ status: string; player_id: number }> {
  return post<{ status: string; player_id: number }>('/api/spy/submit', body, auth);
}

export function fetchOcPlanning(auth: CompanionAuth): Promise<OcResponse> {
  return get<OcResponse>('/api/oc?cat=planning', auth);
}

export function fetchOcExecuting(auth: CompanionAuth): Promise<OcResponse> {
  return get<OcResponse>('/api/oc?cat=executing', auth);
}

export function reserveLoot(
  auth: CompanionAuth,
  body: { npc_id: number; npc_name: string; target_level: number },
): Promise<{ status: string }> {
  return post<{ status: string }>('/api/loot/reserve', body, auth);
}

export function cancelLootReservation(
  auth: CompanionAuth,
  npcId: number,
): Promise<{ status: string }> {
  return del<{ status: string }>(`/api/loot/reserve/${npcId}`, auth);
}

// ── Write-back actions ──────────────────────────────────────

export function flagOffLimits(
  auth: CompanionAuth,
  warId: number,
  body: { player_id: number; player_name: string; reason?: string },
): Promise<{ status: string }> {
  return post<{ status: string }>(`/api/war-off-limits/${warId}`, body, auth);
}

export function removeOffLimits(
  auth: CompanionAuth,
  warId: number,
  playerId: number,
): Promise<{ status: string }> {
  return del<{ status: string }>(`/api/war-off-limits/${warId}/${playerId}`, auth);
}

export function saveTarget(
  auth: CompanionAuth,
  body: {
    player_id: number;
    player_name?: string;
    tag?: string;
    notes?: string;
    difficulty?: string;
  },
): Promise<{ status: string }> {
  return post<{ status: string }>('/api/targets', body, auth);
}

export function removeTarget(
  auth: CompanionAuth,
  playerId: number,
): Promise<{ status: string }> {
  return del<{ status: string }>(`/api/targets/${playerId}`, auth);
}

export function addStakeout(
  auth: CompanionAuth,
  body: { player_id: number; player_name?: string; notes?: string },
): Promise<{ status: string }> {
  return post<{ status: string }>('/api/stakeout', body, auth);
}

export function removeStakeout(
  auth: CompanionAuth,
  playerId: number,
): Promise<{ status: string }> {
  return del<{ status: string }>(`/api/stakeout/${playerId}`, auth);
}

// ── Feature flags (Phase 0) ─────────────────────────────────
//
// Public endpoint — no auth, no X-Player-Id. We still go through
// gmRequest/plainRequest so the Companion uses one transport for everything.

export interface FeatureFlags {
  ff_score: boolean;
  flights: boolean;
  activity: boolean;
  hit_calling: boolean;
}

const FEATURE_FLAGS_DEFAULT: FeatureFlags = {
  ff_score: false,
  flights: false,
  activity: false,
  hit_calling: false,
};

const FEATURE_FLAGS_TTL_MS = 60_000;

let _flagsCache: { value: FeatureFlags; fetchedAt: number } | null = null;

async function rawGetFlags(): Promise<FeatureFlags> {
  const url = `${HUB_ORIGIN}/api/extension/feature-flags`;
  const headers: Record<string, string> = {
    'X-TM-Companion': `userscript/${VERSION}`,
  };
  let res: RawResponse;
  try {
    res = await gmRequest('GET', url, headers);
  } catch {
    res = await plainRequest('GET', url, headers);
  }
  if (res.status < 200 || res.status >= 300 || !res.body) {
    throw new ApiError(`HTTP ${res.status}`, res.status);
  }
  const parsed = JSON.parse(res.body) as Partial<FeatureFlags>;
  // Coerce defensively so a backend missing a key never becomes `undefined`.
  return {
    ff_score: Boolean(parsed.ff_score),
    flights: Boolean(parsed.flights),
    activity: Boolean(parsed.activity),
    hit_calling: Boolean(parsed.hit_calling),
  };
}

export async function fetchFeatureFlags(): Promise<FeatureFlags> {
  const now = Date.now();
  if (_flagsCache && now - _flagsCache.fetchedAt < FEATURE_FLAGS_TTL_MS) {
    return _flagsCache.value;
  }
  try {
    const value = await rawGetFlags();
    _flagsCache = { value, fetchedAt: now };
    return value;
  } catch {
    // Backend unreachable or returned non-2xx: fall back to all-off so the
    // Companion never accidentally lights up a dark-launched overlay just
    // because the network blipped. Cache the default briefly to avoid
    // hammering the endpoint while it's down.
    _flagsCache = { value: FEATURE_FLAGS_DEFAULT, fetchedAt: now };
    return FEATURE_FLAGS_DEFAULT;
  }
}

export function getCachedFeatureFlags(): FeatureFlags {
  return _flagsCache?.value ?? FEATURE_FLAGS_DEFAULT;
}

// ── Hit claims (Phase 4) ────────────────────────────────────
//
// We bypass request<T>() for POST /api/claims/{id} because we need 409 to be
// a *value*, not an exception (the existing claim payload tells the UI who
// got there first). The other claim verbs use request<T>() because they
// don't have a "soft" conflict shape.

export interface ClaimCreateOk {
  ok: true;
  claim: ClaimRow;
}

export interface ClaimCreateConflict {
  ok: false;
  conflict_with: ClaimRow;
}

export type ClaimCreateResult = ClaimCreateOk | ClaimCreateConflict;

export async function postClaim(
  auth: CompanionAuth,
  targetId: number,
  note?: string,
): Promise<ClaimCreateResult> {
  const url = `${HUB_ORIGIN}/api/claims/${targetId}`;
  const headers = authHeaders(auth, true);
  const body = JSON.stringify({ note: note ?? null });
  let res: RawResponse;
  try {
    res = await gmRequest('POST', url, headers, body);
  } catch {
    res = await plainRequest('POST', url, headers, body);
  }
  if (res.status === 201) {
    return { ok: true, claim: JSON.parse(res.body) as ClaimRow };
  }
  if (res.status === 409) {
    // Backend nests the existing row inside detail.claim — unwrap for the UI.
    const parsed = JSON.parse(res.body) as
      | { detail: { detail: string; claim: ClaimRow } | string; claim?: ClaimRow };
    const claim =
      typeof parsed.detail === 'object' && parsed.detail !== null
        ? parsed.detail.claim
        : (parsed.claim as ClaimRow);
    return { ok: false, conflict_with: claim };
  }
  if (res.status === 401 || res.status === 403) throw new ApiError('unauthorized', res.status);
  throw new ApiError(`HTTP ${res.status}`, res.status);
}

export async function releaseClaim(
  auth: CompanionAuth,
  targetId: number,
): Promise<boolean> {
  try {
    await request<ClaimRow>('DELETE', `/api/claims/${targetId}`, auth);
    return true;
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) return false;
    throw err;
  }
}

export async function markClaimHit(
  auth: CompanionAuth,
  targetId: number,
): Promise<boolean> {
  try {
    await request<ClaimRow>('POST', `/api/claims/${targetId}/hit`, auth);
    return true;
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) return false;
    throw err;
  }
}

export function fetchActiveClaims(auth: CompanionAuth): Promise<ClaimActiveResponse> {
  return get<ClaimActiveResponse>('/api/claims/active', auth);
}

// SSE-equivalent. The browser's EventSource API cannot set the required
// X-Player-Id header, and the userscript sandbox doesn't expose a streaming
// fetch primitive — so we mirror the chat-dock pattern and poll
// /api/claims/active every 5s. The signature still matches an event-stream
// shape so the caller is identical to what a real EventSource would be.
export interface ClaimStreamEvent {
  type: 'claim.snapshot' | 'claim.created' | 'claim.released' | 'claim.hit' | 'claim.expired';
  claim?: ClaimRow;
  claims?: ClaimRow[];
}

const CLAIM_POLL_MS = 5_000;
const CLAIM_BACKOFF_MAX_MS = 60_000;

export function streamClaims(
  getAuthFn: () => CompanionAuth | null,
  onEvent: (e: ClaimStreamEvent) => void,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let backoff = CLAIM_POLL_MS;
  // Local mirror so a poll tick can synthesize created/released/hit deltas.
  const last = new Map<number, ClaimRow>();
  let primed = false;

  const tick = async () => {
    if (stopped) return;
    const auth = getAuthFn();
    if (!auth) {
      timer = setTimeout(tick, CLAIM_POLL_MS);
      return;
    }
    try {
      const r = await fetchActiveClaims(auth);
      const current = new Map(r.claims.map((c) => [c.target_id, c]));
      if (!primed) {
        // First poll → emit a snapshot identical to the SSE replay frame.
        onEvent({ type: 'claim.snapshot', claims: r.claims });
        primed = true;
      } else {
        // Diff: anything new = created; anything missing = released or
        // expired (we can't distinguish via /active; mark as released which
        // the UI treats the same way — the cleanup is what matters).
        for (const c of r.claims) {
          if (!last.has(c.target_id)) onEvent({ type: 'claim.created', claim: c });
        }
        for (const [pid, prev] of last) {
          if (!current.has(pid)) onEvent({ type: 'claim.released', claim: prev });
        }
      }
      last.clear();
      current.forEach((v, k) => last.set(k, v));
      backoff = CLAIM_POLL_MS;
    } catch (err) {
      // Auth blew up — keep polling; the bus consumers will skip on null auth.
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        backoff = Math.min(backoff * 2, CLAIM_BACKOFF_MAX_MS);
      } else {
        backoff = Math.min(backoff * 2, CLAIM_BACKOFF_MAX_MS);
      }
    }
    if (!stopped) timer = setTimeout(tick, backoff);
  };

  // Kick off on next tick so the caller can install listeners synchronously.
  timer = setTimeout(tick, 0);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

export { ApiError };
