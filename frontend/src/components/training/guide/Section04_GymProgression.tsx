'use client';

import { GYMS, getGymGain } from '@/lib/constants';
import { formatStatShort } from '@/lib/format';
import type { StatType } from '@/types/training';

interface Section04Props {
  currentStat: number;
  gymDots: number;
  trainedStat: StatType;
}

const STAGE_LABELS: Record<string, string> = {
  light: 'Light-Weight (5E per train)',
  middle: 'Middle-Weight (10E per train)',
  heavy: 'Heavy-Weight (10E per train)',
  specialist: 'Specialist',
};

const ENERGY_LABEL: Record<number, string> = {
  5: '5E',
  10: '10E',
  25: '25E',
  50: '50E',
};

function formatGain(value: number): string {
  if (value === 0) return '—';
  return value.toFixed(1);
}

function getGainForStat(gym: (typeof GYMS)[number], stat: StatType): number {
  const key = stat.toLowerCase() as 'str' | 'spd' | 'def' | 'dex';
  return gym.gains[key];
}

function getCurrentGymByStat(gymDots: number, trainedStat: StatType) {
  return (
    GYMS.find((g) => {
      const gain = getGainForStat(g, trainedStat);
      return gain === gymDots;
    }) ?? null
  );
}

function getNextGym(currentGym: (typeof GYMS)[number] | null, trainedStat: StatType) {
  if (!currentGym) return null;
  const currentIdx = GYMS.findIndex((g) => g.id === currentGym.id);
  if (currentIdx === -1 || currentIdx === GYMS.length - 1) return null;
  // Find next gym that actually trains the stat
  for (let i = currentIdx + 1; i < GYMS.length; i++) {
    if (getGainForStat(GYMS[i], trainedStat) > 0) return GYMS[i];
  }
  return null;
}

const STAGES = ['light', 'middle', 'heavy', 'specialist'] as const;

export function Section04_GymProgression({ currentStat, gymDots, trainedStat }: Section04Props) {
  const currentGym = getCurrentGymByStat(gymDots, trainedStat);
  const nextGym = getNextGym(currentGym, trainedStat);

  // Best endgame gym for reference comparisons (Balboas or Frontline depending on stat)
  const balboasGain = getGymGain(25, trainedStat);
  const frontlineGain = getGymGain(26, trainedStat);
  const bestEndgameGain = Math.max(balboasGain, frontlineGain);

  return (
    <section id="gym-progression" className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-text-primary">
          Gym Progression — Which Gym, When
        </h2>
        <p className="text-text-secondary mt-1">
          Higher gain multiplier = more stat per energy, proportionally. Always train in the best
          gym available for your trained stat.
        </p>
      </div>

      {/* Current status banner */}
      {currentGym && (
        <div className="bg-bg-card border border-torn-green/40 rounded-lg p-4">
          <p className="text-text-primary">
            You&apos;re in{' '}
            <span className="text-torn-green font-bold">{currentGym.name}</span>{' '}
            <span className="text-text-secondary">
              ({gymDots}× gain for {trainedStat}, {ENERGY_LABEL[currentGym.energy] ?? `${currentGym.energy}E`}/train)
            </span>
            .{' '}
            {nextGym ? (
              <>
                Next upgrade:{' '}
                <span className="text-yellow-400 font-bold">{nextGym.name}</span>{' '}
                <span className="text-text-secondary">
                  ({formatGain(getGainForStat(nextGym, trainedStat))}× {trainedStat})
                </span>{' '}
                — unlock: <span className="text-text-primary font-semibold">{nextGym.unlock}</span>.
              </>
            ) : (
              <span className="text-torn-green font-semibold">
                You&apos;re in the best gym for {trainedStat}. Max gains unlocked.
              </span>
            )}
          </p>
        </div>
      )}

      {/* SSL note */}
      <div className="border border-text-secondary/20 rounded-lg p-4 bg-bg-card">
        <p className="text-text-primary font-bold text-sm mb-1">SSL not worth it</p>
        <p className="text-text-secondary text-sm">
          SSL not worth it — restricting Xanax costs more stats than SSL gains. Sports Science Lab
          bans you after 150 Xanax + Ecstasy uses total. Since Xanax is the best energy source in
          the game, limiting it for SSL access loses far more stats than the higher gain multiplier
          recovers. Train at Balboas, Frontline, or the single-stat specialists instead — no
          restrictions, better long-term results.
        </p>
      </div>

      {/* Gym table grouped by stage */}
      <div className="space-y-4">
        {STAGES.map((stage) => {
          const gymsInStage = GYMS.filter((g) => g.stage === stage);
          if (gymsInStage.length === 0) return null;

          return (
            <div key={stage} className="overflow-x-auto rounded-lg border border-text-secondary/20">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-bg-secondary border-b border-text-secondary/20">
                    <th
                      colSpan={8}
                      className="text-left px-4 py-2 text-text-secondary font-semibold text-xs uppercase tracking-wider"
                    >
                      {STAGE_LABELS[stage]}
                    </th>
                  </tr>
                  <tr className="bg-bg-secondary border-b border-text-secondary/20">
                    <th className="text-left px-4 py-2 text-text-secondary font-semibold">Gym</th>
                    <th className="text-center px-3 py-2 text-text-secondary font-semibold">E/train</th>
                    <th className="text-center px-3 py-2 text-blue-400 font-semibold">STR</th>
                    <th className="text-center px-3 py-2 text-red-400 font-semibold">DEF</th>
                    <th className="text-center px-3 py-2 text-yellow-400 font-semibold">SPD</th>
                    <th className="text-center px-3 py-2 text-purple-400 font-semibold">DEX</th>
                    <th className="text-left px-4 py-2 text-text-secondary font-semibold">
                      Unlock Requirement
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {gymsInStage.map((gym) => {
                    const gainForTrainedStat = getGainForStat(gym, trainedStat);
                    const isCurrent = gainForTrainedStat > 0 && gainForTrainedStat === gymDots;
                    const isNext = nextGym && gym.id === nextGym.id;
                    const isSSL = 'sslRestriction' in gym && gym.sslRestriction;

                    let rowClass = 'border-b border-text-secondary/10 transition-colors';
                    if (isCurrent) {
                      rowClass += ' bg-torn-green/10';
                    } else if (isNext) {
                      rowClass += ' bg-yellow-500/10';
                    } else {
                      rowClass += ' hover:bg-bg-secondary/50';
                    }

                    return (
                      <tr key={gym.id} className={rowClass}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`font-medium ${
                                isCurrent
                                  ? 'text-torn-green'
                                  : isNext
                                    ? 'text-yellow-400'
                                    : 'text-text-primary'
                              }`}
                            >
                              {gym.name}
                            </span>
                            {isCurrent && (
                              <span className="text-xs bg-torn-green/20 text-torn-green px-2 py-0.5 rounded-full font-semibold">
                                Current
                              </span>
                            )}
                            {isNext && (
                              <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full font-semibold">
                                Next
                              </span>
                            )}
                            {isSSL && (
                              <span className="text-xs bg-danger/20 text-danger px-2 py-0.5 rounded-full font-semibold">
                                SSL
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center text-text-secondary">
                          {ENERGY_LABEL[gym.energy] ?? `${gym.energy}E`}
                        </td>
                        <td
                          className={`px-3 py-2.5 text-center font-mono text-xs ${
                            trainedStat === 'STR' && isCurrent
                              ? 'text-torn-green font-bold'
                              : 'text-blue-400'
                          }`}
                        >
                          {formatGain(gym.gains.str)}
                        </td>
                        <td
                          className={`px-3 py-2.5 text-center font-mono text-xs ${
                            trainedStat === 'DEF' && isCurrent
                              ? 'text-torn-green font-bold'
                              : 'text-red-400'
                          }`}
                        >
                          {formatGain(gym.gains.def)}
                        </td>
                        <td
                          className={`px-3 py-2.5 text-center font-mono text-xs ${
                            trainedStat === 'SPD' && isCurrent
                              ? 'text-torn-green font-bold'
                              : 'text-yellow-400'
                          }`}
                        >
                          {formatGain(gym.gains.spd)}
                        </td>
                        <td
                          className={`px-3 py-2.5 text-center font-mono text-xs ${
                            trainedStat === 'DEX' && isCurrent
                              ? 'text-torn-green font-bold'
                              : 'text-purple-400'
                          }`}
                        >
                          {formatGain(gym.gains.dex)}
                        </td>
                        <td className="px-4 py-2.5 text-text-secondary text-xs">{gym.unlock}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      {/* Key insight */}
      <div className="bg-bg-card border border-text-secondary/20 rounded-lg p-4">
        <p className="text-text-primary font-semibold">Key insight</p>
        <p className="text-text-secondary text-sm mt-1">
          Gain multipliers scale linearly. Every gym upgrade is a direct multiplier on your
          efficiency. George&apos;s (7.3× for all stats) is the last gym before specialist splits —
          from there, Balboas/Frontline push to 7.5× and single-stat specialists reach 8.0×. Fight
          Club tops out at 10× but requires an invite.
        </p>
        {currentStat > 0 && gymDots > 0 && bestEndgameGain > gymDots && (
          <p className="text-torn-green text-sm font-semibold mt-2">
            At your current {trainedStat} ({formatStatShort(currentStat)}), you&apos;re getting a{' '}
            {gymDots}× gain multiplier. The best accessible endgame gym gives {bestEndgameGain}× —
            that&apos;s {((bestEndgameGain / gymDots) * 100 - 100).toFixed(0)}% more stat per
            energy.
          </p>
        )}
      </div>

      {/* TL;DR */}
      <div className="bg-bg-secondary rounded-lg p-4 border-l-4 border-torn-green">
        <p className="text-torn-green font-bold text-sm uppercase tracking-wide mb-2">TL;DR</p>
        <ul className="space-y-1 text-sm text-text-secondary">
          <li>
            <span className="text-text-primary font-semibold">
              Higher gain multiplier = proportionally more stats per energy.
            </span>{' '}
            No diminishing returns — it&apos;s pure math.
          </li>
          <li>
            <span className="text-text-primary font-semibold">
              Rush George&apos;s
            </span>{' '}
            ($100M gym EXP), then unlock{' '}
            <span className="text-text-primary font-semibold">Balboas or Frontline</span> based on
            your stat focus (DEF/DEX vs STR/SPD).
          </li>
          <li>
            <span className="text-text-primary font-semibold">
              Skip SSL — restricting Xanax costs more stats than SSL gains.
            </span>
          </li>
        </ul>
      </div>
    </section>
  );
}
