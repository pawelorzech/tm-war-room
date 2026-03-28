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
    education_completed: number[];
    education_perks: string[];
    book_perks: string[];
  }>("/api/training/stats"),
  spyEstimate: (playerId: number) => apiFetch<import("@/types/spy").SpyEstimate>(`/api/spy/${playerId}`),
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
