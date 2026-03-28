'use client';

import { useState, useMemo } from 'react';
import type { CalculatorState, CalculatorResults } from '@/types/training';
import { calculateGymGain } from '@/lib/formulas';
import { projectDailyGain } from '@/lib/formulas';
import { GYMS, getGymGain } from '@/lib/constants';
import { formatStatShort, formatPercent } from '@/lib/format';

interface ComparisonToggleProps {
  state: CalculatorState;
  results: CalculatorResults;
  onUpdate: <K extends keyof CalculatorState>(key: K, value: CalculatorState[K]) => void;
}

type ScenarioId =
  | ''
  | 'book30'
  | 'book20'
  | 'addXanax'
  | 'switchBalboas'
  | 'joinLadies'
  | 'joinGents';

interface Scenario {
  id: ScenarioId;
  label: string;
}

const SCENARIOS: Scenario[] = [
  { id: '', label: 'Select a scenario...' },
  { id: 'book30', label: 'Add 30% book' },
  { id: 'book20', label: 'Add 20% book' },
  { id: 'addXanax', label: 'Add Xanax' },
  { id: 'switchBalboas', label: 'Switch to Balboas (7.5x DEF/DEX)' },
  { id: 'joinLadies', label: 'Join Ladies Strip Club (7-star)' },
  { id: 'joinGents', label: 'Join Gents Strip Club (7-star)' },
];

function applyScenario(state: CalculatorState, scenarioId: ScenarioId): CalculatorState {
  switch (scenarioId) {
    case 'book30':
      return { ...state, bookBonus: 'single30' };
    case 'book20':
      return { ...state, bookBonus: 'all20' };
    case 'addXanax':
      return { ...state, energySources: { ...state.energySources, xanax: true } };
    case 'switchBalboas': {
      const gain = getGymGain(25, state.trainedStat); // Balboas = gym ID 25
      return { ...state, gymDots: gain };
    }
    case 'joinLadies':
      return { ...state, companyType: 'Ladies Strip Club', companyStarLevel: 7 };
    case 'joinGents':
      return { ...state, companyType: 'Gents Strip Club', companyStarLevel: 7 };
    default:
      return state;
  }
}

function computeGainPerDay(s: CalculatorState): number {
  const bookMultiplier = s.bookBonus === 'single30' ? 0.30 : s.bookBonus === 'all20' ? 0.20 : 0;

  // Company gym gain bonus
  let companyBonus = 0;
  if (s.companyType === 'Ladies Strip Club' && s.companyStarLevel >= 7) {
    if (s.trainedStat === 'DEF') companyBonus = 0.10;
  } else if (s.companyType === 'Gents Strip Club' && s.companyStarLevel >= 7) {
    if (s.trainedStat === 'DEX') companyBonus = 0.10;
  } else if (s.companyType === 'Fitness Center' && s.companyStarLevel >= 10) {
    companyBonus = 0.03;
  }

  const totalEducation = s.educationBonus + bookMultiplier + companyBonus;

  const gainPerEnergy = calculateGymGain({
    gymDots: s.gymDots,
    currentStat: s.currentStat,
    happy: s.happy,
    steadfastBonus: s.steadfastBonus,
    educationBonus: totalEducation,
    energyUsed: 1,
  });

  return projectDailyGain({ gainPerEnergy, energySources: s.energySources });
}

export function ComparisonToggle({ state, results, onUpdate }: ComparisonToggleProps) {
  const [selectedScenario, setSelectedScenario] = useState<ScenarioId>('');

  const hypotheticalState = useMemo(
    () => (selectedScenario ? applyScenario(state, selectedScenario) : null),
    [state, selectedScenario],
  );

  const currentGainPerDay = results.gainPerDay;
  const hypotheticalGainPerDay = hypotheticalState ? computeGainPerDay(hypotheticalState) : null;

  const diff =
    hypotheticalGainPerDay !== null ? hypotheticalGainPerDay - currentGainPerDay : null;
  const diffPercent =
    diff !== null && currentGainPerDay > 0
      ? (diff / currentGainPerDay) * 100
      : null;

  const scenarioLabel = SCENARIOS.find((s) => s.id === selectedScenario)?.label ?? '';

  function applyToCalculator() {
    if (!hypotheticalState || !selectedScenario) return;
    (Object.keys(hypotheticalState) as (keyof CalculatorState)[]).forEach((key) => {
      // Only update fields that changed
      if (hypotheticalState[key] !== state[key]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onUpdate(key, hypotheticalState[key] as any);
      }
    });
  }

  return (
    <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-text-primary font-semibold text-sm">What-If Comparison</h3>
        {selectedScenario && (
          <button
            onClick={() => setSelectedScenario('')}
            className="text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      <select
        value={selectedScenario}
        onChange={(e) => setSelectedScenario(e.target.value as ScenarioId)}
        className="w-full bg-bg-secondary border border-text-secondary/30 rounded-md px-3 py-2 text-text-primary text-sm
          focus:outline-none focus:border-torn-green focus:ring-1 focus:ring-torn-green"
      >
        {SCENARIOS.map((s) => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>

      {selectedScenario && hypotheticalGainPerDay !== null && (
        <div className="space-y-3">
          {/* Side-by-side comparison */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-bg-secondary border border-text-secondary/20 rounded-lg p-3 text-center">
              <p className="text-xs text-text-secondary mb-1">Current / Day</p>
              <p className="text-xl font-bold text-text-primary">
                {formatStatShort(currentGainPerDay)}
              </p>
            </div>
            <div className="bg-bg-secondary border border-torn-green/40 rounded-lg p-3 text-center">
              <p className="text-xs text-text-secondary mb-1">{scenarioLabel}</p>
              <p className="text-xl font-bold text-torn-green">
                {formatStatShort(hypotheticalGainPerDay)}
              </p>
            </div>
          </div>

          {/* Difference badge */}
          {diff !== null && diffPercent !== null && (
            <div
              className={`flex items-center justify-between rounded-lg p-3 border ${
                diff > 0
                  ? 'bg-torn-green/10 border-torn-green/30'
                  : diff < 0
                  ? 'bg-red-900/20 border-red-800/40'
                  : 'bg-bg-secondary border-text-secondary/20'
              }`}
            >
              <span className="text-sm text-text-secondary">Difference</span>
              <span
                className={`text-sm font-bold ${
                  diff > 0 ? 'text-torn-green' : diff < 0 ? 'text-danger' : 'text-text-secondary'
                }`}
              >
                {diff > 0 ? '+' : ''}
                {formatStatShort(diff)} / day&nbsp;
                <span className="text-xs font-normal opacity-80">
                  ({diff >= 0 ? '+' : ''}{formatPercent(diffPercent)})
                </span>
              </span>
            </div>
          )}

          {/* Apply button */}
          <button
            onClick={applyToCalculator}
            className="w-full py-2 rounded-md text-sm font-medium bg-torn-green text-white
              hover:opacity-90 transition-opacity"
          >
            Apply this scenario to calculator
          </button>
        </div>
      )}
    </div>
  );
}
