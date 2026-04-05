// frontend/src/components/nav/CollapsibleGroup.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavGroup } from "@/lib/nav-data";

interface CollapsibleGroupProps {
  group: NavGroup;
}

export function CollapsibleGroup({ group }: CollapsibleGroupProps) {
  const pathname = usePathname();
  const hasActivePage = group.items.some((item) => pathname.startsWith(item.href));
  const [open, setOpen] = useState(hasActivePage);

  // Auto-expand when navigating to a page in this group
  useEffect(() => {
    if (hasActivePage) setOpen(true);
  }, [hasActivePage]);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted hover:text-text-secondary transition-colors duration-200"
      >
        <span className="text-[9px] transition-transform duration-200" style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>
          ▶
        </span>
        <span>{group.label}</span>
        <span className="ml-auto text-[9px] bg-bg-elevated px-1.5 py-0.5 rounded-full">
          {group.items.length}
        </span>
      </button>

      {open && (
        <div
          className="overflow-hidden"
          style={{ animation: "tm-expand 200ms ease-out" }}
        >
          {group.items.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-4 py-1.5 text-sm transition-all duration-200 ${
                  active
                    ? "border-l-2 border-torn-green bg-torn-green/10 text-text-primary shadow-[inset_3px_0_8px_-4px_rgba(63,185,80,0.25)]"
                    : "border-l-2 border-transparent hover:bg-bg-elevated hover:text-text-primary hover:border-border text-text-secondary"
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
