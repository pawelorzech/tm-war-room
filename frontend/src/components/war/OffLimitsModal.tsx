"use client";

import { useEffect, useId, useRef, useState } from "react";

interface Props {
  mode: "add" | "edit";
  playerName: string;
  initialReason?: string;
  onSubmit: (reason: string) => Promise<void>;
  onCancel: () => void;
}

export function OffLimitsModal({ mode, playerName, initialReason = "", onSubmit, onCancel }: Props) {
  const [reason, setReason] = useState(initialReason);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => textareaRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
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
    setLoading(true);
    setError("");
    try {
      await onSubmit(reason.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setLoading(false);
    }
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
        <h3 id={titleId} className="text-sm font-bold text-text-primary mb-1">
          {mode === "add" ? "Flag as off-limits" : "Edit off-limit reason"}
        </h3>
        <p id={descriptionId} className="text-xs text-text-muted mb-3">
          <span className="text-text-secondary font-medium">{playerName}</span> {"—"} faction-wide flag for the current war. Other members will see this and get a confirmation modal before attacking.
        </p>
        <textarea
          ref={textareaRef}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. med-out — agreed not to re-hospitalize; dip with [Bombla]; family member"
          rows={3}
          maxLength={500}
          className="w-full bg-bg-surface border border-border rounded px-3 py-2 text-base sm:text-sm text-text-primary placeholder:text-text-muted mb-2 resize-none focus:outline-none focus:border-torn-green/50"
        />
        <div className="text-xs text-text-muted mb-3">Optional. Helps others understand why.</div>
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
            disabled={loading}
            className="px-3 py-1.5 text-sm bg-torn-green text-bg-primary rounded hover:bg-torn-green/90 disabled:opacity-30"
          >
            {loading ? "Saving..." : mode === "add" ? "Flag" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
