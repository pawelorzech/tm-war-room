"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  unreadCount?: number;
}

export function MobileDrawer({ open, onClose, unreadCount }: MobileDrawerProps) {
  // Track whether the drawer is mounted (for exit animation)
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      // Force a reflow so the enter animation plays
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimating(true));
      });
      document.body.style.overflow = "hidden";
    } else {
      setAnimating(false);
      // Wait for the exit animation to finish before unmounting
      const timer = setTimeout(() => setVisible(false), 250);
      document.body.style.overflow = "";
      return () => clearTimeout(timer);
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Overlay with fade */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-250 ${
          animating ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      {/* Drawer with slide */}
      <div
        className={`absolute top-0 left-0 h-full w-[260px] shadow-[4px_0_24px_-4px_rgba(0,0,0,0.5)] transition-transform duration-250 ease-out ${
          animating ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar unreadCount={unreadCount} />
      </div>
    </div>
  );
}
