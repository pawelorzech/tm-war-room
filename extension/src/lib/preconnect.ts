// Warm the cross-origin TCP+TLS socket to hub.tri.ovh before the first
// fetch. Saves ~50-200ms on a fresh tab depending on the user's region.
//
// We mark our tags with data-tm-preconnect so we can find and replace
// them later (or remove them in tests) without stomping on hints torn.com
// itself injects.

export function injectPreconnect(origin: string): void {
  if (document.head.querySelector('link[data-tm-preconnect]')) return;

  for (const rel of ['preconnect', 'dns-prefetch'] as const) {
    const link = document.createElement('link');
    link.rel = rel;
    link.href = origin;
    link.setAttribute('data-tm-preconnect', '');
    if (rel === 'preconnect') link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  }
}
