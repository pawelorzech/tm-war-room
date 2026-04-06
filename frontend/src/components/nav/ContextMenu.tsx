// frontend/src/components/nav/ContextMenu.tsx
"use client";

import { useEffect, useRef } from "react";

interface ContextMenuProps {
  x: number;
  y: number;
  isPinned: boolean;
  isFull: boolean;
  onPin: () => void;
  onUnpin: () => void;
  onClose: () => void;
}

export function ContextMenu({
  x,
  y,
  isPinned,
  isFull,
  onPin,
  onUnpin,
  onClose,
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  const style: React.CSSProperties = {
    position: "fixed",
    left: x,
    top: y,
    zIndex: 200,
  };

  return (
    <div
      ref={ref}
      style={style}
      className="min-w-[160px] bg-bg-surface border border-border rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.4)] py-1 overflow-hidden"
    >
      {isPinned ? (
        <button
          onClick={() => {
            onUnpin();
            onClose();
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-bg-elevated hover:text-text-primary transition-colors duration-150"
        >
          <span className="text-xs">📌</span>
          <span>Unpin from top</span>
        </button>
      ) : (
        <button
          onClick={() => {
            onPin();
            onClose();
          }}
          disabled={isFull}
          className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors duration-150 ${
            isFull
              ? "text-text-muted cursor-not-allowed"
              : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
          }`}
        >
          <span className="text-xs">📌</span>
          <span>{isFull ? "Pinned is full (max 8)" : "Pin to top"}</span>
        </button>
      )}
    </div>
  );
}
