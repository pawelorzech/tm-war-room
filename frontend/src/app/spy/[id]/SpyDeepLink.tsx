'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SpyEstimate } from '@/types/spy';
import { api } from '@/lib/api-client';
import { SpyResultCard } from '@/components/spy/SpyResultCard';
import { RefreshButton } from '@/components/layout/RefreshButton';

interface DeepLinkState {
  data: SpyEstimate | null;
  error: string | null;
  notFound: boolean;
  loading: boolean;
}

export function SpyDeepLink({ routeId }: { routeId: string }) {
  // The build-time route param is a sentinel (`_`) for static export. The
  // real player id arrives in the URL pathname at request time. Prefer the
  // pathname; fall back to the route param for local dev where the path
  // matches the sentinel directly.
  const [rawId, setRawId] = useState<string>(routeId);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const match = window.location.pathname.match(/\/spy\/([^/?#]+)/);
    if (match && match[1]) setRawId(decodeURIComponent(match[1]));
  }, []);

  const isValid = /^\d{3,9}$/.test(rawId);
  const playerId = isValid ? parseInt(rawId, 10) : null;

  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState<DeepLinkState>({
    data: null,
    error: null,
    notFound: false,
    loading: !!playerId,
  });

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!playerId) return;
    setState({ data: null, error: null, notFound: false, loading: true });
    api
      .spyEstimate(playerId)
      .then((data) =>
        setState({ data, error: null, notFound: false, loading: false }),
      )
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : 'Could not load spy estimate';
        // Backend returns 404 when no spy data exists — surface a friendly
        // empty-state instead of an error banner.
        const notFound = /404/.test(msg) || /not\s*found/i.test(msg);
        setState({
          data: null,
          error: notFound ? null : msg,
          notFound,
          loading: false,
        });
      });
  }, [playerId, refreshKey]);

  if (!isValid) {
    return (
      <div className="min-h-screen bg-bg-primary text-text-primary">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Spy Central</h1>
            <p className="text-text-secondary text-sm mt-1">
              Player lookup
            </p>
          </div>
          <div className="bg-danger/10 border border-danger/30 rounded-lg p-4 text-sm text-danger">
            Player ID must be a number (3–9 digits). Got: <code>{rawId}</code>
          </div>
          <div className="text-sm">
            <a href="/spy" className="text-torn-green hover:underline">
              ← Back to Spy Central
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Spy Central</h1>
            <p className="text-text-secondary text-sm mt-1">
              Spy estimate for player <span className="text-text-primary">[{playerId}]</span>
            </p>
          </div>
          <RefreshButton onRefresh={handleRefresh} />
        </div>

        <div className="text-xs text-text-secondary">
          <a href="/spy" className="text-torn-green hover:underline">
            ← Back to Spy Central
          </a>
        </div>

        {state.loading && (
          <div className="text-text-secondary text-sm animate-pulse py-4">
            Loading spy estimate…
          </div>
        )}

        {state.error && (
          <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-sm text-danger">
            {state.error}
          </div>
        )}

        {state.notFound && (
          <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-5 text-sm text-text-secondary space-y-2">
            <div className="text-text-primary font-medium">No spy data on this player yet.</div>
            <p>
              We don&apos;t have a spy report or stat estimate for player [{playerId}]. Try
              submitting one from{' '}
              <a href="/spy" className="text-torn-green hover:underline">
                Spy Central
              </a>{' '}
              if you have battle stats from a successful spy.
            </p>
          </div>
        )}

        {state.data && <SpyResultCard data={state.data} />}
      </div>
    </div>
  );
}
