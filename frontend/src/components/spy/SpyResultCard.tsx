'use client';

import type { SpyEstimate } from '@/types/spy';
import {
  bucketStyle,
  formatTotalRange,
  formatPerStat,
  bucketCaption,
} from '@/lib/spy-display';
import type { Bucket } from '@/lib/spy-display';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-secondary rounded px-2 py-1.5 text-center">
      <div className="text-[10px] text-text-secondary">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function SpyResultCard({ data }: { data: SpyEstimate }) {
  const hasData = data.total > 0 && data.confidence !== 'unknown';
  const bucket: Bucket = data.bucket ?? 'estimate';
  const style = bucketStyle(bucket);
  const totalText = formatTotalRange(data.total, data.total_range, bucket);
  const perStat = formatPerStat(data);
  const caption = bucketCaption(data);

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
      </div>
      {hasData ? (
        <div
          className="border-l-[3px] pl-3"
          style={{ borderLeftColor: style.borderColor }}
        >
          <span
            className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
            style={{ background: style.badgeBg, color: style.badgeFg }}
          >
            {style.badgeText}
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-lg">⚔️</span>
            <span className="text-xl font-bold tabular-nums">{totalText}</span>
            <span className="text-xs text-text-secondary">
              {bucket === 'rough_guess' ? 'rough estimate' : 'total estimate'}
            </span>
          </div>
          <p className="text-xs text-text-secondary mt-0.5">{caption}</p>
          {perStat && (
            <div className="grid grid-cols-4 gap-2 mt-2">
              <Stat label="STR" value={perStat.str} />
              <Stat label="DEF" value={perStat.def} />
              <Stat label="SPD" value={perStat.spd} />
              <Stat label="DEX" value={perStat.dex} />
            </div>
          )}
        </div>
      ) : (
        <div className="bg-bg-secondary rounded-lg p-4 text-center text-sm text-text-secondary">
          <p className="font-medium text-text-primary mb-1">No spy estimate available</p>
          <p className="text-xs">
            Nobody has spied this player yet, and TornStats doesn&apos;t have a recent estimate either. Submit a spy report below if you have one, or try again later — the background refresh job picks up new TornStats data hourly.
          </p>
        </div>
      )}
    </div>
  );
}
