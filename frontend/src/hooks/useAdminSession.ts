"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { AUTH_EVENT_NAME, getSessionToken } from "@/lib/api-client";

async function createAdminSession(sessionToken: string): Promise<string | null> {
  const response = await fetch("/api/admin/session", {
    method: "POST",
    headers: { Authorization: `Bearer ${sessionToken}` },
  });

  if (!response.ok) {
    localStorage.removeItem("adminToken");
    return null;
  }

  const data = await response.json();
  return typeof data.token === "string" ? data.token : null;
}

export function useAdminSession() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      const stored = localStorage.getItem("adminToken");
      await Promise.resolve();
      if (cancelled) return;

      if (stored) {
        tokenRef.current = stored;
        setToken(stored);
        setLoading(false);
        return;
      }

      const sessionToken = getSessionToken();
      if (!sessionToken) {
        setLoading(false);
        return;
      }

      try {
        const adminToken = await createAdminSession(sessionToken);
        if (cancelled) return;
        if (adminToken) {
          localStorage.setItem("adminToken", adminToken);
          tokenRef.current = adminToken;
          setToken(adminToken);
        }
      } catch {
        localStorage.removeItem("adminToken");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    const handleAuthChange = (event: Event) => {
      const detail = (event as CustomEvent<{ authenticated?: boolean }>).detail;
      if (detail?.authenticated === false) {
        localStorage.removeItem("adminToken");
        tokenRef.current = null;
        setToken(null);
        setLoading(false);
        return;
      }
      void initialize();
    };

    void initialize();
    window.addEventListener(AUTH_EVENT_NAME, handleAuthChange as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_EVENT_NAME, handleAuthChange as EventListener);
    };
  }, []);

  const adminFetch = useCallback(
    async <T>(path: string, init?: RequestInit): Promise<T> => {
      const doFetch = async (t: string) => {
        const pid = typeof window !== "undefined" ? localStorage.getItem("myKeyPlayer") : null;
        return fetch(path, {
          ...init,
          headers: {
            ...((init?.headers as Record<string, string>) || {}),
            Authorization: `Bearer ${t}`,
            ...(pid ? { "X-Player-Id": pid } : {}),
          },
        });
      };

      const currentToken = tokenRef.current;
      if (!currentToken) throw new Error("Not authenticated");

      let res = await doFetch(currentToken);
      // Auto-refresh on 401 (expired token)
      if (res.status === 401) {
        const sessionToken = getSessionToken();
        if (sessionToken) {
          const refreshedToken = await createAdminSession(sessionToken);
          if (refreshedToken) {
            localStorage.setItem("adminToken", refreshedToken);
            tokenRef.current = refreshedToken;
            setToken(refreshedToken);
            res = await doFetch(refreshedToken);
          }
        }
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      return res.json();
    },
    []
  );

  return { token, loading, adminFetch };
}
