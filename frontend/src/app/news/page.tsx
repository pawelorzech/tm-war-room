'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api-client';
import DOMPurify from 'isomorphic-dompurify';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';
import { CardSkeleton } from '@/components/layout/LoadingSkeleton';

interface NewsEntry {
  id: number | string;
  timestamp?: number;
  text?: string;
  news?: string;
}

const CATEGORIES: { value: string; label: string; help: string }[] = [
  { value: 'armoryDeposit', label: 'Armoury deposits', help: 'Members depositing items into the faction armoury.' },
  { value: 'attack', label: 'Attacks (audit)', help: 'Notable attacks logged in faction news.' },
  { value: 'chain', label: 'Chain events', help: 'Chain bonuses hit, chains broken.' },
  { value: 'revive', label: 'Revives', help: 'Faction revives (NPCs and members).' },
  { value: 'depositFunds', label: 'Bank deposits', help: 'Money deposited into faction bank.' },
  { value: 'withdraw', label: 'Bank withdrawals', help: 'Money withdrawn from faction bank.' },
  { value: 'cesium', label: 'Cesium uses', help: 'Cesium usage by members in active wars.' },
  { value: 'crime', label: 'OC results', help: 'Organised crime results.' },
  { value: 'retract', label: 'Item retracts', help: 'Items pulled back out of the armoury.' },
];

function timeAgo(ts?: number): string {
  if (!ts) return '—';
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function NewsPage() {
  const [cat, setCat] = useState<string>('armoryDeposit');
  const [entries, setEntries] = useState<NewsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.factionNews(cat, 100)
      .then(r => setEntries(r.entries))
      .catch(e => setError(e?.message || 'Failed to load faction news'))
      .finally(() => setLoading(false));
  }, [cat]);

  useEffect(() => { load(); }, [load]);

  const current = CATEGORIES.find(c => c.value === cat) || CATEGORIES[0];

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Faction News</h1>
            <p className="text-sm text-text-muted mt-1">
              Audit trail of every faction event from Torn API v2 — pick a category to see who did what and when.
            </p>
          </div>
          <RefreshButton onRefresh={load} />
        </div>

        <PageExplainer
          id="news"
          title="What is this?"
          bullets={[
            "Torn's faction news log sliced into 9 categories — full audit trail of every faction event.",
            "Pick a category to filter: bank deposits/withdrawals, armoury moves, chain hits, cesium use, revives, OC results.",
            "Useful for spotting suspicious activity, post-mortems on chains, or auditing armoury discipline.",
          ]}
          dataSources={["Torn API v2 — /faction/news (paginated by category)"]}
        />

        <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(c => (
              <button
                key={c.value}
                onClick={() => setCat(c.value)}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                  cat === c.value
                    ? 'bg-torn-green/20 text-torn-green border border-torn-green/40'
                    : 'bg-bg-elevated text-text-muted hover:bg-bg-elevated/80 border border-transparent'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-text-muted">{current.help}</p>
        </div>

        {loading && <CardSkeleton />}
        {error && (
          <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 text-sm text-danger">
            {error}
          </div>
        )}
        {!loading && !error && entries.length === 0 && (
          <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-6 text-center text-text-muted text-sm">
            No entries found for this category in the recent window.
          </div>
        )}
        {!loading && !error && entries.length > 0 && (
          <div className="bg-bg-card border border-text-secondary/15 rounded-xl overflow-hidden">
            <ul className="divide-y divide-border-light">
              {entries.map(e => (
                <li key={String(e.id)} className="p-3 flex items-start justify-between gap-3">
                  <p
                    className="text-sm text-text-primary flex-1 [&_a]:text-torn-green [&_a]:hover:underline"
                    // Security fix: sanitize raw HTML from backend to prevent XSS attacks.
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(e.text || e.news || '(no text)') }}
                  />
                  <span className="text-[11px] text-text-muted shrink-0 tabular-nums">{timeAgo(e.timestamp)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
