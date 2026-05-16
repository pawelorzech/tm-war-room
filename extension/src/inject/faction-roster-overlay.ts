// Faction roster intel overlay.
//
// On /factions.php?step=profile&ID=N we walk every member-row profile link
// and decorate the row with TM Hub intel: OFF-LIMITS flag, target tag,
// stakeout marker, spy coverage chip, and a threat tier tint based on the
// last known battlestats total.
//
// Mechanics shared with bounties-overlay live in lib/row-decorator.ts.

import {
  ApiError,
  fetchFactionSpies,
  fetchOffLimits,
  fetchTargets,
  fetchStakeouts,
  fetchActiveFlights,
} from '../lib/api';
import { getAuth, clearAuth } from '../lib/auth';
import { getFeatureFlags } from '../env';
import { decorateRows } from '../lib/row-decorator';
import type {
  FactionSpyMember,
  ThreatLabel,
  WarOffLimits,
  Target,
  Stakeout,
  FlightRow,
} from '../types';
import { escapeHtml, formatTotal } from '../lib/format';
import { renderFlightPillFromRow } from './flight-pill';

interface FactionRow {
  spy: FactionSpyMember | null;
  off_limits: WarOffLimits | null;
  target: Target | null;
  stakeout: Stakeout | null;
  threat_label: ThreatLabel;
  flight: FlightRow | null;
}

const TIER_COLOR: Record<ThreatLabel, { bg: string; label: string }> = {
  trivial: { bg: 'rgba(63,185,80,0.08)', label: '#3fb950' },
  easy: { bg: 'rgba(63,185,80,0.12)', label: '#3fb950' },
  moderate: { bg: 'rgba(210,153,34,0.10)', label: '#d29922' },
  dangerous: { bg: 'rgba(240,136,62,0.14)', label: '#f0883e' },
  lethal: { bg: 'rgba(248,81,73,0.16)', label: '#f85149' },
  unknown: { bg: 'transparent', label: '#8b949e' },
};

// Aligned with api/threat.py absolute-mode cutoffs by total stats. Bounty
// scoring is relative when the faction is at war; here we don't know the
// caller's stats so we use the absolute scale.
function labelForTotal(total: number | null): ThreatLabel {
  if (total === null || total <= 0) return 'unknown';
  if (total < 1_000_000) return 'trivial';
  if (total < 10_000_000) return 'easy';
  if (total < 100_000_000) return 'moderate';
  if (total < 1_000_000_000) return 'dangerous';
  return 'lethal';
}

const TTL_MS = 60_000;
type Cache<T> = { ts: number; data: T } | null;

const spiesCache = new Map<number, { ts: number; data: Map<number, FactionSpyMember> }>();
const offLimitsCache = new Map<number, { ts: number; data: Map<number, WarOffLimits> }>();
let targetsCache: Cache<Map<number, Target>> = null;
let stakeoutsCache: Cache<Map<number, Stakeout>> = null;

async function getSpies(factionId: number): Promise<Map<number, FactionSpyMember>> {
  const cached = spiesCache.get(factionId);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.data;
  const auth = getAuth();
  if (!auth) return new Map();
  try {
    const resp = await fetchFactionSpies(auth, factionId);
    const map = new Map<number, FactionSpyMember>();
    for (const m of resp.members) map.set(m.player_id, m);
    spiesCache.set(factionId, { ts: Date.now(), data: map });
    return map;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) clearAuth();
    return new Map();
  }
}

async function getOffLimits(warId: number): Promise<Map<number, WarOffLimits>> {
  const cached = offLimitsCache.get(warId);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.data;
  const auth = getAuth();
  if (!auth) return new Map();
  try {
    const resp = await fetchOffLimits(auth, warId);
    const map = new Map<number, WarOffLimits>();
    for (const e of resp.entries) map.set(e.player_id, e);
    offLimitsCache.set(warId, { ts: Date.now(), data: map });
    return map;
  } catch {
    return new Map();
  }
}

async function getTargets(): Promise<Map<number, Target>> {
  if (targetsCache && Date.now() - targetsCache.ts < TTL_MS) return targetsCache.data;
  const auth = getAuth();
  if (!auth) return new Map();
  try {
    const resp = await fetchTargets(auth);
    const map = new Map<number, Target>();
    for (const t of resp.targets) map.set(t.player_id, t);
    targetsCache = { ts: Date.now(), data: map };
    return map;
  } catch {
    return new Map();
  }
}

async function getActiveFlightsMap(): Promise<Map<number, FlightRow>> {
  // Self-gated on the feature flag so the roster overlay doesn't burn a
  // network round-trip when flights are dark. Soft-fails to empty map on
  // any error (fetchActiveFlights already returns an empty list on 503).
  if (!getFeatureFlags().flights) return new Map();
  const auth = getAuth();
  if (!auth) return new Map();
  const resp = await fetchActiveFlights(auth);
  const map = new Map<number, FlightRow>();
  for (const f of resp.flights) map.set(f.player_id, f);
  return map;
}

async function getStakeouts(): Promise<Map<number, Stakeout>> {
  if (stakeoutsCache && Date.now() - stakeoutsCache.ts < TTL_MS) return stakeoutsCache.data;
  const auth = getAuth();
  if (!auth) return new Map();
  try {
    const resp = await fetchStakeouts(auth);
    const map = new Map<number, Stakeout>();
    for (const s of resp.stakeouts) map.set(s.player_id, s);
    stakeoutsCache = { ts: Date.now(), data: map };
    return map;
  } catch {
    return new Map();
  }
}

async function buildMap(
  factionId: number,
  warId: number | null,
): Promise<Map<number, FactionRow>> {
  const [spies, off, targets, stakeouts, flights] = await Promise.all([
    getSpies(factionId),
    warId ? getOffLimits(warId) : Promise.resolve(new Map<number, WarOffLimits>()),
    getTargets(),
    getStakeouts(),
    getActiveFlightsMap(),
  ]);

  // Iterate over spies (= the faction's full member roster as known by TM Hub).
  // Members we have no spy row for still appear in the iteration with a "no spy"
  // pill because the endpoint returns a row for every member.
  const out = new Map<number, FactionRow>();
  for (const [pid, spy] of spies.entries()) {
    out.set(pid, {
      spy,
      off_limits: off.get(pid) ?? null,
      target: targets.get(pid) ?? null,
      stakeout: stakeouts.get(pid) ?? null,
      threat_label: labelForTotal(spy.total > 0 ? spy.total : null),
      flight: flights.get(pid) ?? null,
    });
  }
  return out;
}

const STYLES = `
  [data-tm-faction-roster-badge] {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    padding: 2px 6px;
    margin: 4px 0;
    font-size: 11px;
    font-weight: 600;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    border-radius: 10px;
    background: rgba(22, 27, 34, 0.85);
    border: 1px solid rgba(255,255,255,0.1);
    color: #c9d1d9;
    white-space: nowrap;
  }
  [data-tm-faction-roster-badge] .pill {
    padding: 1px 6px;
    border-radius: 8px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  [data-tm-faction-roster-badge] .pill-offlimits {
    background: rgba(248,81,73,0.22);
    color: #f85149;
  }
  [data-tm-faction-roster-badge] .pill-target {
    background: rgba(139,92,246,0.18);
    color: #a78bfa;
  }
  [data-tm-faction-roster-badge] .pill-stakeout {
    background: rgba(96,165,250,0.18);
    color: #60a5fa;
  }
  [data-tm-faction-roster-badge] .pill-spy-fresh {
    background: rgba(63,185,80,0.16);
    color: #3fb950;
  }
  [data-tm-faction-roster-badge] .pill-spy-stale {
    background: rgba(210,153,34,0.16);
    color: #d29922;
  }
  [data-tm-faction-roster-badge] .pill-no-spy {
    background: rgba(110,118,129,0.16);
    color: #6e7681;
  }
`;



export async function applyFactionRosterOverlay(opts: {
  factionId: number;
  warId: number | null;
}): Promise<void> {
  await decorateRows<FactionRow>({
    featureId: 'faction-roster',
    buildMap: () => buildMap(opts.factionId, opts.warId),
    styles: STYLES,
    stateKey: (d) =>
      [
        d.spy ? d.spy.confidence : 'none',
        d.spy ? (d.spy.age_days ?? '') : '',
        d.spy ? d.spy.total : 0,
        d.off_limits ? d.off_limits.player_id : '',
        d.target ? (d.target.tag ?? d.target.player_id) : '',
        d.stakeout ? d.stakeout.player_id : '',
        d.threat_label,
        d.flight ? `${d.flight.destination}|${d.flight.predicted_landed_at ?? 0}` : '',
      ].join('|'),
    render: ({ row, data, appendBadge }) => {
      const tier = TIER_COLOR[data.threat_label] || TIER_COLOR.unknown;
      if (tier.bg !== 'transparent') {
        row.style.backgroundColor = tier.bg;
        row.style.transition = 'background-color 0.2s ease-out';
      }

      const pills: string[] = [];

      if (data.off_limits) {
        pills.push(`<span class="pill pill-offlimits">🚫 OFF-LIMITS</span>`);
      }

      if (data.target) {
        const tag = data.target.tag ? ` ${escapeHtml(data.target.tag)}` : '';
        pills.push(`<span class="pill pill-target">🎯 target${tag}</span>`);
      }

      if (data.stakeout) {
        pills.push(`<span class="pill pill-stakeout">👁 stakeout</span>`);
      }

      if (data.spy && data.spy.total > 0) {
        const age = data.spy.age_days;
        const ageLabel =
          age === null
            ? 'unknown age'
            : age < 7
              ? `${age}d`
              : age < 30
                ? `${age}d stale`
                : `${age}d old`;
        const spyClass = age === null || age >= 14 ? 'pill-spy-stale' : 'pill-spy-fresh';
        pills.push(
          `<span class="pill ${spyClass}">spy ${escapeHtml(ageLabel)} · ${escapeHtml(formatTotal(data.spy.total))}</span>`,
        );
      } else {
        pills.push(`<span class="pill pill-no-spy">no spy</span>`);
      }

      pills.push(
        `<span class="pill" style="color:${tier.label}">${escapeHtml(data.threat_label)}</span>`,
      );

      const badge = document.createElement('span');
      badge.innerHTML = pills.join('');
      // Append the flight pill after the standard pills so it visually sits
      // at the tail of the roster row. The pill lives in light DOM (no
      // shadow root) — it shares the page's font but has its own styles
      // scoped via [data-tm-flight-pill]. No-op when flags.flights is off.
      if (data.flight) {
        renderFlightPillFromRow(badge, data.flight);
      }
      appendBadge(badge);
    },
  });
}
