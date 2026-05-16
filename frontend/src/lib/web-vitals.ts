/**
 * Web Vitals → Umami custom events.
 * LCP, INP, CLS, TTFB, FCP. Sampled at 100% (frakcja ma ~70 osób).
 *
 * web-vitals is dynamically imported so it doesn't add to the main bundle for
 * users who block analytics or never load the listener.
 */

import { getContextTags } from "./perf-context";

type UmamiTrack = (eventName: string, eventData?: Record<string, unknown>) => void;

interface WindowWithUmami extends Window {
  umami?: { track: UmamiTrack };
}

function reportToUmami(metric: { name: string; value: number; rating: string; id: string }) {
  const w = window as WindowWithUmami;
  if (!w.umami?.track) return;
  const value = metric.name === "CLS" ? Math.round(metric.value * 1000) / 1000 : Math.round(metric.value);
  w.umami.track(`webvital-${metric.name.toLowerCase()}`, {
    value,
    rating: metric.rating,
    id: metric.id,
    path: window.location.pathname,
    ...getContextTags(),
  });
}

export function initWebVitals() {
  if (typeof window === "undefined") return;
  // Dynamic import — keeps web-vitals out of main bundle.
  import("web-vitals").then(({ onLCP, onINP, onCLS, onTTFB, onFCP }) => {
    onLCP(reportToUmami);
    onINP(reportToUmami);
    onCLS(reportToUmami);
    onTTFB(reportToUmami);
    onFCP(reportToUmami);
  }).catch(() => {
    // web-vitals not installed or import failed — silent. Listener is best-effort.
  });
}
