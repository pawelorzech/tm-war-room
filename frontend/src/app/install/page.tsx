'use client';

/**
 * TM Hub Companion install landing.
 *
 * Three install paths (userscript, Chrome extension, Torn PDA) with
 * step-by-step instructions. The userscript path is the recommended option
 * in Phase 1 because it works day-one in Tampermonkey, Violentmonkey, and
 * Torn PDA — the Chrome extension is a placeholder until the Web Store
 * review clears.
 */

const USERSCRIPT_URL = 'https://hub.tri.ovh/companion.user.js';
const TAMPERMONKEY_URL = 'https://www.tampermonkey.net/';
const GREASYFORK_URL = '#'; // TODO: set once published to Greasy Fork

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

        <section className="bg-bg-card border border-text-secondary/15 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold">What it does</h2>
          <ul className="space-y-2 text-sm text-text-secondary list-disc list-inside">
            <li>
              <span className="text-text-primary font-semibold">OFF-LIMITS badges</span> on enemy profiles and the attack page during war,
              so you never accidentally break a med-out / dip agreement set by a faction member.
            </li>
            <li>
              Attack confirmation modal when a target is flagged off-limits — gives you a chance to think
              before you click.
            </li>
            <li>More overlays coming in Phase 2 (spy estimates, target tags, bounty ranks, market prices).</li>
          </ul>
        </section>

        <section className="grid md:grid-cols-3 gap-4">
          {/* Userscript path */}
          <div className="bg-bg-card border border-torn-green/40 rounded-xl p-5 space-y-3 relative">
            <span className="absolute -top-2 right-3 bg-torn-green text-bg-primary text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded">
              Recommended
            </span>
            <h3 className="text-base font-bold">Userscript</h3>
            <p className="text-text-secondary text-xs">
              Works in Tampermonkey, Violentmonkey, and Torn PDA. Fastest way to get started.
            </p>
            <ol className="text-xs text-text-secondary space-y-1.5 list-decimal list-inside">
              <li>
                Install{' '}
                <a href={TAMPERMONKEY_URL} target="_blank" rel="noopener noreferrer" className="text-torn-green underline">
                  Tampermonkey
                </a>{' '}
                (Chrome / Firefox / Edge / Safari)
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

          {/* Chrome extension path */}
          <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-5 space-y-3 opacity-70">
            <span className="absolute text-[10px] font-bold uppercase tracking-wide text-text-muted">
              Coming soon
            </span>
            <h3 className="text-base font-bold">Chrome / Edge / Firefox</h3>
            <p className="text-text-secondary text-xs">
              Native browser extension. Same features as the userscript, plus a popup dashboard.
            </p>
            <ol className="text-xs text-text-muted space-y-1.5 list-decimal list-inside">
              <li>Chrome Web Store — pending review</li>
              <li>Firefox Add-ons — pending review</li>
            </ol>
            <p className="text-text-muted text-[10px] mt-2">
              Use the userscript in the meantime — it works the same.
            </p>
          </div>

          {/* PDA path */}
          <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-5 space-y-3">
            <h3 className="text-base font-bold">Torn PDA (mobile)</h3>
            <p className="text-text-secondary text-xs">
              Torn PDA on iOS and Android supports userscripts natively.
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
