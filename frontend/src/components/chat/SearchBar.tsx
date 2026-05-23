"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Channel, Message } from "@/types/chat";
import { api } from "@/lib/api-client";
import DOMPurify from "isomorphic-dompurify";

interface Props {
  channels: Channel[];
  onJumpToMessage: (channelId: number, messageId: number) => void;
}

type SearchResult = Message & { snippet?: string };

/** Slack-style chat search.
 *
 *  Opens as a panel anchored under the chat header. Supports the same
 *  filter syntax the backend understands: ``from:Name in:channel
 *  has:link|reaction|pin before:YYYY-MM-DD after:YYYY-MM-DD -negation``
 *  plus free text.
 *
 *  Cmd/Ctrl + F (when chat is focused) toggles the panel. Cmd+K stays
 *  reserved for the global command palette. */
export function SearchBar({ channels, onJumpToMessage }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedHint, setParsedHint] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);

  const channelNameById = new Map(channels.map(c => [c.id, c.name]));

  /* Cmd/Ctrl+F toggles the panel — but only when chat is focused, so
   * we don't hijack the browser's find-in-page on other pages. */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        // Only consume when chat is mounted (this hook only runs in chat).
        e.preventDefault();
        setOpen(o => !o);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      // Focus the input after the panel mounts.
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  /* Debounced search — fire 250 ms after the user stops typing. */
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setResults([]);
      setParsedHint([]);
      setError(null);
      return;
    }
    setLoading(true);
    debounceRef.current = window.setTimeout(() => {
      api.chatSearch(q, 30)
        .then(r => {
          setResults(r.messages);
          const hints: string[] = [];
          if (r.parsed.from_name) hints.push(`from:${r.parsed.from_name}`);
          if (r.parsed.in_channel) hints.push(`in:${r.parsed.in_channel}`);
          for (const h of r.parsed.has) hints.push(`has:${h}`);
          if (r.parsed.before_ts_max)
            hints.push(`before:${new Date(r.parsed.before_ts_max * 1000).toISOString().slice(0, 10)}`);
          if (r.parsed.after_ts_min)
            hints.push(`after:${new Date(r.parsed.after_ts_min * 1000).toISOString().slice(0, 10)}`);
          for (const n of r.parsed.neg_text) hints.push(`-${n}`);
          setParsedHint(hints);
          setError(null);
        })
        .catch(err => {
          setError(err instanceof Error ? err.message : "Search failed");
          setResults([]);
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [q, open]);

  const handleJump = useCallback(
    (m: SearchResult) => {
      onJumpToMessage(m.channel_id, m.id);
      setOpen(false);
      setQ("");
    },
    [onJumpToMessage],
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-text-muted hover:text-text-primary p-1 rounded hover:bg-bg-elevated transition-colors"
        title="Search chat (Cmd+F)"
        aria-label="Search chat"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.5" y2="16.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full z-30 bg-bg-surface border-b border-border shadow-lg">
          <div className="p-2 flex items-center gap-2">
            <input
              ref={inputRef}
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder='Search… try "from:Bombel has:link xanax"'
              className="flex-1 bg-bg-elevated border border-border rounded px-2 py-1 text-sm text-text-primary"
            />
            <button
              onClick={() => setOpen(false)}
              className="text-text-muted hover:text-text-primary text-xs px-2"
              aria-label="Close search"
            >
              Esc
            </button>
          </div>
          {parsedHint.length > 0 && (
            <div className="px-2 pb-1 flex flex-wrap gap-1">
              {parsedHint.map(h => (
                <span key={h} className="text-[10px] px-1.5 py-0.5 rounded bg-torn-blue/10 text-torn-blue">
                  {h}
                </span>
              ))}
            </div>
          )}
          <div className="max-h-[60vh] overflow-y-auto">
            {loading && <div className="p-3 text-xs text-text-muted">Searching…</div>}
            {error && <div className="p-3 text-xs text-torn-red">{error}</div>}
            {!loading && !error && q.trim() && results.length === 0 && (
              <div className="p-3 text-xs text-text-muted">No matches.</div>
            )}
            {results.map(m => (
              <button
                key={m.id}
                onClick={() => handleJump(m)}
                className="w-full text-left p-2 border-b border-border last:border-b-0 hover:bg-bg-elevated transition-colors"
              >
                <div className="flex items-baseline gap-2 text-[11px] text-text-muted">
                  <span className="font-medium text-torn-green">{m.player_name}</span>
                  <span>·</span>
                  <span>#{channelNameById.get(m.channel_id) ?? m.channel_id}</span>
                  <span>·</span>
                  <span>{new Date(m.created_at * 1000).toLocaleString()}</span>
                </div>
                <div
                  className="mt-0.5 text-sm text-text-primary break-words"
                  /* The backend's FTS snippet() function emits <mark>...</mark>
                   * but also includes raw user input around the matches.
                   * We must sanitize it with DOMPurify to prevent XSS. */
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(m.snippet ?? escapeHtml(m.content.slice(0, 240))),
                  }}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
