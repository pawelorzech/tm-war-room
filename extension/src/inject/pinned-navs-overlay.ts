// TM Hub pinned-navs quick links on torn.com.
//
// Mounts a small floating panel on every Torn page listing the user's TM Hub
// pinned navigation entries (synced from /api/preferences/pinned-navs). Click
// any row → opens that TM Hub page in a new tab. A ✎ button reveals an
// inline picker (checkboxes over the 14 most-pinned TM Hub routes) so users
// can pin/unpin without leaving Torn — the server is the source of truth and
// TM Hub's own sidebar picks up the change on its next poll.
//
// Why floating, not in Torn's left sidebar: live verification of Torn's
// sidebar selector requires a torn.com login that the userscript can't
// perform from a sanity-walk harness. Floating panel ships safely today;
// porting into Torn's chrome can land later once a known-good selector lives
// in lib/torn-pages.ts.

import { ApiError, fetchPinnedNavs, savePinnedNavs } from '../lib/api';
import { getAuth, clearAuth } from '../lib/auth';
import { HUB_ORIGIN } from '../env';
import { escapeHtml } from '../lib/format';

// 14 most-pinned routes — tight subset of the TM Hub frontend nav, chosen
// to keep the picker scroll-free at default zoom and the bundle string
// budget small.
const NAVS: ReadonlyArray<readonly [string, string]> = [
  ['/dashboard', '🏠 Dashboard'],
  ['/team', '👥 Team'],
  ['/chain', '🔗 Chain'],
  ['/wars', '⚔ Wars'],
  ['/oc', '🕴 OC'],
  ['/armoury', '🛡 Armoury'],
  ['/targets', '🎯 Targets'],
  ['/spy', '🔍 Spy'],
  ['/bounties', '💵 Bounties'],
  ['/market', '🛒 Market'],
  ['/stocks', '📉 Stocks'],
  ['/loot', '💰 Loot'],
  ['/training', '💪 Training'],
  ['/awards', '🏆 Awards'],
];

const HOST_ATTR = 'data-tm-pinned-navs';
const TTL_MS = 60_000;
let cache: { ts: number; hrefs: string[] } | null = null;

async function load(): Promise<string[] | null> {
  if (cache && Date.now() - cache.ts < TTL_MS) return cache.hrefs;
  const auth = getAuth();
  if (!auth) return null;
  try {
    const r = await fetchPinnedNavs(auth);
    cache = { ts: Date.now(), hrefs: r.hrefs };
    return r.hrefs;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) clearAuth();
    return null;
  }
}

async function save(hrefs: string[]): Promise<string[] | null> {
  const auth = getAuth();
  if (!auth) return null;
  try {
    const r = await savePinnedNavs(auth, hrefs);
    cache = { ts: Date.now(), hrefs: r.hrefs };
    return r.hrefs;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) clearAuth();
    return null;
  }
}

function label(h: string): string {
  const m = NAVS.find((r) => r[0] === h);
  return m ? m[1] : h;
}

export async function applyPinnedNavsOverlay(): Promise<void> {
  const hrefs = await load();
  if (hrefs === null) return;
  const key = hrefs.join('|');
  const existing = document.querySelector<HTMLElement>(`[${HOST_ATTR}]`);
  if (existing && existing.dataset.tmKey === key) return;
  existing?.remove();
  render(hrefs, key);
}

function render(hrefs: string[], key: string): void {
  const p = document.createElement('div');
  p.setAttribute(HOST_ATTR, '1');
  p.dataset.tmKey = key;
  p.style.cssText =
    'position:fixed;left:8px;top:120px;z-index:999988;background:#161b22;border:1px solid #30363d;border-radius:8px;padding:6px;display:flex;flex-direction:column;gap:2px;font:600 11px -apple-system,BlinkMacSystemFont,sans-serif;color:#c9d1d9;box-shadow:0 4px 12px rgba(0,0,0,.4);min-width:130px;max-width:180px';

  const headHtml =
    '<div style="display:flex;justify-content:space-between;align-items:center;color:#8b949e;font-size:10px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #21262d;padding-bottom:4px;margin-bottom:2px"><span>TM Hub pins</span><button type="button" data-edit style="background:transparent;border:0;color:#8b949e;cursor:pointer;padding:0;font:inherit" title="Edit pins">✎</button></div>';

  const linkStyle =
    'color:#c9d1d9;text-decoration:none;padding:3px 6px;border-radius:4px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
  const links =
    hrefs.length === 0
      ? `<span style="${linkStyle};color:#8b949e">Click ✎ to pin</span>`
      : hrefs
          .map(
            (h) =>
              `<a href="${HUB_ORIGIN}${escapeHtml(h)}" target="_blank" rel="noopener" style="${linkStyle}">${escapeHtml(label(h))}</a>`,
          )
          .join('');

  p.innerHTML = headHtml + links;
  document.body.appendChild(p);

  p.querySelector<HTMLButtonElement>('[data-edit]')?.addEventListener('click', () =>
    togglePicker(p, new Set(hrefs)),
  );
}

function togglePicker(panel: HTMLElement, currentSet: Set<string>): void {
  const existing = panel.querySelector('[data-tm-picker]');
  if (existing) {
    existing.remove();
    return;
  }
  const rowStyle = 'display:flex;align-items:center;gap:6px;padding:2px 4px;cursor:pointer';
  const rows = NAVS.map(
    ([href, lbl]) =>
      `<label style="${rowStyle}"><input type="checkbox" data-h="${escapeHtml(href)}" ${currentSet.has(href) ? 'checked' : ''} style="margin:0;accent-color:#58a6ff"><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(lbl)}</span></label>`,
  ).join('');
  const wrap = document.createElement('div');
  wrap.setAttribute('data-tm-picker', '1');
  wrap.style.cssText =
    'margin-top:6px;padding-top:6px;border-top:1px solid #21262d;display:flex;flex-direction:column;gap:1px;max-height:260px;overflow-y:auto';
  wrap.innerHTML = rows;
  wrap.addEventListener('change', async (e) => {
    const cb = e.target as HTMLInputElement;
    const href = cb.dataset.h;
    if (!href) return;
    if (cb.checked) currentSet.add(href);
    else currentSet.delete(href);
    const next = NAVS.map((r) => r[0]).filter((h) => currentSet.has(h));
    const saved = await save(next);
    if (saved) await applyPinnedNavsOverlay();
  });
  panel.appendChild(wrap);
}
