'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';

type AvatarMap = Record<number, string>;

const AvatarContext = createContext<AvatarMap>({});

const CACHE_KEY = 'tm_avatars';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function loadCached(): AvatarMap | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch {
    return null;
  }
}

function saveCache(data: AvatarMap) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch { /* quota exceeded — ignore */ }
}

export function AvatarProvider({ children }: { children: ReactNode }) {
  const { isLoggedIn } = useAuth();
  const [avatars, setAvatars] = useState<AvatarMap>({});

  useEffect(() => {
    if (!isLoggedIn) return;

    // Load from cache immediately
    const cached = loadCached();
    if (cached && Object.keys(cached).length > 0) {
      setAvatars(cached);
    }

    // Refresh from API in background
    api.memberAvatars()
      .then(d => {
        const map: AvatarMap = {};
        for (const [k, v] of Object.entries(d.avatars)) {
          map[Number(k)] = v;
        }
        setAvatars(map);
        saveCache(map);
      })
      .catch(() => {});
  }, [isLoggedIn]);

  return <AvatarContext.Provider value={avatars}>{children}</AvatarContext.Provider>;
}

export function useAvatars(): AvatarMap {
  return useContext(AvatarContext);
}
