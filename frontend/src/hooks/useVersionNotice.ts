"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";
import { CURRENT_VERSION, CHANGELOG } from "@/data/changelog";
import type { ChangelogEntry } from "@/data/changelog";

export function useVersionNotice() {
  const [showNotice, setShowNotice] = useState(false);
  const latestEntry: ChangelogEntry | undefined = CHANGELOG[0];

  useEffect(() => {
    api.versionStatus(CURRENT_VERSION)
      .then((res) => {
        if (!res.dismissed) setShowNotice(true);
      })
      .catch(() => {});
  }, []);

  const dismiss = useCallback(async () => {
    setShowNotice(false);
    try {
      await api.versionDismiss(CURRENT_VERSION);
    } catch {}
  }, []);

  return {
    showNotice,
    currentVersion: CURRENT_VERSION,
    latestEntry,
    dismiss,
  };
}
