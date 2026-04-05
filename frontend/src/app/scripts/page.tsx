'use client';

import { PageExplainer } from '@/components/layout/PageExplainer';

interface Script {
  name: string;
  author: string;
  description: string;
  url: string;
  category: 'essential' | 'training' | 'combat' | 'utility' | 'market';
  tags: string[];
}

const RECOMMENDED_SCRIPTS: Script[] = [
  // Essential
  {
    name: 'TornTools',
    author: 'Mephiles',
    description: 'The must-have browser extension. Adds profit calculations, travel prices, stacking status, gym estimates, and hundreds of quality-of-life improvements across every page.',
    url: 'https://www.torn.com/forums.php#/p=threads&f=67&t=16243863',
    category: 'essential',
    tags: ['extension', 'all-in-one', 'chrome', 'firefox'],
  },
  {
    name: 'TornPDA',
    author: 'Manuito',
    description: 'Mobile app for Torn with built-in scripts, travel calculator, chain watcher, and more. Essential for playing on the go.',
    url: 'https://www.torn.com/forums.php#/p=threads&f=67&t=16163503',
    category: 'essential',
    tags: ['mobile', 'app', 'android', 'ios'],
  },
  {
    name: 'YATA',
    author: 'Kivou',
    description: 'Web-based tool suite: travel stocks, awards tracker, chain report, loot timers, company analysis, and faction management. Data source for TM Hub travel prices.',
    url: 'https://yata.yt',
    category: 'essential',
    tags: ['web', 'awards', 'travel', 'chain'],
  },
  {
    name: 'TornStats',
    author: 'IceBlueFire',
    description: 'Spy database, stat estimates, and player comparison tool. Our spy data in TM Hub pulls from TornStats when available.',
    url: 'https://tornstats.com',
    category: 'essential',
    tags: ['web', 'spy', 'stats', 'estimates'],
  },
  // Training
  {
    name: 'Torn Gym Gains',
    author: 'Finally',
    description: 'Shows estimated stat gains per energy in each gym. Helps you pick the optimal gym for your current stats.',
    url: 'https://www.torn.com/forums.php#/p=threads&f=67&t=16290655',
    category: 'training',
    tags: ['gym', 'stats', 'training'],
  },
  {
    name: 'Torn Addiction Watch + Rehab Advisor',
    author: 'JESTR',
    description: 'Monitors brain debuff %, shows education kick-risk warnings, tracks company addiction, estimates rehabs needed. Essential for Xanax users.',
    url: 'https://greasyfork.org/en/scripts/566464-torn-addiction-watch-rehab-advisor',
    category: 'training',
    tags: ['rehab', 'xanax', 'addiction', 'training'],
  },
  // Combat
  {
    name: 'Torn Attack Central',
    author: 'DeKleworansen',
    description: 'Enhanced attack log with sorting, filtering, and RW tracking. Shows respect gains and helps identify good targets.',
    url: 'https://www.torn.com/forums.php#/p=threads&f=67&t=16172587',
    category: 'combat',
    tags: ['attacks', 'war', 'respect'],
  },
  // Market & Utility
  {
    name: 'Torn Item Market Profit',
    author: 'Lugburz',
    description: 'Shows profit margins on item market listings. Highlights items selling below market value for quick flips.',
    url: 'https://www.torn.com/forums.php#/p=threads&f=67&t=16264837',
    category: 'market',
    tags: ['market', 'trading', 'profit'],
  },
  {
    name: 'Torn City Price Check',
    author: 'Lugburz',
    description: 'Quickly check item prices and market trends without visiting the item market.',
    url: 'https://www.torn.com/forums.php#/p=threads&f=67&t=16267498',
    category: 'utility',
    tags: ['prices', 'items', 'utility'],
  },
];

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  essential: { label: 'ESSENTIAL', color: 'bg-torn-green/15 text-torn-green' },
  training: { label: 'TRAINING', color: 'bg-torn-blue/15 text-torn-blue' },
  combat: { label: 'COMBAT', color: 'bg-danger/15 text-danger' },
  market: { label: 'MARKET', color: 'bg-torn-yellow/15 text-torn-yellow' },
  utility: { label: 'UTILITY', color: 'bg-text-secondary/15 text-text-secondary' },
};

export default function ScriptsPage() {
  const grouped = RECOMMENDED_SCRIPTS.reduce((acc, s) => {
    (acc[s.category] = acc[s.category] || []).push(s);
    return acc;
  }, {} as Record<string, Script[]>);

  const order = ['essential', 'training', 'combat', 'market', 'utility'];

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Recommended Userscripts & Tools</h1>
          <p className="text-text-secondary text-sm mt-1">
            Browser extensions, mobile apps, and web tools that make Torn better.
          </p>
        </div>

        <PageExplainer id="scripts" title="Userscripts — What are these?" bullets={[
          "Userscripts are browser add-ons that enhance Torn's interface with extra data, calculations, and quality-of-life features.",
          "TornTools (browser) and TornPDA (mobile) are the two must-haves. Install these first — everything else is optional.",
          "Web tools like YATA and TornStats complement the in-game experience with data tracking, spy estimates, and faction analytics.",
          "All scripts listed here are well-known in the Torn community, regularly updated, and safe to use within Torn's rules.",
        ]} dataSources={["Curated by TM faction leadership"]} links={[
          ["Torn Forums: Userscripts", "https://www.torn.com/forums.php#/p=forums&f=67"],
          ["Greasyfork Torn Scripts", "https://greasyfork.org/en/scripts/by-site/torn.com"],
        ]} />

        {order.map(cat => {
          const scripts = grouped[cat];
          if (!scripts?.length) return null;
          const { label, color } = CATEGORY_LABELS[cat];
          return (
            <div key={cat} className="space-y-2">
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide flex items-center gap-2">
                <span className={`px-1.5 py-0.5 text-[10px] rounded font-bold ${color}`}>{label}</span>
                <span>{scripts.length} tools</span>
              </h2>
              <div className="space-y-2">
                {scripts.map(s => (
                  <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer"
                    className="block bg-bg-card border border-text-secondary/15 rounded-xl p-4 hover:border-torn-green/30 hover:bg-bg-elevated/50 transition-all group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-text-primary group-hover:text-torn-green transition-colors">
                          {s.name}
                          <span className="ml-2 text-xs text-text-muted font-normal">by {s.author}</span>
                        </p>
                        <p className="text-sm text-text-secondary mt-1">{s.description}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {s.tags.map(t => (
                            <span key={t} className="px-1.5 py-0.5 text-[10px] bg-bg-elevated text-text-muted rounded">{t}</span>
                          ))}
                        </div>
                      </div>
                      <span className="text-text-muted group-hover:text-torn-green transition-colors shrink-0 mt-1">{'\u2192'}</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          );
        })}

        <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-4">
          <p className="text-sm font-medium text-text-primary">Know a great script we&apos;re missing?</p>
          <p className="text-xs text-text-secondary mt-1">
            Let leadership know in Discord and we&apos;ll add it to the list. Only well-maintained, Torn-rules-compliant scripts are included.
          </p>
        </div>

        <p className="text-[10px] text-text-muted text-center">
          All scripts listed are community-made tools. TM Hub is not affiliated with their authors.
        </p>
      </div>
    </div>
  );
}
