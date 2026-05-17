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
  const bucket: Bucket = data.bucket ?? 'estimate';
  // Endgame is the only bucket that is rendered WITHOUT a numeric total — the
  // backend deliberately omits a range. We treat it as "has data" so the user
  // sees the warning, not the generic "no spy estimate available" empty state.
  const isEndgame = bucket === 'endgame';
  const hasData = isEndgame || (data.total > 0 && data.confidence !== 'unknown');
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
            {isEndgame && data.rank && (
              <span className="ml-2 text-text-muted">{data.rank}{data.level ? ` · L${data.level}` : ''}</span>
            )}
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
            // The ⚠ glyph at the head of the endgame badge text is decorative
            // emphasis — the surrounding words carry meaning. We still flag
            // the whole badge as a warning landmark so screen readers
            // announce the severity, not just "endgame player".
            role={isEndgame ? 'img' : undefined}
            aria-label={isEndgame ? 'Warning: endgame player' : undefined}
          >
            {style.badgeText}
          </span>
          {isEndgame ? (
            <>
              <p className="text-sm text-text-primary mt-2 font-medium">
                Stats unknown — this player is above the estimator&apos;s honest range.
              </p>
              <p className="text-xs text-text-secondary mt-1">{caption}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <a
                  href={`https://www.tornstats.com/profiles.php?XID=${data.player_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-bg-secondary border border-text-secondary/30 text-text-primary hover:border-torn-green hover:text-torn-green transition-colors"
                >
                  Check on TornStats
                </a>
                <a
                  href={`https://www.torn.com/profiles.php?XID=${data.player_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-bg-secondary border border-text-secondary/30 text-text-primary hover:border-torn-green hover:text-torn-green transition-colors"
                >
                  Open Torn profile
                </a>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-lg" aria-hidden="true">⚔️</span>
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
            </>
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
