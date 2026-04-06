'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useTornPDA } from '@/hooks/useTornPDA';

interface TornPDABridge {
  callHandler: (name: string, ...args: unknown[]) => Promise<unknown>;
}

interface PDAContextValue {
  isPDA: boolean;
  bridge: TornPDABridge | null;
}

const PDAContext = createContext<PDAContextValue>({ isPDA: false, bridge: null });

export function PDAProvider({ children }: { children: ReactNode }) {
  const pda = useTornPDA();
  return <PDAContext.Provider value={pda}>{children}</PDAContext.Provider>;
}

export function usePDA(): PDAContextValue {
  return useContext(PDAContext);
}
