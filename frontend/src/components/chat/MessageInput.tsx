"use client";

import { useState, useRef, useCallback } from "react";

interface Props {
  onSend: (content: string, mentions?: number[]) => void;
  onTyping: () => void;
  disabled?: boolean;
  placeholder?: string;
}

const MAX_LENGTH = 4000;

export function MessageInput({ onSend, onTyping, disabled, placeholder }: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const content = value.trim();
    if (!content || disabled) return;
    onSend(content);
    setValue("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
  };

  return (
    <div className="border-t border-border p-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? "You are muted" : placeholder || "Type a message... (Enter to send, Shift+Enter for newline)"}
          rows={1}
          className="flex-1 resize-none bg-bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-torn-green/50 disabled:opacity-50 disabled:cursor-not-allowed"
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
