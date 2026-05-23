// Reusable row-decoration helper for Torn list pages.
//
// Walks every profile XID anchor on the page, looks the player up in a
// fetcher-provided map, then lets a `render` callback paint the row +
// drop a badge after the anchor. Plumbing (style tag idempotency, row
// container detection, per-row stateKey idempotency, badge cleanup) is
// centralised so each new overlay just supplies the data + paint logic.
//
// First user: bounties-overlay on /bounties.php. Reused on faction roster,
// hospital list, retal queue, jail list, etc.

const DEFAULT_ANCHOR_SELECTOR =
  'a[href*="profiles.php?XID="], a[href*="profile.php?XID="]';
const ROW_CLASS_PATTERN =
  /bounty|user-info-list|user-row|listed-row|members-list|honor-list|hospital|jail|retal/i;
const ROW_WALK_DEPTH = 6;

export interface DecoratorRenderContext<T> {
  anchor: HTMLAnchorElement;
  row: HTMLElement;
  data: T;
  badgeAttr: string;
  /** Removes any prior `[badgeAttr]` element from this row, then inserts the
   *  fresh badge after the anchor. Use this once per row. */
  appendBadge: (badge: HTMLElement) => void;
}

export interface RowDecoratorConfig<T> {
  /** Unique per-feature id. Drives the `<style>` tag id (`tm-companion-${id}-styles`)
   *  and the per-row attributes (`data-tm-${id}-styled`, `data-tm-${id}-badge`). */
  featureId: string;

  /** Fetch (or cache) the player → data map. Implementation owns its own TTL
   *  caching. Returning an empty map skips decoration this tick. */
  buildMap: () => Promise<Map<number, T>>;

  /** CSS appended once to <head>. Scope every selector to
   *  `[data-tm-${featureId}-badge]` so multiple overlays can coexist. */
  styles?: string;

  /** Returns a string that identifies the current state of this player's data.
   *  If the helper already decorated the row with the same string, the row is
   *  skipped — no DOM churn on every poll. Default: always re-decorate. */
  stateKey?: (data: T) => string;

  /** Override the profile anchor selector. Default matches XID= links. */
  anchorSelector?: string;

  /** Paint one row. Helper handles idempotency, row finding, anchor walking. */
  render: (ctx: DecoratorRenderContext<T>) => void;
}

// Returns the list-row container the anchor lives in, or null if there isn't
// one within ROW_WALK_DEPTH. Returning null on a miss (instead of falling back
// to anchor.parentElement) is what prevents badges from leaking into Torn's
// left-side "Information" sidebar widget on hospital/jail views: that widget
// holds an XID anchor to the viewer's own profile but is not wrapped in any
// LI/TR or list-class container, so we'd previously decorate it.
function findRowContainer(anchor: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = anchor;
  for (let i = 0; el && i < ROW_WALK_DEPTH; i += 1) {
    if (el.tagName === 'LI' || el.tagName === 'TR') return el;
    const cls = typeof el.className === 'string' ? el.className : '';
    if (cls && ROW_CLASS_PATTERN.test(cls)) return el;
    el = el.parentElement;
  }
  return null;
}

function ensureStyles(featureId: string, css: string): void {
  const id = `tm-companion-${featureId}-styles`;
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}

export async function decorateRows<T>(cfg: RowDecoratorConfig<T>): Promise<void> {
  const map = await cfg.buildMap();
  if (map.size === 0) return;

  if (cfg.styles) ensureStyles(cfg.featureId, cfg.styles);

  const styleAttr = `data-tm-${cfg.featureId}-styled`;
  const badgeAttr = `data-tm-${cfg.featureId}-badge`;
  const anchorSelector = cfg.anchorSelector ?? DEFAULT_ANCHOR_SELECTOR;

  // Scope to #mainContainer so we don't decorate profile links in the sidebar
  // user-info widget, the header bar, or other persistent chrome — those
  // anchors point at the viewer's own profile and would always match
  // "TM mate" / target / spy data, painting the chrome on every page.
  const scope = document.getElementById('mainContainer') ?? document;
  const anchors = scope.querySelectorAll<HTMLAnchorElement>(anchorSelector);
  anchors.forEach((anchor) => {
    const m = anchor.href.match(/XID=(\d+)/);
    if (!m) return;
    const pid = parseInt(m[1], 10);
    const data = map.get(pid);
    if (data === undefined) return;

    const row = findRowContainer(anchor);
    if (!row) return;

    const stateValue = cfg.stateKey ? cfg.stateKey(data) : '';
    if (row.getAttribute(styleAttr) === stateValue) return;
    row.setAttribute(styleAttr, stateValue);

    const appendBadge = (badge: HTMLElement): void => {
      row.querySelectorAll(`[${badgeAttr}]`).forEach((b) => b.remove());
      badge.setAttribute(badgeAttr, '1');
      anchor.insertAdjacentElement('afterend', badge);
    };

    cfg.render({ anchor, row, data, badgeAttr, appendBadge });
  });
}
