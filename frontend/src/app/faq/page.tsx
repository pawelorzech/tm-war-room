'use client';

import { useState } from 'react';

interface FAQ {
  q: string;
  a: string;
  tip?: string;
}

interface FAQSection {
  id: string;
  icon: string;
  title: string;
  description: string;
  faqs: FAQ[];
}

const FAQ_SECTIONS: FAQSection[] = [
  {
    id: 'combat',
    icon: '⚔️',
    title: 'Combat & Battle Stats',
    description: 'How fighting works in Torn and how to get stronger.',
    faqs: [
      {
        q: 'What do the four battle stats actually do?',
        a: 'Strength increases damage dealt per hit. Defense reduces damage taken per hit. Speed increases your chance of hitting the opponent. Dexterity increases your chance of dodging attacks. Str+Spd are offensive; Dex+Def are defensive.',
        tip: 'Focus all energy on ONE stat early on for fastest growth. Switch to balanced training later.',
      },
      {
        q: 'How do I know if I can beat someone?',
        a: "Check their threat level on our Bounty Board or Enemies page. 'Easy' means you'll likely win, 'Avoid' means don't try. Threat is calculated from spy data or estimated from personalstats (xanax taken, attacks won, etc).",
        tip: 'Xanax taken is the best single indicator of strength — someone with 5000+ xanax is likely very strong.',
      },
      {
        q: 'What is the Fair Fight (FF) multiplier?',
        a: 'Fair Fight ranges from 1x to 3x and rewards attacking players near your strength level. Attacking someone with ~75% or more of your total battle stats yields the maximum 3x FF. The multiplier drops toward 1x the weaker your target is. This is why farming very weak targets gives poor respect.',
      },
      {
        q: 'What stat ratio should I train?',
        a: "Two popular approaches: Hank's Ratio (1.25:1:1:0) — trains 3 stats, good for focused builds. Baldr's Ratio (1.25:1:0.75:0.75) — more balanced, better for Str/Spd offensive builds. Choose early so you're in ratio when you unlock George's Gym.",
      },
      {
        q: 'How do I train effectively?',
        a: 'Use ALL your energy on gym training. Take xanax for +250E (once/day), energy refills (+150E), and use stat enhancers for bonus stats. Higher happy = more stats per train. Check our Training Guide page for personalized advice.',
        tip: 'Happy above 5000 significantly increases gains. Time your training after getting happy boosts.',
      },
      {
        q: 'What are SE (Stat Enhancers) and when should I use them?',
        a: "Stat Enhancers give a random stat boost to one of your 4 battle stats. They're worth using when you have high total stats (100M+) as the boost scales with your current stats. Earlier on, xanax and refills give better value per dollar.",
      },
    ],
  },
  {
    id: 'chains',
    icon: '🔗',
    title: 'Chains & Chaining',
    description: 'How faction chains work and how to maximize rewards.',
    faqs: [
      {
        q: 'How do chains work?',
        a: 'Your faction must land 10 successful attacks within 5 minutes to start a chain. After that, each new hit resets a 5-minute timer. If the timer hits 0:00, the chain breaks. All attack outcomes (leave, mug, hospitalize) count — you do NOT need to hospitalize.',
      },
      {
        q: 'What are chain bonuses and when do they trigger?',
        a: 'Bonuses trigger at 13 milestones: 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, and 100000 hits. The bonus hit provides a large flat amount of respect. Between bonuses, each hit gets a small logarithmic multiplier that gradually increases.',
        tip: 'Save your strongest attacks for bonus hits — coordinate with faction to give bonus hits to members attacking high-level targets.',
      },
      {
        q: 'How do I prevent a chain timeout?',
        a: "Watch the chain timer — if it's getting close to 5 minutes, anyone should attack ASAP. Use easy targets (low-level players, NPCs) as timeout saves. Our Chain Tracker shows the current timer.",
        tip: 'Coordinate timezone shifts so someone is always watching the chain during long runs.',
      },
      {
        q: 'What weapons help with chaining?',
        a: 'For fast hits, use HEGs (Hand-Held EMP Grenades) to cycle through targets quickly. Smoke Grenades have no counter and pair with Tyrosine for a Dex:Spd advantage. For permanent weapons, Rifles (Armalite, SIG 552, Enfield, Gold AK47) offer the best damage and mod selection.',
      },
    ],
  },
  {
    id: 'oc',
    icon: '🕴️',
    title: 'Organized Crime (OC 2.0)',
    description: 'How the new organized crime system works.',
    faqs: [
      {
        q: 'How does OC 2.0 work?',
        a: 'OC 2.0 divides each crime into checkpoints. Each participant takes a role, and their Checkpoint Pass Rate (CPR) determines success likelihood at each checkpoint. Multiple consecutive failures push toward overall failure, but single failures are recoverable via Recovery checkpoints.',
      },
      {
        q: 'What determines my Checkpoint Pass Rate?',
        a: "CPR depends on your role's stat requirements plus Crime Experience (CE). Combat roles (Muscle, Enforcer) need high STR/DEF. Sleight-of-hand roles (Thief, Picklock) favor DEX. Fast-reaction roles (Sniper, Robber) favor SPD. CE acts as a multiplier on top.",
        tip: "A CPR between 70-80% is generally sufficient for high overall success rates.",
      },
      {
        q: 'What is Crime Experience (CE)?',
        a: 'CE is a hidden metric that determines your Natural Nerve Bar (NNB) and influences OC success rates. You gain CE by completing organized crimes successfully. Higher CE = higher NNB (more nerve for solo crimes) + better CPR in OCs.',
      },
      {
        q: 'How should we assign roles?',
        a: 'Place strongest members in critical/mainline checkpoint roles and weaker members in lenient or recovery roles. Not everyone needs very high CPR — a mix works. Ensure nobody is in hospital, jail, or traveling when the crime starts.',
      },
      {
        q: 'Why did our OC fail?',
        a: "Common reasons: members hadn't completed planning, low CPR on critical roles, wrong role assignments (some roles need specific stat thresholds), or crime difficulty too high. Check our OC Planner's 'What went wrong?' analysis on failed crimes.",
      },
    ],
  },
  {
    id: 'market',
    icon: '🛒',
    title: 'Market & Economy',
    description: 'Making money and understanding the Torn economy.',
    faqs: [
      {
        q: 'What are the best ways to make money?',
        a: 'Early game: travel trading (buy abroad, sell at home). Mid-game: stock market benefits, company specials. Late game: bounty collecting, high-level NPC looting, organized crimes, property rental income.',
        tip: 'Plushie and flower sets from travel are consistently the most profitable trade items.',
      },
      {
        q: 'How does the stock market work?',
        a: "Torn stocks differ from real stocks — the main value is in BENEFITS, not price appreciation. Owning enough shares of a stock gives passive benefits (reduced hospital time, bonus money, energy, ammo) every 7 or 31 days. Key thresholds vary by stock. Buying has no tax; selling has a 0.1% fee.",
        tip: 'Prioritize benefit blocks with the highest ROI for your capital level. Smaller blocks like SYM and TCHS are accessible earlier.',
      },
      {
        q: 'How do I protect my money from mugging?',
        a: 'Deposit in the City Bank (earns interest), use your faction bank (deposit anytime), or invest in stocks/property. Never carry large amounts of cash on hand — muggers can take it.',
      },
    ],
  },
  {
    id: 'loot',
    icon: '💰',
    title: 'NPC Looting',
    description: 'How to get valuable drops from NPCs.',
    faqs: [
      {
        q: 'How does NPC looting work?',
        a: 'Certain NPCs (Duke, Leslie, Jimmy, Tiny, Fernando) are lootable. When defeated, loot is distributed lottery-style — the more damage you contribute, the higher your chance of receiving loot. The NPC\'s loot level determines how many players receive loot AND the rarity of drops.',
      },
      {
        q: 'What are the loot level timings?',
        a: 'After an NPC is defeated, levels increase on a fixed schedule: Level 1 = immediately (1 player gets loot), Level 2 = 30 min (2 players), Level 3 = 90 min (3 players), Level 4 = 3.5 hours (4 players), Level 5 = 7.5 hours (5 players). Higher levels also increase rare drop chance.',
        tip: 'Level 4 (3.5 hours) is the sweet spot — good loot count, decent rare drops, reasonable wait. Level 5 takes 4 more hours for only marginal improvement.',
      },
      {
        q: 'Can I loot NPCs at any level?',
        a: 'You need to be strong enough to successfully attack the NPC. Some NPCs are much harder than others. Start with easier NPCs and work your way up as your stats grow. Use our NPC Loot page to track timers and coordinate with faction.',
      },
    ],
  },
  {
    id: 'bounties',
    icon: '💵',
    title: 'Bounties',
    description: 'How bounties work and how to collect them.',
    faqs: [
      {
        q: 'How do bounties work?',
        a: 'Anyone can place a bounty on another player. To claim it, you must hospitalize the target. The bounty placer pays the reward plus a 50% listing fee (e.g., $10M bounty costs $15M to place). Anonymity costs an additional 50%. Unclaimed bounties expire after 7 days.',
      },
      {
        q: 'How do I know if I can beat a bounty target?',
        a: "Check the threat level badge on our Bounty Board. Green 'Easy' = you should win. Yellow 'Medium' = bring supplies. Orange 'Hard' = risky. Red 'Avoid' = don't try. 'Unknown' = check their profile first.",
        tip: "Filter by 'Easy' to find guaranteed money. High-reward + Easy = jackpot.",
      },
      {
        q: 'How can I protect myself from bounties?',
        a: 'Working at a Private Security Firm lets you exchange 20 job points for 72 hours of bounty protection. Otherwise, being in hospital, traveling abroad, or being in jail makes you harder to hit. Strong battle stats are the best long-term defense.',
      },
      {
        q: 'Are bounties anonymous?',
        a: 'Bounties can be placed anonymously for extra cost (additional 50% of the reward). Our board shows lister info when available. Each player can have 10 active bounties placed at any one time.',
      },
    ],
  },
  {
    id: 'wars',
    icon: '🏴',
    title: 'Faction Wars',
    description: 'How wars work and how to win them.',
    faqs: [
      {
        q: 'How do ranked wars work?',
        a: 'Factions enlist in the ranked war pool (requires 10+ active members). You\'re matched 1v1. The win condition is reaching a "lead target" in respect — e.g., if the target is 5,000, you need to be 5,000 ahead. Mugging gives 75% of the score that leaving/hospitalizing gives. Chain bonuses generate large score amounts.',
        tip: 'Focus on hospitalizing online enemies who are fighting. Ignore enemies already in hospital.',
      },
      {
        q: 'What rewards do ranked wars give?',
        a: 'Winners get 2x reward multiplier; losers get 1x. Rewards include bonus respect and caches containing special weapons and armor. Higher faction rank and division provide greater rewards.',
      },
      {
        q: 'How should I prepare for war?',
        a: 'Stock up on medical items (morphine, blood bags), fill your energy, get happy boosts ready, coordinate online times with faction. Check the Enemies page for threat analysis. Keep revives enabled — every second in hospital is a lost attack.',
      },
      {
        q: 'How do territories work?',
        a: 'Territories are city map blocks that factions claim. Owning territory provides daily respect. Some territories spawn Rackets (levels 1-5) that provide daily resources. Assaulting a territory creates a 72-hour wall where attackers fill a score bar while defenders deplete it. Need 10+ members to assault.',
      },
    ],
  },
  {
    id: 'revives',
    icon: '💚',
    title: 'Revives',
    description: 'How to get revived and revive others.',
    faqs: [
      {
        q: 'How do revives work mechanically?',
        a: 'You gain the revive ability at Brain Surgeon rank in the Medical job (kept permanently). Each attempt costs 75 energy (reducible to 25 with faction perks), whether successful or not. Revive skill level determines how much life is restored (level 10 = 10%, level 90 = 90%).',
      },
      {
        q: 'Why do revives sometimes fail?',
        a: 'Each revive a player receives decreases future success chance by ~8%, which slowly fades over 24 hours. If someone has been revived many times recently, the success rate drops significantly. Revivers may decline targets with too many recent revives.',
      },
      {
        q: 'What are revive contracts?',
        a: 'Factions hire reviving factions to provide revives during ranked wars. The reviving faction earns payment per revive (successful or not). This is a major income source for dedicated reviving factions and critical for war performance.',
        tip: 'ALWAYS keep revives enabled during war. Every second in hospital is a lost attack.',
      },
      {
        q: 'How do I get revived?',
        a: 'Ask in Hospital chat or Trade chat — revivers monitor these channels. You can also message a known reviving faction directly. Some factions offer free revives for allies; others charge a fee (typically $500K-$1M per revive). Make sure "Allow revives" is ON in your settings.',
      },
    ],
  },
  {
    id: 'awards',
    icon: '🏆',
    title: 'Awards & Honors',
    description: 'How to earn awards and what circulation means.',
    faqs: [
      {
        q: "What's the difference between honors and medals?",
        a: 'Awards include Honors (honor bars) and Medals, earned by completing challenges across all game activities. There are 347+ honor bars. Each award earned grants 1 Merit point. Higher honor bar = more respect from attacks.',
      },
      {
        q: 'What are Merits and how should I spend them?',
        a: 'Merits are upgrade points earned from awards. You can spend them on 10 different perks (each upgradable 10 times, 55 total merits to max one). Popular investments: extra energy, nerve, or happy; increased gym gains; crime skill boosts; hospitalization time reduction.',
      },
      {
        q: 'What does circulation mean?',
        a: 'Circulation = how many players have earned that award. Lower circulation = rarer = more honor bar points. Some awards have circulation under 100, making them extremely valuable.',
        tip: "Track progress on TornStats to see which honors you're close to completing. Focus on near-threshold honors.",
      },
      {
        q: 'Is there a strategy for farming awards?',
        a: 'Yes. Focus on honors where you are near the threshold. Some players do specific activities in bulk (reviving sprees, travel runs, weapon-type grinding). The "Decorated" honor requires 100 total awards, incentivizing breadth over depth.',
      },
    ],
  },
  {
    id: 'travel',
    icon: '✈️',
    title: 'Travel & Trading',
    description: 'How to profit from international travel.',
    faqs: [
      {
        q: 'How does travel trading work?',
        a: 'Fly to a foreign country, buy items at local prices, return to Torn, sell on the item market or bazaar for profit. Different destinations offer different items. Base capacity is 5 items per trip, expandable significantly.',
      },
      {
        q: 'What are the most profitable items?',
        a: 'Plushies and Flowers are consistently the most profitable. Plushies are generally more profitable than flowers. Consumables (narcotics, alcohol, energy drinks) are also strong. Use TornStats Travel Profits or TornTravel.com for real-time profit calculations.',
      },
      {
        q: 'How do I increase carrying capacity?',
        a: 'Base is 5 items. Large Suitcase adds 4. Business Class Ticket increases base to 10. Private Island Airstrip + Pilot adds +10 and removes airfare. WLT stock benefit block adds more. A PI with Airstrip is considered essential for serious travel trading.',
        tip: 'Popular high-profit destinations: Argentina, UK, Mexico, Cayman Islands, UAE. Use travel calculators for real-time comparisons.',
      },
    ],
  },
  {
    id: 'hub',
    icon: '🏠',
    title: 'Using TM Hub',
    description: 'How to get the most from this tool.',
    faqs: [
      {
        q: 'How does my data stay safe?',
        a: 'Your API key is encrypted (Fernet encryption) and stored in our database. We only use it to fetch YOUR data from Torn. We never share keys or data with other players. Your player ID is used for session management.',
      },
      {
        q: 'How often does data refresh?',
        a: 'Most data refreshes every 30-60 seconds via our background scheduler. You can manually refresh any page with the refresh button. War mode increases polling frequency. Historical data (like stock prices) is collected every 30 minutes.',
      },
      {
        q: 'What does the threat level mean?',
        a: "Threat level compares another player to YOU. It uses spy data (best accuracy), personalstats estimates, or absolute scoring. 'Easy' = you're much stronger, 'Avoid' = they're much stronger. 'Unknown' = no data available.",
      },
      {
        q: 'Why do some pages show "no data"?',
        a: 'Some features need time to accumulate data (stock charts, stat growth). If a page is empty: 1) Check if you\'re logged in, 2) Try the refresh button, 3) The Torn API might be slow. Data loads in the background automatically.',
      },
    ],
  },
];

function FAQItem({ faq, isOpen, onToggle }: { faq: FAQ; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-border-light last:border-0">
      <button onClick={onToggle}
        className="w-full text-left py-3 px-4 flex items-start justify-between gap-3 hover:bg-bg-elevated/30 transition-colors">
        <span className="text-sm font-medium text-text-primary">{faq.q}</span>
        <span className="text-text-muted text-xs shrink-0 mt-0.5">{isOpen ? '▾' : '▸'}</span>
      </button>
      {isOpen && (
        <div className="px-4 pb-3 space-y-2">
          <p className="text-sm text-text-secondary leading-relaxed">{faq.a}</p>
          {faq.tip && (
            <div className="bg-torn-green/5 border border-torn-green/20 rounded-lg px-3 py-2 flex gap-2">
              <span className="text-torn-green text-sm shrink-0">💡</span>
              <p className="text-xs text-torn-green/80 font-medium">{faq.tip}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FAQPage() {
  const [search, setSearch] = useState('');
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const toggleItem = (key: string) => {
    setOpenItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAll = () => {
    const allKeys = new Set<string>();
    for (const section of FAQ_SECTIONS) {
      for (let i = 0; i < section.faqs.length; i++) {
        allKeys.add(`${section.id}-${i}`);
      }
    }
    setOpenItems(allKeys);
  };

  const collapseAll = () => setOpenItems(new Set());

  const filteredSections = search
    ? FAQ_SECTIONS.map(section => ({
        ...section,
        faqs: section.faqs.filter(f =>
          f.q.toLowerCase().includes(search.toLowerCase()) ||
          f.a.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter(s => s.faqs.length > 0)
    : activeSection
      ? FAQ_SECTIONS.filter(s => s.id === activeSection)
      : FAQ_SECTIONS;

  const totalFAQs = FAQ_SECTIONS.reduce((sum, s) => sum + s.faqs.length, 0);

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Frequently Asked Questions</h1>
          <p className="text-text-secondary text-sm mt-1">
            {totalFAQs} answers covering Torn mechanics, features, and strategy.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <input type="text" placeholder="Search questions..." value={search}
            onChange={e => { setSearch(e.target.value); setActiveSection(null); }}
            className="flex-1 min-w-[200px] max-w-sm bg-bg-card border border-text-secondary/20 rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-torn-green/50" />
          <button onClick={expandAll}
            className="px-2.5 py-1.5 text-xs bg-bg-card text-text-secondary rounded-lg hover:bg-bg-elevated transition-colors">
            Expand all
          </button>
          <button onClick={collapseAll}
            className="px-2.5 py-1.5 text-xs bg-bg-card text-text-secondary rounded-lg hover:bg-bg-elevated transition-colors">
            Collapse all
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => { setActiveSection(null); setSearch(''); }}
            className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
              !activeSection && !search ? 'bg-torn-green/20 text-torn-green font-semibold' : 'bg-bg-card text-text-secondary hover:bg-bg-elevated'
            }`}>
            All ({totalFAQs})
          </button>
          {FAQ_SECTIONS.map(s => (
            <button key={s.id} onClick={() => { setActiveSection(s.id); setSearch(''); }}
              className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                activeSection === s.id ? 'bg-torn-green/20 text-torn-green font-semibold' : 'bg-bg-card text-text-secondary hover:bg-bg-elevated'
              }`}>
              {s.icon} {s.title} ({s.faqs.length})
            </button>
          ))}
        </div>

        {filteredSections.length > 0 ? (
          <div className="space-y-4">
            {filteredSections.map(section => (
              <div key={section.id} className="bg-bg-card border border-text-secondary/15 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border bg-bg-elevated/30">
                  <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                    <span>{section.icon}</span>
                    {section.title}
                  </h2>
                  <p className="text-xs text-text-muted mt-0.5">{section.description}</p>
                </div>
                <div>
                  {section.faqs.map((faq, i) => {
                    const key = `${section.id}-${i}`;
                    return (
                      <FAQItem key={key} faq={faq} isOpen={openItems.has(key)}
                        onToggle={() => toggleItem(key)} />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-6 text-center text-text-secondary">
            No questions match your search.
          </div>
        )}

        <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-4 space-y-2">
          <p className="text-sm font-medium text-text-primary">Learn more</p>
          <div className="flex flex-wrap gap-3">
            {[
              ['Torn Wiki', 'https://wiki.torn.com'],
              ['Torn Forums', 'https://www.torn.com/forums.php'],
              ['r/torncity', 'https://reddit.com/r/torncity'],
              ['TornStats', 'https://www.tornstats.com'],
              ['YATA', 'https://yata.yt'],
              ['TornTravel', 'https://www.torntravel.com'],
            ].map(([label, url]) => (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-torn-green hover:text-torn-green/80 underline underline-offset-2 transition-colors">
                {label} ↗
              </a>
            ))}
          </div>
          <p className="text-[10px] text-text-muted mt-2">
            Content sourced from Torn Wiki, Torn Forums, and community guides. TM Hub is built for The Masters [TM] faction.
          </p>
        </div>
      </div>
    </div>
  );
}
