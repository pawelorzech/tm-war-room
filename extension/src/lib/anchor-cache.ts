// Tiny anchor-lookup cache. profile-badges.ts and chat-dock.ts each walk
// the same 3-4-selector fallback list multiple times per render. The cost
// is small individually but predictable. Memoize per cacheKey, with auto-
// invalidation when the cached node is detached (which is how torn.com SPA
// navigation manifests in practice — node ripped out, replacement inserted
// with the same id/class).

const cache = new Map<string, Element>();

export function findFirstAnchor(
  selectors: readonly string[],
  cacheKey: string,
): Element | null {
  const cached = cache.get(cacheKey);
  if (cached && cached.isConnected) return cached;
  if (cached) cache.delete(cacheKey);

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      cache.set(cacheKey, el);
      return el;
    }
  }
  return null;
}

/** Test hook. Not exported for production callers. */
export function _resetAnchorCache(): void {
  cache.clear();
}
