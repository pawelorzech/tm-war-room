// Atomic profile-page overlay stack.
//
// Why this exists: refresh() in index.ts kicks off ~7 independent fetches
// (off-limits, FF score, spy intel, claim button, flight, activity, loot)
// and each renderer mounts its host into the profile anchor *after* its
// fetch resolves. Without a pre-mounted parent that holds reserved height,
// every resolve = layout shift. Empirically: CLS 0.61, "worst cluster:
// 7 shifts" on /profile.php.
//
// The stack is a single container mounted synchronously at the top of
// refresh() (no await before it). Renderers ask attachToProfileStack(host)
// first; only if that returns false (anchor not yet in DOM) do they fall
// back to the legacy insertBefore path. Browser sees one reserved-height
// block from t=0 — async mounts inside it produce zero CLS.
//
// STACK_MIN_HEIGHT_PX is the conservative upper bound for the case "all
// overlays rendered + intel card at average size" (~200px). When fewer
// overlays render the trailing space is empty, which is preferable to
// repeated reflows on every refresh().

import { PROFILE_ANCHOR_SELECTORS } from './torn-pages';

const STACK_ATTR = 'data-tm-companion-stack';
const STACK_MIN_HEIGHT_PX = 200;

/** Mount (idempotent) the overlay stack on the current profile page and
 *  return it. Returns null only if no profile anchor is in the DOM yet,
 *  in which case callers should fall back to their legacy insertBefore
 *  logic (single shift cost, recovered next refresh). */
export function ensureProfileStack(): HTMLElement | null {
  const existing = document.querySelector<HTMLElement>(`[${STACK_ATTR}]`);
  if (existing) return existing;

  const stack = document.createElement('div');
  stack.setAttribute(STACK_ATTR, '');
  stack.style.cssText = [
    'display:block',
    'min-height:' + STACK_MIN_HEIGHT_PX + 'px',
    'margin:0',
    'padding:0',
  ].join(';');

  for (const sel of PROFILE_ANCHOR_SELECTORS) {
    const anchor = document.querySelector(sel);
    if (anchor) {
      anchor.insertBefore(stack, anchor.firstChild);
      return stack;
    }
  }
  return null;
}

/** Append a host into the profile-stack if it exists. Returns true when
 *  the host is now placed (either already had a parent, or just got
 *  appended into the stack); false when the caller must fall back to its
 *  own placement logic. */
export function attachToProfileStack(host: HTMLElement): boolean {
  if (host.parentElement) return true;
  const stack = document.querySelector<HTMLElement>(`[${STACK_ATTR}]`);
  if (!stack) return false;
  stack.appendChild(host);
  return true;
}
