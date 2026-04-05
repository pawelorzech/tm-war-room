// frontend/src/components/nav/MobileSearch.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { searchNavItems } from "@/lib/nav-data";

interface MobileSearchProps {
  open: boolean;
  onClose: () => void;
}

export function MobileSearch({ open, onClose }: MobileSearchProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const results = searchNavItems(query);

  useEffect(() => {
    if (open) {
      setQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  function navigate(href: string) {
    onClose();
    router.push(href);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-bg-primary lg:hidden"
      style={{ animation: "tm-fade-in 150ms ease-out" }}
    >
      {/* Search header */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-border">
        <span className="text-text-muted">🔍</span>
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
            <span className="text-base">{item.icon}</span>
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
