// Types from torn-api.ts
export type StatType = 'STR' | 'DEF' | 'SPD' | 'DEX';

export interface TornProfile {
  name: string;
  level: number;
  player_id: number;
  faction: { name: string; tag: string; faction_id: number } | null;
}

export interface TornBattleStats {
  strength: number;
  defense: number;
  speed: number;
  dexterity: number;
  total: number;
  strength_modifier: number;
  defense_modifier: number;
  speed_modifier: number;
  dexterity_modifier: number;
}

export interface TornBars {
  happy: { current: number; maximum: number };
  energy: { current: number; maximum: number };
}

export interface TornGym {
  active_gym: number;
}

export interface TornPersonalStats {
  xantaken: number;
  exttaken: number;
  energydrinkused: number;
  refills: number;
  statenhancersused: number;
  rehabs: number;
}

export interface TornMerits {
  brawn: number;      // STR passive, merit id 9
  sharpness: number;  // SPD passive, merit id 10
  evasion: number;    // DEX passive, merit id 11
  protection: number; // DEF passive, merit id 12
}

export interface TornSteadfast {
  strength: number;  // % bonus
  defense: number;
  speed: number;
  dexterity: number;
}

export interface TornJob {
  company_name: string;
  company_type: number;
  position: string;
}

export interface TornUserData {
  profile: TornProfile;
  battlestats: TornBattleStats;
  bars: TornBars;
  gym: TornGym;
  personalstats: TornPersonalStats;
  merits: TornMerits;
  steadfast: TornSteadfast;
  educationCompleted: number[];
  educationPerks: string[];
  bookPerks: string[];
  companyPerks: string[];
  job: TornJob;
}

export interface TornApiError {
  code: number;
  error: string;
}

// Types from calculator.ts
export interface EnergySources {
  natural: boolean;
  xanax: boolean;
  pointRefill: boolean;
  fhc: boolean;
  energyCans: number; // 0-6
}

export type BookBonus = 'none' | 'single30' | 'all20';

export interface CalculatorState {
  currentStat: number;
  trainedStat: StatType;
  gymDots: number;
  happy: number;
  steadfastBonus: number;
  educationBonus: number;
  companyType: string | null;
  companyStarLevel: number;
  bookBonus: BookBonus;
  meritLevel: number;
  energySources: EnergySources;
}

export interface FhcComparison {
  useGain: number;
  sellAndBuyXanaxGain: number;
  ratio: number;
}

export interface SeComparison {
  seGain: number;
  seCostPerStat: number;
  xanaxCostPerStat: number;
  xanaxCostPerStatWithRehab: number;
  rehabCostPerXanax: number;
  ratio: number;
  ratioWithRehab: number;
}

export interface Recommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  impact: string;
  category: 'energy' | 'gym' | 'company' | 'items' | 'warning';
}

export interface CalculatorResults {
  gainPerEnergy: number;
  gainPerNatural: number;
  gainPerXanax: number;
  gainPerDay: number;
  happyContributionPercent: number;
  fhcComparison: FhcComparison;
  seComparison: SeComparison;
  daysToNextMilestone: number;
  nextMilestone: number;
  monthlyProjection: number;
  yearlyProjection: number;
  recommendations: Recommendation[];
}
