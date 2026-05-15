// Shadow DOM helpers — isolate our injected UI from Torn's CSS.
//
// Single host element per kind (badge, modal). Re-creating the host on each
// inject would lose Shadow Root state; we look up an existing host and reuse
// it, replacing only the shadow tree contents.

const HOST_ATTR = 'data-tm-companion';

export function ensureHost(kind: string): { host: HTMLElement; shadow: ShadowRoot } {
  const selector = `[${HOST_ATTR}="${kind}"]`;
  let host = document.querySelector<HTMLElement>(selector);
  if (!host) {
    host = document.createElement('div');
    host.setAttribute(HOST_ATTR, kind);
    host.style.all = 'initial'; // defeat Torn's reset rules
    host.style.position = 'static';
  }
  if (!host.shadowRoot) {
    host.attachShadow({ mode: 'open' });
  }
  return { host, shadow: host.shadowRoot! };
}

const BASE_STYLES = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .card {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 12px 14px;
    margin: 8px 0;
    border-radius: 8px;
    background: #161b22;
    border: 1px solid #f85149;
    color: #c9d1d9;
    font-size: 13px;
    line-height: 1.4;
  }
  .card.warn { border-color: #d29922; }
  .icon { font-size: 18px; line-height: 1; }
  .title { font-weight: 700; color: #f85149; }
  .title.warn { color: #d29922; }
  .reason { color: #8b949e; font-style: italic; margin-top: 2px; }
  .meta { color: #6e7681; font-size: 11px; margin-top: 4px; }
  .modal-backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.75);
    z-index: 999999;
    display: flex; align-items: center; justify-content: center;
  }
  .modal {
    background: #161b22;
    border: 1px solid #f85149;
    border-radius: 12px;
    max-width: 480px;
    width: calc(100% - 32px);
    padding: 24px;
    color: #c9d1d9;
    box-shadow: 0 12px 48px rgba(0,0,0,0.6);
  }
  .modal h2 { margin: 0 0 8px; color: #f85149; font-size: 18px; }
  .modal p { margin: 8px 0; }
  .modal .buttons { margin-top: 20px; display: flex; gap: 8px; justify-content: flex-end; }
  .btn {
    border: 0; border-radius: 6px; padding: 8px 16px;
    font-size: 13px; font-weight: 600; cursor: pointer;
  }
  .btn-cancel { background: #21262d; color: #c9d1d9; }
  .btn-attack { background: #f85149; color: #fff; }
`;

export function applyBaseStyles(shadow: ShadowRoot): void {
  if (shadow.querySelector('style[data-tm-base]')) return;
  const style = document.createElement('style');
  style.setAttribute('data-tm-base', '1');
  style.textContent = BASE_STYLES;
  shadow.appendChild(style);
}
