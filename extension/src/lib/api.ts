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
  TargetsResponse,
  StakeoutsResponse,
  BountiesResponse,
  LootResponse,
  StockPortfolioResponse,
  StockRoiResponse,
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

export { ApiError };
