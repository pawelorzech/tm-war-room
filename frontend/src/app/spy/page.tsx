'use client';

import { useState, useCallback } from 'react';
import { SpySearch } from '@/components/spy/SpySearch';
import { SpySubmitForm } from '@/components/spy/SpySubmitForm';
import { FactionLookup } from '@/components/spy/FactionLookup';
import { KnownStatsList } from '@/components/spy/KnownStatsList';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';

export default function SpyPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const handleRefresh = useCallback(() => { setRefreshKey(k => k + 1); }, []);

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
