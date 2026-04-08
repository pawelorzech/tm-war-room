"use client";

import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import type { Thread } from "@/types/chat";

interface Props {
  channelId: number;
  onCreated: (thread: Thread) => void;
  onCancel: () => void;
}

export function CreateThreadDialog({ channelId, onCreated, onCancel }: Props) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLFormElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => titleInputRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
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
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [onCancel]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setLoading(true);
    setError("");
    try {
      const thread = await api.chatCreateThread(channelId, title.trim(), content.trim());
      onCreated(thread);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create topic");
    }
    setLoading(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <form
        ref={dialogRef}
        onSubmit={handleSubmit}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="bg-bg-card border border-border rounded-lg p-4 w-full max-w-lg"
      >
        <h3 id={titleId} className="text-sm font-bold text-text-primary mb-3">New Topic</h3>
        <p id={descriptionId} className="sr-only">
          Create a new discussion thread by providing a title and the opening message.
        </p>
        <input
          ref={titleInputRef}
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Topic title"
          className="w-full bg-bg-surface border border-border rounded px-3 py-2 text-base sm:text-sm text-text-primary placeholder:text-text-muted mb-2 focus:outline-none focus:border-torn-green/50"
        />
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="What do you want to discuss?"
          rows={4}
          className="w-full bg-bg-surface border border-border rounded px-3 py-2 text-base sm:text-sm text-text-primary placeholder:text-text-muted mb-2 resize-none focus:outline-none focus:border-torn-green/50"
        />
        {error && <div className="text-torn-red text-xs mb-2">{error}</div>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !title.trim() || !content.trim()}
            className="px-3 py-1.5 text-sm bg-torn-green text-bg-primary rounded hover:bg-torn-green/90 disabled:opacity-30"
          >
            {loading ? "Creating..." : "Create Topic"}
          </button>
        </div>
      </form>
    </div>
  );
}
