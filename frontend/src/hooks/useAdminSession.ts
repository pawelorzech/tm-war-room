"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./useAuth";

export function useAdminSession() {
  const { playerId } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("adminToken");
    if (stored) { setToken(stored); setLoading(false); return; }
    if (!playerId) { setLoading(false); return; }

    fetch("/api/admin/session", {
      method: "POST",
      headers: { "X-Player-Id": String(playerId) },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.token) {
          localStorage.setItem("adminToken", data.token);
          setToken(data.token);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [playerId]);

  const refreshToken = useCallback(async (): Promise<string | null> => {
    if (!playerId) return null;
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "X-Player-Id": String(playerId) },
      });
      const data = await res.json();
      if (data.token) {
        localStorage.setItem("adminToken", data.token);
        setToken(data.token);
        return data.token;
      }
    } catch {}
    return null;
  }, [playerId]);

  const adminFetch = useCallback(
    async <T>(path: string, init?: RequestInit): Promise<T> => {
      const doFetch = async (t: string) => {
        return fetch(path, {
          ...init,
          headers: {
            ...((init?.headers as Record<string, string>) || {}),
            Authorization: `Bearer ${t}`,
          },
        });
      };

      let res = await doFetch(token!);
      // Auto-refresh on 401 (expired token)
      if (res.status === 401) {
        const newToken = await refreshToken();
        if (newToken) {
          res = await doFetch(newToken);
        }
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      return res.json();
    },
    [token, refreshToken]
  );

  return { token, loading, adminFetch };
}
