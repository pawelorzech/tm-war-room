"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api-client";
import { formatDateShort } from "@/lib/format";

interface AdminFetch {
  <T>(path: string, init?: RequestInit): Promise<T>;
}

// Matches actual backend /api/admin/admins response
interface AdminEntry {
  player_id: number;
  player_name: string;
  granted_by: number;
  granted_at: string;
}

interface AdminsResponse {
  admins: AdminEntry[];
  superadmin_id: number;
}

// Matches /api/admin/keys response
interface KeyEntry {
  player_id: number;
  player_name: string;
  is_faction_key: boolean;
  created_at: string;
}

export function ManageAdmins({ adminFetch }: { adminFetch: AdminFetch }) {
  const { role } = useAuth();
  const [admins, setAdmins] = useState<AdminEntry[]>([]);
  const [superadminId, setSuperadminId] = useState<number>(0);
  const [registeredMembers, setRegisteredMembers] = useState<KeyEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Promote form
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [promoting, setPromoting] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [promoteSuccess, setPromoteSuccess] = useState(false);

  // Demote state
  const [demoting, setDemoting] = useState<number | null>(null);
  const [demoteError, setDemoteError] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [adminsRes, keysRes] = await Promise.all([
        adminFetch<AdminsResponse>("/api/admin/admins"),
        adminFetch<{ keys: KeyEntry[]; registered_count: number; total_faction_members: number }>("/api/admin/keys"),
      ]);
      setAdmins(adminsRes.admins);
      setSuperadminId(adminsRes.superadmin_id);
      setRegisteredMembers(keysRes.keys);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load data");
    }
  }, [adminFetch]);

  useEffect(() => { load(); }, [load]);

  const promotable = useMemo(() => {
    const adminIds = new Set([superadminId, ...admins.map((a) => a.player_id)]);
    return registeredMembers.filter((m) => !adminIds.has(m.player_id));
  }, [superadminId, admins, registeredMembers]);

  if (role !== "superadmin") {
    return (
      <p className="text-text-secondary text-sm">
        Superadmin access required to manage admins.
      </p>
    );
  }

  const handlePromote = async (e: React.FormEvent) => {
    e.preventDefault();
    const pid = parseInt(selectedPlayerId, 10);
    if (!pid || isNaN(pid)) return;
    setPromoting(true);
    setPromoteError(null);
    setPromoteSuccess(false);
    try {
      await adminFetch(`/api/admin/admins/${pid}`, { method: "POST" });
      setSelectedPlayerId("");
      setPromoteSuccess(true);
      await load();
      setTimeout(() => setPromoteSuccess(false), 3000);
    } catch (e) {
      setPromoteError(e instanceof Error ? e.message : "Failed to promote");
    } finally {
      setPromoting(false);
    }
  };

  const handleDemote = async (playerId: number) => {
    setDemoting(playerId);
    setDemoteError((prev) => ({ ...prev, [playerId]: "" }));
    try {
      await adminFetch(`/api/admin/admins/${playerId}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setDemoteError((prev) => ({
        ...prev,
        [playerId]: e instanceof Error ? e.message : "Failed to demote",
      }));
    } finally {
      setDemoting(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Superadmin note */}
      <div className="bg-blue-900/20 border border-blue-700 text-blue-200 rounded p-3 text-sm">
        Superadmin (player {superadminId}) always has full access and cannot be demoted.
      </div>

      {loadError && (
        <div className="bg-red-900/30 border border-red-500 text-red-200 rounded p-3 text-sm">
          {loadError}
        </div>
      )}

      {/* Current Admins */}
      <section>
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
          Current Admins ({admins.length})
        </h2>
        {admins.length === 0 ? (
          <p className="text-text-secondary text-sm">No admins promoted yet. Use the form below to add one.</p>
        ) : (
          <div className="bg-bg-surface border border-border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 text-text-secondary font-medium">Player</th>
                  <th className="text-left px-3 py-2 text-text-secondary font-medium">Granted</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a.player_id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-text-primary">
                      {a.player_name || 'Unknown'}
                      <span className="ml-1 text-xs text-text-secondary">[{a.player_id}]</span>
                    </td>
                    <td className="px-3 py-2 text-text-secondary text-xs">{a.granted_at ? formatDateShort(a.granted_at) : '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleDemote(a.player_id)}
                          disabled={demoting === a.player_id}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                        >
                          {demoting === a.player_id ? "Demoting..." : "Demote"}
                        </button>
                        {demoteError[a.player_id] && (
                          <span className="text-xs text-red-400">{demoteError[a.player_id]}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Promote Form */}
      <section>
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
          Promote to Admin
        </h2>
        <form onSubmit={handlePromote} className="bg-bg-surface border border-border rounded p-4">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-xs text-text-secondary mb-1">Select member</label>
              <select
                value={selectedPlayerId}
                onChange={(e) => setSelectedPlayerId(e.target.value)}
                className="w-full bg-bg-primary border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-torn-green"
              >
                <option value="">— choose a member —</option>
                {promotable.map((m) => (
                  <option key={m.player_id} value={m.player_id}>
                    {m.player_name} [{m.player_id}]
                  </option>
                ))}
              </select>
              {promotable.length === 0 && registeredMembers.length > 0 && (
                <p className="mt-1 text-text-muted text-xs">All registered members are already admins.</p>
              )}
            </div>
            <button
              type="submit"
              disabled={promoting || !selectedPlayerId}
              className="px-4 py-2 bg-torn-green text-black text-sm font-medium rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {promoting ? "Promoting..." : "Promote"}
            </button>
          </div>
          {promoteError && (
            <p className="mt-2 text-red-400 text-xs">{promoteError}</p>
          )}
          {promoteSuccess && (
            <p className="mt-2 text-green-400 text-xs">Player promoted to admin.</p>
          )}
        </form>
      </section>
    </div>
  );
}
