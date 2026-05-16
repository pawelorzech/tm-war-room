/**
 * PerformanceObserver → Umami custom events.
 * Captures longtasks (>50ms main-thread blocks) and significant layout shifts (>0.05).
 * Aggregate CLS/INP/LCP already covered by web-vitals; this gives per-occurrence detail.
 *
 * Umami script is lazyOnload, so events fired before it loads go to a bounded queue
 * and flush when umami appears.
 */

import { getContextTags } from "./perf-context";

type UmamiTrack = (eventName: string, eventData?: Record<string, unknown>) => void;
interface WindowWithUmami extends Window {
  umami?: { track: UmamiTrack };
}

interface LayoutShiftEntry extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
}

const QUEUE_MAX = 100;
const queue: Array<{ name: string; data: Record<string, unknown> }> = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

function tryFlush() {
  const w = window as WindowWithUmami;
  if (!w.umami?.track) return false;
  while (queue.length > 0) {
    const item = queue.shift()!;
    w.umami.track(item.name, item.data);
  }
  return true;
}

function track(name: string, data: Record<string, unknown>) {
  const w = window as WindowWithUmami;
  if (w.umami?.track) {
    if (queue.length > 0) tryFlush();
    w.umami.track(name, data);
    return;
  }
  if (queue.length >= QUEUE_MAX) queue.shift();
  queue.push({ name, data });
  if (!flushTimer) {
    flushTimer = setInterval(() => {
      if (tryFlush()) {
        clearInterval(flushTimer!);
        flushTimer = null;
      }
    }, 1000);
    setTimeout(() => {
      if (flushTimer) {
        clearInterval(flushTimer);
        flushTimer = null;
      }
    }, 30_000);
  }
}

export function initPerfObserver() {
  if (typeof window === "undefined") return;
  if (typeof PerformanceObserver === "undefined") return;

  try {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      if (entries.length === 0) return;
      const ctx = getContextTags();
      const path = window.location.pathname;
      for (const entry of entries) {
        track("perf-longtask", {
          duration: Math.round(entry.duration),
          startTime: Math.round(entry.startTime),
          path,
          ...ctx,
        });
      }
    }).observe({ type: "longtask", buffered: true });
  } catch {
    // longtask API not supported (Safari < 16, Firefox)
  }

  try {
    new PerformanceObserver((list) => {
      const ctx = getContextTags();
      const path = window.location.pathname;
      for (const entry of list.getEntries()) {
        const ls = entry as LayoutShiftEntry;
        if (ls.hadRecentInput) continue;
        if (ls.value < 0.05) continue;
        track("perf-layoutshift", {
          value: Math.round(ls.value * 1000) / 1000,
          startTime: Math.round(ls.startTime),
          path,
          ...ctx,
        });
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch {
    // layout-shift API not supported
  }
}
