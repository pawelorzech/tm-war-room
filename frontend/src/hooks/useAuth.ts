"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AUTH_EVENT_NAME,
  api,
  clearStoredAuth,
  notifyAuthStateChanged,
  storeSessionToken,
} from "@/lib/api-client";
import type { Role } from "@/types/admin";

interface AuthState {
  playerId: number | null;
  playerName: string | null;
  role: Role | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (apiKey: string) => Promise<{
    player_id: number;
    name: string;
    role: Role;
    access_level?: string;
    limited_features?: string[];
    token?: string;
  }>;
  logout: () => void;
  refresh: () => Promise<void>;
  isLoggedIn: boolean;
}

const STORAGE_KEYS = [
  "myKeyPlayer",
  "myKeyName",
  "myKeyRole",
  "sessionToken",
] as const;

const AuthContext = createContext<AuthContextValue | null>(null);

function getStoredPlayerId(): number | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("myKeyPlayer");
  return raw ? Number(raw) : null;
}

function getStoredPlayerName(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("myKeyName");
}

function getStoredRole(): Role | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("myKeyRole") as Role | null;
}

function useProvideAuth(): AuthContextValue {
  const [state, setState] = useState<AuthState>({
    playerId: null,
    playerName: null,
    role: null,
    loading: true,
  });

  const setLoggedOut = useCallback(() => {
    setState({
      playerId: null,
      playerName: null,
      role: null,
      loading: false,
    });
  }, []);

  const refreshPromiseRef = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const runRefresh = async () => {
      const playerId = getStoredPlayerId();
      const playerName = getStoredPlayerName();
      const cachedRole = getStoredRole();

      if (!playerId) {
        setLoggedOut();
        return;
      }

      setState((prev) => ({
        playerId,
        playerName,
        role: cachedRole ?? prev.role,
        loading: true,
      }));

      try {
        const me = await api.me();
        localStorage.setItem("myKeyRole", me.role);
        setState({
          playerId: me.player_id,
          playerName,
          role: me.role,
          loading: false,
        });
      } catch (err) {
        // Only clear auth on actual 401 (already handled by apiFetch).
        // Transient errors (502, network) should keep current session.
        if (err instanceof Error && err.message === "Unauthorized") {
          clearStoredAuth();
          setLoggedOut();
        } else {
          setState((prev) => ({ ...prev, loading: false }));
        }
      }
    };

    const refreshPromise = runRefresh().finally(() => {
      refreshPromiseRef.current = null;
    });
    refreshPromiseRef.current = refreshPromise;
    return refreshPromise;
  }, [setLoggedOut]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleStorage = (event: StorageEvent) => {
      if (!event.key || STORAGE_KEYS.includes(event.key as (typeof STORAGE_KEYS)[number])) {
        void refresh();
      }
    };

    const handleAuthChange = (event: Event) => {
      const detail = (event as CustomEvent<{ authenticated?: boolean }>).detail;
      if (detail?.authenticated === false) {
        setLoggedOut();
        return;
      }
      void refresh();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(AUTH_EVENT_NAME, handleAuthChange as EventListener);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(AUTH_EVENT_NAME, handleAuthChange as EventListener);
    };
  }, [refresh, setLoggedOut]);

  const login = useCallback(async (apiKey: string) => {
    const result = await api.registerKey(apiKey);
    const role = result.role || "member";

    localStorage.setItem("myKeyPlayer", String(result.player_id));
    localStorage.setItem("myKeyName", result.name);
    localStorage.setItem("myKeyRole", role);
    if (result.access_level) {
      localStorage.setItem("myKeyAccess", result.access_level);
    } else {
      localStorage.removeItem("myKeyAccess");
    }
    if (result.limited_features?.length) {
      localStorage.setItem("myKeyLimited", JSON.stringify(result.limited_features));
    } else {
      localStorage.removeItem("myKeyLimited");
    }
    storeSessionToken(result.token ?? null);

    setState({
      playerId: result.player_id,
      playerName: result.name,
      role,
      loading: false,
    });
    notifyAuthStateChanged(true);
    return result;
  }, []);

  const logout = useCallback(() => {
    clearStoredAuth();
    setLoggedOut();
    notifyAuthStateChanged(false);
  }, [setLoggedOut]);

  return useMemo(
    () => ({
      ...state,
      login,
      logout,
      refresh,
      isLoggedIn: state.playerId !== null,
    }),
    [login, logout, refresh, state],
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useProvideAuth();
  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
