'use client';

import { GYMS } from '@/lib/constants';

// First 8 gyms = all light-weight (5E per train)
const BEGINNER_GYMS = GYMS.filter(g => g.stage === 'light');

export function Section01_GettingStarted() {
  return (
    <section id="getting-started" className="space-y-6">
      <h2 className="text-2xl font-bold text-text-primary border-b border-text-secondary/20 pb-3">
        Getting Started (Levels 1–15)
      </h2>

      {/* Intro */}
      <div className="space-y-3 text-text-primary leading-relaxed">
        <p>
          Torn has four battle stats: <strong className="text-torn-green">Strength (STR)</strong>,{' '}
          <strong className="text-torn-green">Defense (DEF)</strong>,{' '}
          <strong className="text-torn-green">Speed (SPD)</strong>, and{' '}
          <strong className="text-torn-green">Dexterity (DEX)</strong>. These determine how well you
          fight. You grow them by spending energy in the gym.
        </p>
        <p>
          Your energy regenerates at <strong>5 energy every 15 minutes</strong>, up to a maximum of{' '}
          <strong>150 energy</strong>. That means you fill up completely in about 7.5 hours. Don&apos;t
          let it sit capped — that&apos;s free gains rotting away.
        </p>
        <p>
          As your stats grow, you unlock better gyms. Better gyms have more{' '}
          <strong className="text-warning">dots</strong> — and more dots means more gains per
          energy. The difference between gyms is not trivial.
        </p>
      </div>

      {/* Gym Progression Table */}
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-3">Gym Progression (First 8 Gyms)</h3>
        <div className="overflow-x-auto rounded-xl border border-text-secondary/20">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-secondary border-b border-text-secondary/20">
                <th className="text-left px-4 py-3 text-text-secondary font-medium">#</th>
                <th className="text-left px-4 py-3 text-text-secondary font-medium">Gym</th>
                <th className="text-left px-4 py-3 text-text-secondary font-medium">Best Gain</th>
                <th className="text-left px-4 py-3 text-text-secondary font-medium">Unlock Requirement</th>
              </tr>
            </thead>
            <tbody>
              {BEGINNER_GYMS.map((gym, index) => (
                <tr
                  key={gym.id}
                  className={`border-b border-text-secondary/10 ${index % 2 === 0 ? 'bg-bg-card' : 'bg-bg-secondary'} hover:bg-bg-secondary/80 transition-colors`}
                >
                  <td className="px-4 py-3 text-text-secondary">{gym.id}</td>
                  <td className="px-4 py-3 font-medium text-text-primary">{gym.name}</td>
                  <td className="px-4 py-3 text-torn-green font-medium">{Math.max(gym.gains.str, gym.gains.def, gym.gains.spd, gym.gains.dex)}x</td>
                  <td className="px-4 py-3 text-text-secondary">{gym.unlock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-text-secondary mt-2">
          More gyms unlock as you gain gym EXP (earned by training). There are 33 gyms total, up to endgame specialists like <strong className="text-torn-green">George&apos;s</strong> (7.3x gains) and <strong className="text-torn-green">Balboas</strong> (7.5x DEF/DEX).
        </p>
      </div>

      {/* Early Advice */}
      <div className="bg-bg-card border border-torn-green/30 rounded-xl p-5 space-y-3">
        <h3 className="text-lg font-semibold text-torn-green">Early Game Advice</h3>
        <p className="text-text-primary">
          <strong>Train all 4 stats equally until you understand the game. Don&apos;t specialize yet.</strong>
        </p>
        <p className="text-text-secondary text-sm">
          Specializing too early locks you into a build that may not fit your playstyle. Once you
          get past the beginner gyms and have some game experience, you&apos;ll be ready
          to decide whether to go offensive (STR/SPD), defensive (DEF/DEX), or balanced.
        </p>
        <p className="text-text-secondary text-sm">
          In the meantime: use your energy, don&apos;t let it cap, and keep upgrading gyms as you
          hit the unlock thresholds.
        </p>
      </div>

      {/* George's milestone callout */}
      <div className="bg-bg-secondary border border-warning/30 rounded-xl p-4 flex gap-3 items-start">
        <span className="text-warning text-xl mt-0.5">★</span>
        <div>
          <p className="font-semibold text-warning">Key Milestone: George&apos;s Gym</p>
          <p className="text-sm text-text-secondary mt-1">
            Reaching <strong className="text-text-primary">George&apos;s</strong> (20 dots) is a big jump in training efficiency.
            At this point, start thinking seriously about specialization, energy sources beyond natural regen,
            and which endgame gym to aim for.
          </p>
        </div>
      </div>

      {/* TL;DR */}
      <div className="bg-bg-secondary border border-text-secondary/30 rounded-xl p-5">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">TL;DR</p>
        <ul className="space-y-2">
          {[
            'Spend energy in the gym to grow your battle stats (STR, DEF, SPD, DEX)',
            'Better gyms unlock as your stats grow — more dots = more gains per energy',
            'Train all 4 stats equally until 250K total, then consider specializing',
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
