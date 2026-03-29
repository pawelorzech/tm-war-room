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
        q: 'How do battle stats work?',
        a: 'You have 4 battle stats: Strength (damage dealt), Defense (damage absorbed), Speed (hit chance), and Dexterity (dodge chance). Total stats determine your fighting power. Stats are gained by training at the gym using energy.',
        tip: 'Focus all energy on ONE stat early on for fastest growth. Switch to balanced training later.',
      },
      {
        q: 'How do I know if I can beat someone?',
        a: "Check their threat level on our Bounty Board or Enemies page. 'Easy' means you'll likely win, 'Avoid' means don't try. Threat is calculated from spy data or estimated from their personalstats (xanax taken, attacks won, etc).",
        tip: 'Look at their xanax taken — someone with 5000+ xanax is likely very strong.',
      },
      {
        q: 'What affects fight outcomes besides stats?',
        a: 'Weapon quality (damage bonus), armor (damage reduction), temporary items (stat boosters), merits (combat perks), and faction perks all matter. Being in a faction with war bonuses helps too.',
      },
      {
        q: 'How do I train effectively?',
        a: 'Use ALL your energy on gym training. Take xanax for +250E (once/day), energy refills (+150E), and use stat enhancers for bonus stats. Higher happy = more stats per train. Check our Training Guide page for personalized advice.',
        tip: 'Happy above 5000 significantly increases gains. Time your training after getting happy boosts.',
      },
      {
        q: 'What are SE (Stat Enhancers) and when should I use them?',
        a: 'Stat Enhancers give a random stat boost to one of your 4 battle stats. They\'re worth using when you have high total stats (100M+) as the boost scales with your current stats. Earlier on, xanax and refills give better value.',
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
        a: 'A chain starts after 10 attacks by faction members within 5 minutes of each other. Each subsequent attack must happen within 5 minutes of the last, or the chain breaks. Longer chains = bigger respect bonuses.',
      },
      {
        q: 'What are chain bonuses?',
        a: 'Bonus respect is awarded at hits 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, and 100000. The bonus multiplier increases at each tier. Hit 10 for a 10x bonus, hit 100 for a 10x bonus of a higher base.',
        tip: 'Save your strongest attacks for bonus hits — they multiply the respect earned.',
      },
      {
        q: 'How do I prevent a chain timeout?',
        a: "Watch the chain timer — if it's getting close to 5 minutes, anyone in faction should attack ASAP. Use easy targets (low-level players, NPCs) as 'timeout saves'. Our Chain Tracker shows the current timer.",
        tip: 'Coordinate with faction — assign timezone shifts so someone is always watching.',
      },
      {
        q: 'Do assists and mugs count for chains?',
        a: 'Yes! Any successful attack outcome (hospitalize, mug, leave, arrest, special) counts toward the chain. Even leaving someone counts.',
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
        a: 'Organized Crimes are team-based missions where faction members fill specific roles. Each crime has a planning phase (members prepare) and an execution phase. Success depends on team composition, planning quality, and crime difficulty.',
      },
      {
        q: 'What is Checkpoint Pass Rate (CPR)?',
        a: "CPR shows how well a member is completing their role's checkpoints during the planning phase. Higher CPR = better chance of success. Aim for 100% CPR on all participants before initiating.",
        tip: 'Don\'t start the crime until all members show "Planning Complete" and high CPR.',
      },
      {
        q: 'What do I get from successful OCs?',
        a: 'Cash rewards (varies by crime difficulty and success), respect for the faction, and sometimes special items. Higher difficulty crimes give more rewards but are harder to succeed.',
      },
      {
        q: 'Why did our OC fail?',
        a: 'Common reasons: not all members completed planning, low CPR, wrong member roles (some roles need specific stat thresholds), or crime difficulty too high for your team. Check the completed crimes tab to see what went wrong.',
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
        a: 'For new players: travel trading (buy abroad, sell at home). Mid-game: stock market benefits, company specials. Late game: bounty collecting, high-level NPC looting, organized crimes. Our Market Scanner shows current item prices.',
        tip: 'Flower and plushie sets from travel are consistent earners.',
      },
      {
        q: 'How does travel trading work?',
        a: 'Fly to other countries, buy items cheaper there, bring them back and sell on the market. Each country has different items. Check travel costs vs profit margins. Airstrip and Private Island reduce travel time.',
      },
      {
        q: 'How do stocks work in Torn?',
        a: "Torn stocks aren't like real stocks — the main value is in BENEFITS, not price appreciation. Each stock gives a passive benefit (reduced hospital time, bonus money, etc) when you hold enough shares. Check thresholds: 1M/2M/5M/10M shares.",
        tip: 'Buy stocks for benefits, not for trading. The benefit at 1M shares is usually the best value.',
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
        a: 'NPCs (like Duke, Leslie, etc) drop loot when attacked. There are 4 loot levels — level 4 gives the best items worth $5-50M+. Loot level increases as more people attack the NPC. After enough attacks, it resets.',
      },
      {
        q: 'How do I know when an NPC is at level 4?',
        a: "Our NPC Loot page tracks estimated loot levels and timing. NPCs cycle through levels on somewhat predictable schedules. The community coordinates to push NPCs to level 4 for maximum drops.",
        tip: 'Reserve a spot on our loot tracker so your faction can coordinate the best loot windows.',
      },
      {
        q: 'Can I loot NPCs at any level?',
        a: 'You need to be strong enough to successfully attack the NPC. Some NPCs are much harder than others. Start with easier NPCs and work your way up as your stats grow.',
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
        a: 'Players can place bounties on other players. To collect, you need to successfully attack the target. The reward is per-attack — if a bounty has quantity x3, it can be collected 3 times.',
      },
      {
        q: 'How do I know if I can beat a bounty target?',
        a: "Check the threat level badge on our Bounty Board. Green 'Easy' = you should win. Yellow 'Medium' = bring supplies. Orange 'Hard' = risky. Red 'Avoid' = don't try. 'Unknown' = check their profile first.",
        tip: 'Filter by "Easy" to find guaranteed money. High-reward + Easy = jackpot.',
      },
      {
        q: 'Can I get bounties placed on me?',
        a: "Yes, anyone can place a bounty on you. It costs money to place bounties. You can't remove a bounty on yourself — just wait for someone to collect it, or hide in another country.",
      },
      {
        q: 'Are bounties anonymous?',
        a: 'The lister is usually shown, but some bounties can be placed anonymously for extra cost. Our board shows lister info when available.',
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
        q: 'What types of wars are there?',
        a: 'Ranked Wars (matched by the system, ranked competition), Raid Wars (declared by factions, territory-based), and Territory Wars (fighting over turf). Each type has different rules and rewards.',
      },
      {
        q: 'How do ranked wars work?',
        a: 'Two factions are matched and fight for a set period. Each successful hospitalization of an enemy = 1 point. Faction with more points at the end wins respect, rank points, and other rewards.',
        tip: 'Focus on hospitalizing enemies who are online and fighting. Ignore enemies in hospital already.',
      },
      {
        q: 'How should I prepare for war?',
        a: 'Stock up on medical items (morphine, blood bags), fill your energy, get happy boosts ready, coordinate online times with faction. Check the Enemies page for threat analysis during war.',
      },
      {
        q: 'What do I get from winning wars?',
        a: 'Respect (faction ranking), rank points (determines your faction tier), and bragging rights. Higher-ranked factions get more perks and can recruit stronger members.',
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
        q: 'How do revives work?',
        a: 'When you\'re in hospital, another player with the "revive" ability can bring you back immediately. It costs them energy (75E). Players need to be Level 12+ and have completed the medical education course.',
      },
      {
        q: 'What are revive contracts?',
        a: 'Factions and individual players offer revive services — they agree to revive you when you need it, usually for a fee or as part of faction membership. Our Revive Tracker shows recent revive activity.',
      },
      {
        q: 'How do I enable revives?',
        a: "Go to your Torn settings and make sure revives are enabled. If disabled, no one can revive you. During wars, being revivable is critical — you're back in the fight immediately.",
        tip: 'ALWAYS keep revives enabled during war. Every second in hospital is a lost attack.',
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
        a: 'Honors are awarded for specific achievements (attack milestones, travel accomplishments, etc). Medals are special honors with limited circulation. Both give honor bar points that increase respect earned.',
      },
      {
        q: 'What does circulation mean?',
        a: 'Circulation = how many players have earned that award. Lower circulation = rarer = more honor bar points. Some awards have circulation under 100, making them extremely valuable.',
        tip: 'Focus on low-circulation awards you\'re close to completing for the best honor bar gains.',
      },
      {
        q: 'How do awards help me?',
        a: 'Each award earned increases your honor bar. Higher honor bar = more respect earned from attacks, which helps your faction ranking. Some awards also give unique perks or item rewards.',
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
        a: "Most data refreshes every 30-60 seconds via our background scheduler. You can manually refresh any page with the refresh button. War mode increases polling frequency. Some data (like stock history) is collected every 30 minutes.",
      },
      {
        q: 'What does the threat level mean?',
        a: "Threat level compares another player to YOU. It uses spy data (best accuracy), personalstats estimates, or absolute scoring. 'Easy' means you're much stronger, 'Avoid' means they're much stronger. 'Unknown' means we have no data.",
      },
      {
        q: 'Why do some pages show "no data"?',
        a: "Some features need time to accumulate data (like stock charts, stat growth). If a page is empty: 1) Check if you're logged in, 2) Try the refresh button, 3) The Torn API might be slow. Data loads in the background.",
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

  // Filter by search
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

        {/* Search and controls */}
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

        {/* Category chips */}
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

        {/* FAQ sections */}
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

        {/* Footer links */}
        <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-4 space-y-2">
          <p className="text-sm font-medium text-text-primary">Learn more</p>
          <div className="flex flex-wrap gap-3">
            {[
              ['Torn Wiki', 'https://wiki.torn.com'],
              ['Torn Forums', 'https://www.torn.com/forums.php'],
              ['r/torncity', 'https://reddit.com/r/torncity'],
              ['TornStats', 'https://www.tornstats.com'],
              ['YATA', 'https://yata.yt'],
            ].map(([label, url]) => (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-torn-green hover:text-torn-green/80 underline underline-offset-2 transition-colors">
                {label} ↗
              </a>
            ))}
          </div>
          <p className="text-[10px] text-text-muted mt-2">
            TM Hub is a community tool built for The Masters [TM] faction. Data from Torn API, TornStats, and YATA.
          </p>
        </div>
      </div>
    </div>
  );
}
