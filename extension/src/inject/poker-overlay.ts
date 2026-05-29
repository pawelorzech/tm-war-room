// Poker-table assist. While the player is seated at a poker table, decorate
// each opponent with a quick-attack link + big-stack flag, and toast when a
// seat empties (a player stood up = chips became cash on hand). This is an
// ASSIST, not a money printer: savvy winners self-hospitalize before standing,
// so a "stood up" event does not guarantee a muggable target. No auto-attack.
import { getAuth } from '../lib/auth';

export interface SeatSnapshot { name: string; chips: number; }
export interface StoodUp { playerId: number; name: string; chips: number; bigStack: boolean; }
export interface DecorateOpts { bigStackThreshold: number; selfId: number; }

// CONFIRM against a live poker page; only this block is page-coupled.
const POKER_SELECTORS = {
  seat: '.tm-test-seat, [data-player-id].poker-seat',
  chips: '.chips',
};

const DONE_ATTR = 'data-tm-poker-done';
const STYLE_ID = 'tm-companion-poker-styles';
let lastSnapshot = new Map<number, SeatSnapshot>();

export function _resetPokerStateForTests(): void {
  lastSnapshot = new Map();
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = `
    .tm-poker-attack{margin-left:6px;padding:1px 7px;border-radius:10px;
      background:#f85149;color:#fff;font-size:11px;font-weight:700;
      text-decoration:none;vertical-align:middle;}
    .tm-poker-bigstack{margin-left:4px;font-weight:700;
      filter:drop-shadow(0 0 2px rgba(248,81,73,.7));}
  `;
  document.head.appendChild(el);
}

function attackHref(pid: number): string {
  return `https://www.torn.com/loader.php?sid=attack&user2ID=${pid}`;
}

function seatPlayerId(el: HTMLElement): number | null {
  const v = el.getAttribute('data-player-id');
  if (v) return parseInt(v, 10);
  const a = el.querySelector<HTMLAnchorElement>('a[href*="XID="]');
  const m = a?.getAttribute('href')?.match(/XID=(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function seatChips(el: HTMLElement): number {
  const raw = (el.querySelector(POKER_SELECTORS.chips)?.textContent || '').trim().toLowerCase();
  const m = raw.match(/([\d,.]+)\s*([bmk]?)/);
  if (!m) return 0;
  const num = parseFloat(m[1].replace(/,/g, ''));
  if (!isFinite(num)) return 0;
  const mult = m[2] === 'b' ? 1e9 : m[2] === 'm' ? 1e6 : m[2] === 'k' ? 1e3 : 1;
  return Math.round(num * mult);
}

export function decoratePokerSeats(seats: HTMLElement[], opts: DecorateOpts): void {
  for (const el of seats) {
    if (el.hasAttribute(DONE_ATTR)) continue;
    const pid = seatPlayerId(el);
    if (!pid || pid === opts.selfId) continue;
    el.setAttribute(DONE_ATTR, '1');
    const chips = seatChips(el);
    if (chips >= opts.bigStackThreshold) {
      const flag = document.createElement('span');
      flag.className = 'tm-poker-bigstack';
      flag.textContent = ' 💰';
      flag.title = 'Big stack. If they stand up without medding out, they are a mug target.';
      el.appendChild(flag);
    }
    const link = document.createElement('a');
    link.href = attackHref(pid);
    link.className = 'tm-poker-attack';
    link.textContent = ' hit';
    link.target = '_top';
    el.appendChild(link);
  }
}

export function detectStoodUp(
  prev: Map<number, SeatSnapshot>, now: Map<number, SeatSnapshot>, bigStackThreshold: number,
): StoodUp[] {
  const left: StoodUp[] = [];
  for (const [pid, snap] of prev) {
    if (!now.has(pid)) {
      left.push({ playerId: pid, name: snap.name, chips: snap.chips, bigStack: snap.chips >= bigStackThreshold });
    }
  }
  left.sort((a, b) => b.chips - a.chips);
  return left;
}

function snapshotSeats(seats: HTMLElement[]): Map<number, SeatSnapshot> {
  const m = new Map<number, SeatSnapshot>();
  for (const el of seats) {
    const pid = seatPlayerId(el);
    if (!pid) continue;
    const a = el.querySelector('a[href*="XID="]');
    m.set(pid, { name: a?.textContent || String(pid), chips: seatChips(el) });
  }
  return m;
}

function toast(p: StoodUp): void {
  const note = document.createElement('div');
  note.className = 'tm-poker-toast';
  note.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:99999;background:#161b22;color:#fff;border-left:4px solid #f85149;padding:10px 14px;border-radius:6px;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,.4);max-width:280px;';
  const msg = document.createElement('div');
  msg.textContent = `${p.name} stood up${p.bigStack ? ' with a big stack' : ''}. Mug now (they may have medded out):`;
  const link = document.createElement('a');
  link.href = attackHref(p.playerId);
  link.textContent = 'Attack';
  link.target = '_top';
  link.style.cssText = 'color:#f85149;font-weight:700;display:inline-block;margin-top:6px;';
  note.appendChild(msg);
  note.appendChild(link);
  document.body.appendChild(note);
  setTimeout(() => note.remove(), 15000);
}

export function applyPokerOverlay(opts: { bigStackThreshold?: number } = {}): void {
  const auth = getAuth();
  if (!auth) return;
  ensureStyles();
  const selfId = auth.player_id;
  const bigStackThreshold = opts.bigStackThreshold ?? 1_000_000;
  const seats = Array.from(document.querySelectorAll<HTMLElement>(POKER_SELECTORS.seat));
  decoratePokerSeats(seats, { bigStackThreshold, selfId });
  const now = snapshotSeats(seats);
  if (now.size === 0) {
    lastSnapshot = new Map(); // left the table; don't diff an empty set into a toast storm
    return;
  }
  if (lastSnapshot.size > 0) {
    for (const p of detectStoodUp(lastSnapshot, now, bigStackThreshold)) {
      if (p.playerId !== selfId) toast(p);
    }
  }
  lastSnapshot = now;
}
