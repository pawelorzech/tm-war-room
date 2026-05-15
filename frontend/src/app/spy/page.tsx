'use client';

import { Suspense, useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import type { SpyEstimate } from '@/types/spy';
import { api } from '@/lib/api-client';
import { SpySearch } from '@/components/spy/SpySearch';
import { SpySubmitForm } from '@/components/spy/SpySubmitForm';
import { SpyResultCard } from '@/components/spy/SpyResultCard';
import { FactionLookup } from '@/components/spy/FactionLookup';
import { KnownStatsList } from '@/components/spy/KnownStatsList';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';

interface DeepLinkState {
  data: SpyEstimate | null;
  error: string | null;
  loading: boolean;
}

function SpyPageInner() {
  const params = useSearchParams();
  const queryId = params.get('id');
  const playerId = queryId && /^\d+$/.test(queryId) ? parseInt(queryId, 10) : null;
  const [refreshKey, setRefreshKey] = useState(0);
  const [deepLink, setDeepLink] = useState<DeepLinkState>({
    data: null,
    error: null,
    loading: !!playerId,
  });

  const handleRefresh = useCallback(() => { setRefreshKey(k => k + 1); }, []);

  useEffect(() => {
    if (!playerId) return;
    setDeepLink({ data: null, error: null, loading: true });
    api.spyEstimate(playerId)
      .then(data => setDeepLink({ data, error: null, loading: false }))
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : 'Could not load spy estimate';
        setDeepLink({ data: null, error: msg, loading: false });
      });
  }, [playerId, refreshKey]);

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Spy Central</h1>
            <p className="text-text-secondary text-sm mt-1">
              Look up battle stat estimates for any Torn player or faction.
            </p>
          </div>
          <RefreshButton onRefresh={handleRefresh} />
        </div>

        {playerId && (
          <div className="space-y-3">
            <div className="text-xs text-text-secondary">
              Deep-linked to player <span className="text-text-primary">[{playerId}]</span> ·{' '}
              <a href="/spy" className="text-torn-green hover:underline">Back to Spy Central</a>
            </div>
            {deepLink.loading && (
              <div className="text-text-secondary text-sm animate-pulse py-4">Loading spy estimate…</div>
            )}
            {deepLink.error && (
              <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-sm text-danger">{deepLink.error}</div>
            )}
            {deepLink.data && <SpyResultCard data={deepLink.data} />}
          </div>
        )}

        <SpySearch key={`search-${refreshKey}`} />

        <FactionLookup key={`faction-${refreshKey}`} />

        <PageExplainer id="spy" title="Spy Central — What's here?" bullets={[
          "Spy reports give you exact battle stats from a successful spy — this is the gold standard for knowing if you can beat someone.",
          "Stat estimates use a rough calculation from personalstats (attacks won, defends lost, etc.) — useful when no spy report exists, but less accurate.",
          "Knowing enemy stats is critical for target selection: attack players you can beat, avoid those who will hospitalize you.",
          "Spy data ages quickly — a report from 6 months ago may be wildly outdated if the player has been actively training. Always check the report date.",
          "Submit your own spy reports: if you successfully spy someone in Torn, paste their exact stats here. These get highest priority ('exact' confidence) and help the whole faction.",
        ]} dataSources={["TornStats spy API estimates", "Member-submitted spy reports", "Personalstats-based estimation algorithm"]} links={[["Torn Wiki: Spying", "https://wiki.torn.com/wiki/Spy"], ["TornStats", "https://www.tornstats.com"]]} />

        <SpySubmitForm key={`submit-${refreshKey}`} />

        <div className="border-t border-border pt-6">
          <KnownStatsList key={`known-${refreshKey}`} />
        </div>
      </div>
    </div>
  );
}

export default function SpyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg-primary" />}>
      <SpyPageInner />
    </Suspense>
  );
}
