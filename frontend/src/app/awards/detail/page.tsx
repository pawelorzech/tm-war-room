'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const CirculationChart = dynamic(
  () => import('@/components/awards/CirculationChart').then(m => ({ default: m.CirculationChart })),
  { ssr: false, loading: () => <div className="h-48 bg-bg-card rounded-lg animate-pulse" /> }
);

interface AwardDetail {
  id: number;
  kind: string;
  name: string;
  description: string;
  type: number;
  rarity: string;
  circulation: number;
  earned: boolean;
  earned_at: number | null;
}

const TYPE_NAMES: Record<number, string> = {
  1: 'Attacks', 2: 'Missions', 3: 'Items', 4: 'Travel',
  5: 'Crimes', 6: 'Drugs', 7: 'Job', 8: 'Social',
  9: 'Gambling', 10: 'Hospital', 11: 'Education', 12: 'Other',
  13: 'Gym', 14: 'Racing', 15: 'Faction', 16: 'Forum',
};

const RARITY_STYLES: Record<string, { text: string; bg: string }> = {
  'Common':         { text: 'text-text-muted',    bg: 'bg-text-muted/10' },
  'Uncommon':       { text: 'text-text-secondary', bg: 'bg-text-secondary/10' },
  'Limited':        { text: 'text-torn-blue',      bg: 'bg-torn-blue/10' },
  'Rare':           { text: 'text-torn-blue',      bg: 'bg-torn-blue/10' },
  'Very Rare':      { text: 'text-torn-yellow',    bg: 'bg-torn-yellow/10' },
  'Extremely Rare': { text: 'text-torn-red',       bg: 'bg-torn-red/10' },
};

function fmtDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function AwardDetailContent() {
  const searchParams = useSearchParams();
  const kind = searchParams.get('kind') || 'honor';
  const id = Number(searchParams.get('id') || 0);

  const [data, setData] = useState<AwardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [circulationHistory, setCirculationHistory] = useState<{ snapshot_date: string; circulation: number }[]>([]);
  const [circulationDays, setCirculationDays] = useState(30);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    api.awardDetail(kind, id)
      .then(d => setData(d as AwardDetail))
      .catch(e => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [kind, id]);

  useEffect(() => { load(); }, [load]);

  const loadCirculation = useCallback(() => {
    if (!id) return;
    api.awardCirculation(kind, id, circulationDays)
      .then(d => setCirculationHistory(d.history))
      .catch(() => {});
  }, [kind, id, circulationDays]);

  useEffect(() => { loadCirculation(); }, [loadCirculation]);

  if (!id) {
    return <p className="text-text-secondary">No award specified.</p>;
  }

  const typeName = TYPE_NAMES[data?.type || 0] || `Type ${data?.type}`;
  const rarityStyle = RARITY_STYLES[data?.rarity || ''] || { text: 'text-text-muted', bg: 'bg-bg-elevated' };

  return (
    <>
      {loading ? (
        <p className="text-text-secondary text-sm animate-pulse">Loading award details...</p>
      ) : error ? (
        <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 text-danger text-sm">{error}</div>
      ) : data ? (
        <>
          {/* Header card */}
          <div className="bg-bg-card border border-text-secondary/20 rounded-xl overflow-hidden">
            {/* Honor bar image */}
            <div className="bg-bg-elevated p-6 flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://www.torn.com/images/${data.kind === 'medal' ? 'medals' : 'honors'}/${data.id}/large.png`}
                alt={data.name}
                className="max-h-20 rounded"
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  if (img.src.includes('large.png')) {
                    img.src = img.src.replace('large.png', 'medium.png');
                  } else {
                    img.style.display = 'none';
                  }
                }}
              />
            </div>

            <div className="p-6 space-y-4">
              <div className="text-center">
                <h1 className="text-2xl font-bold text-text-primary">{data.name}</h1>
                <p className="text-sm text-text-muted mt-1 capitalize">{data.kind}</p>
              </div>

              <div className="flex justify-center">
                {data.earned ? (
                  <div className="px-4 py-2 rounded-full bg-torn-green/15 text-torn-green font-semibold text-sm">
                    Completed!
                    {data.earned_at && <span className="font-normal text-torn-green/70 ml-1">on {fmtDate(data.earned_at)}</span>}
                  </div>
                ) : (
                  <div className="px-4 py-2 rounded-full bg-danger/15 text-danger font-semibold text-sm">
                    Incomplete
                  </div>
                )}
              </div>

              <div className="bg-bg-elevated rounded-lg p-4">
                <p className="text-text-secondary text-sm leading-relaxed">{data.description}</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Category" value={typeName} />
                <StatCard label="Circulation" value={data.circulation.toLocaleString()} sub="players" />
                {data.rarity && (
                  <div className="text-center p-3 rounded-lg bg-bg-elevated">
                    <p className="text-[10px] text-text-muted uppercase mb-1">Rarity</p>
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded ${rarityStyle.text} ${rarityStyle.bg}`}>
                      {data.rarity}
                    </span>
                  </div>
                )}
                <StatCard label="Type" value={data.kind === 'honor' ? 'Honor Bar' : 'Medal'} />
              </div>
            </div>
          </div>

          <div className="flex gap-3 justify-center text-xs">
            <a href={`https://www.tornstats.com/${data.kind === 'medal' ? 'medals' : 'honors'}/${data.id}`}
              target="_blank" rel="noopener"
              className="text-text-muted hover:text-torn-green transition-colors">
              View on TornStats ↗
            </a>
            <a href={`https://wiki.torn.com/wiki/${encodeURIComponent(data.name.replace(/ /g, '_'))}`}
              target="_blank" rel="noopener"
              className="text-text-muted hover:text-torn-green transition-colors">
              Torn Wiki ↗
            </a>
          </div>

          {/* Circulation trend */}
          <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary">Circulation Trend</h2>
              <div className="flex gap-1">
                {[7, 30, 90, 365].map(d => (
                  <button key={d} onClick={() => setCirculationDays(d)}
                    className={`px-2 py-0.5 text-[10px] rounded font-medium transition-colors ${
                      circulationDays === d
                        ? 'bg-torn-green/20 text-torn-green'
                        : 'text-text-muted hover:text-text-secondary'
                    }`}>
                    {d === 365 ? 'All' : `${d}d`}
                  </button>
                ))}
              </div>
            </div>
            <CirculationChart history={circulationHistory} />
          </div>
        </>
      ) : null}
    </>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="text-center p-3 rounded-lg bg-bg-elevated">
      <p className="text-[10px] text-text-muted uppercase mb-1">{label}</p>
      <p className="text-sm font-semibold text-text-primary">{value}</p>
      {sub && <p className="text-[10px] text-text-muted">{sub}</p>}
    </div>
  );
}

export default function AwardDetailPage() {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <Link href="/awards" className="text-sm text-text-secondary hover:text-torn-green transition-colors flex items-center gap-1">
          ← Back to Awards
        </Link>
        <Suspense fallback={<p className="text-text-secondary text-sm animate-pulse">Loading...</p>}>
          <AwardDetailContent />
        </Suspense>
      </div>
    </div>
  );
}
