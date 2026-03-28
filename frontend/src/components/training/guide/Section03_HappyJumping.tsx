'use client';

import dynamic from 'next/dynamic';

const HappyRelevanceChart = dynamic(
  () => import('@/components/training/charts/HappyRelevanceChart').then(m => ({ default: m.HappyRelevanceChart })),
  { ssr: false, loading: () => <div className="h-64 bg-bg-card rounded animate-pulse" /> }
);

interface Section03Props {
  currentStat: number;
  happy: number;
  happyContributionPercent: number;
}

function getZone(currentStat: number): 'low' | 'mid' | 'high' {
  if (currentStat < 50_000_000) return 'low';
  if (currentStat < 500_000_000) return 'mid';
  return 'high';
}

export function Section03_HappyJumping({ currentStat, happy, happyContributionPercent }: Section03Props) {
  const zone = getZone(currentStat);

  const zoneConfig = {
    low: {
      message: 'Happy matters. Consider happy jumping.',
      color: 'text-torn-green',
      borderColor: 'border-torn-green/40',
      bgColor: 'bg-torn-green/10',
    },
    mid: {
      message: 'Diminishing returns. Maybe skip it.',
      color: 'text-warning',
      borderColor: 'border-warning/40',
      bgColor: 'bg-warning/10',
    },
    high: {
      message: 'Completely irrelevant. Save your money.',
      color: 'text-danger',
      borderColor: 'border-danger/40',
      bgColor: 'bg-danger/10',
    },
  }[zone];

  return (
    <section id="happy-jumping" className="space-y-6">
      <h2 className="text-2xl font-bold text-text-primary border-b border-text-secondary/20 pb-3">
        Happy Jumping — When It Matters and When It Doesn&apos;t
      </h2>

      {/* Intro */}
      <div className="space-y-3 text-text-primary leading-relaxed">
        <p>
          <strong>Happy jumping</strong> is a training technique: take Ecstasy, which temporarily
          doubles your happy, then immediately train. Higher happy = slightly more gains per energy.
          It&apos;s been a staple tactic forever — but whether it&apos;s worth it depends entirely on
          your stat level.
        </p>
        <p>
          The math is brutal. Happy is an{' '}
          <strong className="text-yellow-400">additive term inside the formula</strong>. Your stat is
          also additive. As your stat grows into the hundreds of millions, the stat term dwarfs happy
          completely. Doubling your happy at that point barely moves the needle.
        </p>
      </div>

      {/* Chart */}
      <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-5">
        <p className="text-sm font-medium text-text-secondary mb-4">
          Happy Contribution % — across all stat levels (at your current happy of{' '}
          <strong className="text-text-primary">{happy.toLocaleString()}</strong>)
        </p>
        <HappyRelevanceChart currentStat={currentStat} happy={happy} />
      </div>

      {/* "You are here" callout */}
      <div className={`rounded-xl border p-4 ${zoneConfig.bgColor} ${zoneConfig.borderColor}`}>
        <p className="text-xs text-text-secondary uppercase tracking-wider font-medium mb-1">You are here</p>
        <p className={`text-lg font-bold ${zoneConfig.color}`}>
          Happy contributes {happyContributionPercent.toFixed(2)}% to your gains
        </p>
        <p className={`text-sm mt-1 ${zoneConfig.color}`}>{zoneConfig.message}</p>
      </div>

      {/* Three Zones */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-text-primary">The Three Zones</h3>
        <div className="space-y-3">
          {/* Zone 1: Below 50M */}
          <div className="bg-bg-card border border-torn-green/30 rounded-xl p-4 flex gap-3 items-start">
            <span className="text-torn-green font-bold text-sm mt-0.5 shrink-0">&lt; 50M</span>
            <div>
              <p className="font-semibold text-torn-green">Happy jumping helps. Do it.</p>
              <p className="text-sm text-text-secondary mt-1">
                At low stat levels, your happy can account for 20–50%+ of your gains. Doubling it via
                Ecstasy noticeably increases output. The cost of Ecstasy is low relative to the benefit.
                Train right after taking it — don&apos;t waste the window.
              </p>
            </div>
          </div>

          {/* Zone 2: 50M–500M */}
          <div className="bg-bg-card border border-warning/30 rounded-xl p-4 flex gap-3 items-start">
            <span className="text-warning font-bold text-sm mt-0.5 shrink-0">50M–500M</span>
            <div>
              <p className="font-semibold text-warning">Diminishing returns. Probably skip it.</p>
              <p className="text-sm text-text-secondary mt-1">
                Happy contribution has dropped into single digits. Happy jumping still technically
                increases gains, but the percentage boost is small. Whether it&apos;s worth the hassle
                depends on how disciplined your training routine is and what Ecstasy costs that week.
              </p>
            </div>
          </div>

          {/* Zone 3: Above 500M */}
          <div className="bg-bg-card border border-danger/30 rounded-xl p-4 flex gap-3 items-start">
            <span className="text-danger font-bold text-sm mt-0.5 shrink-0">&gt; 500M</span>
            <div>
              <p className="font-semibold text-danger">Completely irrelevant. Save your money.</p>
              <p className="text-sm text-text-secondary mt-1">
                Your stat term is so large that happy is essentially zero. Happy jumping at 1B stats
                is like bringing a water pistol to a tsunami. Spend that money on Xanax instead —
                more energy = more gains, and that actually scales.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* SSL Note */}
      <div className="bg-bg-secondary border border-text-secondary/30 rounded-xl p-5 flex gap-3 items-start">
        <span className="text-text-secondary text-xl mt-0.5 shrink-0">💡</span>
        <div className="space-y-1">
          <p className="font-bold text-text-primary">Skip Sports Science Lab (SSL)</p>
          <p className="text-sm text-text-secondary">
            SSL bans you if you use more than 150 Xanax + Ecstasy combined. Since Xanax is the{' '}
            <strong className="text-text-primary">single best training drug</strong>, restricting it
            for SSL access is a terrible trade. You get more stats training at other
            endgame gyms with unlimited Xanax than you ever would at SSL with drug restrictions.
            Don&apos;t bother with SSL.
          </p>
        </div>
      </div>

      {/* TL;DR */}
      <div className="bg-bg-secondary border border-text-secondary/30 rounded-xl p-5">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">TL;DR</p>
        <ul className="space-y-2">
          {[
            'Below 50M stats: happy jumping helps — happy is a real chunk of your gains',
            'Above 500M stats: don\'t bother — your stat dominates and happy is a rounding error',
            'Skip SSL — restricting Xanax to keep SSL access costs you more stats than it gains',
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-text-primary">
              <span className="text-torn-green mt-0.5 shrink-0">▸</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
