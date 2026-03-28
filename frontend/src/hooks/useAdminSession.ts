"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./useAuth";

export function useAdminSession() {
  const { playerId } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("adminToken");
    if (stored) {
      tokenRef.current = stored;
      setToken(stored);
      setLoading(false);
      return;
    }
    if (!playerId) { setLoading(false); return; }

    fetch("/api/admin/session", {
      method: "POST",
      headers: { "X-Player-Id": String(playerId) },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.token) {
          localStorage.setItem("adminToken", data.token);
          tokenRef.current = data.token;
          setToken(data.token);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [playerId]);

  const adminFetch = useCallback(
    async <T>(path: string, init?: RequestInit): Promise<T> => {
      const doFetch = async (t: string) =>
        fetch(path, {
          ...init,
          headers: {
            ...((init?.headers as Record<string, string>) || {}),
            Authorization: `Bearer ${t}`,
          },
        });

      const currentToken = tokenRef.current;
      if (!currentToken) throw new Error("Not authenticated");

      let res = await doFetch(currentToken);
      // Auto-refresh on 401 (expired token)
      if (res.status === 401 && playerId) {
        try {
          const refreshRes = await fetch("/api/admin/session", {
            method: "POST",
            headers: { "X-Player-Id": String(playerId) },
          });
          const data = await refreshRes.json();
          if (data.token) {
            localStorage.setItem("adminToken", data.token);
            tokenRef.current = data.token;
            setToken(data.token);
            res = await doFetch(data.token);
          }
        } catch {}
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      return res.json();
    },
    [playerId]
  );

  return { token, loading, adminFetch };
}
