// Gym data verified against Torn Wiki (wiki.torn.com/wiki/Gym).
// "gains" = per-stat gain multiplier from wiki (e.g. 7.5 for Balboas DEF).
// Standard gyms unlock via gym EXP (earned by training). Specialist gyms have stat ratio requirements.
// Energy per train: Light=5E, Middle/Heavy=10E, Balboas/Frontline/SSL=25E, Single-stat specialists=50E.
export const GYMS = [
  // Light-Weight (5E per train)
  { id: 1, name: "Premier Fitness", gains: { str: 2.0, spd: 2.0, def: 2.0, dex: 2.0 }, energy: 5, unlock: "Default (free)", stage: "light" as const },
  { id: 2, name: "Average Joes", gains: { str: 2.4, spd: 2.4, def: 2.8, dex: 2.4 }, energy: 5, unlock: "$100 + gym EXP", stage: "light" as const },
  { id: 3, name: "Woody's Workout", gains: { str: 2.7, spd: 3.2, def: 3.0, dex: 2.7 }, energy: 5, unlock: "$250 + gym EXP", stage: "light" as const },
  { id: 4, name: "Beach Bods", gains: { str: 3.2, spd: 3.2, def: 3.2, dex: 0 }, energy: 5, unlock: "$500 + gym EXP", stage: "light" as const },
  { id: 5, name: "Silver Gym", gains: { str: 3.4, spd: 3.6, def: 3.4, dex: 3.2 }, energy: 5, unlock: "$1K + gym EXP", stage: "light" as const },
  { id: 6, name: "Pour Femme", gains: { str: 3.4, spd: 3.6, def: 3.6, dex: 3.8 }, energy: 5, unlock: "$2.5K + gym EXP", stage: "light" as const },
  { id: 7, name: "Davies Den", gains: { str: 3.7, spd: 0, def: 3.7, dex: 3.7 }, energy: 5, unlock: "$5K + gym EXP", stage: "light" as const },
  { id: 8, name: "Global Gym", gains: { str: 4.0, spd: 4.0, def: 4.0, dex: 4.0 }, energy: 5, unlock: "$10K + gym EXP", stage: "light" as const },
  // Middle-Weight (10E per train)
  { id: 9, name: "Knuckle Heads", gains: { str: 4.8, spd: 4.4, def: 4.0, dex: 4.2 }, energy: 10, unlock: "$50K + gym EXP", stage: "middle" as const },
  { id: 10, name: "Pioneer Fitness", gains: { str: 4.4, spd: 4.6, def: 4.8, dex: 4.4 }, energy: 10, unlock: "$100K + gym EXP", stage: "middle" as const },
  { id: 11, name: "Anabolic Anomalies", gains: { str: 5.0, spd: 4.6, def: 5.2, dex: 4.6 }, energy: 10, unlock: "$250K + gym EXP", stage: "middle" as const },
  { id: 12, name: "Core", gains: { str: 5.0, spd: 5.2, def: 5.0, dex: 5.0 }, energy: 10, unlock: "$500K + gym EXP", stage: "middle" as const },
  { id: 13, name: "Racing Fitness", gains: { str: 5.0, spd: 5.4, def: 4.8, dex: 5.2 }, energy: 10, unlock: "$1M + gym EXP", stage: "middle" as const },
  { id: 14, name: "Complete Cardio", gains: { str: 5.5, spd: 5.7, def: 5.5, dex: 5.2 }, energy: 10, unlock: "$2M + gym EXP", stage: "middle" as const },
  { id: 15, name: "Legs, Bums and Tums", gains: { str: 0, spd: 5.5, def: 5.5, dex: 5.7 }, energy: 10, unlock: "$3M + gym EXP", stage: "middle" as const },
  { id: 16, name: "Deep Burn", gains: { str: 6.0, spd: 6.0, def: 6.0, dex: 6.0 }, energy: 10, unlock: "$5M + gym EXP", stage: "middle" as const },
  // Heavy-Weight (10E per train)
  { id: 17, name: "Apollo Gym", gains: { str: 6.0, spd: 6.2, def: 6.4, dex: 6.2 }, energy: 10, unlock: "$7.5M + gym EXP", stage: "heavy" as const },
  { id: 18, name: "Gun Shop", gains: { str: 6.5, spd: 6.4, def: 6.2, dex: 6.2 }, energy: 10, unlock: "$10M + gym EXP", stage: "heavy" as const },
  { id: 19, name: "Force Training", gains: { str: 6.4, spd: 6.5, def: 6.4, dex: 6.8 }, energy: 10, unlock: "$15M + gym EXP", stage: "heavy" as const },
  { id: 20, name: "Cha Cha's", gains: { str: 6.4, spd: 6.4, def: 6.8, dex: 7.0 }, energy: 10, unlock: "$20M + gym EXP", stage: "heavy" as const },
  { id: 21, name: "Atlas", gains: { str: 7.0, spd: 6.4, def: 6.4, dex: 6.5 }, energy: 10, unlock: "$30M + gym EXP", stage: "heavy" as const },
  { id: 22, name: "Last Round", gains: { str: 6.8, spd: 6.5, def: 7.0, dex: 6.5 }, energy: 10, unlock: "$50M + gym EXP", stage: "heavy" as const },
  { id: 23, name: "The Edge", gains: { str: 6.8, spd: 7.0, def: 7.0, dex: 6.8 }, energy: 10, unlock: "$75M + gym EXP", stage: "heavy" as const },
  { id: 24, name: "George's", gains: { str: 7.3, spd: 7.3, def: 7.3, dex: 7.3 }, energy: 10, unlock: "$100M + gym EXP (last standard gym)", stage: "heavy" as const },
  // Specialist Gyms (stat ratio requirements)
  { id: 25, name: "Balboas Gym", gains: { str: 0, spd: 0, def: 7.5, dex: 7.5 }, energy: 25, unlock: "Cha Cha's unlocked; DEF+DEX 25% > STR+SPD", stage: "specialist" as const, stats: ["DEF", "DEX"] },
  { id: 26, name: "Frontline Fitness", gains: { str: 7.5, spd: 7.5, def: 0, dex: 0 }, energy: 25, unlock: "Cha Cha's unlocked; STR+SPD 25% > DEF+DEX", stage: "specialist" as const, stats: ["STR", "SPD"] },
  { id: 27, name: "Gym 3000", gains: { str: 8.0, spd: 0, def: 0, dex: 0 }, energy: 50, unlock: "George's unlocked; STR 25% > 2nd highest stat", stage: "specialist" as const, stats: ["STR"] },
  { id: 28, name: "Mr. Isoyamas", gains: { str: 0, spd: 0, def: 8.0, dex: 0 }, energy: 50, unlock: "George's unlocked; DEF 25% > 2nd highest stat", stage: "specialist" as const, stats: ["DEF"] },
  { id: 29, name: "Total Rebound", gains: { str: 0, spd: 8.0, def: 0, dex: 0 }, energy: 50, unlock: "George's unlocked; SPD 25% > 2nd highest stat", stage: "specialist" as const, stats: ["SPD"] },
  { id: 30, name: "Elites", gains: { str: 0, spd: 0, def: 0, dex: 8.0 }, energy: 50, unlock: "George's unlocked; DEX 25% > 2nd highest stat", stage: "specialist" as const, stats: ["DEX"] },
  { id: 31, name: "Sports Science Lab", gains: { str: 9.0, spd: 9.0, def: 9.0, dex: 9.0 }, energy: 25, unlock: "Last Round unlocked; max 150 Xanax+Ecstasy total", stage: "specialist" as const, sslRestriction: true },
  { id: 32, name: "Fight Club", gains: { str: 10.0, spd: 10.0, def: 10.0, dex: 10.0 }, energy: 10, unlock: "Membership by invite only", stage: "specialist" as const },
] as const;

export type Gym = (typeof GYMS)[number];

export const TRAINING_COMPANIES = [
  {
    name: "Ladies Strip Club",
    perks: [
      { star: 3, effect: "+25% passive DEF", type: "passive" as const, stat: "DEF", value: 0.25 },
      { star: 5, effect: "+50% Serotonin effectiveness", type: "booster" as const },
      { star: 7, effect: "+10% DEF gym gains", type: "gymGain" as const, stat: "DEF", value: 0.10 },
      { star: 10, effect: "+30% melee damage reduction", type: "combat" as const },
    ]
  },
  {
    name: "Gents Strip Club",
    perks: [
      { star: 3, effect: "+25% passive DEX", type: "passive" as const, stat: "DEX", value: 0.25 },
      { star: 5, effect: "+50% Tyrosine effectiveness", type: "booster" as const },
      { star: 7, effect: "+10% DEX gym gains", type: "gymGain" as const, stat: "DEX", value: 0.10 },
      { star: 10, effect: "25% dodge melee", type: "combat" as const },
    ]
  },
  {
    name: "Fitness Center",
    perks: [
      { star: 3, effect: "50% happy loss reduction in gym", type: "passive" as const },
      { star: 5, effect: "~4.5E STR gains per JP", type: "jpTraining" as const, stat: "STR" },
      { star: 10, effect: "+3% gym gains (all)", type: "gymGain" as const, stat: "ALL", value: 0.03 },
    ]
  },
  {
    name: "Music Store",
    perks: [
      { star: 3, effect: "+30% gym XP", type: "passive" as const },
      { star: 10, effect: "+15% ALL battle stats", type: "passive" as const, stat: "ALL", value: 0.15 },
    ]
  },
  {
    name: "Mining Corporation",
    perks: [
      { star: 5, effect: "~4.5E DEF gains per JP", type: "jpTraining" as const, stat: "DEF" },
      { star: 7, effect: "+10% max life", type: "passive" as const },
    ]
  },
  {
    name: "Furniture Store",
    perks: [
      { star: 3, effect: "~4.5E STR gains per JP", type: "jpTraining" as const, stat: "STR" },
      { star: 7, effect: "+25% passive STR", type: "passive" as const, stat: "STR", value: 0.25 },
    ]
  },
  {
    name: "Gas Station",
    perks: [
      { star: 3, effect: "+25% passive SPD", type: "passive" as const, stat: "SPD", value: 0.25 },
      { star: 5, effect: "Cauterize (heal during combat)", type: "combat" as const },
    ]
  },
  {
    name: "Logistics Management",
    perks: [
      { star: 1, effect: "~4.5E SPD gains per JP", type: "jpTraining" as const, stat: "SPD" },
    ]
  },
];

export const ENERGY_SOURCES = [
  { id: "natural", name: "Natural Energy", energy: 150, cost: 0, cooldown: "Regenerates over 24h", daily: 1, notes: "Free. 5E every 15 min." },
  { id: "xanax", name: "Xanax", energy: 250, cost: 839_000, cooldown: "~8h drug cooldown", daily: 2, notes: "Primary training drug. Can boost over max energy cap." },
  { id: "pointRefill", name: "Point Refill", energy: 150, cost: 845_000, cooldown: "1 per day", daily: 1, notes: "~25 points from Points Building." },
  { id: "fhc", name: "FHC (Full Happy Cake)", energy: 150, cost: 12_500_000, cooldown: "None (consumable)", daily: 1, notes: "Usually better to sell and buy Xanax (25x more efficient)." },
  { id: "energyCan", name: "Energy Can", energy: 25, cost: 2_100_000, cooldown: "None", daily: 6, notes: "$12.7M for 6-pack (150E total). Mid-tier efficiency." },
  { id: "lsd", name: "LSD", energy: 50, cost: 28_000, cooldown: "~7h drug cooldown", daily: 0, notes: "Shares drug cooldown with Xanax. +energy, +nerve, +happy." },
] as const;

export const MERIT_STAT_BONUSES = {
  STR: { name: "Brawn", perLevel: 0.03, maxLevel: 10 },
  DEF: { name: "Protection", perLevel: 0.03, maxLevel: 10 },
  SPD: { name: "Sharpness", perLevel: 0.03, maxLevel: 10 },
  DEX: { name: "Evasion", perLevel: 0.03, maxLevel: 10 },
} as const;

export const DEFAULT_PRICES = {
  xanax: 839_000,
  fhc: 12_500_000,
  statEnhancer: 450_000_000,
  energyCan: 2_100_000,
  ecstasy: 40_000,
  lsd: 28_000,
  pointRefill: 845_000,
};

// Look up the gain multiplier for a specific stat from a gym.
// Falls back to max gain across all stats if stat not trained at that gym.
const STAT_TO_GAIN_KEY = { STR: 'str', DEF: 'def', SPD: 'spd', DEX: 'dex' } as const;

export function getGymGain(gymId: number, stat: 'STR' | 'DEF' | 'SPD' | 'DEX'): number {
  const gym = GYMS.find(g => g.id === gymId);
  if (!gym) return 7.3; // fallback to George's level
  const key = STAT_TO_GAIN_KEY[stat];
  const gain = gym.gains[key];
  if (gain > 0) return gain;
  // If gym doesn't train this stat, return max available gain
  return Math.max(gym.gains.str, gym.gains.spd, gym.gains.def, gym.gains.dex);
}

// Jail Gym (API ID 33) is not in GYMS array — add as special case
export function getGymGainById(gymApiId: number, stat: 'STR' | 'DEF' | 'SPD' | 'DEX'): number {
  if (gymApiId === 33) {
    // Jail Gym: STR=3.4, SPD=3.4, DEF=4.6, DEX=0
    const jailGains = { STR: 3.4, DEF: 4.6, SPD: 3.4, DEX: 0 };
    return jailGains[stat] || 3.4;
  }
  return getGymGain(gymApiId, stat);
}

export const STAT_MILESTONES = [
  100_000_000,
  250_000_000,
  500_000_000,
  1_000_000_000,
  2_000_000_000,
  5_000_000_000,
  10_000_000_000,
];
