'use client';

import type { CalculatorState, BookBonus, StatType } from '@/types/training';
import { GYMS, TRAINING_COMPANIES, getGymGain } from '@/lib/constants';

interface StatInputPanelProps {
  state: CalculatorState;
  onUpdate: <K extends keyof CalculatorState>(key: K, value: CalculatorState[K]) => void;
  apiPopulated: boolean;
}

const labelClass = 'block text-xs font-medium text-text-secondary mb-1';
const inputClass =
  'w-full bg-bg-card border border-text-secondary/30 rounded-md px-3 py-2 text-text-primary text-sm ' +
  'focus:outline-none focus:border-torn-green focus:ring-1 focus:ring-torn-green';
const apiInputClass =
  'w-full bg-bg-card border border-blue-500 rounded-md px-3 py-2 text-text-primary text-sm ' +
  'focus:outline-none focus:border-torn-green focus:ring-1 focus:ring-torn-green';
const selectClass =
  'w-full bg-bg-card border border-text-secondary/30 rounded-md px-3 py-2 text-text-primary text-sm ' +
  'focus:outline-none focus:border-torn-green focus:ring-1 focus:ring-torn-green';

interface FieldWrapProps {
  label: string;
  children: React.ReactNode;
}

function FieldWrap({ label, children }: FieldWrapProps) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {children}
    </div>
  );
}

export function StatInputPanel({ state, onUpdate, apiPopulated }: StatInputPanelProps) {
  const statKey = { STR: 'str', DEF: 'def', SPD: 'spd', DEX: 'dex' }[state.trainedStat] as 'str' | 'def' | 'spd' | 'dex';
  const selectedGym = GYMS.find((g) => g.gains[statKey] === state.gymDots) ?? GYMS.find(g => g.id === 24);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Current Stat */}
      <div>
        <label className={labelClass}>
          Your {state.trainedStat} stat value
          <span className="text-text-secondary font-normal ml-1">(the stat you&apos;re training)</span>
        </label>
        <input
          type="number"
          min={0}
          value={state.currentStat}
          onChange={(e) => onUpdate('currentStat', Number(e.target.value))}
          className={`${apiPopulated ? apiInputClass : inputClass} text-lg font-semibold`}
          placeholder="e.g. 100000000"
        />
        {apiPopulated && (
          <p className="text-xs text-blue-400 mt-0.5">Auto-filled from API (your highest stat)</p>
        )}
      </div>

      {/* Stat Being Trained */}
      <FieldWrap label="Stat Being Trained">
        <select
          value={state.trainedStat}
          onChange={(e) => onUpdate('trainedStat', e.target.value as StatType)}
          className={selectClass}
        >
          {(['STR', 'DEF', 'SPD', 'DEX'] as StatType[]).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </FieldWrap>

      {/* Gym */}
      <FieldWrap label="Gym">
        <select
          value={selectedGym?.id ?? ''}
          onChange={(e) => {
            const gym = GYMS.find((g) => g.id === Number(e.target.value));
            if (gym) {
              const gain = getGymGain(gym.id, state.trainedStat);
              onUpdate('gymDots', gain);
            }
          }}
          className={selectClass}
        >
          {GYMS.filter(g => g.gains[statKey] > 0 || g.stage !== 'specialist').map((gym) => (
            <option key={gym.id} value={gym.id}>
              {gym.name} ({gym.gains[statKey] > 0 ? `${gym.gains[statKey]}x ${state.trainedStat}` : 'N/A'}) — {gym.energy}E/train
            </option>
          ))}
        </select>
      </FieldWrap>

      {/* Current Happy */}
      <FieldWrap label="Current Happy">
        <input
          type="number"
          min={0}
          value={state.happy}
          onChange={(e) => onUpdate('happy', Number(e.target.value))}
          className={apiPopulated ? apiInputClass : inputClass}
          placeholder="e.g. 4000"
        />
        {apiPopulated && (
          <p className="text-xs text-blue-400 mt-0.5">Auto-filled from API</p>
        )}
      </FieldWrap>

      {/* Steadfast Bonus */}
      <div>
        <label className={labelClass}>
          Steadfast Bonus:{' '}
          <span className="text-torn-green font-semibold">
            {(state.steadfastBonus * 100).toFixed(0)}%
          </span>
        </label>
        <input
          type="range"
          min={0}
          max={20}
          step={1}
          value={Math.round(state.steadfastBonus * 100)}
          onChange={(e) => onUpdate('steadfastBonus', Number(e.target.value) / 100)}
          className="w-full accent-torn-green"
        />
        <div className="flex justify-between text-xs text-text-secondary mt-0.5">
          <span>0%</span>
          <span>20%</span>
        </div>
      </div>

      {/* Education Bonus */}
      <div>
        <label className={labelClass}>
          Education Bonus:{' '}
          <span className="text-torn-green font-semibold">
            {(state.educationBonus * 100).toFixed(0)}%
          </span>
        </label>
        <input
          type="range"
          min={0}
          max={15}
          step={1}
          value={Math.round(state.educationBonus * 100)}
          onChange={(e) => onUpdate('educationBonus', Number(e.target.value) / 100)}
          className="w-full accent-torn-green"
        />
        <div className="flex justify-between text-xs text-text-secondary mt-0.5">
          <span>0%</span>
          <span>15%</span>
        </div>
      </div>

      {/* Book Bonus */}
      <div>
        <label className={labelClass}>Book Bonus</label>
        <div className="flex flex-col gap-1.5">
          {([
            { value: 'none', label: 'None' },
            { value: 'single30', label: '+30% single stat' },
            { value: 'all20', label: '+20% all stats' },
          ] as { value: BookBonus; label: string }[]).map(({ value, label }) => (
            <label key={value} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="radio"
                name="bookBonus"
                value={value}
                checked={state.bookBonus === value}
                onChange={() => onUpdate('bookBonus', value)}
                className="accent-torn-green"
              />
              <span className="text-sm text-text-primary group-hover:text-torn-green transition-colors">
                {label}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Merit Level */}
      <div>
        <label className={labelClass}>
          Merit Level:{' '}
          <span className="text-torn-green font-semibold">{state.meritLevel}</span>
        </label>
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={state.meritLevel}
          onChange={(e) => onUpdate('meritLevel', Number(e.target.value))}
          className="w-full accent-torn-green"
        />
        <div className="flex justify-between text-xs text-text-secondary mt-0.5">
          <span>0</span>
          <span>10</span>
        </div>
      </div>

      {/* Company */}
      <FieldWrap label="Training Company">
        <select
          value={state.companyType ?? ''}
          onChange={(e) => onUpdate('companyType', e.target.value || null)}
          className={selectClass}
        >
          <option value="">None</option>
          {TRAINING_COMPANIES.map((c) => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
      </FieldWrap>

      {/* Company Star Level (only when company selected) */}
      {state.companyType && (
        <div>
          <label className={labelClass}>
            Company Star Level:{' '}
            <span className="text-torn-green font-semibold">{state.companyStarLevel} ★</span>
          </label>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={state.companyStarLevel}
            onChange={(e) => onUpdate('companyStarLevel', Number(e.target.value))}
            className="w-full accent-torn-green"
          />
          <div className="flex justify-between text-xs text-text-secondary mt-0.5">
            <span>1★</span>
            <span>10★</span>
          </div>
        </div>
      )}
    </div>
  );
}
