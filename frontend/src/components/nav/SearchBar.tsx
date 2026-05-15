"use client";

import { AppIcon } from "@/components/ui/AppIcon";

interface SearchBarProps {
  onOpen: () => void;
}

export function SearchBar({ onOpen }: SearchBarProps) {
  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center gap-2 mx-3 px-3 py-1.5 text-xs text-text-muted bg-bg-primary border border-border-light rounded-md hover:border-border hover:text-text-secondary transition-all duration-200"
      style={{ width: "calc(100% - 24px)" }}
    >
      <AppIcon name="search" size={15} className="text-text-muted" />
      <span className="flex-1 text-left">Search...</span>
      <kbd className="hidden sm:inline text-[9px] bg-bg-elevated px-1.5 py-0.5 rounded border border-border-light font-mono">
        ⌘K
      </kbd>
    </button>
  );
}
