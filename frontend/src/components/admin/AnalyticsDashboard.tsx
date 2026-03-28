"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { formatUptime } from "@/lib/format";

interface AdminFetch {
  <T>(path: string, init?: RequestInit): Promise<T>;
}

// Matches actual backend response shapes
interface RequestStats {
  per_day: Array<{ date: string; count: number; avg_response_ms: number }>;
  per_endpoint: Array<{ endpoint: string; count: number; avg_response_ms: number }>;
}

interface UserStats {
  users: Array<{ player_id: number; player_name: string; request_count: number; last_seen: string }>;
}

interface ErrorEntry {
  endpoint: string;
  status_code: number;
  count: number;
  last_occurred: string;
  last_error_message: string | null;
}

interface SystemInfo {
  uptime_seconds: number;
  version: string;
  cache: { entries: number; last_refresh: number | null };
  integrations: Record<string, { status: string; last_success: string | null; last_error: string | null; last_error_at: string | null }>;
}

interface KeysInfo {
  keys: Array<{ player_id: number; player_name: string; is_faction_key: boolean; created_at: string }>;
  registered_count: number;
  total_faction_members: number;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-bg-surface border border-border rounded p-3">
      <div className="text-xs text-text-secondary mb-1">{label}</div>
      <div className="text-lg font-semibold text-text-primary">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ok: "bg-green-800 text-green-200",
    error: "bg-red-800 text-red-200",
    unknown: "bg-gray-700 text-gray-300",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${styles[status] || styles.unknown}`}>
      {status}
    </span>
  );
}

export function AnalyticsDashboard({ adminFetch }: { adminFetch: AdminFetch }) {
  const [days, setDays] = useState(7);
  const [requestStats, setRequestStats] = useState<RequestStats | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [errorStats, setErrorStats] = useState<ErrorEntry[]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [keysInfo, setKeysInfo] = useState<KeysInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [req, usr, err, sys, keys] = await Promise.all([
        adminFetch<RequestStats>(`/api/admin/stats/requests?days=${days}`),
        adminFetch<UserStats>(`/api/admin/stats/users?days=${days}`),
        adminFetch<{ errors: ErrorEntry[] }>(`/api/admin/stats/errors?days=${days}`),
        adminFetch<SystemInfo>("/api/admin/system"),
        adminFetch<KeysInfo>("/api/admin/keys"),
      ]);
      setRequestStats(req);
      setUserStats(usr);
      setErrorStats(err.errors || []);
      setSystemInfo(sys);
      setKeysInfo(keys);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, [adminFetch, days]);

  useEffect(() => { load(); }, [load]);

  const totalRequests = useMemo(() => requestStats?.per_day.reduce((s, d) => s + d.count, 0) ?? 0, [requestStats]);
  const totalErrors = useMemo(() => errorStats.reduce((s, e) => s + e.count, 0), [errorStats]);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-text-secondary">Date range:</span>
        {[7, 14, 30].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              days === d
                ? "bg-torn-green text-black font-medium"
                : "bg-bg-surface border border-border text-text-secondary hover:text-text-primary"
            }`}
          >
            {d}d
          </button>
        ))}
        <button
          onClick={load}
          disabled={loading}
          className="ml-auto px-3 py-1 rounded text-sm bg-bg-surface border border-border text-text-secondary hover:text-text-primary disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500 text-red-200 rounded p-3 text-sm">
          {error}
        </div>
      )}

      {/* System Info */}
      {systemInfo && (
        <section>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">System</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Uptime" value={formatUptime(systemInfo.uptime_seconds)} />
            <StatCard label="Version" value={systemInfo.version} />
            <StatCard label="Cache Entries" value={systemInfo.cache.entries} />
            <StatCard
              label="Last Refresh"
              value={systemInfo.cache.last_refresh
                ? new Date(systemInfo.cache.last_refresh * 1000).toLocaleTimeString()
                : "N/A"}
            />
          </div>
        </section>
      )}

      {/* Integration Health */}
      {systemInfo?.integrations && (
        <section>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
            Integration Health
          </h2>
          <div className="bg-bg-surface border border-border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 text-text-secondary font-medium">Integration</th>
                  <th className="text-left px-3 py-2 text-text-secondary font-medium">Status</th>
                  <th className="text-left px-3 py-2 text-text-secondary font-medium">Last Success</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(systemInfo.integrations).map(([name, info]) => (
                  <tr key={name} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-text-primary">{name}</td>
                    <td className="px-3 py-2"><StatusBadge status={info.status} /></td>
                    <td className="px-3 py-2 text-text-secondary text-xs">
                      {info.last_success || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Request Stats */}
      {requestStats && (
        <section>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
            Requests (last {days}d)
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <StatCard label="Total Requests" value={totalRequests.toLocaleString()} />
            <StatCard label="Total Errors" value={totalErrors.toLocaleString()} />
            {keysInfo && (
              <StatCard label="Registered Keys" value={`${keysInfo.registered_count} / ${keysInfo.total_faction_members}`} />
            )}
          </div>

          {requestStats.per_endpoint.length > 0 && (
            <div className="bg-bg-surface border border-border rounded overflow-hidden">
              <div className="px-3 py-2 border-b border-border text-xs text-text-secondary font-medium uppercase tracking-wide">
                Top Endpoints
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-3 py-2 text-text-secondary font-medium">Endpoint</th>
                    <th className="text-right px-3 py-2 text-text-secondary font-medium">Requests</th>
                    <th className="text-right px-3 py-2 text-text-secondary font-medium">Avg ms</th>
                  </tr>
                </thead>
                <tbody>
                  {requestStats.per_endpoint.slice(0, 10).map((ep) => (
                    <tr key={ep.endpoint} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 text-text-primary font-mono text-xs">{ep.endpoint}</td>
                      <td className="px-3 py-2 text-right text-text-primary">{ep.count.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-text-secondary">{Math.round(ep.avg_response_ms)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* User Activity */}
      {userStats && userStats.users.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
            User Activity (last {days}d)
          </h2>
          <div className="bg-bg-surface border border-border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 text-text-secondary font-medium">#</th>
                  <th className="text-left px-3 py-2 text-text-secondary font-medium">Player</th>
                  <th className="text-right px-3 py-2 text-text-secondary font-medium">Requests</th>
                </tr>
              </thead>
              <tbody>
                {userStats.users.slice(0, 20).map((m, i) => (
                  <tr key={m.player_id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-text-secondary">{i + 1}</td>
                    <td className="px-3 py-2 text-text-primary">
                      {m.player_name}
                      <span className="ml-1 text-xs text-text-secondary">[{m.player_id}]</span>
                    </td>
                    <td className="px-3 py-2 text-right text-text-primary">{m.request_count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Error Stats */}
      {errorStats.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
            Errors (last {days}d)
          </h2>
          <div className="bg-bg-surface border border-border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 text-text-secondary font-medium">Endpoint</th>
                  <th className="text-right px-3 py-2 text-text-secondary font-medium">Status</th>
                  <th className="text-right px-3 py-2 text-text-secondary font-medium">Count</th>
                </tr>
              </thead>
              <tbody>
                {errorStats.slice(0, 10).map((ep, i) => (
                  <tr key={`${ep.endpoint}-${ep.status_code}-${i}`} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-text-primary font-mono text-xs">{ep.endpoint}</td>
                    <td className="px-3 py-2 text-right text-text-secondary">{ep.status_code}</td>
                    <td className="px-3 py-2 text-right text-red-400">{ep.count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!loading && !error && !requestStats && (
        <p className="text-text-secondary text-sm text-center py-8">No data available.</p>
      )}
    </div>
  );
}
