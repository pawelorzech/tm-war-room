"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Announcement } from "@/types/admin";

const typeStyles: Record<Announcement["type"], string> = {
  alert: "banner-alert",
  warning: "banner-warning",
  info: "banner-info",
  success: "banner-success",
};

const typeIcons: Record<Announcement["type"], string> = {
  alert: "\uD83D\uDEA8",
  warning: "\u26A0\uFE0F",
  info: "\u2139\uFE0F",
  success: "\u2705",
};

interface Props {
  announcements: Announcement[];
  onDismiss: (id: number) => void;
}

export function AnnouncementCarousel({ announcements, onDismiss }: Props) {
  const [current, setCurrent] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionRef = useRef<NodeJS.Timeout | null>(null);

  const count = announcements.length;

  const goTo = useCallback(
    (index: number) => {
      if (isTransitioning || count === 0) return;
      setIsTransitioning(true);
      // Brief fade-out then switch
      transitionRef.current = setTimeout(() => {
        setCurrent(index);
        setIsTransitioning(false);
      }, 150);
    },
    [isTransitioning, count],
  );

  const next = useCallback(() => {
    goTo((current + 1) % count);
  }, [current, count, goTo]);

  const prev = useCallback(() => {
    goTo((current - 1 + count) % count);
  }, [current, count, goTo]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (transitionRef.current) clearTimeout(transitionRef.current);
    };
  }, []);

  // Reset index when announcements change (e.g. after dismiss)
  useEffect(() => {
    setCurrent((c) => (count === 0 ? 0 : c >= count ? count - 1 : c));
  }, [count]);

  // Auto-rotate every 5 seconds when there are multiple announcements
  useEffect(() => {
    if (count <= 1) return;
    const timer = setInterval(() => {
      setCurrent((c) => (c + 1) % count);
    }, 5000);
    return () => clearInterval(timer);
  }, [count]);

  if (count === 0) return null;

  const announcement = announcements[current];
  const canDismiss = announcement.type !== "alert";
  const isAlert = announcement.type === "alert";

  return (
    <div className="w-full px-2 py-1">
      <div
        className={[
          "border rounded-lg px-3 py-2.5 text-sm transition-all duration-200",
          typeStyles[announcement.type],
          isTransitioning ? "opacity-0 translate-x-1" : "opacity-100 translate-x-0",
        ]
          .filter(Boolean)
          .join(" ")}
        style={
          isAlert
            ? { animation: "tm-alert-border 2s ease-in-out infinite" }
            : undefined
        }
      >
        {/* Main row */}
        <div className="flex items-center gap-2">
          {/* Left arrow */}
          {count > 1 && (
            <button
              onClick={prev}
              className="shrink-0 opacity-50 hover:opacity-100 transition-opacity text-lg leading-none px-0.5 -ml-0.5"
              aria-label="Previous announcement"
            >
              {"\u2039"}
            </button>
          )}

          {/* Icon */}
          <span className="shrink-0 text-base" aria-hidden>
            {typeIcons[announcement.type]}
          </span>

          {/* Message */}
          <span className="flex-1 min-w-0 truncate font-medium">
            {announcement.message}
          </span>

          {/* Dismiss button */}
          {canDismiss && (
            <button
              onClick={() => onDismiss(announcement.id)}
              className="shrink-0 opacity-40 hover:opacity-100 transition-all ml-1 w-5 h-5 rounded flex items-center justify-center hover:bg-white/10 text-sm"
              aria-label="Dismiss announcement"
            >
              {"\u00D7"}
            </button>
          )}

          {/* Right arrow */}
          {count > 1 && (
            <button
              onClick={next}
              className="shrink-0 opacity-50 hover:opacity-100 transition-opacity text-lg leading-none px-0.5 -mr-0.5"
              aria-label="Next announcement"
            >
              {"\u203A"}
            </button>
          )}
        </div>

        {/* Dots */}
        {count > 1 && (
          <div className="flex justify-center gap-1.5 mt-2">
            {announcements.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                aria-label={`Go to announcement ${i + 1}`}
                className={[
                  "rounded-full transition-all duration-300",
                  i === current
                    ? "w-2.5 h-2.5 opacity-100 bg-current"
                    : "w-1.5 h-1.5 opacity-30 bg-current hover:opacity-50",
                ].join(" ")}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
