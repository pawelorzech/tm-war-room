function getPlayerId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("myKeyPlayer");
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const pid = getPlayerId();
  const headers: Record<string, string> = {
    ...((init?.headers as Record<string, string>) || {}),
  };
  if (pid) headers["X-Player-Id"] = pid;

  const res = await fetch(path, { ...init, headers });
  if (res.status === 401) {
    localStorage.removeItem("myKeyPlayer");
    localStorage.removeItem("myKeyName");
    window.location.reload();
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
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
  announcements: () => apiFetch<{ announcements: import("@/types/admin").Announcement[] }>("/api/announcements"),
  announcementsAll: () => apiFetch<{ announcements: import("@/types/admin").Announcement[] }>("/api/announcements/all"),
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
    level: number;
  }>("/api/training/stats"),
  spyEstimate: (playerId: number) => apiFetch<import("@/types/spy").SpyEstimate>(`/api/spy/${playerId}`),
  spySearch: (name: string) => apiFetch<import("@/types/spy").SpyEstimate>(`/api/spy/search?q=${encodeURIComponent(name)}`),
  spyKnown: () => apiFetch<{ estimates: import("@/types/spy").SpyEstimate[]; count: number }>("/api/spy/known"),
  spyFaction: (factionId: number) => apiFetch<import("@/types/spy").SpyFactionResponse>(`/api/spy/faction/${factionId}`),
  chainList: (force?: boolean) => apiFetch<unknown>(`/api/chain/chains${force ? '?force=true' : ''}`),
  chainDetail: (start: number, end: number) => apiFetch<unknown>(`/api/chain/chains/detail?start=${start}&end=${end}`),
  chainReport: (hours: number = 24) => apiFetch<unknown>(`/api/chain/report?hours=${hours}`),
  chainRecent: (limit: number = 50) => apiFetch<unknown>(`/api/chain/recent?limit=${limit}`),
  awardsMe: () => apiFetch<unknown>(`/api/awards/me`),
  targetsList: (tag?: string) => apiFetch<unknown>(`/api/targets${tag ? `?tag=${encodeURIComponent(tag)}` : ''}`),
  targetsAdd: (data: { player_id: number; player_name?: string; tag?: string; notes?: string; difficulty?: string }) =>
    apiFetch<unknown>('/api/targets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  targetsUpdate: (playerId: number, data: { tag?: string; notes?: string; difficulty?: string }) =>
    apiFetch<unknown>(`/api/targets/${playerId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  targetsRemove: (playerId: number) =>
    apiFetch<unknown>(`/api/targets/${playerId}`, { method: 'DELETE' }),
  lootTimers: () => apiFetch<unknown>('/api/loot'),
  travelInfo: () => apiFetch<unknown>('/api/travel'),
  stockMarket: () => apiFetch<unknown>('/api/stocks/market'),
  stockPortfolio: () => apiFetch<unknown>('/api/stocks/portfolio'),
  revives: () => apiFetch<unknown>('/api/revives'),
  marketPrices: (items?: string) => apiFetch<{ items: unknown[]; count: number }>(`/api/market/prices${items ? `?items=${items}` : ''}`),
  statSnapshots: (playerId: number) => apiFetch<{ player_id: number; snapshots: unknown[]; count: number }>(`/api/stats/snapshots/${playerId}`),
  statGrowth: (playerId: number, days: number = 30) => apiFetch<unknown>(`/api/stats/growth/${playerId}?days=${days}`),
  statLeaderboard: () => apiFetch<{ members: unknown[]; count: number }>("/api/stats/leaderboard"),
  spySubmit: (data: { player_id: number; strength: number; defense: number; speed: number; dexterity: number }) =>
    fetch(`/api/spy/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Player-Id": (typeof window !== "undefined" && localStorage.getItem("myKeyPlayer")) || "" },
      body: JSON.stringify(data),
    }).then(r => r.json()),
  registerKey: (apiKey: string) =>
    fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey }),
    }).then(async (r) => {
      const body = await r.json();
      if (!r.ok) throw new Error(body.detail || "Failed");
      return body as { player_id: number; name: string; role: import("@/types/admin").Role };
    }),
};
