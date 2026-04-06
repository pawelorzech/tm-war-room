"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import { useAuth } from "./useAuth";

interface ChatAccess {
  canAccess: boolean;
  loading: boolean;
}

export function useChatAccess(): ChatAccess {
  const { role, loading: authLoading } = useAuth();
  const [chatEnabled, setChatEnabled] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);

  useEffect(() => {
    api.publicSettings()
      .then((settings) => {
        setChatEnabled(settings.chat_enabled_for_all === "true");
      })
      .catch(() => {
        setChatEnabled(false);
      })
      .finally(() => setSettingsLoading(false));
  }, []);

  const isAdmin = role === "admin" || role === "superadmin";
  const canAccess = chatEnabled || isAdmin;
  const loading = authLoading || settingsLoading;

  return { canAccess, loading };
}
