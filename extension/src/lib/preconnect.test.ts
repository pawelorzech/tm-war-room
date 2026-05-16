// Sprint 1 quick win #4 — preconnect / dns-prefetch hint injection.
//
// Reason: torn.com → hub.tri.ovh is cross-origin. Every first fetch on a
// fresh tab pays for DNS + TCP + TLS handshake (~50-200ms depending on
// region). A preconnect hint dropped into <head> early in boot lets the
// browser warm the socket while the rest of the script parses.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { injectPreconnect } from './preconnect';

describe('injectPreconnect', () => {
  beforeEach(() => {
    // Clean slate per test — happy-dom retains document state.
    document.head.querySelectorAll('link[data-tm-preconnect]').forEach((n) => n.remove());
  });
  afterEach(() => {
    document.head.querySelectorAll('link[data-tm-preconnect]').forEach((n) => n.remove());
  });

  it('adds a preconnect link tag for the given origin', () => {
    injectPreconnect('https://hub.tri.ovh');
    const link = document.head.querySelector(
      'link[rel="preconnect"][data-tm-preconnect]',
    ) as HTMLLinkElement | null;
    expect(link).not.toBeNull();
    expect(link!.href).toBe('https://hub.tri.ovh/');
  });

  it('also adds a dns-prefetch fallback for older browsers', () => {
    injectPreconnect('https://hub.tri.ovh');
    const link = document.head.querySelector(
      'link[rel="dns-prefetch"][data-tm-preconnect]',
    ) as HTMLLinkElement | null;
    expect(link).not.toBeNull();
    expect(link!.href).toBe('https://hub.tri.ovh/');
  });

  it('is idempotent — calling twice does not duplicate the hints', () => {
    injectPreconnect('https://hub.tri.ovh');
    injectPreconnect('https://hub.tri.ovh');
    const links = document.head.querySelectorAll('link[data-tm-preconnect]');
    expect(links.length).toBe(2); // one preconnect, one dns-prefetch — no doubles
  });
});
