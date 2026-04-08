"use client";

import { useState, useEffect, useCallback, useRef, useId } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { searchNavItems, fuzzyMatch } from "@/lib/nav-data";

const CHANNEL_ICONS: Record<string, string> = {
  general: "💬", "war-room": "⚔️", trading: "💰", "off-topic": "🎲",
  announcements: "📢", "hub-feedback": "💡", traveling: "✈️", leadership: "👑",
};

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [channels, setChannels] = useState<{ id: number; name: string; unread: number }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const router = useRouter();

  const pageResults = searchNavItems(query);

  const channelResults = channels
    .filter(ch => !query || fuzzyMatch(query, ch.name))
    .map(ch => ({
      label: `#${ch.name}`,
      href: `/chat?channel=${ch.id}`,
      icon: CHANNEL_ICONS[ch.name] || "💬",
      group: "Chat",
      unread: ch.unread,
    }));

  const unreadChannels = channelResults.filter(c => c.unread > 0).sort((a, b) => b.unread - a.unread);
  const otherChannels = channelResults.filter(c => c.unread === 0);
  const results = [...unreadChannels, ...pageResults.map(r => ({ ...r, unread: 0 })), ...otherChannels];

  // Reset on open
  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setQuery("");
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
      document.body.style.overflow = "hidden";
      return;
    }

    document.body.style.overflow = "";
    previouslyFocusedRef.current?.focus();
  }, [open]);

  useEffect(() => {
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Fetch channels when palette opens
  useEffect(() => {
    if (!open) return;
    api.chatChannels()
      .then(data => {
        setChannels(data.channels.map(ch => ({
          id: ch.id,
          name: ch.name,
          unread: ch.unread ?? 0,
        })));
      })
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

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
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative w-full max-w-md bg-bg-surface border border-border rounded-xl shadow-[0_16px_48px_rgba(0,0,0,0.4)] overflow-hidden"
        style={{ animation: "tm-fade-in 150ms ease-out" }}
      >
        <h2 id={titleId} className="sr-only">
          Command palette
        </h2>
        <p id={descriptionId} className="sr-only">
          Search pages and chat channels, then use arrow keys and enter to navigate.
        </p>
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
              No results found
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
              {item.unread > 0 && (
                <span className="min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-torn-green text-bg-primary rounded-full px-1">
                  {item.unread}
                </span>
              )}
              <span className="text-[10px] text-text-muted">{item.group}</span>
            </button>
          ))}
          {!query && unreadChannels.length === 0 && (
            <p className="px-4 py-6 text-sm text-text-muted text-center">
              Type to search all pages...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
