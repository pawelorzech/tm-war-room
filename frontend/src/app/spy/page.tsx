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
          "Look up any player's estimated battle stats by ID (live TornStats query) or by name (searches local database).",
          "Faction Lookup: enter a faction ID to see estimates for all their members at once.",
          "Submit Spy Reports: did a spy in Torn? Paste the exact stats — these get highest priority ('exact' confidence).",
          "Data sources: TornStats estimates (auto-fetched), scheduler refreshes during wars, and manual member submissions.",
          "Known Stats table shows everyone in our database. Admins can delete, block, or hide entries.",
        ]} />

        <SpySubmitForm key={`submit-${refreshKey}`} />

        <div className="border-t border-border pt-6">
          <KnownStatsList key={`known-${refreshKey}`} />
        </div>
      </div>
    </div>
  );
}
