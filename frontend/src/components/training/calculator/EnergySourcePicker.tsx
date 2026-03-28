'use client';

import type { EnergySources } from '@/types/training';
import { ENERGY_SOURCES } from '@/lib/constants';
import { formatStatShort, formatMoney } from '@/lib/format';

interface EnergySourcePickerProps {
  energySources: EnergySources;
  onUpdate: (sources: EnergySources) => void;
  gainPerEnergy: number;
}

type BooleanEnergyKey = 'natural' | 'xanax' | 'pointRefill' | 'fhc';

const BOOLEAN_SOURCES: { key: BooleanEnergyKey; constantId: string }[] = [
  { key: 'natural', constantId: 'natural' },
  { key: 'xanax', constantId: 'xanax' },
  { key: 'pointRefill', constantId: 'pointRefill' },
  { key: 'fhc', constantId: 'fhc' },
];

function getTotalEnergy(sources: EnergySources): number {
  let total = 0;
  if (sources.natural) total += 150;
  if (sources.xanax) total += 250 * 2;
  if (sources.pointRefill) total += 150;
  if (sources.fhc) total += 150;
  total += sources.energyCans * 25;
  return total;
}

export function EnergySourcePicker({
  energySources,
  onUpdate,
  gainPerEnergy,
}: EnergySourcePickerProps) {
  const totalEnergy = getTotalEnergy(energySources);
  const totalDailyGain = gainPerEnergy * totalEnergy;

  function toggleBoolean(key: BooleanEnergyKey) {
    onUpdate({ ...energySources, [key]: !energySources[key] });
  }

  function setCans(value: number) {
    onUpdate({ ...energySources, energyCans: Math.max(0, Math.min(6, value)) });
  }

  const energyCanInfo = ENERGY_SOURCES.find((s) => s.id === 'energyCan');

  return (
    <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-4 space-y-3">
      <h3 className="text-text-primary font-semibold text-sm">Daily Energy Sources</h3>

      <div className="space-y-2">
        {BOOLEAN_SOURCES.map(({ key, constantId }) => {
          const source = ENERGY_SOURCES.find((s) => s.id === constantId);
          if (!source) return null;
          const checked = energySources[key];
          const gain = gainPerEnergy * source.energy * (source.daily ?? 1);

          return (
            <label
              key={key}
              className="flex items-start gap-3 cursor-pointer group rounded-lg p-2 -mx-2
                hover:bg-bg-secondary transition-colors"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleBoolean(key)}
                className="mt-0.5 accent-torn-green w-4 h-4 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span
                    className={`text-sm font-medium transition-colors ${
                      checked ? 'text-text-primary' : 'text-text-secondary'
                    }`}
                  >
                    {source.name}
                  </span>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-text-secondary">{source.energy}E</span>
                    {source.cost > 0 && (
                      <span className="text-text-secondary">{formatMoney(source.cost)}</span>
                    )}
                    {checked && (
                      <span className="text-torn-green font-semibold">
                        +{formatStatShort(gain)}/day
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-text-secondary mt-0.5">{source.notes}</p>
              </div>
            </label>
          );
        })}

        {/* Energy Cans */}
        <div className="flex items-start gap-3 rounded-lg p-2 -mx-2">
          <div className="mt-0.5 w-4 h-4 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span
                className={`text-sm font-medium transition-colors ${
                  energySources.energyCans > 0 ? 'text-text-primary' : 'text-text-secondary'
                }`}
              >
                Energy Cans
              </span>
              <div className="flex items-center gap-2 text-xs">
                {energyCanInfo && (
                  <span className="text-text-secondary">25E each · {formatMoney(energyCanInfo.cost)}/can</span>
                )}
                {energySources.energyCans > 0 && (
                  <span className="text-torn-green font-semibold">
                    +{formatStatShort(gainPerEnergy * energySources.energyCans * 25)}/day
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 mt-1.5">
              <input
                type="range"
                min={0}
                max={6}
                step={1}
                value={energySources.energyCans}
                onChange={(e) => setCans(Number(e.target.value))}
                className="flex-1 accent-torn-green"
              />
              <input
                type="number"
                min={0}
                max={6}
                value={energySources.energyCans}
                onChange={(e) => setCans(Number(e.target.value))}
                className="w-14 bg-bg-secondary border border-text-secondary/30 rounded-md px-2 py-1
                  text-text-primary text-sm text-center
                  focus:outline-none focus:border-torn-green focus:ring-1 focus:ring-torn-green"
              />
              <span className="text-xs text-text-secondary w-8">/ 6</span>
            </div>
            {energyCanInfo && (
              <p className="text-xs text-text-secondary mt-0.5">{energyCanInfo.notes}</p>
            )}
          </div>
        </div>
      </div>

      {/* Totals */}
      <div className="border-t border-text-secondary/20 pt-3 space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Total daily energy</span>
          <span className="text-text-primary font-semibold">{totalEnergy}E</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Total daily gain</span>
          <span className="text-torn-green font-bold">{formatStatShort(totalDailyGain)}</span>
        </div>
      </div>
    </div>
  );
}
