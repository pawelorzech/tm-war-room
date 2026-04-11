import type { Announcement } from "@/types/admin";
import type { SpyEstimate, SpySubmitResponse } from "@/types/spy";
import type { Bot, Channel, Message, Thread, UnreadCounts } from "@/types/chat";

export const AUTH_EVENT_NAME = "tmhub:auth-changed";

function getPlayerId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("myKeyPlayer");
}

export function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("sessionToken");
}

export function storeSessionToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem("sessionToken", token);
    return;
  }
  localStorage.removeItem("sessionToken");
}

export function clearStoredAuth(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("myKeyPlayer");
  localStorage.removeItem("myKeyName");
  localStorage.removeItem("myKeyRole");
  localStorage.removeItem("myKeyAccess");
  localStorage.removeItem("myKeyLimited");
  localStorage.removeItem("sessionToken");
  localStorage.removeItem("adminToken");
}

export function notifyAuthStateChanged(authenticated: boolean): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(AUTH_EVENT_NAME, {
      detail: { authenticated },
    }),
  );
}

interface ApiFetchOptions extends RequestInit {
  includeAuth?: boolean;
}

function apiPostJson<T>(path: string, body: unknown, init?: Omit<ApiFetchOptions, "body" | "method">): Promise<T> {
  return apiFetch<T>(path, {
    ...init,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...((init?.headers as Record<string, string>) || {}),
    },
    body: JSON.stringify(body),
  });
}

function buildAuthHeaders(
  headers: Record<string, string>,
  includeAuth: boolean,
): Record<string, string> {
  if (!includeAuth) return headers;

  const pid = getPlayerId();
  const token = getSessionToken();
  if (pid) {
    headers["X-Player-Id"] = pid;
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function readResponseBody(res: Response): Promise<unknown> {
  return res.json().catch(() => ({}));
}

// Deduplicate concurrent GET requests to the same path
const _inflight = new Map<string, Promise<unknown>>();

async function apiFetch<T>(path: string, init?: ApiFetchOptions): Promise<T> {
  const method = init?.method?.toUpperCase() ?? "GET";
  const isGet = method === "GET";

  // Reuse inflight GET requests instead of firing duplicates
  if (isGet) {
    const pending = _inflight.get(path);
    if (pending) return pending as Promise<T>;
  }

  const promise = _apiFetchInner<T>(path, init);
  if (isGet) {
    _inflight.set(path, promise);
    promise.finally(() => _inflight.delete(path));
  }
  return promise;
}

async function _apiFetchInner<T>(path: string, init?: ApiFetchOptions): Promise<T> {
  const headers = buildAuthHeaders(
    {
      ...((init?.headers as Record<string, string>) || {}),
    },
    init?.includeAuth !== false,
  );

  const res = await fetch(path, { ...init, headers });
  if (res.status === 401) {
    clearStoredAuth();
    notifyAuthStateChanged(false);
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const body = await readResponseBody(res);
    const detail = typeof body === "object" && body && "detail" in body ? body.detail : null;
    throw new Error(typeof detail === "string" ? detail : `HTTP ${res.status}`);
  }
  return (await readResponseBody(res)) as T;
}

export const api = {
  overview: () => apiFetch<import("@/types/war").OverviewResponse>("/api/overview"),
  detail: () => apiFetch<import("@/types/war").DetailResponse>("/api/members/detail"),
  enemy: (factionId?: number) => {
    const pid = getPlayerId();
    let url = factionId ? `/api/enemy?faction_id=${factionId}` : "/api/enemy";
    if (pid) url += `${url.includes("?") ? "&" : "?"}baseline_pid=${pid}`;
    return apiFetch<import("@/types/war").EnemyResponse>(url);
  },
  me: () => apiFetch<import("@/types/admin").MeResponse>("/api/me"),
  announcements: () => apiFetch<{ announcements: Announcement[] }>("/api/announcements"),
  announcementsAll: () => apiFetch<{ announcements: Announcement[] }>("/api/announcements/all"),
  trainingStats: () => apiFetch<{
    profile: { player_id: number; name: string; level: number };
    battlestats: { strength: number; defense: number; speed: number; dexterity: number };
    bars: { happy: { current: number; maximum: number }; energy: { current: number; maximum: number } };
    gym: { active_gym: number };
    merits: { brawn: number; protection: number; sharpness: number; evasion: number };
    personalstats: { xantaken: number; refills: number; statenhancersused: number; rehabs: number };
    steadfast: { strength: number; defense: number; speed: number; dexterity: number };
    educationCompleted: number[];
    educationPerks: string[];
    bookPerks: string[];
    companyPerks: string[];
    job: { company_name: string; company_type: number; position: string };
    level: number;
  }>("/api/training/stats"),
  spyEstimate: (playerId: number) => apiFetch<import("@/types/spy").SpyEstimate>(`/api/spy/${playerId}`),
  spySearch: (name: string) => apiFetch<import("@/types/spy").SpyEstimate>(`/api/spy/search?q=${encodeURIComponent(name)}`),
  spyKnown: () => apiFetch<{ estimates: SpyEstimate[]; count: number }>("/api/spy/known"),
  spyFaction: (factionId: number) => apiFetch<import("@/types/spy").SpyFactionResponse>(`/api/spy/faction/${factionId}`),
  chainList: (force?: boolean) => apiFetch<unknown>(`/api/chain/chains${force ? '?force=true' : ''}`),
  chainDetail: (start: number, end: number) => apiFetch<unknown>(`/api/chain/chains/detail?start=${start}&end=${end}`),
  chainReport: (hours: number = 24) => apiFetch<unknown>(`/api/chain/report?hours=${hours}`),
  chainRecent: (limit: number = 50) => apiFetch<unknown>(`/api/chain/recent?limit=${limit}`),
  chainTimeline: (hours: number = 48) => apiFetch<unknown>(`/api/chain/timeline?hours=${hours}`),
  chainAnalytics: (days: number = 7) => apiFetch<unknown>(`/api/chain/analytics?days=${days}`),
  awardsMe: () => apiFetch<unknown>(`/api/awards/me`),
  awardDetail: (kind: string, id: number) => apiFetch<unknown>(`/api/awards/detail/${kind}/${id}`),
  awardCirculation: (kind: string, id: number, days?: number) =>
    apiFetch<{ award_id: number; kind: string; history: { snapshot_date: string; circulation: number }[]; count: number }>(
      `/api/awards/circulation/${kind}/${id}${days ? `?days=${days}` : ''}`
    ),
  targetsList: (tag?: string) => apiFetch<unknown>(`/api/targets${tag ? `?tag=${encodeURIComponent(tag)}` : ''}`),
  targetsAdd: (data: { player_id: number; player_name?: string; tag?: string; notes?: string; difficulty?: string }) =>
    apiFetch<unknown>('/api/targets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  targetsUpdate: (playerId: number, data: { tag?: string; notes?: string; difficulty?: string }) =>
    apiFetch<unknown>(`/api/targets/${playerId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  targetsRemove: (playerId: number) =>
    apiFetch<unknown>(`/api/targets/${playerId}`, { method: 'DELETE' }),
  lootTimers: () => apiFetch<unknown>('/api/loot'),
  lootReserve: (npc_id: number, npc_name: string, target_level: number) =>
    apiFetch<unknown>('/api/loot/reserve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ npc_id, npc_name, target_level }) }),
  lootCancelReserve: (npc_id: number) =>
    apiFetch<unknown>(`/api/loot/reserve/${npc_id}`, { method: 'DELETE' }),
  travelInfo: () => apiFetch<unknown>('/api/travel'),
  ocOverview: (cat?: string) => apiFetch<unknown>(`/api/oc${cat ? `?cat=${cat}` : ''}`),
  warHistory: () => apiFetch<unknown>('/api/wars'),
  bounties: () => apiFetch<unknown>('/api/bounties'),
  notifications: () => apiFetch<unknown>('/api/notifications'),
  notificationsUnread: () => apiFetch<unknown>('/api/notifications/unread'),
  notificationsReadAll: () => apiFetch<unknown>('/api/notifications/read-all', { method: 'POST' }),
  stakeoutList: () => apiFetch<unknown>('/api/stakeout'),
  stakeoutAdd: (data: { player_id: number; player_name?: string; notes?: string }) =>
    apiFetch<unknown>('/api/stakeout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  stakeoutRemove: (playerId: number) =>
    apiFetch<unknown>(`/api/stakeout/${playerId}`, { method: 'DELETE' }),
  stockMarket: () => apiFetch<unknown>('/api/stocks/market'),
  stockPortfolio: () => apiFetch<unknown>('/api/stocks/portfolio'),
  stockHistory: (stockId: number, days?: number) => apiFetch<unknown>(`/api/stocks/history/${stockId}${days ? `?days=${days}` : ''}`),
  stockROI: () => apiFetch<unknown>('/api/stocks/roi'),
  revives: () => apiFetch<unknown>('/api/revives'),
  companyCatalog: () => apiFetch<{
    companies: {
      id: number; name: string; cost: number; default_employees: number;
      positions: { name: string; man_required: number; int_required: number; end_required: number; special_ability?: string }[];
      stock: { name: string; cost: number; rrp: number }[];
      specials: { name: string; effect: string; cost: number; rating_required: number }[];
    }[];
    count: number;
  }>('/api/company/catalog'),
  companyFaction: () => apiFetch<{
    companies: {
      company_id: number; company_name: string; company_type: number;
      members: { player_id: number; player_name: string; position: string }[];
    }[];
    count: number;
  }>('/api/company/faction'),
  marketPrices: (items?: string) => apiFetch<{ items: unknown[]; count: number }>(`/api/market/prices${items ? `?items=${items}` : ''}`),
  statSnapshots: (playerId: number) => apiFetch<{ player_id: number; snapshots: unknown[]; count: number }>(`/api/stats/snapshots/${playerId}`),
  statGrowth: (playerId: number, days: number = 30) => apiFetch<unknown>(`/api/stats/growth/${playerId}?days=${days}`),
  statLeaderboard: () => apiFetch<{ members: unknown[]; count: number }>("/api/stats/leaderboard"),
  statGrowthLeaderboard: (days: number = 30) => apiFetch<{ members: unknown[]; count: number; days: number }>(`/api/stats/growth-leaderboard?days=${days}`),
  spySubmit: (data: { player_id: number; strength: number; defense: number; speed: number; dexterity: number }) =>
    apiPostJson<SpySubmitResponse>("/api/spy/submit", data),
  pushVapidKey: () => apiFetch<{ vapid_public_key: string | null; enabled: boolean }>('/api/push/vapid-key'),
  pushSubscribe: (data: { endpoint: string; keys: { p256dh: string; auth: string }; preferences: Record<string, boolean> }) =>
    apiFetch<unknown>('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  pushPreferences: (prefs: Record<string, boolean>) =>
    apiFetch<unknown>('/api/push/preferences', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preferences: prefs }) }),
  pushUnsubscribe: (endpoint: string) =>
    apiFetch<unknown>(`/api/push/unsubscribe?endpoint=${encodeURIComponent(endpoint)}`, { method: 'DELETE' }),
  // ── PDA Push ─────────────────────────────────────────────
  pdaRegister: () =>
    apiFetch<{ status: string }>('/api/push/pda/register', { method: 'POST' }),
  pdaPoll: () =>
    apiFetch<{ events: { event_id: number; title: string; body: string; url: string | null; icon: string | null; created_at: string }[] }>('/api/push/pda/poll'),
  pdaUnregister: () =>
    apiFetch<{ status: string }>('/api/push/pda/unregister', { method: 'DELETE' }),
  versionStatus: (v: string) => apiFetch<{ dismissed: boolean }>(`/api/version/status?v=${encodeURIComponent(v)}`),
  versionDismiss: (version: string) =>
    apiFetch<{ ok: boolean }>('/api/version/dismiss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version }) }),
  // ── Settings ──────────────────────────────────────────────
  status: () => apiFetch<{ war_active: boolean; poll_interval: number; last_refresh: number; refresh_cycle: number }>("/api/status"),
  publicSettings: () => apiFetch<Record<string, string>>("/api/settings/public"),

  // ── Chat ──────────────────────────────────────────────────
  chatChannels: () => apiFetch<{ channels: Channel[] }>("/api/chat/channels"),
  chatMessages: (channelId: number, before?: number, limit = 50) =>
    apiFetch<{ messages: Message[] }>(
      `/api/chat/channels/${channelId}/messages?limit=${limit}${before ? `&before=${before}` : ""}`
    ),
  chatSendMessage: (channelId: number, content: string, mentions: number[] = []) =>
    apiFetch<import("@/types/chat").Message>(`/api/chat/channels/${channelId}/messages`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, mentions }),
    }),
  chatEditMessage: (messageId: number, content: string) =>
    apiFetch<{ status: string }>(`/api/chat/messages/${messageId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }),
  chatDeleteMessage: (messageId: number) =>
    apiFetch<{ status: string }>(`/api/chat/messages/${messageId}`, { method: "DELETE" }),
  chatTogglePin: (messageId: number) =>
    apiFetch<{ status: string; pinned: boolean }>(`/api/chat/messages/${messageId}/pin`, { method: "POST" }),
  chatPinnedMessages: (channelId: number) =>
    apiFetch<{ messages: Message[] }>(`/api/chat/channels/${channelId}/pinned`),
  chatThreads: (channelId: number, before?: number) =>
    apiFetch<{ threads: Thread[] }>(
      `/api/chat/channels/${channelId}/threads${before ? `?before=${before}` : ""}`
    ),
  chatCreateThread: (channelId: number, title: string, content: string) =>
    apiFetch<import("@/types/chat").Thread>(`/api/chat/channels/${channelId}/threads`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content }),
    }),
  chatThreadMessages: (threadId: number, before?: number, limit = 50) =>
    apiFetch<{ thread: Thread; messages: Message[] }>(
      `/api/chat/threads/${threadId}/messages?limit=${limit}${before ? `&before=${before}` : ""}`
    ),
  chatSendThreadMessage: (threadId: number, content: string, mentions: number[] = []) =>
    apiFetch<import("@/types/chat").Message>(`/api/chat/threads/${threadId}/messages`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, mentions }),
    }),
  chatToggleThreadLock: (threadId: number) =>
    apiFetch<{ status: string; locked: boolean }>(`/api/chat/threads/${threadId}/lock`, { method: "POST" }),
  chatToggleThreadPin: (threadId: number) =>
    apiFetch<{ status: string; pinned: boolean }>(`/api/chat/threads/${threadId}/pin`, { method: "POST" }),
  chatDeleteThread: (threadId: number) =>
    apiFetch<{ status: string }>(`/api/chat/threads/${threadId}`, { method: "DELETE" }),
  chatUpdateRead: (channelId: number, messageId: number, threadId = 0) =>
    apiFetch<{ status: string }>("/api/chat/read", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel_id: channelId, message_id: messageId, thread_id: threadId }),
    }),
  chatUnread: () => apiFetch<UnreadCounts>("/api/chat/unread"),
  chatOnline: () => apiFetch<{ online: number[] }>("/api/chat/online"),
  chatTraveling: () => apiFetch<{ travelers: { player_id: number; name: string; status: string }[] }>("/api/chat/traveling"),
  chatAdminIds: () => apiFetch<{ admin_ids: number[] }>("/api/chat/admin-ids"),
  chatCreateChannel: (data: { name: string; description?: string; type?: string; position?: number; admin_only?: boolean }) =>
    apiFetch<{ status: string; channel_id: number }>("/api/chat/channels", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  chatUpdateChannel: (channelId: number, data: Record<string, unknown>) =>
    apiFetch<{ status: string }>(`/api/chat/channels/${channelId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  chatDeleteChannel: (channelId: number) =>
    apiFetch<{ status: string }>(`/api/chat/channels/${channelId}`, { method: "DELETE" }),
  chatMutePlayer: (playerId: number, reason = "", durationHours?: number) =>
    apiFetch<{ status: string }>(`/api/chat/mute/${playerId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, duration_hours: durationHours }),
    }),
  chatUnmutePlayer: (playerId: number) =>
    apiFetch<{ status: string }>(`/api/chat/mute/${playerId}`, { method: "DELETE" }),
  chatBotsList: () => apiFetch<{ bots: Bot[] }>("/api/chat/bots"),
  chatCreateBot: (name: string, allowedChannels = "*") =>
    apiFetch<{ bot_id: number; token: string }>("/api/chat/bots", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, allowed_channels: allowedChannels }),
    }),
  chatDeleteBot: (botId: number) =>
    apiFetch<{ status: string }>(`/api/chat/bots/${botId}`, { method: "DELETE" }),

  // ── Avatars & Presence ──────────────────────────────
  heartbeat: () =>
    apiFetch<{ ok: boolean }>('/api/heartbeat', { method: 'POST' }),
  memberAvatars: () =>
    apiFetch<{ avatars: Record<string, string> }>('/api/members/avatars'),
  profileMe: () =>
    apiFetch<{
      player_id: number;
      name: string;
      level: number;
      faction: { position: string; faction_id?: number; faction_name?: string } | null;
      profile_image: string | null;
      life: { current: number; maximum: number } | null;
      last_action: { status: string; timestamp: number } | null;
      status: { description: string } | null;
    }>('/api/profile/me'),

  // ── Armoury Competitions ────────────────────────────
  armouryCompetitions: () => apiFetch<{
    competitions: {
      id: number; name: string; category: string; items: string | null; status: string;
      start_ts: number; end_ts: number; created_by: number | null;
      prize_text: string | null;
    }[];
    count: number;
  }>('/api/armoury/competitions'),
  armouryLeaderboard: (id: number) => apiFetch<{
    competition: {
      id: number; name: string; category: string; items: string | null; status: string;
      start_ts: number; end_ts: number;
      prize_text: string | null;
    };
    leaderboard: {
      rank: number; player_id: number; player_name: string;
      total: number; deposits: number; last_deposit: number;
    }[];
    total_deposited: number;
    participants: number;
  }>(`/api/armoury/competitions/${id}/leaderboard`),
  armouryCreateCompetition: (data: { name: string; categories: string[]; items?: string[]; start_ts: number; end_ts: number; prize_text?: string }) =>
    apiPostJson<{ id: number; status: string }>('/api/armoury/competitions', data),
  armouryEndCompetition: (id: number) =>
    apiPostJson<{ status: string }>(`/api/armoury/competitions/${id}/end`, {}),
  armourySearchItems: (q: string) =>
    apiFetch<{ items: { id: number; name: string; type: string }[] }>(
      `/api/armoury/items/search?q=${encodeURIComponent(q)}`
    ),
  armouryCategories: () =>
    apiFetch<{ categories: Record<string, string[]> }>('/api/armoury/categories'),
  armouryPoll: () =>
    apiPostJson<{ status: string }>('/api/armoury/poll', {}),

  listKeys: () => apiFetch<{ keys: { player_id: number; name: string }[] }>("/api/keys"),

  registerKey: (apiKey: string) =>
    apiPostJson<{
      player_id: number;
      name: string;
      role: import("@/types/admin").Role;
      access_level?: string;
      limited_features?: string[];
      token?: string;
    }>(
      "/api/keys",
      { api_key: apiKey },
      { includeAuth: false },
    ),
};
