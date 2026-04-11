"use client";

import { useState, useEffect, useCallback } from "react";
import { getActiveEvent } from "@/data/seasonal-events";
import type { SeasonalEvent } from "@/data/seasonal-events";

function dismissKey(event: SeasonalEvent, year: number): string {
  return `dismissed-seasonal-${event.id}-${year}`;
}

export function SeasonalBanner() {
  const [event, setEvent] = useState<SeasonalEvent | null>(null);
  const [tipIndex, setTipIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const active = getActiveEvent();
    setEvent(active);

    if (active) {
      const year = new Date().getFullYear();
      const key = dismissKey(active, year);
      if (typeof window !== "undefined" && localStorage.getItem(key) === "1") {
        setDismissed(true);
      }
      // Start with a random tip so it's not always the first one
      setTipIndex(Math.floor(Math.random() * active.tips.length));
    }

    setMounted(true);
  }, []);

  const handleDismiss = useCallback(() => {
    if (!event) return;
    const year = new Date().getFullYear();
    localStorage.setItem(dismissKey(event, year), "1");
    setDismissed(true);
  }, [event]);

  const nextTip = useCallback(() => {
    if (!event) return;
    setTipIndex((prev) => (prev + 1) % event.tips.length);
  }, [event]);

  // Don't render during SSR or before hydration
  if (!mounted || !event || dismissed) return null;

  const tip = event.tips[tipIndex];

  return (
    <div className="mx-4 mt-2">
      <div
        className={`flex items-start gap-2.5 bg-bg-card border border-text-secondary/15 rounded-lg px-3 py-2.5 text-sm border-l-4 ${event.color}`}
      >
        {/* Icon */}
        <span className="shrink-0 text-base leading-5" aria-hidden="true">
          {event.icon}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-text-primary">{event.name}:</span>{" "}
          <span className="text-text-secondary">{tip}</span>
        </div>

        {/* Next tip button */}
        {event.tips.length > 1 && (
          <button
            onClick={nextTip}
            className="shrink-0 text-text-muted hover:text-text-primary transition-colors w-5 h-5 rounded flex items-center justify-center hover:bg-white/10 text-xs"
            aria-label="Next tip"
            title="Next tip"
          >
            {"\u203A"}
          </button>
        )}

        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          className="shrink-0 text-text-muted hover:text-text-primary transition-colors w-5 h-5 rounded flex items-center justify-center hover:bg-white/10 text-sm"
          aria-label="Dismiss seasonal banner"
        >
          {"\u2715"}
        </button>
      </div>
    </div>
  );
}
