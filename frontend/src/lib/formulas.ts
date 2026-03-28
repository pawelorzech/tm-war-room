import type { EnergySources } from '@/types/training';

export interface GymGainParams {
  gymDots: number;
  currentStat: number;
  happy: number;
  steadfastBonus: number;
  educationBonus: number;
  energyUsed: number;
}

export function calculateGymGain(params: GymGainParams): number {
  const { gymDots, currentStat, happy, steadfastBonus, educationBonus, energyUsed } = params;
  // Coefficient calibrated to match actual in-game data:
  // ~3533 DEF/E at 1.276B DEF in Balboas (7.5 gain), ~10% bonuses, ~4500 happy.
  // Previously 2.4114e-6 was calibrated for PRD "dots" scale (Balboas=39); recalibrated
  // for wiki gain multipliers (Balboas DEF=7.5) by factor 39/7.5 = 5.2.
  const statComponent = 1.2539e-5 * currentStat;
  const happyComponent = 0.00226263 * happy;
  const inner = statComponent + happyComponent + 0.55;
  const raw = (gymDots * 4) * inner * (1 + steadfastBonus + educationBonus) / 150 * energyUsed;
  return raw;
}

export function calculateHappyContribution(currentStat: number, happy: number): number {
  const statComponent = 0.00019106 * currentStat;
  const happyComponent = 0.00226263 * happy;
  const total = statComponent + happyComponent + 0.55;
  return (happyComponent / total) * 100;
}

export interface FhcComparisonParams {
  currentStat: number;
  gymDots: number;
  happy: number;
  steadfastBonus: number;
  educationBonus: number;
  fhcSellPrice: number;
  xanaxPrice: number;
}

export function compareFhcUseVsSell(params: FhcComparisonParams) {
  const { fhcSellPrice, xanaxPrice, ...gymParams } = params;
  const gainPerEnergy = calculateGymGain({ ...gymParams, energyUsed: 1 });
  const useGain = gainPerEnergy * 150;
  const xanaxCount = fhcSellPrice / xanaxPrice;
  const sellAndBuyXanaxGain = xanaxCount * 250 * gainPerEnergy;
  return { useGain, sellAndBuyXanaxGain, ratio: sellAndBuyXanaxGain / useGain };
}

export interface SeComparisonParams {
  currentStat: number;
  sePrice: number;
  xanaxPrice: number;
  gymDots: number;
  happy: number;
  steadfastBonus: number;
  educationBonus: number;
}

export function compareStatEnhancer(params: SeComparisonParams) {
  const { currentStat, sePrice, xanaxPrice, ...gymParams } = params;
  const seGain = currentStat * 0.01;
  const seCostPerStat = sePrice / seGain;
  const gainPerEnergy = calculateGymGain({
    ...gymParams, currentStat, energyUsed: 1,
  });
  const xanaxGain = gainPerEnergy * 250;
  const xanaxCostPerStat = xanaxPrice / xanaxGain;
  return { seGain, seCostPerStat, xanaxCostPerStat, ratio: seCostPerStat / xanaxCostPerStat };
}

export function projectDailyGain(params: {
  gainPerEnergy: number;
  energySources: EnergySources;
}): number {
  const { gainPerEnergy, energySources } = params;
  let totalEnergy = 0;
  if (energySources.natural) totalEnergy += 150;
  if (energySources.xanax) totalEnergy += 250 * 2;
  if (energySources.pointRefill) totalEnergy += 150;
  if (energySources.fhc) totalEnergy += 150;
  totalEnergy += energySources.energyCans * 25;
  return gainPerEnergy * totalEnergy;
}

export function daysToMilestone(currentStat: number, targetStat: number, dailyGain: number): number {
  if (currentStat >= targetStat) return 0;
  return Math.ceil((targetStat - currentStat) / dailyGain);
}
