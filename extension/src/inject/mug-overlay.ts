// Mug Radar chip: shows a mug-score next to a player's name on profile,
// attack, faction-roster and item-market pages, plus a one-click link to
// Torn's native attack page. Info-only: the player still clicks Mug. Quiet
// for low-value targets so it never adds noise.
import { getAuth, clearAuth } from '../lib/auth';
import { fetchMugScore, ApiError } from '../lib/api';
import type { MugScoreResponse } from '../types';

const STYLE_ID = 'tm-companion-mug-styles';
const CHIP_CLASS = 'tm-mug-chip';
const DONE_ATTR = 'data-tm-mug-done';

// Per-page cache so re-runs (URL watcher bursts) don't refetch the same id.
let cache = new Map<number, MugScoreResponse>();

export function _resetMugCacheForTests(): void {
  cache = new Map();
}

const TIER_COLOR: Record<string, string> = {
  prime: '#f85149',
  good: '#d29922',
  meh: '#8b949e',
  cooldown: '#6e7681',
};

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = `
    .${CHIP_CLASS}{display:inline-flex;align-items:center;gap:4px;margin-left:6px;
      padding:1px 6px;border-radius:10px;font-size:11px;font-weight:600;
      color:#fff;vertical-align:middle;cursor:default;}
    .${CHIP_CLASS} a{color:#fff;text-decoration:underline;font-weight:700;}
    .tm-mug-prime{background:${TIER_COLOR.prime};}
    .tm-mug-good{background:${TIER_COLOR.good};}
    .tm-mug-meh{background:${TIER_COLOR.meh};}
    .tm-mug-cooldown{background:${TIER_COLOR.cooldown};}
  `;
  document.head.appendChild(el);
}

function xidFromHref(href: string): number | null {
  const m = href.match(/XID=(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function attackHref(pid: number): string {
  return `https://www.torn.com/loader.php?sid=attack&user2ID=${pid}`;
}

function tooltip(s: MugScoreResponse): string {
  const b = s.breakdown;
  const cd = b.cooldown_remaining_h ? ` | cooldown ${b.cooldown_remaining_h}h` : '';
  return `Mug ${s.score}/100 (${s.tier}) | win ${b.winnability} money ${b.money} avail ${b.availability} fresh ${b.fresh_cash} poker ${b.poker}${cd}. Estimate from proxies, not exact cash.`;
}

function renderChip(anchor: HTMLElement, s: MugScoreResponse): void {
  const chip = document.createElement('span');
  chip.className = `${CHIP_CLASS} tm-mug-${s.tier === 'skip' ? 'meh' : s.tier}`;
  chip.title = tooltip(s);
  const label = document.createElement('span');
  label.textContent = `MUG ${s.score}`;
  chip.appendChild(label);
  if (s.hittable_now && s.tier !== 'cooldown') {
    const link = document.createElement('a');
    link.href = attackHref(s.player_id);
    link.textContent = 'hit';
    link.target = '_top';
    chip.appendChild(link);
  }
  anchor.insertAdjacentElement('afterend', chip);
}

export async function applyMugOverlay(): Promise<void> {
  const auth = getAuth();
  if (!auth) return;
  ensureStyles();

  const seen = new Set<number>();
  const anchors = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('#mainContainer a[href*="profiles.php?XID="]'),
  ).filter((a) => !a.hasAttribute(DONE_ATTR));

  for (const a of anchors) {
    const pid = xidFromHref(a.getAttribute('href') || '');
    if (!pid) continue;
    a.setAttribute(DONE_ATTR, '1');
    if (pid === auth.player_id) continue; // never chip yourself
    if (seen.has(pid)) continue; // one chip per player per run
    seen.add(pid);
    try {
      let s = cache.get(pid);
      if (!s) {
        s = await fetchMugScore(auth, pid);
        cache.set(pid, s);
      }
      if (s.tier === 'skip') continue;
      renderChip(a, s);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        clearAuth();
      }
      // otherwise degrade silently: never block the Torn page.
    }
  }
}
