'use client';

import { SpySearch } from '@/components/spy/SpySearch';
import { SpySubmitForm } from '@/components/spy/SpySubmitForm';
import { FactionLookup } from '@/components/spy/FactionLookup';
import { KnownStatsList } from '@/components/spy/KnownStatsList';

export default function SpyPage() {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Spy Central</h1>
          <p className="text-text-secondary text-sm mt-1">
            Look up battle stat estimates for any Torn player or faction.
          </p>
        </div>

        <SpySearch />

        <FactionLookup />

        <div className="bg-bg-secondary border-l-4 border-torn-green rounded-r-lg p-4 space-y-2">
          <p className="text-sm font-semibold text-torn-green">How data gets here</p>
          <ul className="text-xs text-text-secondary space-y-1">
            <li><span className="text-torn-green font-medium">Auto:</span> Searching a player or faction fetches estimates from TornStats in real-time.</li>
            <li><span className="text-torn-green font-medium">Auto:</span> Scheduler refreshes enemy faction data every 30 minutes during wars.</li>
            <li><span className="text-torn-green font-medium">Manual:</span> Did a spy in Torn? Submit the exact stats below — marked as "exact" and highest priority.</li>
          </ul>
        </div>

        <SpySubmitForm />

        <div className="border-t border-border pt-6">
          <KnownStatsList />
        </div>
      </div>
    </div>
  );
}
