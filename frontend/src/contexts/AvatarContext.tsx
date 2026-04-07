'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';

type AvatarMap = Record<number, string>;

const AvatarContext = createContext<AvatarMap>({});

export function AvatarProvider({ children }: { children: ReactNode }) {
  const { isLoggedIn } = useAuth();
  const [avatars, setAvatars] = useState<AvatarMap>({});

  useEffect(() => {
    if (!isLoggedIn) return;
    api.memberAvatars()
      .then(d => {
        const map: AvatarMap = {};
        for (const [k, v] of Object.entries(d.avatars)) {
          map[Number(k)] = v;
        }
        setAvatars(map);
      })
      .catch(() => {});
  }, [isLoggedIn]);

  return <AvatarContext.Provider value={avatars}>{children}</AvatarContext.Provider>;
}

export function useAvatars(): AvatarMap {
  return useContext(AvatarContext);
}
