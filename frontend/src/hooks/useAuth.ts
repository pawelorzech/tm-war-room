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
    if (!pid) {
      setState({ playerId: null, playerName: null, role: null, loading: false });
      return;
    }
    api.me().then((me) => {
      setState({
        playerId: me.player_id,
        playerName: name,
        role: me.role,
        loading: false,
      });
    }).catch(() => {
      setState({ playerId: null, playerName: null, role: null, loading: false });
    });
  }, []);

  const login = useCallback(async (apiKey: string) => {
    const result = await api.registerKey(apiKey);
    localStorage.setItem("myKeyPlayer", String(result.player_id));
    localStorage.setItem("myKeyName", result.name);
    setState({
      playerId: result.player_id,
      playerName: result.name,
      role: result.role || "member",
      loading: false,
    });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("myKeyPlayer");
    localStorage.removeItem("myKeyName");
    localStorage.removeItem("adminToken");
    setState({ playerId: null, playerName: null, role: null, loading: false });
  }, []);

  return { ...state, login, logout, isLoggedIn: state.playerId !== null };
}
