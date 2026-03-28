"use client";

import { useState, useEffect, useCallback } from "react";

interface AdminFetch {
  <T>(path: string, init?: RequestInit): Promise<T>;
}

interface RequestStats {
  days: number;
  total_requests: number;
  hourly_breakdown: Array<{ hour: string; count: number }>;
  top_endpoints: Array<{ endpoint: string; count: number }>;
}

interface UserStats {
  days: number;
  members: Array<{ player_id: number; name: string; request_count: number }>;
}

interface ErrorStats {
  days: number;
  total_errors: number;
  errors_by_endpoint: Array<{ endpoint: string; count: number }>;
}

interface Integration {
  name: string;
  status: "ok" | "error" | "unknown";
  last_check?: string;
}

interface SystemInfo {
  uptime_seconds: number;
  version: string;
  cache_entries: number;
  last_refresh: string | null;
  integrations: Integration[];
}

interface KeysInfo {
  total_keys: number;
  total_members: number;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const [errorStats, setErrorStats] = useState<ErrorStats | null>(null);
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
        adminFetch<ErrorStats>(`/api/admin/stats/errors?days=${days}`),
        adminFetch<SystemInfo>("/api/admin/system"),
        adminFetch<KeysInfo>("/api/admin/keys"),
      ]);
      setRequestStats(req);
      setUserStats(usr);
      setErrorStats(err);
      setSystemInfo(sys);
      setKeysInfo(keys);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, [adminFetch, days]);

  useEffect(() => { load(); }, [load]);

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
            <StatCard label="Cache Entries" value={systemInfo.cache_entries} />
            <StatCard
              label="Last Refresh"
              value={systemInfo.last_refresh ? formatDate(systemInfo.last_refresh) : "N/A"}
            />
          </div>
        </section>
      )}

      {/* Integration Health */}
      {systemInfo?.integrations && systemInfo.integrations.length > 0 && (
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
                  <th className="text-left px-3 py-2 text-text-secondary font-medium">Last Check</th>
                </tr>
              </thead>
              <tbody>
                {systemInfo.integrations.map((int) => (
                  <tr key={int.name} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-text-primary">{int.name}</td>
                    <td className="px-3 py-2"><StatusBadge status={int.status} /></td>
                    <td className="px-3 py-2 text-text-secondary">
                      {int.last_check ? formatDate(int.last_check) : "—"}
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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
            <StatCard label="Total Requests" value={requestStats.total_requests.toLocaleString()} />
            {errorStats && (
              <StatCard label="Total Errors" value={errorStats.total_errors.toLocaleString()} />
            )}
            {keysInfo && (
              <StatCard
                label="Registered Keys"
                value={`${keysInfo.total_keys} / ${keysInfo.total_members}`}
              />
            )}
          </div>

          {requestStats.top_endpoints.length > 0 && (
            <div className="bg-bg-surface border border-border rounded overflow-hidden">
              <div className="px-3 py-2 border-b border-border text-xs text-text-secondary font-medium uppercase tracking-wide">
                Top Endpoints
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-3 py-2 text-text-secondary font-medium">Endpoint</th>
                    <th className="text-right px-3 py-2 text-text-secondary font-medium">Requests</th>
                  </tr>
                </thead>
                <tbody>
                  {requestStats.top_endpoints.slice(0, 10).map((ep) => (
                    <tr key={ep.endpoint} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 text-text-primary font-mono text-xs">{ep.endpoint}</td>
                      <td className="px-3 py-2 text-right text-text-primary">{ep.count.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* User Activity */}
      {userStats && userStats.members.length > 0 && (
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
                {userStats.members.slice(0, 20).map((m, i) => (
                  <tr key={m.player_id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-text-secondary">{i + 1}</td>
                    <td className="px-3 py-2 text-text-primary">
                      {m.name}
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
      {errorStats && errorStats.errors_by_endpoint.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
            Errors by Endpoint (last {days}d)
          </h2>
          <div className="bg-bg-surface border border-border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 text-text-secondary font-medium">Endpoint</th>
                  <th className="text-right px-3 py-2 text-text-secondary font-medium">Errors</th>
                </tr>
              </thead>
              <tbody>
                {errorStats.errors_by_endpoint.slice(0, 10).map((ep) => (
                  <tr key={ep.endpoint} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-text-primary font-mono text-xs">{ep.endpoint}</td>
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
