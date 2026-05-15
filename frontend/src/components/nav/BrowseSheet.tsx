// frontend/src/components/nav/BrowseSheet.tsx
"use client";

import { useState, useEffect, useRef, useId } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_GROUPS, fuzzyMatch, isNavItemActive } from "@/lib/nav-data";
import { AppIcon } from "@/components/ui/AppIcon";

interface BrowseSheetProps {
  open: boolean;
  onClose: () => void;
  isPinned: (href: string) => boolean;
  isFull: () => boolean;
  onPin: (href: string) => void;
  onUnpin: (href: string) => void;
  showVersionBadge?: boolean;
}

export function BrowseSheet({ open, onClose, isPinned, isFull, onPin, onUnpin, showVersionBadge = false }: BrowseSheetProps) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [query, setQuery] = useState("");
  const sheetRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setVisible(true);
      setQuery("");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAnimating(true);
          searchRef.current?.focus();
        });
      });
      document.body.style.overflow = "hidden";
    } else {
      setAnimating(false);
      const timer = setTimeout(() => setVisible(false), 250);
      document.body.style.overflow = "";
      previouslyFocusedRef.current?.focus();
      return () => clearTimeout(timer);
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const container = sheetRef.current;
      if (!container) return;
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!visible) return null;

  const lowerQuery = query.trim().toLowerCase();

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
        className={`absolute bottom-0 left-0 right-0 top-12 bg-bg-surface border-t border-border rounded-t-2xl shadow-[0_-8px_32px_rgba(0,0,0,0.5)] transition-transform duration-250 ease-out flex flex-col ${
          animating ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2 pb-2 shrink-0">
          <div className="w-8 h-1 bg-text-muted rounded-full" />
        </div>

        {/* Search */}
        <div className="px-4 pb-3 shrink-0">
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search features..."
            className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-torn-green transition-colors"
          />
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-[env(safe-area-inset-bottom)] pb-6">
          {NAV_GROUPS.map(group => {
            const filtered = lowerQuery
              ? group.items.filter(item => fuzzyMatch(lowerQuery, item.label))
              : group.items;
            if (filtered.length === 0) return null;
            return (
              <div key={group.id}>
                <p id={group.id === NAV_GROUPS[0].id ? titleId : undefined}
                  className="text-[10px] font-semibold uppercase tracking-wider text-text-muted pt-3 pb-1.5 border-b border-border-light/50 mb-1">
                  {group.label}
                </p>
                {filtered.map(item => {
                  const active = isNavItemActive(pathname, item.href);
                  const pinned = isPinned(item.href);
                  return (
                    <div key={item.href} className="flex items-center gap-2">
                      <Link
                        href={item.href}
                        onClick={onClose}
                        className={`flex-1 flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm transition-colors ${
                          active
                            ? "bg-torn-green/10 text-text-primary font-medium"
                            : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
                        }`}
                      >
                        <span className="w-6 text-center"><AppIcon name={item.icon} size={17} /></span>
                        <span>{item.label}</span>
                        {showVersionBadge && item.href === "/changelog" && (
                          <span className="text-[9px] font-bold uppercase bg-torn-green/20 text-torn-green px-1.5 py-0.5 rounded-full ml-auto">
                            NEW
                          </span>
                        )}
                      </Link>
                      <button
                        onClick={() => pinned ? onUnpin(item.href) : onPin(item.href)}
                        disabled={!pinned && isFull()}
                        className={`w-8 h-8 flex items-center justify-center rounded-md text-sm transition-colors shrink-0 ${
                          pinned
                            ? "text-torn-yellow hover:bg-torn-yellow/10"
                            : isFull()
                              ? "text-text-muted/30 cursor-not-allowed"
                              : "text-text-muted hover:text-torn-yellow hover:bg-torn-yellow/10"
                        }`}
                        title={pinned ? "Unpin" : isFull() ? "Max pins reached" : "Pin to favorites"}
                      >
                        <AppIcon name="star" size={15} className={pinned ? "fill-current" : ""} />
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
