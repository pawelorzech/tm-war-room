// frontend/src/components/nav/BottomSheet.tsx
"use client";

import { useEffect, useState, useRef, useId } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavGroup } from "@/lib/nav-data";

interface BottomSheetProps {
  group: NavGroup | null;
  onClose: () => void;
  showVersionBadge?: boolean;
}

export function BottomSheet({ group, onClose, showVersionBadge = false }: BottomSheetProps) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (group) {
      previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimating(true));
      });
      document.body.style.overflow = "hidden";
    } else {
      setAnimating(false);
      const timer = setTimeout(() => setVisible(false), 250);
      document.body.style.overflow = "";
      previouslyFocusedRef.current?.focus();
      return () => clearTimeout(timer);
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [group]);

  useEffect(() => {
    if (!group) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const container = sheetRef.current;
      if (!container) return;
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [group, onClose]);

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
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`absolute bottom-0 left-0 right-0 bg-bg-surface border-t border-border rounded-t-2xl shadow-[0_-8px_32px_rgba(0,0,0,0.5)] transition-transform duration-250 ease-out ${
          animating ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2 pb-3">
          <div className="w-8 h-1 bg-text-muted rounded-full" />
        </div>

        {/* Section title */}
        <p id={titleId} className="px-4 pb-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
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
                {showVersionBadge && item.href === "/changelog" && (
                  <span className="text-[9px] font-bold uppercase bg-torn-green/20 text-torn-green px-1.5 py-0.5 rounded-full ml-auto">
                    NEW
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
