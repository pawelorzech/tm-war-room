'use client';

import { useEffect, useState } from 'react';

const USERSCRIPT_URL = 'https://hub.tri.ovh/companion.user.js';
// Greasy Fork listing — Tampermonkey trusts GF natively, so installs from this URL
// bypass the Chrome 130+ "Developer Mode required" prompt entirely. GF's
// "Automatic sync" polls hub.tri.ovh/companion.user.js, so every new Companion
// version we ship lands here within an hour without any manual republish.
const GREASYFORK_URL = 'https://greasyfork.org/en/scripts/578482-tm-hub-companion';
const TAMPERMONKEY_URL = 'https://www.tampermonkey.net/';
const TORN_PDA_IOS_URL = 'https://apps.apple.com/app/torn-pda/id1467110341';
const TORN_PDA_ANDROID_URL = 'https://play.google.com/store/apps/details?id=com.manuito.tornpda';

type Env = 'desktop' | 'apple-mobile' | 'android-mobile' | 'unknown';

function detectEnv(): Env {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'apple-mobile';
  // iPad on iPadOS 13+ reports as Macintosh; the touch-end hint disambiguates.
  if (/Macintosh/.test(ua) && 'ontouchend' in document) return 'apple-mobile';
  if (/Android/i.test(ua)) return 'android-mobile';
  return 'desktop';
}

export default function InstallPage() {
  const [env, setEnv] = useState<Env>('unknown');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setEnv(detectEnv());
  }, []);

  const isMobile = env === 'apple-mobile' || env === 'android-mobile';
  const showDesktop = !isMobile;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(USERSCRIPT_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // older browser without clipboard API — user can still copy from the visible code block
    }
  };

  const pdaStoreUrl = env === 'android-mobile' ? TORN_PDA_ANDROID_URL : TORN_PDA_IOS_URL;

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <header className="text-center space-y-2">
          <h1 className="text-3xl font-bold">TM Hub Companion</h1>
          <p className="text-text-secondary">
            Your faction intel injected directly into torn.com pages.
          </p>
          {isMobile && (
            <p className="text-text-muted text-xs">
              You're on {env === 'apple-mobile' ? 'iPhone / iPad' : 'Android'} — showing the mobile install path. Open this page on desktop for Chrome / Firefox instructions.
            </p>
          )}
        </header>

        <section className="space-y-4">
          {showDesktop && GREASYFORK_URL && (
            <div className="bg-bg-card border-2 border-torn-green rounded-xl p-5 space-y-3 relative">
              <span className="absolute -top-2 right-3 bg-torn-green text-bg-primary text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded">
                Recommended · Desktop
              </span>
              <h3 className="text-base font-bold">1-click install via Greasy Fork</h3>
              <p className="text-text-secondary text-xs">
                Works around Chrome's MV3 restrictions — no "developer mode" toggle, no manual paste. Tampermonkey trusts Greasy Fork natively.
              </p>
              <ol className="text-xs text-text-secondary space-y-1.5 list-decimal list-inside">
                <li>
                  Install <a href={TAMPERMONKEY_URL} target="_blank" rel="noopener noreferrer" className="text-torn-green underline">Tampermonkey</a> (Chrome, Firefox, Edge)
                </li>
                <li>
                  Open <a href={GREASYFORK_URL} target="_blank" rel="noopener noreferrer" className="text-torn-green underline">TM Hub Companion on Greasy Fork</a> → click the green <span className="text-text-primary">Install</span> button → Tampermonkey opens an install prompt
                </li>
                <li>
                  Open <a href="/extension-auth" className="text-torn-green underline">/extension-auth</a> in this browser to authorize
                </li>
                <li>Reload torn.com — done.</li>
              </ol>
              <a
                href={GREASYFORK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center bg-torn-green text-bg-primary font-bold text-sm px-4 py-2 rounded-md hover:opacity-90 transition"
              >
                Open Greasy Fork →
              </a>
              <p className="text-text-muted text-[10px]">Updates automatically every 24h.</p>
            </div>
          )}

          <div className={isMobile ? 'grid grid-cols-1 gap-4' : 'grid md:grid-cols-2 gap-4'}>
            {showDesktop && (
              <div className="bg-bg-card border border-torn-green/40 rounded-xl p-5 space-y-3 relative">
                <span className="absolute -top-2 right-3 bg-torn-green/80 text-bg-primary text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded">
                  {GREASYFORK_URL ? 'Alternative · Desktop' : 'Desktop'}
                </span>
                <h3 className="text-base font-bold">Tampermonkey (direct)</h3>
                <p className="text-text-secondary text-xs">
                  Works in Chrome, Firefox, Edge. If the 1-click link below shows "cannot install scripts from this website", use the manual fallback underneath.
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
                    Try{' '}
                    <a href={USERSCRIPT_URL} className="text-torn-green underline">
                      install TM Hub Companion
                    </a>
                    {' '}— Tampermonkey should offer to install
                  </li>
                  <li>Open <a href="/extension-auth" className="text-torn-green underline">/extension-auth</a> to authorize</li>
                  <li>Reload torn.com — done.</li>
                </ol>

                <details className="text-[11px] text-text-secondary border-t border-text-secondary/15 pt-3">
                  <summary className="cursor-pointer text-text-primary font-semibold">
                    Got "cannot install scripts from this website"? Manual install (always works)
                  </summary>
                  <div className="mt-2 space-y-2 pl-1">
                    <p>
                      Chrome 130+ blocks direct userscript installs unless <span className="text-text-primary">Developer Mode</span> is on at{' '}
                      <code className="bg-bg-primary px-1 rounded">chrome://extensions/</code>. Two fixes — pick one:
                    </p>
                    <p className="text-text-primary font-semibold">Option A — enable Developer Mode</p>
                    <ol className="space-y-1 list-decimal list-inside pl-2">
                      <li>Open <code className="bg-bg-primary px-1 rounded">chrome://extensions/</code></li>
                      <li>Toggle <span className="text-text-primary">Developer mode</span> ON (top-right)</li>
                      <li>Click the install link above again — Tampermonkey will accept it</li>
                    </ol>
                    <p className="text-text-primary font-semibold">Option B — paste the URL into Tampermonkey directly</p>
                    <ol className="space-y-1 list-decimal list-inside pl-2">
                      <li>Click the Tampermonkey icon → <span className="text-text-primary">Dashboard</span></li>
                      <li>Go to <span className="text-text-primary">Utilities</span> tab</li>
                      <li>Under <span className="text-text-primary">Install from URL</span>, paste the URL below and click Install</li>
                    </ol>
                    <div className="flex items-stretch gap-2 mt-2">
                      <code className="flex-1 bg-bg-primary border border-border rounded-md px-2 py-1.5 text-[10px] font-mono break-all flex items-center">
                        {USERSCRIPT_URL}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="bg-torn-green/20 hover:bg-torn-green/30 border border-torn-green/40 text-torn-green text-[11px] font-semibold px-3 rounded-md transition shrink-0"
                      >
                        {copied ? 'Copied!' : 'Copy URL'}
                      </button>
                    </div>
                  </div>
                </details>

                <p className="text-text-muted text-[10px]">
                  Updates automatically every 24h.
                </p>
              </div>
            )}

            <div className="bg-bg-card border border-torn-green/40 rounded-xl p-5 space-y-3 relative">
              <span className="absolute -top-2 right-3 bg-torn-green/80 text-bg-primary text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded">
                {isMobile ? 'Recommended · Mobile' : 'Mobile'}
              </span>
              <h3 className="text-base font-bold">Torn PDA</h3>
              <p className="text-text-secondary text-xs">
                The only working path on iOS — and the easiest on Android. PDA runs userscripts natively, no Tampermonkey required.
              </p>
              <p className="text-text-muted text-[11px] leading-relaxed">
                <span className="text-text-secondary font-semibold">Before you start:</span> in PDA, open{' '}
                <a href="https://www.torn.com/preferences.php#tab=api" target="_blank" rel="noopener noreferrer" className="text-torn-green underline">
                  Torn → Preferences → API Keys
                </a>{' '}
                and create a <span className="text-text-secondary">Full Access</span> key. Long-press → Copy.
              </p>
              <ol className="text-xs text-text-secondary space-y-1.5 list-decimal list-inside">
                <li>
                  Install{' '}
                  <a href={pdaStoreUrl} target="_blank" rel="noopener noreferrer" className="text-torn-green underline">
                    Torn PDA
                  </a>{' '}
                  ({env === 'android-mobile' ? 'Play Store' : env === 'apple-mobile' ? 'App Store' : 'App Store / Play Store'})
                </li>
                <li>Open PDA → More → Userscripts → tap <span className="text-text-primary">+ Add</span></li>
                <li>Paste the URL below into the script source field:</li>
              </ol>
              <div className="flex items-stretch gap-2">
                <code className="flex-1 bg-bg-primary border border-border rounded-md px-2 py-1.5 text-[10px] font-mono break-all flex items-center">
                  {USERSCRIPT_URL}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="bg-torn-green/20 hover:bg-torn-green/30 border border-torn-green/40 text-torn-green text-[11px] font-semibold px-3 rounded-md transition shrink-0"
                >
                  {copied ? 'Copied!' : 'Copy URL'}
                </button>
              </div>
              <ol start={4} className="text-xs text-text-secondary space-y-1.5 list-decimal list-inside">
                <li>Tap Save → enable the script</li>
                <li>Open <a href="/extension-auth" className="text-torn-green underline">/extension-auth</a> in PDA's browser to authorize</li>
              </ol>
            </div>
          </div>
        </section>

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
              <li className="flex gap-2"><span className="text-torn-green">✓</span><span><span className="text-text-primary font-semibold">Submit-spy chip on attack pages</span> — after a fight where the opponent's STR/DEF/SPD/DEX showed up in the outcome, one click ships the stats to TM Hub so the rest of the faction sees them</span></li>
              <li className="flex gap-2"><span className="text-torn-green">✓</span><span><span className="text-text-primary font-semibold">TM Hub pin shortcuts on Torn</span> — floating quick-links panel for your TM Hub pinned routes, with an inline picker over 14 popular pages; pins sync with TM Hub's /preferences/pinned-navs</span></li>
              <li className="flex gap-2"><span className="text-torn-green">✓</span><span><span className="text-text-primary font-semibold">Edit saved targets in place</span> — when a target is already on your list, the profile card shows Edit + Remove side-by-side; Edit re-opens the modal pre-filled with the current tag, difficulty, and notes</span></li>
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

        <section className="bg-bg-card border border-text-secondary/15 rounded-xl p-6 space-y-3">
          <h2 className="text-lg font-semibold">Troubleshooting</h2>
          <ul className="text-sm text-text-secondary space-y-2 list-disc list-inside">
            <li>
              <span className="text-text-primary">"Tampermonkey cannot install scripts from this website"</span> — Chrome 130+ requires
              Developer Mode at <code className="bg-bg-primary px-1 rounded">chrome://extensions/</code>. Either toggle it on, or open the
              <span className="text-text-primary"> Tampermonkey Dashboard → Utilities → Install from URL</span> and paste{' '}
              <code className="bg-bg-primary px-1 rounded break-all">{USERSCRIPT_URL}</code>. Detailed steps are in the install card above.
            </li>
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

        <section className="bg-bg-card border border-text-secondary/15 rounded-xl p-6 space-y-3">
          <h2 className="text-lg font-semibold">Telemetry</h2>
          <p className="text-sm text-text-secondary">
            The Companion sends anonymous performance signals to{' '}
            <span className="text-text-primary">hub.tri.ovh</span> so we can spot regressions without
            asking everyone for bug reports. Zero PII. The exact field list is enumerated and signed off in{' '}
            <a
              href="https://github.com/Bombel/tm-war-room/blob/master/extension/docs/rum-privacy-review.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-torn-green underline"
            >
              the privacy review document
            </a>
            .
          </p>
          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            <div className="bg-bg-primary/40 border border-text-secondary/10 rounded-lg p-3 space-y-1">
              <p className="text-text-primary font-medium">What's sent</p>
              <ul className="text-text-secondary space-y-1 list-disc list-inside">
                <li>Time-to-first-overlay, blocking time, paint timings</li>
                <li>Polls per minute (visible vs hidden tab)</li>
                <li>Long-task counts and error counts (no messages)</li>
                <li>Page kind: <code>profile</code>, <code>attack</code>, etc.</li>
                <li>Companion version</li>
              </ul>
            </div>
            <div className="bg-bg-primary/40 border border-text-secondary/10 rounded-lg p-3 space-y-1">
              <p className="text-text-primary font-medium">What's never sent</p>
              <ul className="text-text-secondary space-y-1 list-disc list-inside">
                <li>Your player ID, faction ID, or names</li>
                <li>Full URLs, search params, referrer</li>
                <li>User-agent, IP, cookies</li>
                <li>Message content from chat / forums / mail</li>
                <li>Error stacks, file paths, line numbers</li>
              </ul>
            </div>
          </div>
          <p className="text-text-muted text-[11px] pt-2">
            Opt-out is coming as a toggle in the status chip Settings sheet. Until then, the beacon is gated by a
            backend kill switch and is dark by default — the privacy doc above explains the rollout plan.
          </p>
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
