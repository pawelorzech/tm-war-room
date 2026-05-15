"use client";

import { useEffect, useId, useRef } from "react";
import type { WarOffLimits } from "@/types/war";

interface Props {
  entry: WarOffLimits;
  attackUrl: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function OffLimitsConfirmModal({ entry, attackUrl, onCancel, onConfirm }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => cancelRef.current?.focus());

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

  const handleAttackAnyway = () => {
    onConfirm();
    window.open(attackUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="bg-bg-card border border-torn-red/40 rounded-lg p-4 w-full max-w-md"
      >
        <h3 id={titleId} className="text-sm font-bold text-torn-red mb-2">
          {"⚠"} Off-limits agreement
        </h3>
        <p id={descriptionId} className="text-sm text-text-primary mb-2">
          <span className="font-semibold">{entry.player_name}</span> is flagged as off-limits by{" "}
          <span className="font-semibold">{entry.set_by_name}</span>.
        </p>
        {entry.reason ? (
          <div className="bg-bg-surface border border-border rounded px-3 py-2 text-xs text-text-secondary mb-3">
            {entry.reason}
          </div>
        ) : (
          <div className="text-xs text-text-muted mb-3">No reason provided.</div>
        )}
        <p className="text-xs text-text-muted mb-3">
          Attacking will likely break the agreement. Continue?
        </p>
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm bg-bg-elevated border border-border rounded text-text-primary hover:bg-bg-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAttackAnyway}
            className="px-3 py-1.5 text-sm bg-torn-red/20 border border-torn-red/40 text-torn-red rounded hover:bg-torn-red/30"
          >
            Attack anyway
          </button>
        </div>
      </div>
    </div>
  );
}
