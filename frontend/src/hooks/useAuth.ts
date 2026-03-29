"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";
import type { Role } from "@/types/admin";

interface AuthState {
  playerId: number | null;
  playerName: string | null;
  role: Role | null;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    playerId: null,
    playerName: null,
    role: null,
    loading: true,
  });

  useEffect(() => {
    const pid = localStorage.getItem("myKeyPlayer");
    const name = localStorage.getItem("myKeyName");
    const cachedRole = localStorage.getItem("myKeyRole") as Role | null;
    if (!pid) {
      setState({ playerId: null, playerName: null, role: null, loading: false });
      return;
    }
    // Use cached role immediately, refresh in background
    if (cachedRole) {
      setState({ playerId: Number(pid), playerName: name, role: cachedRole, loading: false });
    }
    api.me().then((me) => {
      localStorage.setItem("myKeyRole", me.role);
      setState({
        playerId: me.player_id,
        playerName: name,
        role: me.role,
        loading: false,
      });
    }).catch(() => {
      if (!cachedRole) {
        setState({ playerId: null, playerName: null, role: null, loading: false });
      }
    });
  }, []);

  const login = useCallback(async (apiKey: string) => {
    const result = await api.registerKey(apiKey);
    const role = result.role || "member";
    localStorage.setItem("myKeyPlayer", String(result.player_id));
    localStorage.setItem("myKeyName", result.name);
    localStorage.setItem("myKeyRole", role);
    if (result.access_level) localStorage.setItem("myKeyAccess", result.access_level);
    if (result.limited_features?.length) localStorage.setItem("myKeyLimited", JSON.stringify(result.limited_features));
    setState({
      playerId: result.player_id,
      playerName: result.name,
      role,
      loading: false,
    });
    return result;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("myKeyPlayer");
    localStorage.removeItem("myKeyName");
    localStorage.removeItem("myKeyRole");
    localStorage.removeItem("adminToken");
    // Force full page reload to clear all cached state, hooks, and data
    window.location.href = "/";
  }, []);

  return { ...state, login, logout, isLoggedIn: state.playerId !== null };
}
