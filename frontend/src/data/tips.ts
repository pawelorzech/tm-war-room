export interface Tip {
  text: string;
  category: 'money' | 'training' | 'combat' | 'economy';
}

export const TIPS: Tip[] = [
  // Money & Security
  { text: 'Cash on hand can be mugged (5-15%). Bank it, stock it, or ghost trade it.', category: 'money' },
  { text: 'After being mugged, remaining cash has 12h mug protection \u2014 don\u2019t move it unnecessarily.', category: 'money' },
  { text: 'Stocks are instant buy/sell \u2014 great for parking large amounts of cash quickly.', category: 'money' },
  { text: 'Property vaults hold 100M (Small) to 1B (XL) \u2014 safe but requires owning the property.', category: 'money' },
  { text: 'Never carry large cash while traveling \u2014 API tools track your travel for mugging.', category: 'money' },

  // Training
  { text: 'Higher happiness = more stats per energy in gym. Prioritize property upgrades and candy.', category: 'training' },
  { text: 'Switzerland rehab restores max happiness for cheap \u2014 unlock it at level 15.', category: 'training' },
  { text: 'Candy \u2192 Ecstasy combo doubles your happiness. Eat candies first, then pop Ecstasy.', category: 'training' },
  { text: 'Don\u2019t use Stat Enhancers (dumbbells, boxing gloves, etc.) early \u2014 they sell for ~450M each.', category: 'training' },

  // Combat
  { text: 'Leave targets for max XP, hospitalize for chain timer extension, mug for cash.', category: 'combat' },
  { text: 'Pepper spray reduces target\u2019s dexterity to 1/5 for 20 seconds \u2014 always use first in a fight.', category: 'combat' },
  { text: '10 hits in 5 minutes to start a chain. Then 1 hit per timer cycle to maintain it.', category: 'combat' },
  { text: 'Check a bounty target\u2019s Xanax usage before attacking \u2014 it reveals how much they train.', category: 'combat' },

  // Economy
  { text: 'Flowers and plushies are safest to run abroad \u2014 total cost ~300K means minimal mug risk.', category: 'economy' },
  { text: 'All Item Market sales have a 5% fee \u2014 factor this into your profit calculations.', category: 'economy' },
  { text: 'Spend your 75 casino tokens daily: $1K wheel \u2192 $50K wheel \u2192 lottery ticket \u2192 slots.', category: 'economy' },
  { text: 'City shop items can be resold for huge profit \u2014 beer bought for $1K sells for 380K+.', category: 'economy' },
];
