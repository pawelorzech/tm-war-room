'use client';
import { useState, useMemo, useEffect } from 'react';
import type { CalculatorState, CalculatorResults, EnergySources, TornUserData } from '@/types/training';
import { calculateGymGain, calculateHappyContribution, compareFhcUseVsSell, compareStatEnhancer, calculateRehabCostPerXanax, projectDailyGain, daysToMilestone } from '@/lib/formulas';
import { generateRecommendations } from '@/lib/recommendations';
import { DEFAULT_PRICES, STAT_MILESTONES, getGymGainById } from '@/lib/constants';

const defaultEnergySources: EnergySources = {
  natural: true, xanax: false, pointRefill: false, fhc: false, energyCans: 0,
};

const defaultState: CalculatorState = {
  currentStat: 100_000_000,
  trainedStat: 'DEF',
  gymDots: 20,
  happy: 4000,
  steadfastBonus: 0,
  educationBonus: 0,
  companyType: null,
  companyStarLevel: 0,
  bookBonus: 'none',
  meritLevel: 0,
  energySources: defaultEnergySources,
};

export function useCalculator(apiData: TornUserData | null) {
  const [state, setState] = useState<CalculatorState>(defaultState);

  useEffect(() => {
    if (!apiData) return;
    const stats = apiData.battlestats;
    const statValues = [
      { stat: 'STR' as const, value: stats.strength },
      { stat: 'DEF' as const, value: stats.defense },
      { stat: 'SPD' as const, value: stats.speed },
      { stat: 'DEX' as const, value: stats.dexterity },
    ];
    const highest = statValues.reduce((a, b) => a.value > b.value ? a : b);
    const gymDots = getGymGainById(apiData.gym.active_gym, highest.stat);

    // Map merit level for the trained stat
    const meritMap = { STR: apiData.merits.brawn, DEF: apiData.merits.protection, SPD: apiData.merits.sharpness, DEX: apiData.merits.evasion };
    const meritLevel = meritMap[highest.stat] ?? 0;

    // Steadfast bonus for the trained stat (API gives %, we need decimal)
    const steadfastMap = { STR: apiData.steadfast.strength, DEF: apiData.steadfast.defense, SPD: apiData.steadfast.speed, DEX: apiData.steadfast.dexterity };
    const steadfastBonus = (steadfastMap[highest.stat] ?? 0) / 100;

    // Education gym bonus — count completed gym-relevant courses
    // Sports Science courses that give gym gains: Bachelor (ID varies), stat-specific courses
    // Approximate: if many courses done, assume ~3-5% bonus
    const eduCount = apiData.educationCompleted.length;
    const educationBonus = eduCount > 100 ? 0.05 : eduCount > 50 ? 0.03 : eduCount > 20 ? 0.02 : 0.01;

    setState(prev => ({
      ...prev,
      currentStat: highest.value,
      trainedStat: highest.stat,
      gymDots,
      happy: apiData.bars.happy.current,
      meritLevel,
      steadfastBonus,
      educationBonus,
    }));
  }, [apiData]);

  const updateField = <K extends keyof CalculatorState>(key: K, value: CalculatorState[K]) => {
    setState(prev => ({ ...prev, [key]: value }));
  };

  const results = useMemo((): CalculatorResults => {
    const bookMultiplier = state.bookBonus === 'single30' ? 0.30 : state.bookBonus === 'all20' ? 0.20 : 0;
    const totalEducation = state.educationBonus + bookMultiplier;

    const gainPerEnergy = calculateGymGain({
      gymDots: state.gymDots,
      currentStat: state.currentStat,
      happy: state.happy,
      steadfastBonus: state.steadfastBonus,
      educationBonus: totalEducation,
      energyUsed: 1,
    });

    const happyContributionPercent = calculateHappyContribution(state.currentStat, state.happy);

    const fhcComparison = compareFhcUseVsSell({
      currentStat: state.currentStat,
      gymDots: state.gymDots,
      happy: state.happy,
      steadfastBonus: state.steadfastBonus,
      educationBonus: totalEducation,
      fhcSellPrice: DEFAULT_PRICES.fhc,
      xanaxPrice: DEFAULT_PRICES.xanax,
    });

    const rehabs = apiData?.personalstats.rehabs ?? 0;
    const rehabCostPerXanax = calculateRehabCostPerXanax(rehabs);

    const seComparison = compareStatEnhancer({
      currentStat: state.currentStat,
      sePrice: DEFAULT_PRICES.statEnhancer,
      xanaxPrice: DEFAULT_PRICES.xanax,
      gymDots: state.gymDots,
      happy: state.happy,
      steadfastBonus: state.steadfastBonus,
      educationBonus: totalEducation,
      rehabCostPerXanax,
    });

    const gainPerDay = projectDailyGain({
      gainPerEnergy,
      energySources: state.energySources,
    });

    const nextMilestone = STAT_MILESTONES.find(m => m > state.currentStat) ?? state.currentStat * 2;
    const daysToNext = gainPerDay > 0 ? daysToMilestone(state.currentStat, nextMilestone, gainPerDay) : Infinity;

    const partialResults: CalculatorResults = {
      gainPerEnergy,
      gainPerNatural: gainPerEnergy * 150,
      gainPerXanax: gainPerEnergy * 250,
      gainPerDay,
      happyContributionPercent,
      fhcComparison,
      seComparison,
      daysToNextMilestone: daysToNext,
      nextMilestone,
      monthlyProjection: state.currentStat + gainPerDay * 30,
      yearlyProjection: state.currentStat + gainPerDay * 365,
      recommendations: [],
    };

    const recommendations = generateRecommendations(state, partialResults, apiData ?? undefined);

    return { ...partialResults, recommendations };
  }, [state, apiData]);

  return { state, updateField, results };
}
