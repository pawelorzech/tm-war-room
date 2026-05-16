'use client';

/**
 * TM Hub Companion install landing.
 *
 * Two install paths: Tampermonkey (desktop) and Torn PDA (mobile). Both run
 * the same userscript hosted at /companion.user.js. A native MV3 browser
 * extension is not currently on the roadmap — the userscript covers Chrome,
 * Firefox, Edge, and Safari through Tampermonkey.
 */

const USERSCRIPT_URL = 'https://hub.tri.ovh/companion.user.js';
const TAMPERMONKEY_URL = 'https://www.tampermonkey.net/';

export default function InstallPage() {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <header className="text-center space-y-2">
          <h1 className="text-3xl font-bold">TM Hub Companion</h1>
          <p className="text-text-secondary">
            Your faction intel injected directly into torn.com pages.
          </p>
        </header>

        <section className="grid md:grid-cols-2 gap-4">
          {/* Shipped features */}
          <div className="bg-bg-card border border-torn-green/30 rounded-xl p-6 space-y-3">
            <div className="flex items-center gap-2">
              <span className="bg-torn-green/20 text-torn-green text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded">Live</span>
              <h2 className="text-lg font-semibold">What works today</h2>
            </div>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li className="flex gap-2"><span className="text-torn-green">✓</span><span><span className="text-text-primary font-semibold">OFF-LIMITS badges</span> on enemy profile + attack page during war (med-out / dip tracker)</span></li>
              <li className="flex gap-2"><span className="text-torn-green">✓</span><span><span className="text-text-primary font-semibold">Attack confirmation modal</span> when a target is flagged off-limits</span></li>
              <li className="flex gap-2"><span className="text-torn-green">✓</span><span><span className="text-text-primary font-semibold">Notification toasts</span> for TM Hub inbox items, surfaced on torn.com</span></li>
              <li className="flex gap-2"><span className="text-torn-green">✓</span><span><span className="text-text-primary font-semibold">@Mention alerts</span> from TM Hub chat, with native browser notifications when the tab is hidden</span></li>
              <li className="flex gap-2"><span className="text-torn-green">✓</span><span><span className="text-text-primary font-semibold">Presence heartbeat</span> — show as online on /team while you have torn.com open</span></li>
              <li className="flex gap-2"><span className="text-torn-green">✓</span><span><span className="text-text-primary font-semibold">Status chip + settings</span> bottom-right, with mute timers and disconnect</span></li>
              <li className="flex gap-2"><span className="text-torn-green">✓</span><span><span className="text-text-primary font-semibold">Persistent chat dock</span> — read + reply to TM Hub chat without leaving torn.com</span></li>
              <li className="flex gap-2"><span className="text-torn-green">✓</span><span><span className="text-text-primary font-semibold">TM Hub intel card</span> on profile + attack pages — spy estimates, your target tags, faction stakeout flags</span></li>
              <li className="flex gap-2"><span className="text-torn-green">✓</span><span><span className="text-text-primary font-semibold">Inline write-back actions</span> — flag off-limits, save target with tag/difficulty/notes, watch/unwatch stakeout — all from the torn.com profile</span></li>
              <li className="flex gap-2"><span className="text-torn-green">✓</span><span><span className="text-text-primary font-semibold">Bounties threat coloring</span> on /bounties.php — rows tinted + TM threat badge with score and source</span></li>
              <li className="flex gap-2"><span className="text-torn-green">✓</span><span><span className="text-text-primary font-semibold">Loot NPC overlay</span> on Duke / Leslie / Jimmy / Bruno / Easter Bunny — current level, countdown grid, faction reservations, reserve inline</span></li>
              <li className="flex gap-2"><span className="text-torn-green">✓</span><span><span className="text-text-primary font-semibold">Stocks portfolio + ROI overlay</span> on the stock market page — total value, P/L %, ready-to-collect benefits, top 3 marginal-ROI moves with cost + payback days</span></li>
              <li className="flex gap-2"><span className="text-torn-green">✓</span><span><span className="text-text-primary font-semibold">Faction roster intel overlay</span> on enemy faction profiles — every member row tinted by threat tier with OFF-LIMITS, target tag, stakeout, and spy-age pills</span></li>
              <li className="flex gap-2"><span className="text-torn-green">✓</span><span><span className="text-text-primary font-semibold">Hospital list intel</span> on /hospitalview.php — TM mate (green) / war enemy (red) / OFF-LIMITS / target pills inline on each row</span></li>
              <li className="flex gap-2"><span className="text-torn-green">✓</span><span><span className="text-text-primary font-semibold">Armoury competition card</span> on /factions.php?step=armoury — active competitions with top-5 leaderboard, your rank highlighted, time remaining</span></li>
              <li className="flex gap-2"><span className="text-torn-green">✓</span><span><span className="text-text-primary font-semibold">Retal queue intel</span> on /factions.php?step=retals — OFF-LIMITS, target tag, and spy total pills on attackers we know</span></li>
              <li className="flex gap-2"><span className="text-torn-green">✓</span><span><span className="text-text-primary font-semibold">Travel arbitrage card</span> on /travelagency.php — top-3 destinations by best item profit, with abroad cost / sell value / travel time</span></li>
              <li className="flex gap-2"><span className="text-torn-green">✓</span><span><span className="text-text-primary font-semibold">Ambient pills wherever player names appear</span> — /messages, /forums, /friendlist, /searchresults all get inline OFF-LIMITS / target / stakeout / spy total pills next to known players</span></li>
              <li className="flex gap-2"><span className="text-torn-green">✓</span><span><span className="text-text-primary font-semibold">Item market fair-price pills</span> on /imarket.php — every listing gets a green/red pill showing whether the asking price is below, at, or above TM Hub's fair value, with the % delta</span></li>
              <li className="flex gap-2"><span className="text-torn-green">✓</span><span><span className="text-text-primary font-semibold">OC 2.0 readiness card</span> on /factions.php?step=crimes — planning + executing OCs with slot fill, average CPR, ready-at countdown, and a pill telling you whether you're already booked</span></li>
              <li className="flex gap-2"><span className="text-torn-green">✓</span><span><span className="text-text-primary font-semibold">Jail list intel</span> on /jailview.php — TM mate (green) / war enemy (red) / OFF-LIMITS / target pills inline on each row, same signals as the hospital list</span></li>
              <li className="flex gap-2"><span className="text-torn-green">✓</span><span><span className="text-text-primary font-semibold">Hall of Fame marker</span> on /halloffame.php — small TM pill on faction mates and ☠ pill on current war enemies across all leaderboard tabs, no row tinting</span></li>
              <li className="flex gap-2"><span className="text-torn-green">✓</span><span><span className="text-text-primary font-semibold">Mark-all-read footer</span> in the notification toast tray — clear every TM Hub inbox toast in one click; button auto-hides when the tray is empty</span></li>
            </ul>
          </div>

          {/* Roadmap */}
          <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-6 space-y-3">
            <div className="flex items-center gap-2">
              <span className="bg-text-secondary/15 text-text-secondary text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded">Next</span>
              <h2 className="text-lg font-semibold">Coming up</h2>
            </div>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li className="flex gap-2"><span className="text-text-muted">○</span><span>Tell Bombel what you'd like to see next.</span></li>
            </ul>
            <p className="text-text-muted text-[11px] pt-2">
              Suggestions? Ping <span className="text-text-secondary">@Bombel</span> in #general or the GitHub issues.
            </p>
          </div>
        </section>

        <section className="grid md:grid-cols-2 gap-4">
          {/* Userscript path (desktop) */}
          <div className="bg-bg-card border border-torn-green/40 rounded-xl p-5 space-y-3 relative">
            <span className="absolute -top-2 right-3 bg-torn-green text-bg-primary text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded">
              Desktop
            </span>
            <h3 className="text-base font-bold">Tampermonkey</h3>
            <p className="text-text-secondary text-xs">
              Works in Chrome, Firefox, Edge, and Safari. Fastest way to get started.
            </p>
            <p className="text-text-muted text-[11px] leading-relaxed">
              <span className="text-text-secondary font-semibold">Before you start:</span> open{' '}
              <a href="https://www.torn.com/preferences.php#tab=api" target="_blank" rel="noopener noreferrer" className="text-torn-green underline">
                Torn → Preferences → API Keys
              </a>{' '}
              and create a <span className="text-text-secondary">Full Access</span> key — TM Hub will ask for it on first connect.
            </p>
            <ol className="text-xs text-text-secondary space-y-1.5 list-decimal list-inside">
              <li>
                Install{' '}
                <a href={TAMPERMONKEY_URL} target="_blank" rel="noopener noreferrer" className="text-torn-green underline">
                  Tampermonkey
                </a>
              </li>
              <li>
                Click{' '}
                <a href={USERSCRIPT_URL} className="text-torn-green underline">
                  install TM Hub Companion
                </a>{' '}
                — Tampermonkey will offer to install
              </li>
              <li>Open <a href="/extension-auth" className="text-torn-green underline">/extension-auth</a> to authorize the script</li>
              <li>Reload torn.com — done.</li>
            </ol>
            <p className="text-text-muted text-[10px] mt-2">
              Updates automatically every 24h.
            </p>
          </div>

          {/* PDA path (mobile) */}
          <div className="bg-bg-card border border-torn-green/40 rounded-xl p-5 space-y-3 relative">
            <span className="absolute -top-2 right-3 bg-torn-green text-bg-primary text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded">
              Mobile
            </span>
            <h3 className="text-base font-bold">Torn PDA</h3>
            <p className="text-text-secondary text-xs">
              Torn PDA on iOS and Android supports userscripts natively.
            </p>
            <p className="text-text-muted text-[11px] leading-relaxed">
              <span className="text-text-secondary font-semibold">Before you start:</span> in PDA, open{' '}
              <a href="https://www.torn.com/preferences.php#tab=api" target="_blank" rel="noopener noreferrer" className="text-torn-green underline">
                Torn → Preferences → API Keys
              </a>{' '}
              and create a <span className="text-text-secondary">Full Access</span> key. Long-press the key → Copy. TM Hub will ask for it on first connect.
            </p>
            <ol className="text-xs text-text-secondary space-y-1.5 list-decimal list-inside">
              <li>Open Torn PDA → More → Userscripts</li>
              <li>
                Tap <span className="text-text-primary">+ Add</span> and paste:
              </li>
            </ol>
            <code className="block bg-bg-primary border border-border rounded-md p-2 text-[10px] font-mono break-all">
              {USERSCRIPT_URL}
            </code>
            <ol start={3} className="text-xs text-text-secondary space-y-1.5 list-decimal list-inside">
              <li>Tap Save → enable the script</li>
              <li>Open <a href="/extension-auth" className="text-torn-green underline">/extension-auth</a> in PDA's browser to authorize</li>
            </ol>
          </div>
        </section>

        <section className="bg-bg-card border border-text-secondary/15 rounded-xl p-6 space-y-3">
          <h2 className="text-lg font-semibold">Troubleshooting</h2>
          <ul className="text-sm text-text-secondary space-y-2 list-disc list-inside">
            <li>
              <span className="text-text-primary">Badge does not appear on enemy profile</span> — make sure you are logged into TM Hub
              and re-run <a href="/extension-auth" className="text-torn-green underline">/extension-auth</a> to refresh the token.
            </li>
            <li>
              <span className="text-text-primary">Token expired</span> — tokens are valid for 90 days.
              Re-open <a href="/extension-auth" className="text-torn-green underline">/extension-auth</a> to mint a fresh one.
            </li>
            <li>
              <span className="text-text-primary">No off-limits flags showing</span> — the badges only show during an active war.
              If you are in war and still nothing, check <a href="/war" className="text-torn-green underline">/war</a> in TM Hub to verify war_id detection.
            </li>
            <li>
              <span className="text-text-primary">Popup blocked when clicking Connect</span> — allow popups from www.torn.com in your
              browser settings, then click the banner again.
            </li>
          </ul>
        </section>

        <footer className="text-text-muted text-xs text-center pt-4 border-t border-text-secondary/15">
          <p>
            TM Hub Companion is open source and runs locally in your browser.
            It only talks to <span className="text-text-secondary">hub.tri.ovh</span> — never sends data to third parties.
          </p>
        </footer>
      </div>
    </div>
  );
}
