'use client';

import { useState } from 'react';
import { PageExplainer } from '@/components/layout/PageExplainer';

/* ── Section data ── */

interface GuideSection {
  id: string;
  icon: string;
  title: string;
  content: React.ReactNode;
}

/* ── Collapsible card component ── */

function SectionCard({
  section,
  isOpen,
  onToggle,
}: {
  section: GuideSection;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="bg-bg-card border border-text-secondary/15 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-bg-elevated/30 transition-colors"
      >
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <span className="text-base">{section.icon}</span>
          {section.title}
        </h2>
        <span className="text-text-muted text-xs shrink-0">
          {isOpen ? '\u25BE' : '\u25B8'}
        </span>
      </button>
      {isOpen && (
        <div className="px-4 pb-4 border-t border-border-light">
          <div className="pt-3 space-y-3 text-sm text-text-secondary leading-relaxed">
            {section.content}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Reusable tip component ── */

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-torn-green/5 border border-torn-green/20 rounded-lg px-3 py-2 flex gap-2">
      <span className="text-torn-green text-sm shrink-0">&#128161;</span>
      <p className="text-xs text-torn-green/80 font-medium">{children}</p>
    </div>
  );
}

/* ── Section content builders ── */

function WelcomeContent() {
  return (
    <>
      <p>
        Welcome to <span className="text-text-primary font-semibold">The Masters [TM]</span>. Being part of an organized
        faction gives you huge advantages over going solo. Here is what we provide:
      </p>
      <ul className="space-y-1.5 pl-1">
        {[
          ['Weapons & Armor lending', 'Access to faction armoury with top-tier equipment you can borrow anytime.'],
          ['War supplies', 'Medical items, temporary weapons, and boosters provided during ranked wars and territory assaults.'],
          ['Training perks', 'Faction upgrades that boost gym gains, energy, and happy — making every train session more efficient.'],
          ['Organized Crimes', 'Coordinated OCs with optimized role assignments for maximum rewards and Crime Experience.'],
          ['Community & knowledge', 'Experienced players who can answer questions, share strategies, and help you grow faster.'],
        ].map(([title, desc]) => (
          <li key={title} className="flex gap-2">
            <span className="text-torn-green shrink-0 mt-0.5">&#9656;</span>
            <span><span className="text-text-primary font-medium">{title}</span> — {desc}</span>
          </li>
        ))}
      </ul>
      <p className="text-text-primary font-medium mt-2">What we expect from you:</p>
      <ul className="space-y-1 pl-1">
        {[
          'Stay active — log in daily, use your energy, complete your OC tasks.',
          'Train every day — gym gains compound over time; consistency is everything.',
          'Participate in wars and chains — when the faction calls, show up.',
          'Follow instructions during war — leadership coordinates targets and timing.',
          'Check faction chat regularly — important announcements happen there.',
          'Read newsletters — leadership posts updates with strategic info.',
        ].map((item) => (
          <li key={item} className="flex gap-2">
            <span className="text-torn-green shrink-0 mt-0.5">&#9656;</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function LevelingContent() {
  return (
    <>
      <p>
        <span className="text-text-primary font-semibold">Level 15</span> is the first major milestone in Torn. It
        unlocks two game-changers:
      </p>
      <ul className="space-y-1.5 pl-1">
        <li className="flex gap-2">
          <span className="text-torn-green shrink-0 mt-0.5">&#9656;</span>
          <span><span className="text-text-primary font-medium">International travel</span> — fly abroad to buy items cheap and sell at home for profit. This is the #1 early-game money maker.</span>
        </li>
        <li className="flex gap-2">
          <span className="text-torn-green shrink-0 mt-0.5">&#9656;</span>
          <span><span className="text-text-primary font-medium">Switzerland rehab</span> — restores your happiness to maximum for cheap, which directly increases gym training gains.</span>
        </li>
      </ul>

      <p className="text-text-primary font-medium mt-2">Equipment for leveling</p>
      <ul className="space-y-1 pl-1">
        {[
          'Weapon: Macana (~$100K) — cheap but effective melee weapon for early attacks.',
          'Armor: Full leather set — gloves, boots, pants, jacket. Cheap and available in shops.',
          'Temporary weapons: 200 Pepper Sprays — use these on tougher targets for guaranteed stun.',
        ].map((item) => (
          <li key={item} className="flex gap-2">
            <span className="text-torn-green shrink-0 mt-0.5">&#9656;</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <p className="text-text-primary font-medium mt-2">Leveling strategy</p>
      <p>
        Attack &quot;leveling targets&quot; — these are abandoned high-level accounts with very low stats. They give excellent
        XP because of the level difference. The key detail:{' '}
        <span className="text-text-primary font-semibold">LEAVE the fight, do not hospitalize</span>. Leaving gives the
        most XP per attack.
      </p>
      <p>
        It takes roughly <span className="text-text-primary font-semibold">120-200 attacks</span> to reach level 15. Use
        energy boosters to speed this up:
      </p>
      <ul className="space-y-1 pl-1">
        <li className="flex gap-2">
          <span className="text-torn-green shrink-0 mt-0.5">&#9656;</span>
          <span><span className="text-text-primary font-medium">LSD</span> — 50E for ~$4M. Cheap energy boost, good early on.</span>
        </li>
        <li className="flex gap-2">
          <span className="text-torn-green shrink-0 mt-0.5">&#9656;</span>
          <span><span className="text-text-primary font-medium">Xanax</span> — 250E for ~$7M. Best energy-per-dollar, but has a drug cooldown.</span>
        </li>
      </ul>

      <Tip>
        Search for &quot;Baldr&apos;s Levelling Targets&quot; on the Torn forums for a maintained list of easy targets
        sorted by level.
      </Tip>
    </>
  );
}

function TrainingContent() {
  return (
    <>
      <p>
        Training is the core progression system in Torn. Your battle stats (Strength, Defense, Speed, Dexterity) determine
        how well you fight. Here is how to maximize gains:
      </p>

      <p className="text-text-primary font-medium mt-2">Happiness = gains</p>
      <p>
        Happiness <span className="text-text-primary font-semibold">directly scales</span> how many stat points you earn
        per gym train. Training at 1000 happy gives roughly double the gains of training at 500 happy. Always train with
        the highest happiness you can get.
      </p>

      <p className="text-text-primary font-medium mt-2">How to boost happiness</p>
      <ul className="space-y-1.5 pl-1">
        {[
          'Property upgrade — your property sets your maximum happy cap. Aim for Private Island eventually (99,999 happy).',
          'Switzerland rehab (level 15+) — restores happiness to your max for a small fee. The best daily reset.',
          'Candy + Ecstasy combo — eat candy bars to use up your booster cooldown, then use Ecstasy which doubles your current happiness. Time this before a big training session.',
        ].map((item) => (
          <li key={item} className="flex gap-2">
            <span className="text-torn-green shrink-0 mt-0.5">&#9656;</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <p className="text-text-primary font-medium mt-2">Energy sources (ranked)</p>
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
              <th className="py-2 px-3">Source</th>
              <th className="py-2 px-3 text-right">Energy</th>
              <th className="py-2 px-3">Notes</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Natural regen', '5E/15min', 'Free — use it or lose it (capped at max energy)'],
              ['LSD', '+50E', 'Cheap (~$4M), no drug cooldown conflict'],
              ['Xanax', '+250E', 'Best value (~$7M), triggers drug cooldown'],
              ['Energy refill', '+150E', 'Costs 25 points, once per day maximum'],
              ['Energy drinks', '+variable', 'Uses booster cooldown slot'],
              ['FHCs', '+250E+', 'Uses booster cooldown, expensive but powerful'],
            ].map(([source, energy, notes]) => (
              <tr key={source} className="border-b border-border-light">
                <td className="py-1.5 px-3 text-text-primary font-medium whitespace-nowrap">{source}</td>
                <td className="py-1.5 px-3 text-text-secondary text-right tabular-nums">{energy}</td>
                <td className="py-1.5 px-3 text-text-muted text-xs">{notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-text-primary font-medium mt-2">Focus your stats</p>
      <p>
        Most players train <span className="text-text-primary font-semibold">2 stats heavily</span> depending on their
        weapon choice:
      </p>
      <ul className="space-y-1 pl-1">
        <li className="flex gap-2">
          <span className="text-torn-green shrink-0 mt-0.5">&#9656;</span>
          <span><span className="text-text-primary font-medium">Strength + Defense</span> — tank build, good for melee weapons and survivability.</span>
        </li>
        <li className="flex gap-2">
          <span className="text-torn-green shrink-0 mt-0.5">&#9656;</span>
          <span><span className="text-text-primary font-medium">Speed + Dexterity</span> — evasion build, good for ranged weapons and dodging.</span>
        </li>
      </ul>

      <Tip>
        Check the Training Guide page in TM Hub for personalized advice based on your current stats, including gym
        recommendations and cost analysis.
      </Tip>
    </>
  );
}

function MoneySafetyContent() {
  return (
    <>
      <p>
        Cash on hand can be <span className="text-text-primary font-semibold">mugged</span> — attackers take 5-15% of your
        cash depending on their merits. Protecting your money is essential.
      </p>

      <p className="text-text-primary font-medium mt-2">Mug protection mechanic</p>
      <p>
        After being mugged, your remaining cash has a <span className="text-text-primary font-semibold">12-hour linear
        decay protection</span> — muggers get progressively less from you. However, this protection is
        <span className="text-text-primary font-semibold"> voided if your cash balance changes</span> (receiving money,
        selling items, etc).
      </p>

      <p className="text-text-primary font-medium mt-2">Storage methods (ranked by safety)</p>
      <div className="space-y-2">
        {[
          {
            name: 'City Bank',
            safety: 'Safest',
            safetyColor: 'text-torn-green',
            desc: 'Earns interest. Use 7-14 day terms to compound returns. Must manually reinvest when terms expire. No risk whatsoever.',
          },
          {
            name: 'Stocks',
            safety: 'Very safe',
            safetyColor: 'text-torn-green',
            desc: 'Instant buy/sell since Stocks 2.0. Risk: price fluctuation between buy and sell. Good for quick parking of cash.',
          },
          {
            name: 'Faction vault',
            safety: 'Safe',
            safetyColor: 'text-torn-blue',
            desc: 'Deposit unlimited amounts, but only faction leaders can withdraw. Requires trust in leadership.',
          },
          {
            name: 'Ghost trades',
            safety: 'Moderate',
            safetyColor: 'text-torn-yellow',
            desc: 'Set up a trade with a trusted player — cash sits safely in the trade for 6 hours. Set an alarm so you don\'t forget!',
          },
          {
            name: 'Property vaults',
            safety: 'Moderate',
            safetyColor: 'text-torn-yellow',
            desc: 'Small (100M), Medium (300M), Large (500M), XL (1B). Only works for owned properties, not rented.',
          },
          {
            name: 'Cayman Island Bank',
            safety: 'Risky',
            safetyColor: 'text-danger',
            desc: 'Level 15+ required, unlimited storage. RISKY: players track travel via API to mug you on landing. You have only a 15-second buffer when landing.',
          },
          {
            name: 'Items as cash',
            safety: 'Varies',
            safetyColor: 'text-text-secondary',
            desc: 'Convert cash to items that hold value: Xanax, Donator Packs (instant pawn sell), Type 98 Anti Tank (~$17M NPC sell). Can\'t be mugged, but price can fluctuate.',
          },
        ].map((method) => (
          <div key={method.name} className="bg-bg-elevated/30 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-text-primary font-medium text-sm">{method.name}</span>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${method.safetyColor}`}>
                {method.safety}
              </span>
            </div>
            <p className="text-xs text-text-muted mt-0.5">{method.desc}</p>
          </div>
        ))}
      </div>

      <Tip>
        Rule of thumb: never carry more than you can afford to lose. Deposit cash immediately after earning it.
      </Tip>
    </>
  );
}

function MedicalContent() {
  return (
    <>
      <p>
        Medical items reduce your hospital time and restore life. Stock up{' '}
        <span className="text-text-primary font-semibold">before</span> you need them — you cannot access the Item Market
        from hospital.
      </p>

      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
              <th className="py-2 px-3">Item</th>
              <th className="py-2 px-3 text-right">Hosp. Reduced</th>
              <th className="py-2 px-3 text-right">Life Restored</th>
              <th className="py-2 px-3">Notes</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Small First Aid Kit', '20 min', '5%', 'Cheapest option — good for minor scrapes'],
              ['First Aid Kit', '40 min', '10%', 'Solid balance of cost and effectiveness'],
              ['Morphine', '70 min', '15%', 'Best time-per-dollar ratio for most players'],
              ['Blood Bag (compatible)', '2 hours', '30%', 'Requires Intravenous Therapy education'],
            ].map(([item, time, life, notes]) => (
              <tr key={item} className="border-b border-border-light">
                <td className="py-1.5 px-3 text-text-primary font-medium whitespace-nowrap">{item}</td>
                <td className="py-1.5 px-3 text-text-secondary text-right tabular-nums">{time}</td>
                <td className="py-1.5 px-3 text-text-secondary text-right tabular-nums">{life}</td>
                <td className="py-1.5 px-3 text-text-muted text-xs">{notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-text-primary font-medium mt-2">Important notes</p>
      <ul className="space-y-1.5 pl-1">
        <li className="flex gap-2">
          <span className="text-torn-green shrink-0 mt-0.5">&#9656;</span>
          <span>
            <span className="text-text-primary font-medium">Wrong/incompatible blood bag</span> = self-hospitalize.
            This is actually the cheapest way to &quot;hide&quot; in hospital for ~1.5 hours if needed.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-torn-green shrink-0 mt-0.5">&#9656;</span>
          <span>
            <span className="text-text-primary font-medium">AB+ blood type?</span> You are a universal recipient, so
            all blood bags work on you. Use Ipecac Syrup instead for self-hospitalization.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-torn-green shrink-0 mt-0.5">&#9656;</span>
          <span>
            <span className="text-text-primary font-medium">Blood bag prerequisites:</span> you must complete
            Intro to Biochemistry, then Intravenous Therapy education courses before you can use blood bags.
          </span>
        </li>
      </ul>

      <Tip>
        Keep at least 10 Morphine and 5 compatible Blood Bags in your inventory at all times. During wars, leadership
        will supply additional medical items through the faction armoury.
      </Tip>
    </>
  );
}

function EducationContent() {
  return (
    <>
      <p>
        Torn has <span className="text-text-primary font-semibold">12 Bachelor degrees</span> that take approximately 6.6
        years in total without any time reductions. Education runs passively in the background, so start immediately and
        never leave it idle.
      </p>

      <p className="text-text-primary font-medium mt-2">Time reduction stacking</p>
      <p>Multiple sources reduce education course duration and they stack:</p>
      <ul className="space-y-1 pl-1">
        {[
          'WSU stock benefit — 10% reduction (requires stock block ownership)',
          'Fitness Centre or Hair Salon job — 30 min reduction per job point spent',
          'Education NPC "Principal" job — 10% reduction',
          'Merit upgrades — 2% per level, maxing at 20% with 55 merits invested',
        ].map((item) => (
          <li key={item} className="flex gap-2">
            <span className="text-torn-green shrink-0 mt-0.5">&#9656;</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <p className="text-text-primary font-medium mt-2">Priority order for new players</p>
      <div className="space-y-2">
        {[
          {
            num: '1',
            title: 'General Studies',
            desc: 'Unlocks all other education courses. Complete this first.',
          },
          {
            num: '2',
            title: 'Biology / Health courses',
            desc: 'Unlocks blood bag usage via Intravenous Therapy. Critical for war survival.',
          },
          {
            num: '3',
            title: 'History Bachelor',
            desc: 'Unlocks the museum — exchange complete flower/plushie sets for collectible items.',
          },
          {
            num: '4',
            title: 'Business Management',
            desc: 'Required to run your own company. Good long-term passive income.',
          },
        ].map((item) => (
          <div key={item.num} className="flex gap-3 items-start bg-bg-elevated/30 rounded-lg px-3 py-2">
            <span className="text-torn-green font-bold text-lg shrink-0 w-6 text-center">{item.num}</span>
            <div>
              <p className="text-text-primary font-medium text-sm">{item.title}</p>
              <p className="text-xs text-text-muted">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <Tip>
        The biggest mistake new players make is ignoring education. Start immediately — it runs in the background while you
        play. Allocate merits to Education Length reduction first for the best long-term value.
      </Tip>
    </>
  );
}

function CasinoContent() {
  return (
    <>
      <p>
        You get <span className="text-text-primary font-semibold">75 free casino tokens daily</span>. Here is how to
        spend them optimally:
      </p>

      <p className="text-text-primary font-medium mt-2">Optimal daily strategy</p>
      <div className="space-y-2">
        {[
          {
            step: '1',
            action: '$1,000 Spin the Wheel',
            tokens: '1 token',
            reason: 'Statistically net-positive over time. Small bet, good expected value.',
          },
          {
            step: '2',
            action: '$50,000 Spin the Wheel',
            tokens: '1 token',
            reason: 'Also net-positive. The wheels are some of the best value in the casino.',
          },
          {
            step: '3',
            action: '1 Lottery Ticket',
            tokens: '1 token',
            reason: 'Tiny chance at massive payout. Only 1 token, worth the gamble.',
          },
          {
            step: '4',
            action: 'Remaining tokens on Slots ($10-$10,000)',
            tokens: '72 tokens',
            reason: 'Slots are the best use of bulk tokens. Scale bet size to your bankroll.',
          },
        ].map((item) => (
          <div key={item.step} className="flex gap-3 items-start bg-bg-elevated/30 rounded-lg px-3 py-2">
            <span className="text-torn-green font-bold text-lg shrink-0 w-6 text-center">{item.step}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-text-primary font-medium text-sm">{item.action}</p>
                <span className="text-[10px] text-text-muted bg-bg-elevated rounded px-1.5 py-0.5">{item.tokens}</span>
              </div>
              <p className="text-xs text-text-muted mt-0.5">{item.reason}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-danger/5 border border-danger/20 rounded-lg px-3 py-2 mt-2">
        <p className="text-xs text-danger/80 font-medium">
          If you struggle with gambling, Torn provides a self-exclusion option: Settings &rarr; Casino Self-Exclusion.
          This permanently locks your access to the casino.
        </p>
      </div>
    </>
  );
}

function LinksContent() {
  const resources = [
    {
      name: 'Torn Wiki',
      url: 'https://wiki.torn.com',
      desc: 'Official game wiki — mechanics, items, formulas. The definitive reference.',
    },
    {
      name: 'YATA',
      url: 'https://yata.yt',
      desc: 'Community tool suite: bazaar search, abroad stock, awards tracker, chain reports.',
    },
    {
      name: 'TornStats',
      url: 'https://www.tornstats.com',
      desc: 'Spy database, stat estimates, and player comparison. Powers TM Hub spy data.',
    },
    {
      name: 'TornPDA',
      url: 'https://www.torn.com/forums.php#/p=threads&f=67&t=16163503',
      desc: 'Essential mobile app for Torn — built-in scripts, chain watcher, travel calculator (Android + iOS).',
    },
    {
      name: 'Loot Rangers Discord',
      url: 'https://discord.gg/lootrangers',
      desc: 'NPC loot coordination community. Get alerts when NPCs are ready to loot.',
    },
    {
      name: "Ahab's Guides List",
      url: 'https://www.torn.com/forums.php#/p=threads&f=61&t=16034448',
      desc: 'Comprehensive index of all Torn community guides. Start here for deep dives.',
    },
  ];

  return (
    <>
      <p>
        These community tools and resources are trusted by experienced Torn players and regularly
        updated.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {resources.map((r) => (
          <a
            key={r.name}
            href={r.url}
            target="_blank" rel="noopener noreferrer"
            
            className="block bg-bg-elevated/30 rounded-lg px-3 py-2.5 hover:border-torn-green/30 hover:bg-bg-elevated/50 transition-all group border border-transparent"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-text-primary font-medium text-sm group-hover:text-torn-green transition-colors">
                {r.name}
              </p>
              <span className="text-text-muted group-hover:text-torn-green transition-colors shrink-0">
                {'\u2192'}
              </span>
            </div>
            <p className="text-xs text-text-muted mt-0.5">{r.desc}</p>
          </a>
        ))}
      </div>
    </>
  );
}

/* ── Sections definition ── */

const SECTIONS: GuideSection[] = [
  { id: 'welcome', icon: '\uD83D\uDCCB', title: 'Welcome to The Masters', content: <WelcomeContent /> },
  { id: 'leveling', icon: '\u2694\uFE0F', title: 'First Steps — Level 15 Fast Track', content: <LevelingContent /> },
  { id: 'training', icon: '\uD83C\uDFCB\uFE0F', title: 'Training Efficiently', content: <TrainingContent /> },
  { id: 'money', icon: '\uD83D\uDCB0', title: 'Money Safety', content: <MoneySafetyContent /> },
  { id: 'medical', icon: '\uD83C\uDFE5', title: 'Medical Items Quick Reference', content: <MedicalContent /> },
  { id: 'education', icon: '\uD83C\uDF93', title: 'Education Priorities', content: <EducationContent /> },
  { id: 'casino', icon: '\uD83C\uDFB0', title: 'Casino Token Strategy', content: <CasinoContent /> },
  { id: 'links', icon: '\uD83D\uDD17', title: 'Useful Links', content: <LinksContent /> },
];

/* ── Main page ── */

export default function GuidePage() {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['welcome']));

  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setOpenSections(new Set(SECTIONS.map((s) => s.id)));
  const collapseAll = () => setOpenSections(new Set());

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Member Guide</h1>
          <p className="text-text-secondary text-sm mt-1">
            Your one-stop reference for Torn game mechanics and TM faction tips.
          </p>
        </div>

        {/* Page explainer */}
        <PageExplainer
          id="guide"
          title="New to Torn or TM?"
          bullets={[
            'This guide covers everything a new faction member needs to know — from leveling to money safety to medical items.',
            'Each section is collapsible. Click any header to expand it. The Welcome section is open by default.',
            'Content is based on community knowledge, Torn Wiki, and experienced player advice.',
            'Bookmark this page and revisit it as you progress — different sections become relevant at different stages.',
          ]}
          dataSources={['Torn Wiki', 'Torn Forums', 'TM faction leadership']}
          links={[
            ['Torn Wiki', 'https://wiki.torn.com'],
            ['Torn Forums', 'https://www.torn.com/forums.php'],
          ]}
        />

        {/* Controls */}
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={expandAll}
            className="px-2.5 py-1.5 text-xs bg-bg-card text-text-secondary rounded-lg hover:bg-bg-elevated transition-colors"
          >
            Expand all
          </button>
          <button
            onClick={collapseAll}
            className="px-2.5 py-1.5 text-xs bg-bg-card text-text-secondary rounded-lg hover:bg-bg-elevated transition-colors"
          >
            Collapse all
          </button>
          <span className="text-xs text-text-muted ml-auto">
            {openSections.size} of {SECTIONS.length} sections open
          </span>
        </div>

        {/* Quick nav pills */}
        <div className="flex flex-wrap gap-1.5">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setOpenSections((prev) => new Set(prev).add(s.id));
                document.getElementById(`section-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                openSections.has(s.id)
                  ? 'bg-torn-green/20 text-torn-green font-semibold'
                  : 'bg-bg-card text-text-secondary hover:bg-bg-elevated'
              }`}
            >
              {s.icon} {s.title}
            </button>
          ))}
        </div>

        {/* Sections */}
        <div className="space-y-3">
          {SECTIONS.map((section) => (
            <div key={section.id} id={`section-${section.id}`}>
              <SectionCard
                section={section}
                isOpen={openSections.has(section.id)}
                onToggle={() => toggleSection(section.id)}
              />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-4 space-y-2">
          <p className="text-sm font-medium text-text-primary">Have questions not covered here?</p>
          <p className="text-xs text-text-secondary">
            Ask in faction chat or check our{' '}
            <a href="/faq" className="text-torn-green hover:text-torn-green/80 underline underline-offset-2 transition-colors">
              FAQ page
            </a>{' '}
            for detailed answers on specific game mechanics.
          </p>
          <p className="text-[10px] text-text-muted mt-2">
            Content sourced from Torn Wiki, Torn Forums, and experienced TM members. Last updated April 2026.
          </p>
        </div>
      </div>
    </div>
  );
}
