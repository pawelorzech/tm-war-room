// Fixed-position Shadow DOM host that survives SPA navigation.
//
// Torn re-renders /mainContainer when you click around but rarely touches
// the body element directly. We pin our host to document.body with fixed
// positioning, so it stays visible across page changes. The host element
// itself is created once per kind and reused — the Shadow Root contents are
// what we re-render.

const HOST_ATTR = 'data-tm-companion';

export interface PersistentHostOptions {
  kind: string;
  /** Inline style for the host element. Caller controls fixed positioning. */
  style?: string;
  /** Z-index for stacking against torn.com chrome. Default 999900. */
  zIndex?: number;
}

export function ensurePersistentHost({
  kind,
  style,
  zIndex = 999900,
}: PersistentHostOptions): { host: HTMLElement; shadow: ShadowRoot } {
  const selector = `[${HOST_ATTR}="${kind}"]`;
  let host = document.querySelector<HTMLElement>(selector);
  if (!host) {
    host = document.createElement('div');
    host.setAttribute(HOST_ATTR, kind);
    host.style.cssText = `all: initial; position: fixed; z-index: ${zIndex}; ${style || ''}`;
  } else if (style) {
    host.style.cssText = `all: initial; position: fixed; z-index: ${zIndex}; ${style}`;
  }
  if (!host.shadowRoot) {
    host.attachShadow({ mode: 'open' });
  }
  if (!host.parentElement) {
    document.body.appendChild(host);
  }
  return { host, shadow: host.shadowRoot! };
}
