'use client';

import dynamic from 'next/dynamic';
import type { EnergySources, CalculatorResults } from '@/types/training';
import { EnergySourcePicker } from '@/components/training/calculator/EnergySourcePicker';
import { formatMoney, formatStatShort, formatMultiplier } from '@/lib/format';
import { DEFAULT_PRICES } from '@/lib/constants';

const EnergyCostChart = dynamic(
  () => import('@/components/training/charts/EnergyCostChart').then((m) => ({ default: m.EnergyCostChart })),
  {
    ssr: false,
    loading: () => <div className="h-64 bg-bg-card rounded animate-pulse" />,
  }
);

interface Section05Props {
  energySources: EnergySources;
  onUpdateEnergySources: (sources: EnergySources) => void;
  gainPerEnergy: number;
  results: CalculatorResults;
}

const RANKED_SOURCES = [
  {
    rank: 1,
    name: 'Natural Energy',
    energyText: '150E/day',
    costText: 'Free',
    costPerE: 0,
    badge: 'Free',
    badgeColor: 'bg-torn-green/20 text-torn-green',
    note: 'Always train on natural energy. No reason not to.',
  },
  {
    rank: 2,
    name: 'LSD',
    energyText: '50E',
    costText: `${formatMoney(DEFAULT_PRICES.lsd)} / 50E`,
    costPerE: DEFAULT_PRICES.lsd / 50,
    badge: `${formatMoney(DEFAULT_PRICES.lsd / 50)}/E`,
    badgeColor: 'bg-torn-green/20 text-torn-green',
    note: 'Cheapest cost/E but shares drug cooldown with Xanax. Also gives +nerve and +happy.',
  },
  {
    rank: 3,
    name: 'Xanax',
    energyText: '250E',
    costText: `${formatMoney(DEFAULT_PRICES.xanax)} / 250E`,
    costPerE: DEFAULT_PRICES.xanax / 250,
    badge: `${formatMoney(DEFAULT_PRICES.xanax / 250)}/E`,
    badgeColor: 'bg-torn-green/20 text-torn-green',
    note: 'Primary training drug. Can boost energy over your normal cap. ~2 per day.',
  },
  {
    rank: 4,
    name: 'Point Refill',
    energyText: '150E/day',
    costText: `${formatMoney(DEFAULT_PRICES.pointRefill)} / 150E`,
    costPerE: DEFAULT_PRICES.pointRefill / 150,
    badge: `${formatMoney(DEFAULT_PRICES.pointRefill / 150)}/E`,
    badgeColor: 'bg-yellow-500/20 text-yellow-400',
    note: '~25 points at the Points Building. Solid mid-tier value, 1 per day.',
  },
  {
    rank: 5,
    name: 'Energy Cans (6-pack)',
    energyText: '150E (6×25)',
    costText: `${formatMoney(DEFAULT_PRICES.energyCan * 6)} / 150E`,
    costPerE: (DEFAULT_PRICES.energyCan * 6) / 150,
    badge: `${formatMoney((DEFAULT_PRICES.energyCan * 6) / 150)}/E`,
    badgeColor: 'bg-warning/20 text-warning',
    note: 'Mid-tier efficiency. Use only if you\'ve maxed all other sources.',
  },
  {
    rank: 6,
    name: 'FHC (use it)',
    energyText: '150E',
    costText: `${formatMoney(DEFAULT_PRICES.fhc)} / 150E`,
    costPerE: DEFAULT_PRICES.fhc / 150,
    badge: `${formatMoney(DEFAULT_PRICES.fhc / 150)}/E`,
    badgeColor: 'bg-danger/20 text-danger',
    note: 'WORST value. Sell it and buy Xanax instead — see below.',
  },
];

export function Section05_EnergyManagement({
  energySources,
  onUpdateEnergySources,
  gainPerEnergy,
  results,
}: Section05Props) {
  const { fhcComparison } = results;

  return (
    <section id="energy-management" className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-text-primary">
          Energy Management — Getting the Most Out of Every Point
        </h2>
        <p className="text-text-secondary mt-1">
          Not all energy is created equal. Here&apos;s the cost ranking from best to worst.
        </p>
      </div>

      {/* Ranked list */}
      <div className="space-y-2">
        {RANKED_SOURCES.map((src) => (
          <div
            key={src.rank}
            className="bg-bg-card border border-text-secondary/20 rounded-lg p-4 flex items-start gap-4"
          >
            <span className="text-2xl font-black text-text-secondary/40 w-6 flex-shrink-0 leading-none mt-0.5">
              {src.rank}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-text-primary font-semibold">{src.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${src.badgeColor}`}>
                  {src.badge}
                </span>
                <span className="text-text-secondary text-xs">{src.costText}</span>
                <span className="text-text-secondary text-xs">·</span>
                <span className="text-text-secondary text-xs">{src.energyText}</span>
              </div>
              <p className="text-xs text-text-secondary mt-1">{src.note}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-bg-card border border-text-secondary/20 rounded-lg p-4">
        <h3 className="text-text-primary font-semibold mb-3">Cost per 1K Stat — Visual Comparison</h3>
        <EnergyCostChart gainPerEnergy={gainPerEnergy} />
        <p className="text-xs text-text-secondary mt-2">
          Based on your current stat &amp; gym. Lower = better.
        </p>
      </div>

      {/* Energy source picker */}
      <div>
        <h3 className="text-text-primary font-semibold mb-3">Your Daily Energy Setup</h3>
        <EnergySourcePicker
          energySources={energySources}
          onUpdate={onUpdateEnergySources}
          gainPerEnergy={gainPerEnergy}
        />
      </div>

      {/* FHC sell vs use card */}
      <div className="bg-bg-card border-2 border-torn-green rounded-lg p-5">
        <h3 className="text-torn-green font-bold text-lg mb-3">
          FHC: Sell or Use?
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-bg-secondary rounded-lg p-3 border border-danger/30">
            <p className="text-text-secondary text-xs uppercase tracking-wide font-semibold mb-1">
              Using FHC directly
            </p>
            <p className="text-text-primary">
              FHC refills energy to max (<span className="font-bold">~150E</span>) →{' '}
              <span className="text-warning font-bold">
                +{formatStatShort(fhcComparison.useGain)} stat
              </span>
            </p>
            <p className="text-text-secondary text-xs mt-1">
              Cost: {formatMoney(DEFAULT_PRICES.fhc)} for 150E
            </p>
          </div>
          <div className="bg-bg-secondary rounded-lg p-3 border border-torn-green/30">
            <p className="text-text-secondary text-xs uppercase tracking-wide font-semibold mb-1">
              Sell FHC → Buy Xanax
            </p>
            <p className="text-text-primary">
              {formatMoney(DEFAULT_PRICES.fhc)} buys ~{(DEFAULT_PRICES.fhc / DEFAULT_PRICES.xanax).toFixed(1)} Xanax →{' '}
              <span className="text-torn-green font-bold">
                +{formatStatShort(fhcComparison.sellAndBuyXanaxGain)} stat
              </span>
            </p>
            <p className="text-text-secondary text-xs mt-1">
              Same money, way more energy
            </p>
          </div>
        </div>
        <div className="mt-4 bg-torn-green/10 border border-torn-green/30 rounded-lg p-3 text-center">
          <p className="text-torn-green font-black text-xl">
            Selling = {formatMultiplier(fhcComparison.ratio)} more stats per dollar
          </p>
          <p className="text-text-secondary text-sm mt-1">
            Always sell your FHCs. Buy Xanax instead. No exceptions.
          </p>
        </div>
      </div>

      {/* TL;DR */}
      <div className="bg-bg-secondary rounded-lg p-4 border-l-4 border-torn-green">
        <p className="text-torn-green font-bold text-sm uppercase tracking-wide mb-2">TL;DR</p>
        <ul className="space-y-1 text-sm text-text-secondary">
          <li>
            <span className="text-text-primary font-semibold">Natural + Xanax is the foundation.</span>{' '}
            Set it up, do it every day.
          </li>
          <li>
            <span className="text-text-primary font-semibold">
              Always sell FHCs and buy Xanax instead
            </span>{' '}
            (~{formatMultiplier(fhcComparison.ratio)} more efficient).
          </li>
          <li>
            <span className="text-text-primary font-semibold">Point refills are decent value</span>{' '}
            if you have points — add them to your daily routine.
          </li>
        </ul>
      </div>
    </section>
  );
}
