"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";
import type { Announcement } from "@/types/admin";

export function useAnnouncements() {
  const [active, setActive] = useState<Announcement[]>([]);
  const [all, setAll] = useState<Announcement[]>([]);

  const getDismissed = (): number[] =>
    JSON.parse(localStorage.getItem("dismissedAnnouncements") || "[]");

  const dismiss = useCallback((id: number) => {
    const dismissed = getDismissed();
    if (!dismissed.includes(id)) {
      localStorage.setItem("dismissedAnnouncements", JSON.stringify([...dismissed, id]));
    }
    setActive((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [activeRes, allRes] = await Promise.all([
        api.announcements(),
        api.announcementsAll(),
      ]);
      const dismissed = getDismissed();
      // Alert type cannot be dismissed — always show. Others filter by dismissed.
      setActive(activeRes.announcements.filter((a) => a.type === "alert" || !dismissed.includes(a.id)));
      setAll(allRes.announcements);
    } catch {}
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const unreadCount = active.length;

  return { active, all, unreadCount, dismiss, refresh };
}
