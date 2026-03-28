"use client";

import type { Announcement } from "@/types/admin";
import { getAnnouncementState, ANNOUNCEMENT_TYPE_BADGE_STYLES } from "@/types/admin";
import { formatDate } from "@/lib/format";

const typeStyles: Record<Announcement["type"], string> = {
  alert: "bg-red-900/50 border-red-500 text-red-200",
  warning: "bg-yellow-900/30 border-yellow-600 text-yellow-200",
  info: "bg-blue-900/30 border-blue-500 text-blue-200",
  success: "bg-green-900/30 border-green-500 text-green-200",
};

interface Props {
  announcements: Announcement[];
}

export function AnnouncementList({ announcements }: Props) {
  if (announcements.length === 0) {
    return (
      <p className="text-text-secondary text-sm text-center py-8">
        No announcements yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {announcements.map((a) => {
        const state = getAnnouncementState(a);

        return (
          <div
            key={a.id}
            className={[
              "border rounded p-3 text-sm",
              state === "active" ? typeStyles[a.type] : "bg-bg-surface border-border text-text-secondary",
              state === "expired" ? "opacity-50" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div className="flex items-start gap-2">
              {/* Type badge */}
              <span
                className={[
                  "shrink-0 px-1.5 py-0.5 rounded text-xs font-semibold uppercase",
                  state === "active"
                    ? ANNOUNCEMENT_TYPE_BADGE_STYLES[a.type]
                    : "bg-gray-700 text-gray-300",
                ].join(" ")}
              >
                {state === "active" ? a.type : state}
              </span>

              {/* Message */}
              <span
                className={[
                  "flex-1",
                  state === "revoked" ? "line-through" : "",
                ].join(" ")}
              >
                {a.message}
              </span>
            </div>

            {/* Revoke reason */}
            {state === "revoked" && a.revoke_reason && (
              <p className="mt-1 text-xs opacity-70 italic">
                Reason: {a.revoke_reason}
              </p>
            )}

            {/* Created date */}
            <p className="mt-1 text-xs opacity-60">{formatDate(a.created_at)}</p>
          </div>
        );
      })}
    </div>
  );
}
