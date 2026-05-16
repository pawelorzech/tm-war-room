/**
 * Shared context tags for all perf telemetry (web-vitals + perf-observer).
 * Identifies WHERE TM Hub is running so we can diagnose perf per consumption path:
 * standalone hub.tri.ovh, embedded in Torn PDA WebView, or injected via Tampermonkey iframe.
 */

export type EmbeddedContext = "pda" | "iframe" | "standalone";

export function getEmbeddedContext(): EmbeddedContext {
  if (typeof window === "undefined") return "standalone";
  if (window.flutter_inappwebview) return "pda";
  try {
    if (window.parent !== window) return "iframe";
  } catch {
    return "iframe";
  }
  return "standalone";
}

export interface PerfContextTags {
  embedded: EmbeddedContext;
  viewport: string;
}

export function getContextTags(): PerfContextTags {
  return {
    embedded: getEmbeddedContext(),
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  };
}
