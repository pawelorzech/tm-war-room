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
      if (isNumeric) {
        // ID search — queries TornStats live if not in local DB
        const data = await api.spyEstimate(parseInt(q, 10));
        setResult(data);
      } else {
        // Name search — local DB only (Torn API doesn't support name→ID lookup)
        const data = await api.spySearch(q);
        setResult(data);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Player not found';
      if (msg.includes('No known players')) {
        setError(`No players matching "${q}" in our database yet. To add someone, search by their player ID (found on their Torn profile page).`);
      } else if (msg.includes('No spy data')) {
        setError('No spy data found on TornStats for this player.');
      } else {
        setError(msg);
      }
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
      <p className="text-xs text-text-muted">
        Search by <span className="text-text-secondary">player ID</span> to fetch live data from TornStats, or by <span className="text-text-secondary">name</span> to search players already in our database.
      </p>
      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-sm text-danger">{error}</div>
      )}
      {result && <SpyResultCard data={result} />}
    </div>
  );
}
