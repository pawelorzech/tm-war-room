'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface RefreshButtonProps {
  onRefresh: () => Promise<void> | void;
}

export function RefreshButton({ onRefresh }: RefreshButtonProps) {
  const { role } = useAuth();
  const [spinning, setSpinning] = useState(false);

  if (role !== 'admin' && role !== 'superadmin') return null;

  const handleClick = async () => {
    setSpinning(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setSpinning(false), 600);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={spinning}
      title="Force refresh data from Torn API"
      className="px-2.5 py-1.5 text-xs rounded-lg border border-text-secondary/20 text-text-secondary hover:text-torn-green hover:border-torn-green/40 transition-all disabled:opacity-50"
    >
      <span className={spinning ? 'inline-block animate-spin' : ''}>↻</span>
      <span className="ml-1 hidden sm:inline">Refresh</span>
    </button>
  );
}
