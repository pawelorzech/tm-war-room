'use client';

function ChecklistItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-3 text-sm text-text-primary">
      <span className="shrink-0 mt-0.5 w-5 h-5 rounded border border-gray-500 flex items-center justify-center text-xs font-bold text-transparent">
        ✓
      </span>
      <span>{text}</span>
    </li>
  );
}

export function Section09_TrainingBreak() {
  return (
    <section id="training-break" className="space-y-6">
      <h2 className="text-2xl font-bold text-text-primary border-b border-text-secondary/20 pb-3">
        Preparing for Training Break
      </h2>

      {/* Context */}
      <div className="space-y-3 text-text-primary leading-relaxed">
        <p>
          TM and many factions have periodic{' '}
          <strong className="text-torn-green">training breaks</strong> during Ranked Wars. During a
          Ranked War, your faction needs you focused on fighting — not training. Your energy goes to
          attacks, chains, and war activities instead of the gym.
        </p>
        <p>
          Smart players prepare before and after the break to minimize lost training time and
          maximize their burst when they return to the gym.
        </p>
      </div>

      {/* Before break */}
      <div className="bg-bg-card border-l-4 border-torn-green rounded-r-xl p-5 space-y-3">
        <h4 className="font-semibold text-torn-green text-base">Before the war starts</h4>
        <ul className="space-y-2.5">
          <ChecklistItem text="Train hard right up until the war begins — maximize every last gym session" />
          <ChecklistItem text="Use your point refill and any remaining energy for one final gym push" />
          <ChecklistItem text="If your Steadfast rotation is favorable, stack your last sessions to benefit" />
          <ChecklistItem text="Decide: sell FHCs now (buy Xanax for training) or save them for war refills" />
          <ChecklistItem text="Note your current stat level — you'll want to track what you missed" />
        </ul>
      </div>

      {/* During break (war) */}
      <div className="bg-bg-card border-l-4 border-warning rounded-r-xl p-5 space-y-3">
        <h4 className="font-semibold text-warning text-base">During the war</h4>
        <ul className="space-y-2.5">
          {[
            'Your energy goes to war activities — attacking, reviving, chaining.',
            'No gym training during the war. That\'s why it\'s called a training break.',
            'FHCs are valuable during wars for instant energy refills mid-chain — don\'t sell them now.',
            'Keep track of how many days the war lasts — you\'ll use this to plan your comeback.',
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-text-primary">
              <span className="shrink-0 mt-0.5 text-warning">▸</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* After break */}
      <div className="bg-bg-card border-l-4 border-torn-green rounded-r-xl p-5 space-y-3">
        <h4 className="font-semibold text-torn-green text-base">After the war ends</h4>
        <ul className="space-y-2.5">
          <ChecklistItem text="Resume gym training immediately — every hour counts" />
          <ChecklistItem text="This is the best time to buy a 30% training book and go all-in" />
          <ChecklistItem text="Use Xanax, cans, point refills — everything you've got" />
          <ChecklistItem text="Coordinate with faction for Steadfast timing to align with your book window" />
          <ChecklistItem text="Stack all bonuses: book + Steadfast + company perks for maximum burst" />
        </ul>
      </div>

      {/* Strategy callout */}
      <div className="bg-bg-secondary border border-torn-green/40 rounded-xl p-5 flex gap-3 items-start">
        <span className="text-torn-green text-xl mt-0.5 shrink-0">★</span>
        <div className="space-y-1">
          <p className="font-semibold text-torn-green">Pro tip: The post-war burst</p>
          <p className="text-sm text-text-primary">
            Buy a 30% book right when the war ends. Stack it with Steadfast rotation, your best
            company perks, and all energy sources. 31 days of boosted training makes up for the war
            break and then some.
          </p>
        </div>
      </div>

      {/* TL;DR */}
      <div className="bg-bg-secondary border border-text-secondary/30 rounded-xl p-5">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">TL;DR</p>
        <ul className="space-y-2">
          {[
            'Before war: train hard until the last moment, use all gym energy',
            'During war: energy goes to fighting, not gym — that\'s the break',
            'After war: burst train with 30% book + all bonuses stacked',
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-text-primary">
              <span className="text-torn-green mt-0.5 shrink-0">▸</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
