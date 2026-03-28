'use client';

import { MERIT_STAT_BONUSES } from '@/lib/constants';
import type { StatType, BookBonus } from '@/types/training';
import { formatStatShort, formatPercent } from '@/lib/format';

interface Section08Props {
  trainedStat: StatType;
  meritLevel: number;
  educationBonus: number;
  bookBonus: BookBonus;
  onUpdateMerit: (level: number) => void;
  onUpdateEducation: (bonus: number) => void;
  onUpdateBook: (bonus: BookBonus) => void;
  gainPerDay: number;
}

const MERIT_COST_PER_LEVEL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function getMeritCumulativeCost(level: number): number {
  return MERIT_COST_PER_LEVEL.slice(0, level).reduce((sum, c) => sum + c, 0);
}

export function Section08_MeritsAndBooks({
  trainedStat,
  meritLevel,
  educationBonus,
  bookBonus,
  onUpdateMerit,
  onUpdateEducation,
  onUpdateBook,
  gainPerDay,
}: Section08Props) {
  const meritData = MERIT_STAT_BONUSES[trainedStat];
  const meritBonusPercent = meritLevel * meritData.perLevel * 100;
  const yearlyGainImpact = gainPerDay * 365 * (meritBonusPercent / 100);

  const bookLabel: Record<BookBonus, string> = {
    none: 'No book active',
    single30: '+30% single stat (31 days)',
    all20: '+20% all stats (31 days)',
  };

  return (
    <section id="merits-books" className="space-y-8">
      <h2 className="text-2xl font-bold text-text-primary border-b border-text-secondary/20 pb-3">
        Merits, Education, and Books
      </h2>

      {/* ── MERITS ── */}
      <div className="space-y-5">
        <h3 className="text-xl font-semibold text-text-primary">Merits</h3>
        <div className="space-y-3 text-text-primary leading-relaxed">
          <p>
            Each battle stat has a dedicated merit track. Every level gives you{' '}
            <strong className="text-torn-green">+3% passive stat</strong>. Max level is 10, for a
            total of <strong className="text-torn-green">+30%</strong>. That&apos;s not gym gain — it&apos;s
            a permanent multiplier on your base stat value.
          </p>
          <p>
            Merits cost merit points. The total for maxing one stat: <strong>55 merit points</strong>.
          </p>
        </div>

        {/* Merit stat table */}
        <div className="overflow-x-auto rounded-xl border border-text-secondary/20">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-secondary border-b border-text-secondary/20">
                <th className="text-left px-4 py-3 text-text-secondary font-medium">Stat</th>
                <th className="text-left px-4 py-3 text-text-secondary font-medium">Merit Name</th>
                <th className="text-left px-4 py-3 text-text-secondary font-medium">Per Level</th>
                <th className="text-left px-4 py-3 text-text-secondary font-medium">Max Levels</th>
                <th className="text-left px-4 py-3 text-text-secondary font-medium">Max Bonus</th>
              </tr>
            </thead>
            <tbody>
              {(Object.entries(MERIT_STAT_BONUSES) as [StatType, typeof MERIT_STAT_BONUSES[StatType]][]).map(
                ([stat, data], index) => (
                  <tr
                    key={stat}
                    className={`border-b border-text-secondary/10 transition-colors ${
                      stat === trainedStat
                        ? 'bg-torn-green/10 hover:bg-torn-green/15'
                        : index % 2 === 0
                        ? 'bg-bg-card hover:bg-bg-secondary/80'
                        : 'bg-bg-secondary hover:bg-bg-secondary/80'
                    }`}
                  >
                    <td className={`px-4 py-3 font-semibold ${stat === trainedStat ? 'text-torn-green' : 'text-text-primary'}`}>
                      {stat}
                    </td>
                    <td className="px-4 py-3 text-text-primary">{data.name}</td>
                    <td className="px-4 py-3 text-text-secondary">+3%</td>
                    <td className="px-4 py-3 text-text-secondary">{data.maxLevel}</td>
                    <td className={`px-4 py-3 font-medium ${stat === trainedStat ? 'text-torn-green' : 'text-text-primary'}`}>
                      +30%
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>

        {/* Merit cost table */}
        <div>
          <h4 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
            Merit Cost Breakdown
          </h4>
          <div className="overflow-x-auto rounded-xl border border-text-secondary/20">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg-secondary border-b border-text-secondary/20">
                  <th className="text-left px-4 py-3 text-text-secondary font-medium">Level</th>
                  <th className="text-left px-4 py-3 text-text-secondary font-medium">Cost (merits)</th>
                  <th className="text-left px-4 py-3 text-text-secondary font-medium">Total spent</th>
                  <th className="text-left px-4 py-3 text-text-secondary font-medium">Bonus</th>
                </tr>
              </thead>
              <tbody>
                {MERIT_COST_PER_LEVEL.map((cost, i) => {
                  const level = i + 1;
                  const totalCost = getMeritCumulativeCost(level);
                  const isCurrentOrBelow = level <= meritLevel;
                  return (
                    <tr
                      key={level}
                      className={`border-b border-text-secondary/10 transition-colors ${
                        isCurrentOrBelow
                          ? 'bg-torn-green/10'
                          : i % 2 === 0
                          ? 'bg-bg-card'
                          : 'bg-bg-secondary'
                      }`}
                    >
                      <td className={`px-4 py-2.5 font-medium ${isCurrentOrBelow ? 'text-torn-green' : 'text-text-primary'}`}>
                        {level}
                        {level === meritLevel && (
                          <span className="ml-2 text-xs text-torn-green bg-torn-green/20 px-1.5 py-0.5 rounded">you</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary">{cost}</td>
                      <td className="px-4 py-2.5 text-text-secondary">{totalCost}</td>
                      <td className={`px-4 py-2.5 font-medium ${isCurrentOrBelow ? 'text-torn-green' : 'text-text-secondary'}`}>
                        +{level * 3}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Merit slider */}
        <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-text-primary">
              Your {trainedStat} merit level
            </label>
            <span className="text-torn-green font-bold text-lg">{meritLevel} / 10</span>
          </div>
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={meritLevel}
            onChange={(e) => onUpdateMerit(Number(e.target.value))}
            className="w-full accent-torn-green"
          />
          <div className="flex justify-between text-xs text-text-secondary">
            <span>0 (no merits)</span>
            <span>10 (maxed)</span>
          </div>
          {meritLevel > 0 && (
            <div className="bg-bg-secondary rounded-lg p-3 space-y-1">
              <p className="text-sm text-text-primary">
                At merit level <strong className="text-torn-green">{meritLevel}</strong>:{' '}
                <strong className="text-torn-green">+{meritBonusPercent.toFixed(0)}%</strong> passive{' '}
                {trainedStat}. Cost so far:{' '}
                <strong>{getMeritCumulativeCost(meritLevel)} merit points</strong>.
              </p>
              <p className="text-sm text-text-secondary">
                Effect on yearly gain:{' '}
                <strong className="text-torn-green">
                  +{formatStatShort(yearlyGainImpact)} {trainedStat}
                </strong>{' '}
                vs. no merits.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── EDUCATION ── */}
      <div className="space-y-5">
        <h3 className="text-xl font-semibold text-text-primary">Education</h3>
        <div className="space-y-3 text-text-primary leading-relaxed">
          <p>
            Completing education courses at the Torn University gives permanent gym gain bonuses.
            Unlike merits, these boost your <em>gym efficiency</em> — not just passive stat value.
          </p>
          <p>
            The most important course is{' '}
            <strong className="text-torn-green">Sports Science</strong> — the Bachelor&apos;s degree gives{' '}
            <strong>+1% all gym gains</strong>, plus individual stat courses give +1% each. Passive stat
            bonuses (+2% STR/SPD or +2% DEF/DEX) come from separate courses. Total gym gain bonus from
            all education is roughly <strong>+2-5%</strong> depending on stat.
          </p>
          <p className="text-text-secondary text-sm">
            These bonuses are small individually, but permanent and free — just time-gated.
            Prioritize Sports Science early.
          </p>
        </div>

        {/* Education slider */}
        <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-text-primary">
              Your education gym bonus
            </label>
            <span className="text-torn-green font-bold text-lg">{formatPercent(educationBonus)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={15}
            step={1}
            value={educationBonus}
            onChange={(e) => onUpdateEducation(Number(e.target.value))}
            className="w-full accent-torn-green"
          />
          <div className="flex justify-between text-xs text-text-secondary">
            <span>0% (no courses)</span>
            <span>~15% (near maxed)</span>
          </div>

          <div className="bg-bg-secondary rounded-lg p-3">
            <p className="text-xs text-text-secondary">
              Key courses: <strong className="text-text-primary">Sports Science</strong> (+2% gains + 2% passive){' '}
              · <strong className="text-text-primary">Law</strong> (+1%) · More in Torn University
            </p>
          </div>
        </div>
      </div>

      {/* ── BOOKS ── */}
      <div className="space-y-5">
        <h3 className="text-xl font-semibold text-text-primary">Books</h3>
        <div className="space-y-3 text-text-primary leading-relaxed">
          <p>
            Books give temporary but powerful gym gain boosts. There are three relevant types:
          </p>
        </div>

        {/* Book types */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              key: 'single30' as BookBonus,
              title: '+30% Single Stat',
              duration: '31 days',
              description: 'Massive burst multiplier for one stat. Stack with Steadfast and saved energy for a huge gain window.',
              accent: 'torn-green',
            },
            {
              key: 'all20' as BookBonus,
              title: '+20% All Stats',
              duration: '31 days',
              description: 'Weaker per stat but covers all four. Good if you train balanced or want broad efficiency.',
              accent: 'blue-400',
            },
            {
              key: 'none' as BookBonus,
              title: '+5% Flat (Permanent)',
              duration: 'Permanent (10M cap)',
              description: 'Permanent passive boost that never expires. Useful long-term but lower ceiling.',
              accent: 'text-secondary',
            },
          ].map((book) => (
            <div
              key={book.key}
              className={`rounded-xl border p-4 cursor-pointer transition-colors ${
                bookBonus === book.key
                  ? 'border-torn-green bg-torn-green/10'
                  : 'border-text-secondary/20 bg-bg-card hover:border-gray-500'
              }`}
              onClick={() => onUpdateBook(book.key)}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="bookBonus"
                  checked={bookBonus === book.key}
                  onChange={() => onUpdateBook(book.key)}
                  className="mt-1 accent-torn-green shrink-0"
                />
                <div className="space-y-1">
                  <p className={`font-semibold text-sm ${bookBonus === book.key ? 'text-torn-green' : 'text-text-primary'}`}>
                    {book.title}
                  </p>
                  <p className="text-xs text-text-secondary">{book.duration}</p>
                  <p className="text-xs text-text-secondary leading-relaxed">{book.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Active book display */}
        {bookBonus !== 'none' && (
          <div className="bg-bg-secondary border border-torn-green/30 rounded-xl p-4">
            <p className="text-sm font-medium text-torn-green">
              Active: {bookLabel[bookBonus]}
            </p>
            <p className="text-xs text-text-secondary mt-1">
              This is included in your daily gain calculation.
            </p>
          </div>
        )}

        {/* Strategy callout */}
        <div className="bg-bg-card border-l-4 border-torn-green rounded-r-xl p-4">
          <p className="text-sm font-semibold text-torn-green mb-1">Stack everything for a burst window</p>
          <p className="text-sm text-text-primary">
            Stack a 30% {trainedStat} book + Steadfast {trainedStat} rotation + all energy boosters
            (Xanax, cans, point refills) for a massive 31-day burst window. This is how top players
            push hundreds of millions of stats quickly.
          </p>
        </div>
      </div>

      {/* TL;DR */}
      <div className="bg-bg-secondary border border-text-secondary/30 rounded-xl p-5">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">TL;DR</p>
        <ul className="space-y-2">
          {[
            'Max your stat merit (55 merit points for +30%)',
            'Complete Sports Science education ASAP — permanent and free',
            'Stack 30% book with Steadfast rotation for max burst windows',
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
