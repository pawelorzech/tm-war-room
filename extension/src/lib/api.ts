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
  FlightPlayerResponse,
  ActiveFlightsResponse,
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
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
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

export function put<T>(path: string, body: unknown, auth: CompanionAuth): Promise<T> {
  return request<T>('PUT', path, auth, body);
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
  // Companion always asks for inline entities so we can render live cards.
  params.set('include', 'entities');
  const qs = `?${params.toString()}`;
  return get<{ messages: ChatMessage[] }>(`/api/chat/channels/${channelId}/messages${qs}`, auth);
}

export function resolveChatEntities(
  auth: CompanionAuth,
  entities: { kind: string; id: number }[],
): Promise<{ entities: Record<string, import('../types').EntityCard> }> {
  return post(
    '/api/chat/entities/resolve',
    { entities },
    auth,
  );
}

export interface ChatSearchResponse {
  query: string;
  parsed: {
    text: string;
    neg_text: string[];
    from_name: string | null;
    in_channel: string | null;
    has: string[];
    before_ts_max: number | null;
    after_ts_min: number | null;
  };
  messages: (ChatMessage & { snippet?: string | null })[];
  limit: number;
  offset: number;
}

export function searchChatMessages(
  auth: CompanionAuth,
  q: string,
  limit = 30,
): Promise<ChatSearchResponse> {
  const qs = `q=${encodeURIComponent(q)}&limit=${limit}`;
  return get<ChatSearchResponse>(`/api/chat/search?${qs}`, auth);
}

export interface WarRoomCardResponse {
  active: boolean;
  war_id?: number;
  opponent_name?: string;
  opponent_id?: number;
  score_us?: number;
  score_them?: number;
  target_score?: number;
  time_remaining_s?: number;
  top_targets?: {
    id: number;
    name: string;
    level: number;
    status_text: string;
    threat_score: number;
    threat_label: string;
    attack_url: string;
  }[];
}

export function fetchWarRoomCard(auth: CompanionAuth): Promise<WarRoomCardResponse> {
  return get<WarRoomCardResponse>('/api/chat/war-room-card', auth);
}

export interface ChainAssistResponse {
  id: number;
  channel_id: number;
  message_id: number | null;
  target_id: number;
  target_name: string;
  target_status_state: string;
  started_by: number;
  started_by_name: string;
  started_at: number;
  ended_at: number | null;
  hitters: { id: number; name: string }[];
}

export function fetchChainAssist(
  auth: CompanionAuth,
  assistId: number,
): Promise<ChainAssistResponse> {
  return get<ChainAssistResponse>(`/api/chat/assist/${assistId}`, auth);
}

export function joinChainAssist(
  auth: CompanionAuth,
  assistId: number,
): Promise<ChainAssistResponse> {
  return post<ChainAssistResponse>(`/api/chat/assist/${assistId}/join`, {}, auth);
}

export function endChainAssist(
  auth: CompanionAuth,
  assistId: number,
): Promise<ChainAssistResponse> {
  return post<ChainAssistResponse>(`/api/chat/assist/${assistId}/end`, {}, auth);
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

export interface CompanionChatCommand {
  name: string;
  description: string;
}

export function fetchChatCommands(
  auth: CompanionAuth,
): Promise<{ commands: CompanionChatCommand[] }> {
  return get<{ commands: CompanionChatCommand[] }>('/api/chat/commands', auth);
}

export function addChatReaction(
  auth: CompanionAuth,
  messageId: number,
  emoji: string,
): Promise<{ status: string; reaction: { emoji: string; count: number; players: { id: number; name: string }[] } }> {
  return post(
    `/api/chat/messages/${messageId}/reactions`,
    { emoji },
    auth,
  );
}

export function removeChatReaction(
  auth: CompanionAuth,
  messageId: number,
  emoji: string,
): Promise<{ status: string; reaction: { emoji: string; count: number; players: { id: number; name: string }[] } }> {
  return del(
    `/api/chat/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
    auth,
  );
}

export function fetchMemberAvatars(
  auth: CompanionAuth,
): Promise<{ avatars: Record<string, string> }> {
  return get<{ avatars: Record<string, string> }>('/api/members/avatars', auth);
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

export function fetchPinnedNavs(auth: CompanionAuth): Promise<{ hrefs: string[] }> {
  return get<{ hrefs: string[] }>('/api/preferences/pinned-navs', auth);
}

export function savePinnedNavs(
  auth: CompanionAuth,
  hrefs: string[],
): Promise<{ hrefs: string[] }> {
  return put<{ hrefs: string[] }>('/api/preferences/pinned-navs', { hrefs }, auth);
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

// ── FF score (Phase 1B — FFScouter parity) ─────────────────
//
// Public-ish endpoint: requires JWT + X-Player-Id like the rest of /api/*.
// 503 = feature disabled at backend (ENABLE_FF_SCORE=0). Companion treats
// that as "feature unavailable" and silently hides the chip. 4xx/5xx other
// than 503 produce a single warn log + null so a transient backend hiccup
// never noisy-floods the console on every profile view.
//
// 5-minute in-memory cache keyed by player id so re-rendering the same
// profile (or opening it twice in a session) doesn't refetch.

export type FFDomStat = 'STR' | 'DEF' | 'SPD' | 'DEX';

export interface FFScore {
  player_id: number;
  score: number;
  dom_stat: FFDomStat;
  source: 'spy' | 'formula';
  computed_at: number;
  expires_at: number;
}

const FF_CACHE_TTL_MS = 5 * 60_000;
const _ffCache = new Map<number, { value: FFScore | null; fetchedAt: number }>();
let _ffWarnedOnce = false;

export async function fetchFF(
  auth: CompanionAuth,
  playerId: number,
): Promise<FFScore | null> {
  const cached = _ffCache.get(playerId);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < FF_CACHE_TTL_MS) {
    return cached.value;
  }
  try {
    const data = await get<FFScore>(`/api/ff/${playerId}`, auth);
    _ffCache.set(playerId, { value: data, fetchedAt: now });
    return data;
  } catch (err) {
    // 503 = feature disabled — cache a null so we don't hammer the endpoint
    // on every page paint while the flag is off. Other errors also cached
    // briefly as null to avoid retry storms.
    if (!_ffWarnedOnce && err instanceof ApiError && err.status !== 503) {
      console.warn('[tm-companion] fetchFF failed:', err.status);
      _ffWarnedOnce = true;
    }
    _ffCache.set(playerId, { value: null, fetchedAt: now });
    return null;
  }
}

// Sprint 2 #9 — bulk FF lookup.
//
// Replaces the N parallel single-id fetches the faction-roster overlay was
// doing for visible enemies (50-100 ids per page) with one POST per <=100-id
// batch. Cuts JWT-auth + rate-limit budget by ~50-100x on the typical roster.
//
// Soft-fail behaviour mirrors fetchFF: 503 (feature flag off at the backend)
// returns an empty Map so the overlay silently degrades. 429 gets one retry
// with a short backoff — if that still 429s we return what we have rather
// than throwing, because failing closed would tint every row "unknown".
//
// We deliberately don't share the per-id _ffCache here: the bulk path is
// invoked by overlays that have their own TTL cache, and folding cache
// reads in would force callers to dedupe themselves. Keep it transport-only.

const FF_BULK_CHUNK = 100;
const FF_BULK_RETRY_DELAY_MS = 500;

interface FFBulkResponse {
  scores: Record<string, Omit<FFScore, 'player_id'>>;
}

async function postFFBulkOnce(
  ids: number[],
  auth: CompanionAuth,
): Promise<FFBulkResponse | null> {
  // Returns null on 503 (feature disabled) or 429 (rate-limited) so the
  // caller can decide between empty-map and retry. Other 4xx/5xx propagate
  // as ApiError — they signal real bugs we want surfaced.
  try {
    return await post<FFBulkResponse>('/api/ff/bulk', { player_ids: ids }, auth);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 503 || err.status === 429)) {
      return err.status === 429 ? null : { scores: {} };
    }
    throw err;
  }
}

export async function fetchFFBulk(
  playerIds: number[],
  auth: CompanionAuth,
): Promise<Map<number, FFScore>> {
  const out = new Map<number, FFScore>();
  if (playerIds.length === 0) return out;

  for (let i = 0; i < playerIds.length; i += FF_BULK_CHUNK) {
    const batch = playerIds.slice(i, i + FF_BULK_CHUNK);
    let resp: FFBulkResponse | null;
    try {
      resp = await postFFBulkOnce(batch, auth);
    } catch {
      // Any other transport / 4xx / 5xx error: skip this batch so one bad
      // shard doesn't blank the whole overlay.
      continue;
    }
    if (resp === null) {
      // 429 — one retry with a small fixed backoff. Production rate-limit
      // window is 60s; we don't want to block the UI that long, but a brief
      // jittered delay handles the common "two overlays init at once" race.
      await new Promise<void>((r) => setTimeout(r, FF_BULK_RETRY_DELAY_MS));
      try {
        resp = await postFFBulkOnce(batch, auth);
      } catch {
        resp = { scores: {} };
      }
      if (resp === null) resp = { scores: {} };
    }
    for (const [pidStr, value] of Object.entries(resp.scores)) {
      const pid = Number(pidStr);
      if (!Number.isFinite(pid)) continue;
      out.set(pid, { player_id: pid, ...value });
    }
  }
  return out;
}

// ── Feature flags (Phase 0 + Plan item #15 SWR) ─────────────
//
// Public endpoint — no auth, no X-Player-Id. We still go through
// gmRequest/plainRequest so the Companion uses one transport for everything.
//
// Stale-while-revalidate: the last successful flag payload is persisted to
// GM_setValue under FEATURE_FLAGS_STORAGE_KEY. `getCachedFeatureFlags()`
// lazily hydrates the in-memory cache from that storage on first call so the
// first paint on a cold tab uses the flags the user saw last session — no
// 50-150ms wait while the background fetch races first paint. The background
// fetch always runs (driven by `lib/poll.ts startPolling` from index.ts) and
// re-publishes both in-memory + GM storage. When the new payload differs
// from the cached one we dispatch `tm-companion-refresh` so overlays that
// gate on flags re-evaluate.
//
// We deliberately do NOT enforce a TTL on the cached value. The background
// poll runs unconditionally on the 60s cadence, so "stale-but-usable" is the
// default; the only ceiling on staleness is the next visibility-aware tick.

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

const FEATURE_FLAGS_STORAGE_KEY = 'tm-companion:feature-flags-cache';

interface PersistedFlagsPayload {
  value: FeatureFlags;
  savedAt: string;
}

// GM_* shims — declared once here (auth.ts has its own copy; harmless dup).
declare const GM_getValue: <T>(key: string, def?: T) => T;
declare const GM_setValue: (key: string, value: unknown) => void;

let _flagsCache: { value: FeatureFlags; fetchedAt: number } | null = null;
let _flagsHydrated = false;

function coerceFlags(raw: unknown): FeatureFlags | null {
  // Strict coercion: every field must be a real boolean. Anything else is a
  // corrupted/legacy payload and should fall back to defaults rather than be
  // silently widened (a stray "yes" string would otherwise look truthy and
  // accidentally light up a dark-launched feature).
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.ff_score !== 'boolean' ||
    typeof r.flights !== 'boolean' ||
    typeof r.activity !== 'boolean' ||
    typeof r.hit_calling !== 'boolean'
  ) {
    return null;
  }
  return {
    ff_score: r.ff_score,
    flights: r.flights,
    activity: r.activity,
    hit_calling: r.hit_calling,
  };
}

function readPersistedFlags(): FeatureFlags | null {
  try {
    if (typeof GM_getValue !== 'function') return null;
    const raw = GM_getValue<PersistedFlagsPayload | null>(
      FEATURE_FLAGS_STORAGE_KEY,
      null,
    );
    if (!raw || typeof raw !== 'object') return null;
    const payload = raw as Partial<PersistedFlagsPayload>;
    if (typeof payload.savedAt !== 'string') return null;
    return coerceFlags(payload.value);
  } catch {
    return null;
  }
}

function writePersistedFlags(value: FeatureFlags): void {
  try {
    if (typeof GM_setValue !== 'function') return;
    const payload: PersistedFlagsPayload = {
      value,
      savedAt: new Date().toISOString(),
    };
    GM_setValue(FEATURE_FLAGS_STORAGE_KEY, payload);
  } catch {
    // GM storage unavailable (rare — but PDA/MV3 sandboxes change shape).
    // Memory cache still works for the lifetime of this tab.
  }
}

function hydrateFlagsFromStorage(): void {
  if (_flagsHydrated) return;
  _flagsHydrated = true;
  const persisted = readPersistedFlags();
  if (persisted) {
    _flagsCache = { value: persisted, fetchedAt: Date.now() };
  }
}

function flagsEqual(a: FeatureFlags, b: FeatureFlags): boolean {
  return (
    a.ff_score === b.ff_score &&
    a.flights === b.flights &&
    a.activity === b.activity &&
    a.hit_calling === b.hit_calling
  );
}

function dispatchRefreshEvent(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event('tm-companion-refresh'));
  } catch {
    // dispatchEvent failing is exotic (e.g. window proxied away during
    // teardown). Swallow — the next poll tick will try again.
  }
}

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
  // Make sure any previously-persisted value is in memory before we compute
  // the "previous value" used for change detection. Otherwise a cold tab
  // with cached flags { ff_score: true } would compare against all-false
  // defaults and dispatch a spurious refresh on the very first tick.
  hydrateFlagsFromStorage();
  const prev = _flagsCache?.value ?? null;
  try {
    const value = await rawGetFlags();
    _flagsCache = { value, fetchedAt: Date.now() };
    writePersistedFlags(value);
    if (prev && !flagsEqual(prev, value)) {
      dispatchRefreshEvent();
    }
    return value;
  } catch {
    // Backend unreachable or returned non-2xx: keep whatever cached value we
    // already have (could be the hydrated persistent one, could be null).
    // Falling back to defaults here would defeat the SWR — a single network
    // blip would wipe out user-visible flag state. If nothing is cached yet,
    // return defaults but don't poison the cache.
    return _flagsCache?.value ?? FEATURE_FLAGS_DEFAULT;
  }
}

export function getCachedFeatureFlags(): FeatureFlags {
  hydrateFlagsFromStorage();
  return _flagsCache?.value ?? FEATURE_FLAGS_DEFAULT;
}

// ── Flights (Phase 2B, FFScouter parity) ────────────────────
//
// Both endpoints 503 when ENABLE_FLIGHTS is off. We soft-fail to "no data"
// rather than bubble the error so callers can render the pill conditionally
// without try/catch blocks at every call site. 30 s cache mirrors the
// scheduler's 60 s tick — the worst stale window is one tick.

const FLIGHTS_TTL_MS = 30_000;

interface PerPlayerFlightCache {
  ts: number;
  value: FlightPlayerResponse | null;
}

const _perPlayerFlightCache = new Map<number, PerPlayerFlightCache>();
let _activeFlightsCache: { ts: number; value: ActiveFlightsResponse } | null = null;

export async function fetchFlight(
  auth: CompanionAuth,
  playerId: number,
): Promise<FlightPlayerResponse | null> {
  const cached = _perPlayerFlightCache.get(playerId);
  const now = Date.now();
  if (cached && now - cached.ts < FLIGHTS_TTL_MS) return cached.value;
  try {
    const value = await get<FlightPlayerResponse>(`/api/flights/${playerId}`, auth);
    _perPlayerFlightCache.set(playerId, { ts: now, value });
    return value;
  } catch {
    _perPlayerFlightCache.set(playerId, { ts: now, value: null });
    return null;
  }
}

export async function fetchActiveFlights(
  auth: CompanionAuth,
): Promise<ActiveFlightsResponse> {
  const now = Date.now();
  if (_activeFlightsCache && now - _activeFlightsCache.ts < FLIGHTS_TTL_MS) {
    return _activeFlightsCache.value;
  }
  try {
    const value = await get<ActiveFlightsResponse>('/api/flights/active', auth);
    _activeFlightsCache = { ts: now, value };
    return value;
  } catch {
    const empty: ActiveFlightsResponse = { flights: [], cached_at: Math.floor(now / 1000) };
    _activeFlightsCache = { ts: now, value: empty };
    return empty;
  }
}

// ── Activity tracker (Phase 3B) ─────────────────────────────
//
// Read API returns a 7×24 heatmap (Mon=0..Sun=6, hour=0..23 UTC) plus the
// suggested attack window string "HH:00-HH:00 UTC". Backend is gated behind
// ENABLE_ACTIVITY — when disabled it returns 503, which we surface as null
// so callers can bail cleanly.

export interface ActivityResponse {
  bins: number[][];
  most_active_window: string;
}

const ACTIVITY_TTL_MS = 5 * 60_000;

const _activityCache = new Map<number, { value: ActivityResponse | null; fetchedAt: number }>();

export async function fetchActivity(
  auth: CompanionAuth,
  playerId: number,
): Promise<ActivityResponse | null> {
  const now = Date.now();
  const cached = _activityCache.get(playerId);
  if (cached && now - cached.fetchedAt < ACTIVITY_TTL_MS) return cached.value;
  try {
    const value = await get<ActivityResponse>(`/api/activity/${playerId}`, auth);
    _activityCache.set(playerId, { value, fetchedAt: now });
    return value;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 503 || err.status === 404)) {
      _activityCache.set(playerId, { value: null, fetchedAt: now });
      return null;
    }
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) throw err;
    _activityCache.set(playerId, { value: null, fetchedAt: now });
    return null;
  }
}

// Per-session enrollment debounce: we POST /track at most once per playerId
// per Companion lifetime. The backend is idempotent anyway, but spamming on
// every profile click would burn the rate-limit budget (30/min per caller).
const _enrolledThisSession = new Set<number>();

export function enrollActivityTracking(auth: CompanionAuth, playerId: number): void {
  if (_enrolledThisSession.has(playerId)) return;
  _enrolledThisSession.add(playerId);
  void post<void>(`/api/activity/track/${playerId}`, {}, auth).catch(() => {
    // Silent no-op on any error; backend is idempotent so retries are safe.
  });
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

// Live stream of TM Hub faction claim events. Extracted to lib/claim-stream
// in Sprint 1 so the polling + Page Visibility gating can be unit-tested.
// The function here is a thin wrapper that wires the default fetcher; the
// behaviour contract lives in lib/claim-stream.ts.
import { createClaimStream, type ClaimStreamEvent } from './claim-stream';
export type { ClaimStreamEvent };

export function streamClaims(
  getAuthFn: () => CompanionAuth | null,
  onEvent: (e: ClaimStreamEvent) => void,
): () => void {
  const handle = createClaimStream(getAuthFn, onEvent, {
    fetcher: fetchActiveClaims,
    isAuthError: (err) => err instanceof ApiError && (err.status === 401 || err.status === 403),
  });
  return handle.stop;
}

export { ApiError };
