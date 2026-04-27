'use client';

import type { SpyEstimate } from '@/types/spy';

const CONFIDENCE_STYLES: Record<string, string> = {
  exact: 'bg-torn-green/20 text-torn-green border-torn-green/40',
  estimate: 'bg-warning/20 text-warning border-warning/40',
  stale: 'bg-danger/20 text-danger border-danger/40',
  unknown: 'bg-bg-elevated text-text-muted border-text-secondary/30',
};

function formatStat(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(Math.round(n));
}

export function SpyResultCard({ data }: { data: SpyEstimate }) {
  const stats = [
    { label: 'STR', value: data.strength },
    { label: 'DEF', value: data.defense },
    { label: 'SPD', value: data.speed },
    { label: 'DEX', value: data.dexterity },
  ];

  return (
    <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-bold text-text-primary">
            {data.player_name || `#${data.player_id}`}
          </h3>
          <p className="text-xs text-text-secondary">
            <a href={`https://www.torn.com/profiles.php?XID=${data.player_id}`}
               target="_blank" rel="noopener noreferrer" className="text-torn-green hover:underline">
              [{data.player_id}]
            </a>
          </p>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${CONFIDENCE_STYLES[data.confidence]}`}>
          {data.confidence}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map(s => (
          <div key={s.label} className="bg-bg-secondary rounded-lg p-3 text-center">
            <p className="text-xs text-text-secondary mb-1">{s.label}</p>
            <p className="text-lg font-bold text-text-primary">{formatStat(s.value)}</p>
          </div>
        ))}
      </div>
      <div className="bg-bg-secondary rounded-lg p-3 text-center">
        <p className="text-xs text-text-secondary mb-1">Total Battle Stats</p>
        <p className="text-2xl font-extrabold text-torn-green">{formatStat(data.total)}</p>
      </div>
      <div className="flex items-center justify-between text-xs text-text-secondary">
        <span>Source: {data.source}</span>
        <span>{data.age_days === 0 ? 'Today' : `${data.age_days}d ago`}</span>
      </div>
    </div>
  );
}
