"use client";

import { useEffect } from "react";
import { Sidebar } from "./Sidebar";

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  unreadCount?: number;
}

export function MobileDrawer({ open, onClose, unreadCount }: MobileDrawerProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="absolute top-0 left-0 h-full w-[260px]">
        <Sidebar unreadCount={unreadCount} />
      </div>
    </div>
  );
}
