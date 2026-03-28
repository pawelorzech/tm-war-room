"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";

interface AdminFetch {
  <T>(path: string, init?: RequestInit): Promise<T>;
}

interface AdminEntry {
  player_id: number;
  name: string;
  role: "admin" | "superadmin";
  granted_at: string;
}

interface AdminsResponse {
  admins: AdminEntry[];
}

const SUPERADMIN_ID = 2362436;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ManageAdmins({ adminFetch }: { adminFetch: AdminFetch }) {
  const { role } = useAuth();
  const [admins, setAdmins] = useState<AdminEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Promote form
  const [promoteId, setPromoteId] = useState("");
  const [promoting, setPromoting] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [promoteSuccess, setPromoteSuccess] = useState(false);

  // Demote state
  const [demoting, setDemoting] = useState<number | null>(null);
  const [demoteError, setDemoteError] = useState<Record<number, string>>({});

  const loadAdmins = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await adminFetch<AdminsResponse>("/api/admin/admins");
      setAdmins(res.admins);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load admins");
    }
  }, [adminFetch]);

  useEffect(() => { loadAdmins(); }, [loadAdmins]);

  if (role !== "superadmin") {
    return (
      <p className="text-text-secondary text-sm">
        Superadmin access required to manage admins.
      </p>
    );
  }

  const handlePromote = async (e: React.FormEvent) => {
    e.preventDefault();
    const pid = parseInt(promoteId.trim(), 10);
    if (!pid || isNaN(pid)) return;
    setPromoting(true);
    setPromoteError(null);
    setPromoteSuccess(false);
    try {
      await adminFetch(`/api/admin/admins/${pid}`, { method: "POST" });
      setPromoteId("");
      setPromoteSuccess(true);
      await loadAdmins();
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
      await loadAdmins();
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
        Superadmin (player {SUPERADMIN_ID}) always has full access and cannot be demoted.
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
          <p className="text-text-secondary text-sm">No admins found.</p>
        ) : (
          <div className="bg-bg-surface border border-border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 text-text-secondary font-medium">Player</th>
                  <th className="text-left px-3 py-2 text-text-secondary font-medium">Role</th>
                  <th className="text-left px-3 py-2 text-text-secondary font-medium">Granted</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a.player_id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-text-primary">
                      {a.name}
                      <span className="ml-1 text-xs text-text-secondary">[{a.player_id}]</span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-xs font-semibold uppercase ${
                          a.role === "superadmin"
                            ? "bg-purple-800 text-purple-200"
                            : "bg-blue-800 text-blue-200"
                        }`}
                      >
                        {a.role}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-text-secondary">{formatDate(a.granted_at)}</td>
                    <td className="px-3 py-2 text-right">
                      {a.role !== "superadmin" && (
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
                      )}
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
          Promote Player
        </h2>
        <form onSubmit={handlePromote} className="bg-bg-surface border border-border rounded p-4">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-xs text-text-secondary mb-1">Player ID</label>
              <input
                type="number"
                value={promoteId}
                onChange={(e) => setPromoteId(e.target.value)}
                placeholder="e.g. 1234567"
                className="w-full bg-bg-base border border-border rounded px-3 py-1.5 text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-torn-green"
              />
            </div>
            <button
              type="submit"
              disabled={promoting || !promoteId.trim()}
              className="px-4 py-1.5 bg-torn-green text-black text-sm font-medium rounded hover:opacity-90 disabled:opacity-50"
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
