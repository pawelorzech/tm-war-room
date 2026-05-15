// frontend/src/components/nav/MobileSearch.tsx
"use client";

import { useState, useEffect, useRef, useId } from "react";
import { useRouter } from "next/navigation";
import { searchNavItems } from "@/lib/nav-data";
import { AppIcon } from "@/components/ui/AppIcon";

interface MobileSearchProps {
  open: boolean;
  onClose: () => void;
}

export function MobileSearch({ open, onClose }: MobileSearchProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const router = useRouter();

  const results = searchNavItems(query);

  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
      document.body.style.overflow = "hidden";
      return;
    }

    document.body.style.overflow = "";
    previouslyFocusedRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const container = dialogRef.current;
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
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  function navigate(href: string) {
    onClose();
    router.push(href);
  }

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="fixed inset-0 z-[100] bg-bg-primary lg:hidden"
      style={{ animation: "tm-fade-in 150ms ease-out" }}
    >
      <h2 id={titleId} className="sr-only">
        Mobile search
      </h2>
      <p id={descriptionId} className="sr-only">
        Search for pages and select a result to navigate.
      </p>
      {/* Search header */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-border">
        <AppIcon name="search" size={17} className="text-text-muted" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search pages..."
          className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
        />
        <button
          onClick={onClose}
          className="text-sm text-text-secondary hover:text-text-primary px-2 py-1"
          aria-label="Close search"
        >
          Cancel
        </button>
      </div>

      {/* Results */}
      <div className="overflow-y-auto" style={{ height: "calc(100vh - 48px)" }}>
        {query && results.length === 0 && (
          <p className="px-4 py-8 text-sm text-text-muted text-center">
            No pages found
          </p>
        )}
        {results.map((item) => (
          <button
            key={item.href}
            onClick={() => navigate(item.href)}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-text-secondary hover:bg-bg-elevated transition-colors border-b border-border-light/30"
          >
            <AppIcon name={item.icon} size={17} />
            <div className="flex-1 text-left">
              <span className="text-text-primary">{item.label}</span>
            </div>
            <span className="text-[10px] text-text-muted">{item.group}</span>
          </button>
        ))}
        {!query && (
          <p className="px-4 py-8 text-sm text-text-muted text-center">
            Type to search all pages...
          </p>
        )}
      </div>
    </div>
  );
}
