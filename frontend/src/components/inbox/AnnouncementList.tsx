"use client";

import type { Announcement } from "@/types/admin";
import { getAnnouncementState, ANNOUNCEMENT_TYPE_BADGE_STYLES } from "@/types/admin";
import { formatDate } from "@/lib/format";

const typeStyles: Record<Announcement["type"], string> = {
  alert: "bg-red-50 border-red-300 text-red-800 dark:bg-red-900/50 dark:border-red-500 dark:text-red-200",
  warning: "bg-yellow-50 border-yellow-300 text-yellow-800 dark:bg-yellow-900/30 dark:border-yellow-600 dark:text-yellow-200",
  info: "bg-blue-50 border-blue-300 text-blue-800 dark:bg-blue-900/30 dark:border-blue-500 dark:text-blue-200",
  success: "bg-green-50 border-green-300 text-green-800 dark:bg-green-900/30 dark:border-green-500 dark:text-green-200",
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
                    : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
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
