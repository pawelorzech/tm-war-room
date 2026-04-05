"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { searchNavItems } from "@/lib/nav-data";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const results = searchNavItems(query);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Global Cmd+K listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (open) {
          onClose();
        }
      }
      if (open && e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const navigate = useCallback(
    (href: string) => {
      onClose();
      router.push(href);
      if (typeof window !== "undefined" && (window as unknown as Record<string, unknown>).umami) {
        (window as unknown as { umami: { track: (event: string, data?: Record<string, string>) => void } }).umami.track("command-palette-nav", { to: href });
      }
    },
    [onClose, router],
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      navigate(results[selectedIndex].href);
    }
  }

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
        style={{ animation: "tm-fade-in 150ms ease-out" }}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-md bg-bg-surface border border-border rounded-xl shadow-[0_16px_48px_rgba(0,0,0,0.4)] overflow-hidden"
        style={{ animation: "tm-fade-in 150ms ease-out" }}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <span className="text-text-muted">🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages..."
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
          />
          <kbd className="text-[9px] text-text-muted bg-bg-elevated px-1.5 py-0.5 rounded border border-border-light font-mono">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[300px] overflow-y-auto py-2">
          {query && results.length === 0 && (
            <p className="px-4 py-6 text-sm text-text-muted text-center">
              No pages found
            </p>
          )}
          {results.map((item, i) => (
            <button
              key={item.href}
              onClick={() => navigate(item.href)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors duration-100 ${
                i === selectedIndex
                  ? "bg-torn-green/10 text-text-primary"
                  : "text-text-secondary hover:bg-bg-elevated"
              }`}
            >
              <span>{item.icon}</span>
              <span className="flex-1 text-left">{item.label}</span>
              <span className="text-[10px] text-text-muted">{item.group}</span>
            </button>
          ))}
          {!query && (
            <p className="px-4 py-6 text-sm text-text-muted text-center">
              Type to search all pages...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
