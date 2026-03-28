'use client';

import { useState } from 'react';
import type { SpyEstimate } from '@/types/spy';
import { api } from '@/lib/api-client';
import { SpyResultCard } from './SpyResultCard';

export function SpySearch() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SpyEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) { setError('Enter a player name or ID'); return; }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const isNumeric = /^\d+$/.test(q);
      let data: SpyEstimate;
      if (isNumeric) {
        data = await api.spyEstimate(parseInt(q, 10));
      } else {
        data = await api.spySearch(q);
      }
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Player not found');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Player name or ID"
          className="flex-1 bg-bg-card border border-text-secondary/30 rounded-lg px-4 py-2.5 text-text-primary text-sm focus:outline-none focus:border-torn-green focus:ring-1 focus:ring-torn-green"
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="px-5 py-2.5 bg-torn-green text-white text-sm font-semibold rounded-lg hover:bg-torn-green/90 transition-colors disabled:opacity-50"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>
      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-sm text-danger">{error}</div>
      )}
      {result && <SpyResultCard data={result} />}
    </div>
  );
}
