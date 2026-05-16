// Build-time constants injected by esbuild's `define` in scripts/build.mjs.
//
// IMPORTANT: read these without a `typeof process !== 'undefined'` guard.
// The userscript runtime (Tampermonkey / Violentmonkey / Torn PDA) has no
// global `process` — that's a Node.js artefact. A defensive guard like
// `typeof process !== 'undefined' && process.env && process.env.X` will
// short-circuit on FALSE at runtime and the fallback wins, even though
// esbuild correctly substituted the literal during build. (That's why the
// status chip used to render "v0.0.0" instead of the real package version.)
//
// Trusting the substitution gives us, after build:
//   export const COMPANION_VERSION = "0.10.4" || "0.0.0";  → "0.10.4"
//
// The `|| '...'` keeps TypeScript happy (the env var is optional in the
// declared type) and provides a sensible dev-time default when running
// outside the bundler.

declare const process: {
  env: {
    TM_HUB_ORIGIN?: string;
    TM_COMPANION_VERSION?: string;
  };
};

export const HUB_ORIGIN: string =
  process.env.TM_HUB_ORIGIN || 'https://hub.tri.ovh';

export const COMPANION_VERSION: string =
  process.env.TM_COMPANION_VERSION || '0.0.0';

// FFScouter parity (Phase 0): re-export the lib/api cache helper as part of
// the public env surface. Overlays in Phases 1B/2B/3B/4B will gate their own
// init on this without having to import lib/api directly. Defaults are
// all-false so any call site that runs before the first fetch is safe.
import { getCachedFeatureFlags, type FeatureFlags } from './lib/api';

export function getFeatureFlags(): FeatureFlags {
  return getCachedFeatureFlags();
}

export type { FeatureFlags };
