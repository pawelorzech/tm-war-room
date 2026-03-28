"use client";

import { useState, useEffect, useCallback } from "react";
import type { Announcement } from "@/types/admin";

const typeStyles: Record<Announcement["type"], string> = {
  alert: "bg-red-900/50 border-red-500 text-red-200",
  warning: "bg-yellow-900/30 border-yellow-600 text-yellow-200",
  info: "bg-blue-900/30 border-blue-500 text-blue-200",
  success: "bg-green-900/30 border-green-500 text-green-200",
};

const typeIcons: Record<Announcement["type"], string> = {
  alert: "🚨",
  warning: "⚠️",
  info: "ℹ️",
  success: "✅",
};

interface Props {
  announcements: Announcement[];
  onDismiss: (id: number) => void;
}

export function AnnouncementCarousel({ announcements, onDismiss }: Props) {
  const [current, setCurrent] = useState(0);

  const count = announcements.length;

  const next = useCallback(() => {
    setCurrent((c) => (c + 1) % count);
  }, [count]);

  const prev = useCallback(() => {
    setCurrent((c) => (c - 1 + count) % count);
  }, [count]);

  // Reset index when announcements change (e.g. after dismiss)
  useEffect(() => {
    setCurrent((c) => (count === 0 ? 0 : c >= count ? count - 1 : c));
  }, [count]);

  // Auto-rotate every 5 seconds when there are multiple announcements
  useEffect(() => {
    if (count <= 1) return;
    const timer = setInterval(next, 5000);
    return () => clearInterval(timer);
  }, [count, next]);

  if (count === 0) return null;

  const announcement = announcements[current];
  const canDismiss = announcement.type !== "alert";
  const isAlert = announcement.type === "alert";

  return (
    <div className="w-full px-2 py-1">
      <div
        className={[
          "border rounded px-3 py-2 text-sm",
          typeStyles[announcement.type],
          isAlert ? "animate-pulse-border" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={isAlert ? { boxShadow: "0 0 0 1px rgb(239 68 68 / 0.6)" } : undefined}
      >
        {/* Main row */}
        <div className="flex items-center gap-2">
          {/* Left arrow */}
          {count > 1 && (
            <button
              onClick={prev}
              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
              aria-label="Previous announcement"
            >
              ‹
            </button>
          )}

          {/* Icon */}
          <span className="shrink-0" aria-hidden>
            {typeIcons[announcement.type]}
          </span>

          {/* Message */}
          <span className="flex-1 min-w-0 truncate">{announcement.message}</span>

          {/* Dismiss button */}
          {canDismiss && (
            <button
              onClick={() => onDismiss(announcement.id)}
              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity ml-1"
              aria-label="Dismiss announcement"
            >
              ×
            </button>
          )}

          {/* Right arrow */}
          {count > 1 && (
            <button
              onClick={next}
              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
              aria-label="Next announcement"
            >
              ›
            </button>
          )}
        </div>

        {/* Dots */}
        {count > 1 && (
          <div className="flex justify-center gap-1 mt-1">
            {announcements.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                aria-label={`Go to announcement ${i + 1}`}
                className={[
                  "w-1.5 h-1.5 rounded-full transition-opacity",
                  i === current ? "opacity-100 bg-current" : "opacity-30 bg-current",
                ].join(" ")}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
