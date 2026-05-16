'use client';

// Active hit-claims widget — flag-gated, polls /api/claims/active every 5s.
//
// Why polling and not EventSource: the backend SSE stream requires the
// X-Player-Id header (enforced by `enforce_api_auth` middleware in
// api/main.py). The browser EventSource API can't set custom headers, so a
// straight `new EventSource(...)` would 400 every time. Until the backend
// either accepts the player id via cookie-bound JWT subject or exposes a
// query-param fallback, we mirror the Companion's polling cadence.
//
// Hidden when feature flag `hit_calling` is off.

import { useCallback, useEffect, useState } from 'react';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';

interface ClaimRow {
  target_id: number;
  claimer_id: number;
  claimer_name: string | null;
  claimed_at: number;
  expires_at: number;
  status: 'active' | 'released' | 'hit' | 'expired';
  note: string | null;
}

interface ClaimActiveResponse {
  claims: ClaimRow[];
  cached_at: number;
}

const POLL_MS = 5_000;

function getMyId(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('myKeyPlayer');
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

function buildAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const pid = localStorage.getItem('myKeyPlayer');
  const token = localStorage.getItem('sessionToken');
  const headers: Record<string, string> = {};
  if (pid) headers['X-Player-Id'] = pid;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function formatMmSs(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export interface ActiveClaimsProps {
  /** "full" = title + table; "compact" = single-line dense list for sidebars. */
  variant?: 'full' | 'compact';
}

export function ActiveClaims({ variant = 'full' }: ActiveClaimsProps) {
  const { flags, loading: flagsLoading } = useFeatureFlags();
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const myId = getMyId();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/claims/active', {
        headers: buildAuthHeaders(),
        credentials: 'include',
      });
      if (!res.ok) {
        if (res.status === 503) {
          setError(null);
          setClaims([]);
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as ClaimActiveResponse;
      setClaims(data.claims || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'fetch failed');
    }
  }, []);

  useEffect(() => {
    if (!flags.hit_calling) return;
    // Initial fetch + interval. We also tick a second-resolution clock so the
    // m:ss countdown updates between poll cycles.
    void refresh();
    const pollHandle = setInterval(() => void refresh(), POLL_MS);
    const tickHandle = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000);
    return () => {
      clearInterval(pollHandle);
      clearInterval(tickHandle);
    };
  }, [flags.hit_calling, refresh]);

  const releaseOwn = useCallback(
    async (targetId: number) => {
      try {
        const res = await fetch(`/api/claims/${targetId}`, {
          method: 'DELETE',
          headers: buildAuthHeaders(),
          credentials: 'include',
        });
        if (res.ok) {
          setClaims((prev) => prev.filter((c) => c.target_id !== targetId));
        }
      } catch {
        // Next poll cycle will reconcile.
      }
    },
    [],
  );

  if (flagsLoading) return null;
  if (!flags.hit_calling) return null;

  const visible = claims.filter((c) => c.status === 'active' && c.expires_at > now);

  if (variant === 'compact') {
    return (
      <div className="bg-bg-card border border-border rounded-lg p-3 text-xs">
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-text-primary">
            <span className="mr-1">🎯</span>
            Active claims
          </span>
          <span className="text-text-muted">{visible.length}</span>
        </div>
        {visible.length === 0 ? (
          <div className="text-text-muted italic">No active claims.</div>
        ) : (
          <ul className="space-y-1">
            {visible.slice(0, 6).map((c) => {
              const isMine = myId !== null && c.claimer_id === myId;
              const left = c.expires_at - now;
              return (
                <li key={c.target_id} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    <span className={isMine ? 'text-torn-green' : 'text-text-secondary'}>
                      {c.claimer_name || `[${c.claimer_id}]`}
                    </span>
                    <span className="text-text-muted"> → </span>
                    <a
                      href={`https://www.torn.com/profiles.php?XID=${c.target_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-text-primary hover:text-torn-green"
                    >
                      [{c.target_id}]
                    </a>
                  </span>
                  <span className="text-text-muted shrink-0">{formatMmSs(left)}</span>
                </li>
              );
            })}
          </ul>
        )}
        {error && <div className="text-danger mt-1">{error}</div>}
      </div>
    );
  }

  return (
    <section className="bg-bg-card border border-border rounded-xl p-4 space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary">
          <span className="mr-1">🎯</span>
          Active hit claims
        </h2>
        <span className="text-xs text-text-muted">
          {visible.length} active · 15-min TTL
        </span>
      </header>
      <p className="text-xs text-text-secondary">
        When two faction members hit the same target at once, both attacks waste
        energy. A claim reserves a target for 15 minutes so teammates pick a
        different one.
      </p>
      {visible.length === 0 ? (
        <div className="text-sm text-text-muted italic">
          No active claims right now.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-text-muted text-xs uppercase tracking-wide">
              <tr>
                <th className="py-1 pr-3">Claimer</th>
                <th className="py-1 pr-3">Target</th>
                <th className="py-1 pr-3">Claimed</th>
                <th className="py-1 pr-3 text-right">Expires</th>
                <th className="py-1 pr-0" />
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => {
                const isMine = myId !== null && c.claimer_id === myId;
                const left = c.expires_at - now;
                const ago = Math.max(0, now - c.claimed_at);
                return (
                  <tr key={c.target_id} className="border-t border-border">
                    <td className="py-2 pr-3">
                      <span
                        className={
                          isMine
                            ? 'text-torn-green font-semibold'
                            : 'text-text-primary'
                        }
                      >
                        {c.claimer_name || `[${c.claimer_id}]`}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <a
                        href={`https://www.torn.com/profiles.php?XID=${c.target_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-text-secondary hover:text-torn-green"
                      >
                        [{c.target_id}]
                      </a>
                    </td>
                    <td className="py-2 pr-3 text-text-muted">{formatMmSs(ago)} ago</td>
                    <td className="py-2 pr-3 text-right text-text-secondary tabular-nums">
                      {formatMmSs(left)} left
                    </td>
                    <td className="py-2 pr-0 text-right">
                      {isMine && (
                        <button
                          onClick={() => void releaseOwn(c.target_id)}
                          className="px-2 py-1 text-xs rounded border border-border text-text-secondary hover:text-text-primary hover:border-torn-green"
                        >
                          Release
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {error && (
        <div className="text-xs text-danger">
          Could not refresh claims: {error}
        </div>
      )}
    </section>
  );
}
