'use client';

import type { CalculatorResults, CalculatorState, Recommendation } from '@/types/training';
import {
  formatStatShort,
  formatStatFull,
  formatMoney,
  formatMultiplier,
  formatPercent,
} from '@/lib/format';

interface ResultsPanelProps {
  results: CalculatorResults;
  state: CalculatorState;
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-bg-secondary border border-text-secondary/20 rounded-lg p-3 text-center">
      <p className="text-xs text-text-secondary mb-1">{label}</p>
      <p className="text-lg font-bold text-text-primary">{value}</p>
      {sub && <p className="text-xs text-text-secondary mt-0.5">{sub}</p>}
    </div>
  );
}

function priorityBadge(priority: Recommendation['priority']) {
  const classes = {
    high: 'bg-danger/10 text-danger border border-danger/30',
    medium: 'bg-warning/10 text-warning border border-warning/30',
    low: 'bg-bg-card text-text-secondary border border-text-secondary/30',
  };
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${classes[priority]}`}>
      {priority}
    </span>
  );
}

function milestoneLabel(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(0)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}M`;
  return formatStatShort(value);
}

export function ResultsPanel({ results, state }: ResultsPanelProps) {
  const {
    gainPerEnergy,
    gainPerNatural,
    gainPerXanax,
    gainPerDay,
    happyContributionPercent,
    fhcComparison,
    seComparison,
    daysToNextMilestone,
    nextMilestone,
    monthlyProjection,
    yearlyProjection,
    recommendations,
  } = results;

  const happyBadgeClass =
    happyContributionPercent > 5
      ? 'bg-torn-green/10 text-torn-green border border-torn-green/40'
      : happyContributionPercent < 1
      ? 'bg-bg-card text-text-secondary border border-text-secondary/30'
      : 'bg-warning/10 text-warning border border-warning/30';

  return (
    <div className="space-y-4">
      {/* Hero card */}
      <div className="bg-bg-card border border-torn-green/30 rounded-xl p-5 text-center">
        <p className="text-text-secondary text-sm mb-1">Gain per Energy Point</p>
        <p className="text-5xl font-extrabold text-torn-green tracking-tight">
          {formatStatShort(gainPerEnergy)}
        </p>
        <p className="text-text-secondary text-xs mt-1">
          {formatStatFull(gainPerEnergy)} stat / energy
        </p>
      </div>

      {/* 3-column grid */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Per Natural (150E)"
          value={formatStatShort(gainPerNatural)}
          sub={formatStatFull(gainPerNatural)}
        />
        <StatCard
          label="Per Xanax (250E)"
          value={formatStatShort(gainPerXanax)}
          sub={formatStatFull(gainPerXanax)}
        />
        <StatCard
          label="Per Day"
          value={formatStatShort(gainPerDay)}
          sub={formatStatFull(gainPerDay)}
        />
      </div>

      {/* Projections row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-bg-secondary border border-text-secondary/20 rounded-lg p-3">
          <p className="text-xs text-text-secondary mb-1">Monthly Projection</p>
          <p className="text-lg font-bold text-text-primary">{formatStatShort(monthlyProjection)}</p>
          <p className="text-xs text-text-secondary">+{formatStatShort(gainPerDay * 30)} gained</p>
        </div>
        <div className="bg-bg-secondary border border-text-secondary/20 rounded-lg p-3">
          <p className="text-xs text-text-secondary mb-1">Yearly Projection</p>
          <p className="text-lg font-bold text-text-primary">{formatStatShort(yearlyProjection)}</p>
          <p className="text-xs text-text-secondary">+{formatStatShort(gainPerDay * 365)} gained</p>
        </div>
      </div>

      {/* Happy + Milestone row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-bg-secondary border border-text-secondary/20 rounded-lg p-3">
          <p className="text-xs text-text-secondary mb-1">Happy Contribution</p>
          <span className={`inline-block text-sm font-semibold px-2 py-0.5 rounded ${happyBadgeClass}`}>
            {formatPercent(happyContributionPercent)}
          </span>
          <p className="text-xs text-text-secondary mt-1">
            {happyContributionPercent > 5
              ? 'Happy jumping helps here'
              : happyContributionPercent < 1
              ? 'Skip Ecstasy — stat dominates'
              : 'Minor contribution'}
          </p>
        </div>
        <div className="bg-bg-secondary border border-text-secondary/20 rounded-lg p-3">
          <p className="text-xs text-text-secondary mb-1">
            Days to {milestoneLabel(nextMilestone)}
          </p>
          <p className="text-lg font-bold text-text-primary">
            {isFinite(daysToNextMilestone) ? daysToNextMilestone.toLocaleString() : '—'}
          </p>
          <p className="text-xs text-text-secondary">days at current pace</p>
        </div>
      </div>

      {/* FHC Comparison */}
      <div className="bg-bg-secondary border border-text-secondary/20 rounded-lg p-3">
        <p className="text-xs text-text-secondary mb-2 uppercase tracking-wide font-medium">FHC Comparison</p>
        <div className="flex items-center justify-between text-sm">
          <div>
            <span className="text-text-secondary">Use FHC: </span>
            <span className="text-text-primary font-semibold">{formatStatShort(fhcComparison.useGain)}</span>
          </div>
          <div className="text-text-secondary text-xs">vs</div>
          <div>
            <span className="text-text-secondary">Sell + Xanax: </span>
            <span className="text-torn-green font-semibold">{formatStatShort(fhcComparison.sellAndBuyXanaxGain)}</span>
          </div>
          <div className="bg-torn-green/20 text-torn-green text-xs font-bold px-2 py-1 rounded border border-torn-green/30">
            {formatMultiplier(fhcComparison.ratio)} better
          </div>
        </div>
      </div>

      {/* SE Comparison */}
      <div className="bg-bg-secondary border border-text-secondary/20 rounded-lg p-3">
        <p className="text-xs text-text-secondary mb-2 uppercase tracking-wide font-medium">Stat Enhancer vs Xanax</p>
        <div className="flex items-center justify-between text-sm flex-wrap gap-2">
          <div>
            <span className="text-text-secondary">SE cost/stat: </span>
            <span className="text-text-primary font-semibold">{formatMoney(seComparison.seCostPerStat)}</span>
          </div>
          <div>
            <span className="text-text-secondary">Xanax cost/stat: </span>
            <span className="text-torn-green font-semibold">{formatMoney(seComparison.xanaxCostPerStat)}</span>
          </div>
          <div className="bg-torn-green/20 text-torn-green text-xs font-bold px-2 py-1 rounded border border-torn-green/30">
            Xanax {formatMultiplier(seComparison.ratio)} cheaper
          </div>
        </div>
        {seComparison.rehabCostPerXanax > 0 && (
          <div className="mt-2 pt-2 border-t border-text-secondary/10">
            <div className="flex items-center justify-between text-sm flex-wrap gap-2">
              <div>
                <span className="text-text-secondary">Rehab cost/xanax: </span>
                <span className="text-warning font-semibold">{formatMoney(seComparison.rehabCostPerXanax)}</span>
              </div>
              <div>
                <span className="text-text-secondary">+rehab cost/stat: </span>
                <span className="text-warning font-semibold">{formatMoney(seComparison.xanaxCostPerStatWithRehab)}</span>
              </div>
              {seComparison.ratioWithRehab >= 1 ? (
                <div className="bg-torn-green/20 text-torn-green text-xs font-bold px-2 py-1 rounded border border-torn-green/30">
                  Xanax {formatMultiplier(seComparison.ratioWithRehab)} cheaper
                </div>
              ) : (
                <div className="bg-danger/10 text-danger text-xs font-bold px-2 py-1 rounded border border-danger/30">
                  SE {formatMultiplier(1 / seComparison.ratioWithRehab)} cheaper
                </div>
              )}
            </div>
            <p className="text-xs text-text-secondary mt-1">With rehab costs factored in</p>
          </div>
        )}
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-text-secondary uppercase tracking-wide font-medium">Recommendations</p>
          {recommendations.map((rec) => (
            <div
              key={rec.id}
              className="bg-bg-secondary border border-text-secondary/20 rounded-lg p-3 flex gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="text-sm font-semibold text-text-primary">{rec.title}</span>
                  {priorityBadge(rec.priority)}
                </div>
                <p className="text-xs text-text-secondary">{rec.description}</p>
              </div>
              <div className="text-xs font-medium text-torn-green whitespace-nowrap self-start pt-0.5">
                {rec.impact}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
