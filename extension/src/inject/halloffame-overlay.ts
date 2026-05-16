// Hall of Fame faction marker.
//
// On /halloffame.php (all tabs) drop a tiny "TM" pill on faction mates and a
// "☠" pill on current war enemies. No row tinting — leaderboards are stat
// showcases, not combat planning. Players we don't recognise stay untouched.
//
// Deliberately tiny: bypasses lib/row-decorator and inlines its own
// XID scanner + idempotency (via a marker class on the badge). Two signals,
// inline styles, no <style> tag. Keeps the userscript bundle under 150 KiB.

import { ApiError, fetchKeys, fetchEnemy } from '../lib/api';
import { getAuth, clearAuth } from '../lib/auth';

const TTL_MS = 60_000;
const MARKER = 'tm-hof-mark';

let kCache: { ts: number; data: Set<number> } | null = null;
let eCache: { ts: number; data: Set<number> } | null = null;

async function getKeys(): Promise<Set<number>> {
  if (kCache && Date.now() - kCache.ts < TTL_MS) return kCache.data;
  const auth = getAuth();
  if (!auth) return new Set();
  try {
    const r = await fetchKeys(auth);
    const s = new Set<number>(r.keys.map((k) => k.player_id));
    kCache = { ts: Date.now(), data: s };
    return s;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) clearAuth();
    return new Set();
  }
}

async function getEnemy(): Promise<Set<number>> {
  if (eCache && Date.now() - eCache.ts < TTL_MS) return eCache.data;
  const auth = getAuth();
  if (!auth) return new Set();
  try {
    const r = await fetchEnemy(auth);
    const s = new Set<number>(r.members.map((m) => m.id));
    eCache = { ts: Date.now(), data: s };
    return s;
  } catch {
    return new Set();
  }
}

const BASE =
  'display:inline-flex;align-items:center;padding:1px 6px;margin-left:4px;font:600 10px/1 -apple-system,BlinkMacSystemFont,sans-serif;border-radius:6px;vertical-align:middle;text-transform:uppercase;letter-spacing:.04em';
const MATE = ';color:#3fb950;background:rgba(63,185,80,.18);border:1px solid rgba(63,185,80,.35)';
const ENEMY = ';color:#f85149;background:rgba(248,81,73,.20);border:1px solid rgba(248,81,73,.35)';

export async function applyHalloffameOverlay(): Promise<void> {
  const [mates, enemies] = await Promise.all([getKeys(), getEnemy()]);
  if (mates.size === 0 && enemies.size === 0) return;

  // Scope to #mainContainer so we don't decorate header/sidebar profile chrome.
  const scope = document.getElementById('mainContainer') ?? document;
  const anchors = scope.querySelectorAll<HTMLAnchorElement>(
    'a[href*="profiles.php?XID="], a[href*="profile.php?XID="]',
  );
  anchors.forEach((a) => {
    // Idempotent: skip anchors whose next sibling is already our badge.
    if (a.nextElementSibling?.classList.contains(MARKER)) return;
    const m = a.href.match(/XID=(\d+)/);
    if (!m) return;
    const pid = parseInt(m[1], 10);
    let style: string;
    let text: string;
    if (mates.has(pid)) {
      // Mate wins over enemy in the rare overlap (faction-switch mid-fetch).
      style = BASE + MATE;
      text = 'TM';
    } else if (enemies.has(pid)) {
      style = BASE + ENEMY;
      text = '☠';
    } else {
      return;
    }
    const badge = document.createElement('span');
    badge.classList.add(MARKER);
    badge.style.cssText = style;
    badge.textContent = text;
    a.insertAdjacentElement('afterend', badge);
  });
}
