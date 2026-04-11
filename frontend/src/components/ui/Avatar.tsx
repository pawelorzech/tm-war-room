'use client';

import { useState } from 'react';
import { useAvatars } from '@/contexts/AvatarContext';

const SIZE_PX: Record<string, number> = { sm: 24, md: 32, lg: 64 };
const SIZE_CLASS: Record<string, string> = {
  sm: 'w-6 h-6 text-[9px]',
  md: 'w-8 h-8 text-xs',
  lg: 'w-16 h-16 text-xl',
};

const PALETTE = [
  'bg-blue-600', 'bg-purple-600', 'bg-pink-600', 'bg-indigo-600',
  'bg-cyan-600', 'bg-teal-600', 'bg-orange-600', 'bg-rose-600',
];

function getColor(playerId: number): string {
  return PALETTE[playerId % PALETTE.length];
}

interface AvatarProps {
  playerId: number;
  name?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Avatar({ playerId, name, size = 'sm', className = '' }: AvatarProps) {
  const avatars = useAvatars();
  const url = avatars[playerId];
  const initials = name ? name.slice(0, 2).toUpperCase() : String(playerId).slice(-2);
  const cls = SIZE_CLASS[size];
  const [imgError, setImgError] = useState(false);

  if (url && !imgError) {
    return (
      <img
        src={url}
        alt={name || String(playerId)}
        width={SIZE_PX[size]}
        height={SIZE_PX[size]}
        loading="lazy"
        decoding="async"
        className={`rounded-full object-cover shrink-0 ${cls} ${className}`}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      className={`rounded-full flex items-center justify-center shrink-0 font-bold text-white ${cls} ${getColor(playerId)} ${className}`}
      title={name || String(playerId)}
    >
      {initials}
    </div>
  );
}
