"use client";

import { useState, useEffect, useCallback } from "react";

interface AdminFetch {
  <T>(path: string, init?: RequestInit): Promise<T>;
}

interface SpyEstimate {
  player_id: number;
  player_name: string | null;
  total: number;
  confidence: string;
  source: string;
  age_days: number | null;
}

interface BlockedEntry {
  player_id: number;
  reason: string | null;
  blocked_by: number;
  blocked_at: string;
}

interface HiddenEntry {
  player_id: number;
  hidden_by: number;
  hidden_at: string;
}

function fmt(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  return n > 0 ? `${(n / 1e3).toFixed(0)}K` : "—";
}

export function SpyAdmin({ adminFetch }: { adminFetch: AdminFetch }) {
  const [estimates, setEstimates] = useState<SpyEstimate[]>([]);
  const [blocked, setBlocked] = useState<BlockedEntry[]>([]);
  const [hidden, setHidden] = useState<HiddenEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Action forms
  const [blockId, setBlockId] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [hideId, setHideId] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [knownRes, blockedRes, hiddenRes] = await Promise.all([
        adminFetch<{ estimates: SpyEstimate[] }>("/api/spy/known"),
        adminFetch<{ blocked: BlockedEntry[] }>("/api/spy/admin/blocked"),
        adminFetch<{ hidden: HiddenEntry[] }>("/api/spy/admin/hidden"),
      ]);
      setEstimates(knownRes.estimates);
      setBlocked(blockedRes.blocked);
      setHidden(hiddenRes.hidden);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (playerId: number) => {
    if (!confirm(`Delete all spy data for player ${playerId}?`)) return;
    try {
      await adminFetch(`/api/spy/admin/${playerId}`, { method: "DELETE" });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const handleBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    const pid = parseInt(blockId, 10);
    if (!pid) return;
    try {
      await adminFetch(`/api/spy/admin/block/${pid}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: blockReason || null }),
      });
      setBlockId("");
      setBlockReason("");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Block failed");
    }
  };

  const handleUnblock = async (playerId: number) => {
    try {
      await adminFetch(`/api/spy/admin/block/${playerId}`, { method: "DELETE" });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Unblock failed");
    }
  };

  const handleHide = async (e: React.FormEvent) => {
    e.preventDefault();
    const pid = parseInt(hideId, 10);
    if (!pid) return;
    try {
      await adminFetch(`/api/spy/admin/hide/${pid}`, { method: "POST" });
      setHideId("");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Hide failed");
    }
  };

  const handleUnhide = async (playerId: number) => {
    try {
      await adminFetch(`/api/spy/admin/hide/${playerId}`, { method: "DELETE" });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Unhide failed");
    }
  };

  if (loading) return <div className="text-text-secondary text-sm">Loading spy admin...</div>;
  if (error) return <div className="bg-danger/10 border border-danger/30 rounded p-3 text-sm text-danger">{error}</div>;

  return (
    <div className="space-y-8">
      {/* Known Stats */}
      <section>
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
          Known Stats ({estimates.length})
        </h2>
        {estimates.length === 0 ? (
          <p className="text-text-muted text-sm">No spy data yet.</p>
        ) : (
          <div className="bg-bg-surface border border-border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-muted text-xs uppercase">
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Age</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {estimates.map(e => (
                  <tr key={e.player_id} className="border-b border-border-light last:border-0">
                    <td className="px-3 py-2 text-text-primary">
                      {e.player_name || `#${e.player_id}`}
                      <span className="ml-1 text-xs text-text-muted">[{e.player_id}]</span>
                    </td>
                    <td className="px-3 py-2 text-torn-green font-semibold">{fmt(e.total)}</td>
                    <td className="px-3 py-2 text-text-muted text-xs">{e.source}</td>
                    <td className="px-3 py-2 text-text-muted text-xs">{e.age_days != null ? `${e.age_days}d` : "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => handleDelete(e.player_id)}
                              className="text-xs text-red-400 hover:text-red-300 transition-colors">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Block Players */}
      <section>
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
          Blocked Players ({blocked.length})
        </h2>
        <p className="text-xs text-text-muted mb-3">
          Blocked players cannot be looked up, submitted, or fetched. Existing data is deleted on block.
        </p>
        <form onSubmit={handleBlock} className="flex gap-2 mb-3">
          <input type="text" value={blockId} onChange={e => setBlockId(e.target.value)} placeholder="Player ID"
                 className="w-32 bg-bg-primary border border-border rounded px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-torn-green" />
          <input type="text" value={blockReason} onChange={e => setBlockReason(e.target.value)} placeholder="Reason (optional)"
                 className="flex-1 bg-bg-primary border border-border rounded px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-torn-green" />
          <button type="submit" className="px-3 py-1.5 bg-danger text-white text-sm rounded hover:bg-danger/80 transition-colors">Block</button>
        </form>
        {blocked.length > 0 && (
          <div className="bg-bg-surface border border-border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-muted text-xs uppercase">
                  <th className="px-3 py-2">Player ID</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2">Blocked At</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {blocked.map(b => (
                  <tr key={b.player_id} className="border-b border-border-light last:border-0">
                    <td className="px-3 py-2 text-text-primary">[{b.player_id}]</td>
                    <td className="px-3 py-2 text-text-secondary text-xs">{b.reason || "—"}</td>
                    <td className="px-3 py-2 text-text-muted text-xs">{b.blocked_at}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => handleUnblock(b.player_id)}
                              className="text-xs text-torn-green hover:text-torn-green/80 transition-colors">
                        Unblock
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Hidden Players */}
      <section>
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
          Hidden Players ({hidden.length})
        </h2>
        <p className="text-xs text-text-muted mb-3">
          Hidden players are excluded from the Known Stats list and name search for non-admins. Data remains in the database.
        </p>
        <form onSubmit={handleHide} className="flex gap-2 mb-3">
          <input type="text" value={hideId} onChange={e => setHideId(e.target.value)} placeholder="Player ID"
                 className="w-32 bg-bg-primary border border-border rounded px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-torn-green" />
          <button type="submit" className="px-3 py-1.5 bg-warning text-black text-sm rounded hover:bg-warning/80 transition-colors">Hide</button>
        </form>
        {hidden.length > 0 && (
          <div className="bg-bg-surface border border-border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-muted text-xs uppercase">
                  <th className="px-3 py-2">Player ID</th>
                  <th className="px-3 py-2">Hidden At</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {hidden.map(h => (
                  <tr key={h.player_id} className="border-b border-border-light last:border-0">
                    <td className="px-3 py-2 text-text-primary">[{h.player_id}]</td>
                    <td className="px-3 py-2 text-text-muted text-xs">{h.hidden_at}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => handleUnhide(h.player_id)}
                              className="text-xs text-torn-green hover:text-torn-green/80 transition-colors">
                        Unhide
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
