'use client';

import { SpySearch } from '@/components/spy/SpySearch';
import { KnownStatsList } from '@/components/spy/KnownStatsList';

export default function SpyPage() {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Spy Central</h1>
          <p className="text-text-secondary text-sm mt-1">
            Look up battle stat estimates for any player. Data aggregated from TornStats, YATA, and member submissions.
          </p>
        </div>

        <SpySearch />

        <div className="border-t border-border pt-6">
          <KnownStatsList />
        </div>
      </div>
    </div>
  );
}
