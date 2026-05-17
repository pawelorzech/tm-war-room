"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { api } from "@/lib/api-client";

interface Member {
  player_id: number;
  name: string;
}

interface Props {
  onSend: (content: string, mentions?: number[]) => void;
  onTyping: () => void;
  disabled?: boolean;
  placeholder?: string;
  members?: Member[];
}

const MAX_LENGTH = 4000;
const MAX_SUGGESTIONS = 5;

// Mirror of api/chat_commands.py _COMMAND_RE — slash + letter + word chars.
const SLASH_PREFIX_RE = /^\/([A-Za-z][A-Za-z0-9_-]*)?$/;

interface ChatCommand {
  name: string;
  description: string;
}

let _chatCommandsCache: { commands: ChatCommand[]; fetchedAt: number } | null = null;
const COMMAND_CACHE_TTL_MS = 60_000;

async function loadChatCommands(): Promise<ChatCommand[]> {
  const now = Date.now();
  if (_chatCommandsCache && now - _chatCommandsCache.fetchedAt < COMMAND_CACHE_TTL_MS) {
    return _chatCommandsCache.commands;
  }
  try {
    const r = await api.chatCommands();
    _chatCommandsCache = { commands: r.commands, fetchedAt: now };
    return r.commands;
  } catch {
    return _chatCommandsCache?.commands ?? [];
  }
}

function getMentionQuery(text: string, cursorPos: number): string | null {
  // Find the last @ before cursor
  const before = text.slice(0, cursorPos);
  const atIdx = before.lastIndexOf("@");
  if (atIdx === -1) return null;
  // Make sure there's no space between @ and cursor (mention must be contiguous)
  const fragment = before.slice(atIdx + 1);
  if (/\s/.test(fragment)) return null;
  return fragment;
}

function getSlashPrefix(text: string): string | null {
  const m = text.match(SLASH_PREFIX_RE);
  if (!m) return null;
  return m[1] ?? "";
}

export function MessageInput({ onSend, onTyping, disabled, placeholder, members = [] }: Props) {
  const [value, setValue] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Member[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [pendingMentions, setPendingMentions] = useState<number[]>([]);
  const [allCommands, setAllCommands] = useState<ChatCommand[]>([]);
  const [slashPrefix, setSlashPrefix] = useState<string | null>(null);
  const [cmdSelectedIdx, setCmdSelectedIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Pre-load the command list once so the first "/" feels instant.
  useEffect(() => {
    void loadChatCommands().then(setAllCommands);
  }, []);

  const cmdSuggestions = slashPrefix === null
    ? []
    : allCommands.filter(c => c.name.toLowerCase().startsWith(slashPrefix.toLowerCase()));

  // Update suggestions whenever query changes
  useEffect(() => {
    if (mentionQuery === null) {
      setSuggestions([]);
      setSelectedIdx(0);
      return;
    }
    const q = mentionQuery.toLowerCase();
    const matches = members
      .filter(m => m.name.toLowerCase().includes(q))
      .slice(0, MAX_SUGGESTIONS);
    setSuggestions(matches);
    setSelectedIdx(0);
  }, [mentionQuery, members]);

  const insertMention = useCallback((member: Member) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    const after = value.slice(cursor);
    const atIdx = before.lastIndexOf("@");
    // Replace from @ to cursor with @Name + space
    const newValue = before.slice(0, atIdx) + `@${member.name} ` + after;
    setValue(newValue);
    setPendingMentions(prev => prev.includes(member.player_id) ? prev : [...prev, member.player_id]);
    setMentionQuery(null);
    setSuggestions([]);
    // Restore focus + move cursor after inserted mention
    setTimeout(() => {
      if (ta) {
        const newCursor = atIdx + member.name.length + 2; // @Name + space
        ta.focus();
        ta.setSelectionRange(newCursor, newCursor);
      }
    }, 0);
  }, [value]);

  const handleSubmit = useCallback(() => {
    const content = value.trim();
    if (!content || disabled) return;

    // Auto-extract @mentions even if user didn't pick from autocomplete dropdown
    const byLower = new Map<string, number>();
    for (const m of members) byLower.set(m.name.toLowerCase(), m.player_id);
    const combined = new Set<number>(pendingMentions);
    const tokens = content.match(/@[\w-]+/g) ?? [];
    for (const t of tokens) {
      const pid = byLower.get(t.slice(1).toLowerCase());
      if (pid) combined.add(pid);
    }
    const finalMentions = Array.from(combined);

    onSend(content, finalMentions.length > 0 ? finalMentions : undefined);
    setValue("");
    setPendingMentions([]);
    setMentionQuery(null);
    setSuggestions([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSend, pendingMentions, members]);

  const acceptCommand = useCallback((cmd: ChatCommand) => {
    setValue(`/${cmd.name} `);
    setSlashPrefix(null);
    setCmdSelectedIdx(0);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (slashPrefix !== null && cmdSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCmdSelectedIdx(i => (i + 1) % cmdSuggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setCmdSelectedIdx(i => (i - 1 + cmdSuggestions.length) % cmdSuggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        acceptCommand(cmdSuggestions[cmdSelectedIdx] ?? cmdSuggestions[0]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashPrefix(null);
        return;
      }
    }
    if (suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx(i => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(suggestions[selectedIdx]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        setSuggestions([]);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    if (v.length > MAX_LENGTH) return;
    setValue(v);
    onTyping();
    // Auto-resize
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
    }
    // Detect mention query
    const cursor = e.target.selectionStart ?? v.length;
    setMentionQuery(getMentionQuery(v, cursor));
    // Detect slash-command prefix (input must START with "/<name>" — no spaces)
    const slash = getSlashPrefix(v);
    setSlashPrefix(slash);
    if (slash !== null) setCmdSelectedIdx(0);
  };

  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    setMentionQuery(getMentionQuery(ta.value, ta.selectionStart ?? ta.value.length));
  };

  return (
    <div className="border-t border-border p-3 relative shrink-0">
      {/* Slash-command autocomplete dropdown */}
      {slashPrefix !== null && cmdSuggestions.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 mb-1 bg-bg-surface border border-border rounded-lg shadow-lg overflow-hidden z-50">
          {cmdSuggestions.map((cmd, idx) => (
            <button
              key={cmd.name}
              type="button"
              onMouseDown={e => { e.preventDefault(); acceptCommand(cmd); }}
              className={`w-full text-left px-3 py-2 text-sm flex items-baseline gap-3 transition-colors ${
                idx === cmdSelectedIdx
                  ? "bg-bg-elevated text-text-primary"
                  : "text-text-primary hover:bg-bg-elevated"
              }`}
            >
              <span className="font-mono text-torn-blue font-medium">/{cmd.name}</span>
              <span className="text-[11px] text-text-muted">{cmd.description}</span>
            </button>
          ))}
        </div>
      )}
      {slashPrefix !== null && cmdSuggestions.length === 0 && (
        <div className="absolute bottom-full left-3 right-3 mb-1 bg-bg-surface border border-border rounded-lg shadow-lg overflow-hidden z-50 px-3 py-2 text-[11px] text-text-muted">
          No matching commands
        </div>
      )}
      {/* @mention autocomplete dropdown */}
      {suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute bottom-full left-3 right-3 mb-1 bg-bg-surface border border-border rounded-lg shadow-lg overflow-hidden z-50"
        >
          {suggestions.map((member, idx) => (
            <button
              key={member.player_id}
              type="button"
              onMouseDown={e => { e.preventDefault(); insertMention(member); }}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                idx === selectedIdx
                  ? "bg-bg-elevated text-text-primary"
                  : "text-text-primary hover:bg-bg-elevated"
              }`}
            >
              <span className="w-6 h-6 rounded-full bg-bg-elevated flex items-center justify-center text-xs font-bold text-torn-green shrink-0">
                {member.name.charAt(0).toUpperCase()}
              </span>
              <span className="font-medium">@{member.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onSelect={handleSelect}
          disabled={disabled}
          placeholder={disabled ? "You are muted" : placeholder || "Type a message... (Enter to send, Shift+Enter for newline)"}
          rows={1}
          className="flex-1 resize-none bg-bg-surface border border-border rounded-lg px-3 py-2 text-base sm:text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-torn-green/50 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className="px-3 py-2 bg-torn-green text-bg-primary text-sm font-medium rounded-lg hover:bg-torn-green/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
        >
          Send
        </button>
      </div>
      {value.length > MAX_LENGTH * 0.9 && (
        <div className="text-[11px] text-right mt-1 text-text-muted">
          <span className={value.length >= MAX_LENGTH ? "text-torn-red" : ""}>
            {value.length}/{MAX_LENGTH}
          </span>
        </div>
      )}
    </div>
  );
}
