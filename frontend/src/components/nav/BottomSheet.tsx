// frontend/src/components/nav/BottomSheet.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavGroup } from "@/lib/nav-data";

interface BottomSheetProps {
  group: NavGroup | null;
  onClose: () => void;
}

export function BottomSheet({ group, onClose }: BottomSheetProps) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (group) {
      setVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimating(true));
      });
      document.body.style.overflow = "hidden";
    } else {
      setAnimating(false);
      const timer = setTimeout(() => setVisible(false), 250);
      document.body.style.overflow = "";
      return () => clearTimeout(timer);
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [group]);

  if (!visible || !group) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-250 ${
          animating ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-bg-surface border-t border-border rounded-t-2xl shadow-[0_-8px_32px_rgba(0,0,0,0.5)] transition-transform duration-250 ease-out ${
          animating ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2 pb-3">
          <div className="w-8 h-1 bg-text-muted rounded-full" />
        </div>

        {/* Section title */}
        <p className="px-4 pb-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {group.label}
        </p>

        {/* Items grid */}
        <div className="grid grid-cols-2 gap-2 px-4 pb-6 max-h-[60vh] overflow-y-auto">
          {group.items.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-2 px-3 py-3 rounded-lg border text-sm transition-all duration-200 ${
                  active
                    ? "bg-torn-green/10 border-torn-green/30 text-text-primary"
                    : "bg-bg-primary border-border-light text-text-secondary hover:border-border"
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
