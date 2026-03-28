'use client';

import { SpySearch } from '@/components/spy/SpySearch';

export default function SpyPage() {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text-primary">Spy Central</h1>
          <p className="text-text-secondary text-sm mt-1">
            Look up battle stat estimates for any player. Data aggregated from TornStats, YATA, and member submissions.
          </p>
        </div>
        <SpySearch />
      </div>
    </div>
  );
}
