'use client';

// Intel Pack explainer — Phase 5 polish of the FFScouter parity wave.
//
// This page is the user-facing entry point for the four flag-gated server
// features (FF score / flights / activity / hit claims) the Phase 1-4 work
// shipped. The framing is "how we compare to FFScouter" rather than parity —
// our spy-estimate advantage is the lede, and the FF fallback is the polite
// admission that we can't always have spy data.

import { useState } from 'react';
import Link from 'next/link';
import { PageExplainer } from '@/components/layout/PageExplainer';

interface FeatureCard {
  id: string;
  title: string;
  icon: string;
  positioning: string;
  whatItDoes: string;
  whereYouSee: string;
  dataSource: string;
  whyYouCare: string;
  ffscouter: string;
  tmhub: string;
}

const FEATURES: FeatureCard[] = [
  {
    id: 'ff-score',
    title: 'Fair-Fight score fallback',
    icon: '⚖️',
    positioning:
      'A calibrated difficulty estimate that fills in when no fresh spy data exists for a target.',
    whatItDoes:
      "We compute an FFScouter-style FF score from the target's level and the dominant stat ratio. The score is clamped to 1.0..5.0 and tagged with which stat to counter (STR / DEF / SPD / DEX).",
    whereYouSee:
      'Companion FF chip on profile pages, attack pages, and faction roster rows. Renders only when no fresh spy estimate exists for that target — the spy chip wins everywhere else.',
    dataSource:
      'TM Hub FF formula (battle stats / level), computed on demand and cached in-memory for 60 seconds.',
    whyYouCare:
      "Before a hit you want a 'should I bring more energy?' signal. Spy estimates remain the gold standard, but for targets nobody has scouted yet the FF fallback beats clicking blind.",
    ffscouter:
      'Renders an FF chip on every Torn profile/attack page, regardless of whether you have spy data.',
    tmhub:
      'Renders an FF chip ONLY when no fresh spy data exists. When TM Hub has a spy estimate the spy chip shows actual stats instead of a formula approximation.',
  },
  {
    id: 'flights',
    title: 'Flight tracker',
    icon: '✈️',
    positioning:
      "Server-side flight detection so you know who's landing when, even after you close the tab.",
    whatItDoes:
      "Polls Torn every 60s for state changes (Travelling / Abroad / Returning). Detects departures and predicts landing time from the observed flight duration — the duration also tells us the ticket class (standard / private / business / WLT / book).",
    whereYouSee:
      'Companion flight pill next to each player on faction roster / profile / attack pages. Frontend airborne section on /travel listing all in-flight faction members.',
    dataSource:
      'TM Hub scheduler tick (60s polling of Torn API v2 personalstats.travel + status fields).',
    whyYouCare:
      'Landing windows are a chase opportunity. A 60s scheduler beats a userscript that only sees the current page — we capture departures the moment they happen, you read them later.',
    ffscouter:
      'Client-side: only sees flights when you have the page open. No history beyond what you can recall.',
    tmhub:
      'Server-side: 60s polling captures every faction departure even when nobody has the tab open. Landing time prediction with ticket-class detection.',
  },
  {
    id: 'activity',
    title: '7x24 activity heatmap',
    icon: '⏰',
    positioning:
      'When is this player actually online? A 14-day UTC heatmap by weekday and hour.',
    whatItDoes:
      "Samples last_action.timestamp every 5 min for all faction members. Outsiders get enrolled organically the first time a faction member opens their profile in TM Hub or the Companion — no opt-in required from the target.",
    whereYouSee:
      'Embedded in /team row details. Companion shows the most-active-window chip on /profile.php pages.',
    dataSource:
      "TM Hub scheduler (5-min sampling), 14-day rolling retention, faction members tracked continuously and outsiders enrolled on demand.",
    whyYouCare:
      "Planning a war hit or a chain assist? Knowing the target's preferred UTC window is the difference between a 30-minute wait and a 10-hour stakeout.",
    ffscouter:
      'No equivalent — FFScouter is a per-page chip, not a tracking service.',
    tmhub:
      'Full 14-day heatmap, faction-wide visibility, organic enrollment of outsiders the faction is scoping.',
  },
  {
    id: 'hit-calling',
    title: 'Hit-call claims',
    icon: '🎯',
    positioning:
      'Reserve a target for 15 minutes so two teammates do not waste energy on the same kill.',
    whatItDoes:
      'POST a claim against a target_id. Claim auto-expires after 15 min, can be manually released at any time, and resolves to status=hit when you mark the fight outcome. Live SSE stream pushes claim events to every connected client.',
    whereYouSee:
      'Companion Claim button on /profile.php, hospital rows, and the attack-end screen. Frontend Active Claims panel on /chain and embedded in war pages.',
    dataSource:
      'TM Hub claims service — SQLite-backed, Redis-fanned-out via pub/sub, 15-min default TTL. Live SSE stream for instant updates; 5s poll fallback when the SSE connection drops.',
    whyYouCare:
      'Double-claiming during a war is the single most expensive coordination failure. A 1-click reserve + auto-expire keeps teammates honest without a chat ping every hit.',
    ffscouter:
      'No equivalent — no coordination layer.',
    tmhub:
      'Faction-wide claim ledger with 15-min TTL, live SSE updates, and an auto-expire so a stale claim never blocks a teammate.',
  },
];

interface FaqEntry {
  question: string;
  answer: React.ReactNode;
}

const FAQ: FaqEntry[] = [
  {
    question: 'Why is my FF score showing only when spy is missing?',
    answer: (
      <>
        Spy estimates are strictly better than the FF formula — they show
        actual battle stats, not a derived approximation. Stacking a fallback
        chip on top of a real spy chip would be redundant noise, so the FF
        chip only renders when no fresh spy estimate exists for that target.
        If you suddenly see an FF chip on a target that used to have a spy
        chip, it means the spy data aged out and you should re-scout.
      </>
    ),
  },
  {
    question: 'How accurate is the flight tracker?',
    answer: (
      <>
        We poll Torn every 60 seconds, so the landing time is accurate to
        within ~60s. Ticket class (standard / private / business / WLT /
        travel book) is detected from the observed flight duration, not from
        a Torn API field — Torn does not expose ticket class directly, so we
        match the time-in-air against the known duration table.
      </>
    ),
  },
  {
    question: 'Who can see my activity heatmap?',
    answer: (
      <>
        Anyone in your faction with access to TM Hub. The heatmap is built
        from public Torn data (last_action.timestamp) — we just sample it
        every 5 minutes and bin into 7x24 UTC slots. Outsiders (non-faction
        players) are tracked organically when a faction member opens their
        profile in TM Hub or the Companion. There is no opt-in flow for
        tracked targets — this is standard scouting practice and the data is
        already public via the Torn API.
      </>
    ),
  },
  {
    question: 'What happens to expired hit claims?',
    answer: (
      <>
        Claims auto-expire 15 minutes after creation. You can manually
        release a claim at any time before that via the Release button. When
        you mark a fight outcome the claim transitions to status=hit; if you
        let it expire the claim simply disappears from the active list. The
        history is retained for post-war reporting but does not block new
        claims on the same target.
      </>
    ),
  },
  {
    question: 'Can I disable individual features?',
    answer: (
      <>
        Not per-user, currently — the four feature flags (ff_score / flights
        / activity / hit_calling) are faction-wide and flipped server-side
        by leadership. If you do not want a feature visible in your
        Companion, you can disable the relevant overlay in the Companion
        settings panel. Per-user opt-out for the server-backed features is
        tracked as future work.
      </>
    ),
  },
  {
    question: 'What is the data source for each feature?',
    answer: (
      <ul className="list-disc pl-5 space-y-1">
        <li>
          <strong>FF score:</strong> TM Hub FF formula, computed on-demand from
          spy estimates + level when available, level-only otherwise.
        </li>
        <li>
          <strong>Flight tracker:</strong> TM Hub scheduler tick polling Torn
          API v2 every 60s.
        </li>
        <li>
          <strong>Activity heatmap:</strong> 5-min sampling of
          last_action.timestamp, 14-day retention.
        </li>
        <li>
          <strong>Hit claims:</strong> TM Hub claims service (SQLite + Redis
          pub/sub), 15-min default TTL.
        </li>
      </ul>
    ),
  },
];

function FeatureSection({ feature, isOpen, onToggle }: {
  feature: FeatureCard;
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
          <span className="text-base">{feature.icon}</span>
          {feature.title}
        </h2>
        <span className="text-text-muted text-xs shrink-0">
          {isOpen ? '▾' : '▸'}
        </span>
      </button>
      {isOpen && (
        <div className="px-4 pb-4 border-t border-border-light pt-3 space-y-3 text-sm text-text-secondary leading-relaxed">
          <p className="text-text-primary italic">{feature.positioning}</p>
          <div>
            <p className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-1">
              What it does
            </p>
            <p>{feature.whatItDoes}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-1">
              Where you see it
            </p>
            <p>{feature.whereYouSee}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-1">
              Data source
            </p>
            <p className="text-torn-blue/90 font-medium">{feature.dataSource}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-1">
              Why you care
            </p>
            <p>{feature.whyYouCare}</p>
          </div>
          <div className="bg-bg-elevated/40 rounded-lg p-3 space-y-2">
            <p className="text-xs uppercase tracking-wider text-text-muted font-semibold">
              How we compare to FFScouter
            </p>
            <div className="grid sm:grid-cols-2 gap-2 text-xs">
              <div className="bg-bg-card border border-border rounded p-2">
                <p className="text-text-muted font-semibold mb-1">FFScouter</p>
                <p className="text-text-secondary">{feature.ffscouter}</p>
              </div>
              <div className="bg-torn-green/5 border border-torn-green/20 rounded p-2">
                <p className="text-torn-green font-semibold mb-1">TM Hub Intel Pack</p>
                <p className="text-text-secondary">{feature.tmhub}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FaqItem({ entry, isOpen, onToggle }: {
  entry: FaqEntry;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="bg-bg-card border border-text-secondary/15 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-bg-elevated/30 transition-colors"
      >
        <span className="text-sm font-semibold text-text-primary">
          {entry.question}
        </span>
        <span className="text-text-muted text-xs shrink-0">
          {isOpen ? '▾' : '▸'}
        </span>
      </button>
      {isOpen && (
        <div className="px-4 pb-4 border-t border-border-light pt-3 text-sm text-text-secondary leading-relaxed">
          {entry.answer}
        </div>
      )}
    </div>
  );
}

export default function IntelPackGuidePage() {
  const [openFeatures, setOpenFeatures] = useState<Set<string>>(
    new Set(['ff-score']),
  );
  const [openFaq, setOpenFaq] = useState<Set<number>>(new Set([0]));

  const toggleFeature = (id: string) =>
    setOpenFeatures((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleFaq = (idx: number) =>
    setOpenFaq((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Hero */}
        <div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">TM Hub Intel Pack</h1>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-torn-blue bg-torn-blue/10 border border-torn-blue/30 rounded px-2 py-0.5">
              flag-gated
            </span>
          </div>
          <p className="text-text-secondary text-sm mt-2 leading-relaxed">
            Server-backed scouting suite that goes beyond what a client-side
            userscript can do. Four features (FF fallback, flight tracker, 7x24
            activity heatmap, hit-call claims) running on the TM Hub backend,
            surfaced through the Companion and the web app.
          </p>
        </div>

        {/* Page explainer */}
        <PageExplainer
          id="guide-intel-pack"
          title="What this is and why we built it"
          bullets={[
            'FFScouter is a popular Torn userscript. It shows fair-fight scores on every profile/attack page. Useful, but it is a client-side overlay — no history, no coordination, no server.',
            'TM Hub Intel Pack covers the same four use cases but server-side. That means flight detection runs while you sleep, activity heatmaps accumulate across days, and hit claims fan out faction-wide via live SSE.',
            'Spy data still wins where we have it. FF fallback only fills in for un-scouted targets. The intent is augmentation, not replacement.',
            'All four features are flag-gated. Leadership flips them on per faction; defaults are off.',
          ]}
          dataSources={['TM Hub backend', 'Torn API v2', 'TornStats (spy data)']}
          links={[
            ['Member Guide', '/guide'],
            ['Companion install', '/install'],
            ['Changelog', '/changelog'],
          ]}
        />

        {/* Features */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-text-primary">Features</h2>
          <div className="space-y-2">
            {FEATURES.map((feature) => (
              <FeatureSection
                key={feature.id}
                feature={feature}
                isOpen={openFeatures.has(feature.id)}
                onToggle={() => toggleFeature(feature.id)}
              />
            ))}
          </div>
        </section>

        {/* Audit comparison table */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-text-primary">
            How we compare to FFScouter at a glance
          </h2>
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
                  <th className="py-2 px-3">Capability</th>
                  <th className="py-2 px-3">FFScouter</th>
                  <th className="py-2 px-3">TM Hub Intel Pack</th>
                </tr>
              </thead>
              <tbody>
                {[
                  [
                    'Battle-stat estimate',
                    'Always on (formula-based)',
                    'Spy data when present; FF fallback when not',
                  ],
                  [
                    'Flight tracking',
                    'Only what is on the open page',
                    '60s server polling, faction-wide history',
                  ],
                  [
                    'Activity heatmap',
                    'None',
                    '14-day 7x24 UTC heatmap, organic enrollment',
                  ],
                  [
                    'Hit-call coordination',
                    'None',
                    'Faction-wide claims with 15-min auto-expire',
                  ],
                  [
                    'Transport for live updates',
                    'N/A (per-page render)',
                    'SSE stream + 5s polling fallback',
                  ],
                ].map(([cap, fs, tm]) => (
                  <tr key={cap} className="border-b border-border-light">
                    <td className="py-2 px-3 text-text-primary font-medium whitespace-nowrap">
                      {cap}
                    </td>
                    <td className="py-2 px-3 text-text-muted text-xs">{fs}</td>
                    <td className="py-2 px-3 text-torn-green/90 text-xs">{tm}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQ */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-text-primary">FAQ</h2>
          <div className="space-y-2">
            {FAQ.map((entry, idx) => (
              <FaqItem
                key={idx}
                entry={entry}
                isOpen={openFaq.has(idx)}
                onToggle={() => toggleFaq(idx)}
              />
            ))}
          </div>
        </section>

        {/* Footer */}
        <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-4 space-y-2">
          <p className="text-sm font-medium text-text-primary">More to read</p>
          <p className="text-xs text-text-secondary">
            See the main <Link href="/guide" className="text-torn-green hover:text-torn-green/80 underline">Member Guide</Link>{' '}
            for Torn game mechanics. Install the{' '}
            <Link href="/install" className="text-torn-green hover:text-torn-green/80 underline">TM Hub Companion</Link>{' '}
            to get the chips/pills/buttons inside torn.com itself.
          </p>
        </div>
      </div>
    </div>
  );
}
