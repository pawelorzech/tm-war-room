'use client';

import type { CalculatorResults } from '@/types/training';
import { formatMoney, formatStatShort, formatStatFull, formatMultiplier } from '@/lib/format';
import { DEFAULT_PRICES } from '@/lib/constants';

interface Section06Props {
  currentStat: number;
  results: CalculatorResults;
}

const SE_PRICE = DEFAULT_PRICES.statEnhancer;
const XANAX_PRICE = DEFAULT_PRICES.xanax;
const XANAX_ENERGY = 250;

export function Section06_StatEnhancers({ currentStat, results }: Section06Props) {
  const { seComparison } = results;

  const seGain = seComparison.seGain;
  const xanaxGain = (results.gainPerXanax / XANAX_ENERGY) * XANAX_ENERGY;
  const seCostPer1K = seComparison.seCostPerStat;
  const xanaxCostPer1K = seComparison.xanaxCostPerStat;
  const ratio = seComparison.ratio;
  const rehabCostPerXanax = seComparison.rehabCostPerXanax;
  const xanaxCostPerStatWithRehab = seComparison.xanaxCostPerStatWithRehab;
  const ratioWithRehab = seComparison.ratioWithRehab;

  return (
    <section id="stat-enhancers" className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-text-primary">
          Stat Enhancers — The Math
        </h2>
        <p className="text-text-secondary mt-1">
          SEs sound powerful. The math tells a different story.
        </p>
      </div>

      {/* What SEs do */}
      <div className="bg-bg-card border border-text-secondary/20 rounded-lg p-4 space-y-2">
        <h3 className="text-text-primary font-semibold">What do Stat Enhancers do?</h3>
        <p className="text-text-secondary text-sm">
          Each SE gives you{' '}
          <span className="text-text-primary font-bold">+1% of your current stat</span>{' '}
          as a permanent gain. That sounds great — until you look at the price.
        </p>
        <div className="flex flex-wrap gap-4 mt-2 text-sm">
          <div>
            <span className="text-text-secondary">Cost per SE: </span>
            <span className="text-text-primary font-bold">{formatMoney(SE_PRICE)}</span>
          </div>
          <div>
            <span className="text-text-secondary">Cooldown: </span>
            <span className="text-text-primary font-bold">6 hours</span>
          </div>
          <div>
            <span className="text-text-secondary">Max per day: </span>
            <span className="text-text-primary font-bold">4</span>
          </div>
        </div>
        {currentStat > 0 && seGain > 0 && (
          <p className="text-torn-green text-sm font-semibold mt-1">
            At your current stat ({formatStatFull(currentStat)}), one SE gives you{' '}
            +{formatStatFull(Math.round(seGain))} stat.
          </p>
        )}
      </div>

      {/* Comparison table */}
      <div>
        <h3 className="text-text-primary font-semibold mb-3">
          SE vs Xanax — Cost per 1,000 Stat
        </h3>
        <div className="overflow-x-auto rounded-lg border border-text-secondary/20">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-secondary border-b border-text-secondary/20">
                <th className="text-left px-4 py-3 text-text-secondary font-semibold">Method</th>
                <th className="text-right px-4 py-3 text-text-secondary font-semibold">Stat Gain</th>
                <th className="text-right px-4 py-3 text-text-secondary font-semibold">Cost</th>
                <th className="text-right px-4 py-3 text-text-secondary font-semibold">
                  Cost / 1K Stat
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-text-secondary/10 bg-danger/5">
                <td className="px-4 py-3">
                  <span className="text-text-primary font-medium">Stat Enhancer</span>
                  <span className="ml-2 text-xs text-danger bg-danger/10 px-2 py-0.5 rounded-full">
                    Most expensive
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-text-primary font-semibold">
                  {seGain > 0 ? `+${formatStatShort(seGain)}` : '—'}
                </td>
                <td className="px-4 py-3 text-right text-text-secondary">
                  {formatMoney(SE_PRICE)}
                </td>
                <td className="px-4 py-3 text-right text-danger font-bold">
                  {seCostPer1K > 0 ? formatMoney(seCostPer1K) : '—'}
                </td>
              </tr>
              <tr className={`border-b border-text-secondary/10 ${rehabCostPerXanax > 0 ? '' : 'bg-torn-green/5'}`}>
                <td className="px-4 py-3">
                  <span className="text-text-primary font-medium">Xanax (250E)</span>
                  {rehabCostPerXanax === 0 && (
                    <span className="ml-2 text-xs text-torn-green bg-torn-green/10 px-2 py-0.5 rounded-full">
                      Cheapest
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-text-primary font-semibold">
                  {xanaxGain > 0 ? `+${formatStatShort(xanaxGain)}` : '—'}
                </td>
                <td className="px-4 py-3 text-right text-text-secondary">
                  {formatMoney(XANAX_PRICE)}
                </td>
                <td className="px-4 py-3 text-right text-torn-green font-bold">
                  {xanaxCostPer1K > 0 ? formatMoney(xanaxCostPer1K) : '—'}
                </td>
              </tr>
              {rehabCostPerXanax > 0 && (
                <tr className={`border-b border-text-secondary/10 ${ratioWithRehab >= 1 ? 'bg-torn-green/5' : 'bg-warning/5'}`}>
                  <td className="px-4 py-3">
                    <span className="text-text-primary font-medium">Xanax + Rehab</span>
                    {ratioWithRehab >= 1 ? (
                      <span className="ml-2 text-xs text-torn-green bg-torn-green/10 px-2 py-0.5 rounded-full">
                        Cheapest
                      </span>
                    ) : (
                      <span className="ml-2 text-xs text-danger bg-danger/10 px-2 py-0.5 rounded-full">
                        More than SE!
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-text-primary font-semibold">
                    {xanaxGain > 0 ? `+${formatStatShort(xanaxGain)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-text-secondary">
                    <div>{formatMoney(XANAX_PRICE + rehabCostPerXanax)}</div>
                    <div className="text-xs text-warning">incl. {formatMoney(rehabCostPerXanax)} rehab</div>
                  </td>
                  <td className={`px-4 py-3 text-right font-bold ${ratioWithRehab >= 1 ? 'text-torn-green' : 'text-warning'}`}>
                    {xanaxCostPerStatWithRehab > 0 ? formatMoney(xanaxCostPerStatWithRehab) : '—'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {ratio > 0 && (
          <div className="mt-3 space-y-2">
            <div className="bg-bg-card border border-text-secondary/20 rounded-lg p-3 text-center">
              <p className="text-text-primary text-sm">
                Xanax is{' '}
                <span className="text-torn-green font-black text-xl">{formatMultiplier(ratio)}</span>{' '}
                cheaper per stat than SEs{rehabCostPerXanax > 0 ? ' (before rehab)' : ''}.
              </p>
            </div>
            {rehabCostPerXanax > 0 && (
              <div className={`border rounded-lg p-3 text-center ${
                ratioWithRehab >= 1
                  ? 'bg-torn-green/10 border-torn-green/30'
                  : 'bg-danger/10 border-danger/30'
              }`}>
                <p className="text-text-primary text-sm">
                  {ratioWithRehab >= 1 ? (
                    <>
                      With rehab costs, Xanax is still{' '}
                      <span className="text-torn-green font-black text-xl">{formatMultiplier(ratioWithRehab)}</span>{' '}
                      cheaper than SEs.
                    </>
                  ) : (
                    <>
                      With rehab costs, SEs become{' '}
                      <span className="text-danger font-black text-xl">{formatMultiplier(1 / ratioWithRehab)}</span>{' '}
                      cheaper than Xanax! Consider switching to SEs.
                    </>
                  )}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Verdict */}
      {rehabCostPerXanax > 0 && ratioWithRehab < 1 ? (
        <div className="bg-warning/10 border-2 border-warning rounded-lg p-5">
          <p className="text-warning font-black text-lg mb-2">Verdict — Rehab Changes Everything</p>
          <p className="text-text-primary text-sm leading-relaxed">
            Without rehab, Xanax is cheaper. But your rehab costs ({formatMoney(rehabCostPerXanax)}/xanax)
            make{' '}
            <span className="font-bold">SEs the better value at your current rehab level</span>.
            Consider switching to SEs until your rehab cost comes down.
          </p>
          <p className="text-text-secondary text-xs mt-2">
            Rehab cost grows with each rehab done. If you&apos;ve done many rehabs, Xanax becomes
            increasingly expensive when you factor in the cost to wipe the addiction.
          </p>
        </div>
      ) : (
        <div className="bg-danger/10 border-2 border-danger rounded-lg p-5">
          <p className="text-danger font-black text-lg mb-2">Verdict</p>
          <p className="text-text-primary text-sm leading-relaxed">
            SEs are the{' '}
            <span className="font-bold">most expensive per-stat method</span> in the game
            {rehabCostPerXanax > 0 ? ' — even with rehab costs factored into Xanax' : ''}. Only
            worth it for very wealthy players who&apos;ve already maxed all energy sources — and even
            then, only if you have money burning a hole in your pocket.
          </p>
          <p className="text-text-secondary text-xs mt-2">
            If you&apos;re spending money on SEs before you&apos;re buying Xanax daily, you&apos;re
            leaving huge gains on the table.
          </p>
        </div>
      )}

      {/* TL;DR */}
      <div className="bg-bg-secondary rounded-lg p-4 border-l-4 border-torn-green">
        <p className="text-torn-green font-bold text-sm uppercase tracking-wide mb-2">TL;DR</p>
        <ul className="space-y-1 text-sm text-text-secondary">
          <li>
            <span className="text-text-primary font-semibold">
              SEs give +1% of your stat
            </span>
            {seGain > 0 && currentStat > 0 ? (
              <> (~{formatStatShort(seGain)} at your level).</>
            ) : (
              <>. Enter your stats to see exact gain.</>
            )}
          </li>
          <li>
            <span className="text-text-primary font-semibold">
              Xanax is{ratio > 0 ? ` ${formatMultiplier(ratio)}` : ' far'} cheaper per stat gained
              {rehabCostPerXanax > 0 ? ' (before rehab)' : ''}.
            </span>
          </li>
          {rehabCostPerXanax > 0 && (
            <li>
              <span className="text-text-primary font-semibold">
                With rehab costs: {ratioWithRehab >= 1
                  ? `Xanax is still ${formatMultiplier(ratioWithRehab)} cheaper.`
                  : `SEs become ${formatMultiplier(1 / ratioWithRehab)} cheaper — consider switching.`}
              </span>
            </li>
          )}
          <li>
            <span className="text-text-primary font-semibold">
              Only use SEs after maximizing all energy sources.
            </span>{' '}
            There&apos;s no point otherwise.
          </li>
        </ul>
      </div>
    </section>
  );
}
