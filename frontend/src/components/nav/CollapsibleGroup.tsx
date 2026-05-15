// frontend/src/components/nav/CollapsibleGroup.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ContextMenu } from "./ContextMenu";
import { isNavItemActive, type NavGroup } from "@/lib/nav-data";
import { AppIcon } from "@/components/ui/AppIcon";

interface CollapsibleGroupProps {
  group: NavGroup;
  isPinned: (href: string) => boolean;
  isFull: () => boolean;
  onPin: (href: string) => void;
  onUnpin: (href: string) => void;
  showVersionBadge?: boolean;
}

interface MenuState {
  x: number;
  y: number;
  href: string;
}

export function CollapsibleGroup({
  group,
  isPinned,
  isFull,
  onPin,
  onUnpin,
  showVersionBadge = false,
}: CollapsibleGroupProps) {
  const pathname = usePathname();
  const hasActivePage = group.items.some((item) => pathname.startsWith(item.href));
  const [open, setOpen] = useState(hasActivePage);
  const [menu, setMenu] = useState<MenuState | null>(null);

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
        <span
          className="text-[9px] transition-transform duration-200"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        >
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
            const active = isNavItemActive(pathname, item.href);
            const pinned = isPinned(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, href: item.href });
                }}
                className={`group/item flex items-center gap-2 px-4 py-1.5 text-sm transition-all duration-200 ${
                  active
                    ? "border-l-2 border-torn-green bg-torn-green/10 text-text-primary shadow-[inset_3px_0_8px_-4px_rgba(63,185,80,0.25)]"
                    : "border-l-2 border-transparent hover:bg-bg-elevated hover:text-text-primary hover:border-border text-text-secondary"
                }`}
              >
                <AppIcon name={item.icon} size={16} />
                <span className="flex-1">{item.label}</span>
                {showVersionBadge && item.href === "/changelog" && (
                  <span className="text-[9px] font-bold uppercase bg-torn-green/20 text-torn-green px-1.5 py-0.5 rounded-full">
                    NEW
                  </span>
                )}
                <button
	                  onClick={(e) => {
	                    e.preventDefault();
	                    e.stopPropagation();
	                    if (pinned) onUnpin(item.href);
	                    else onPin(item.href);
	                  }}
                  className={`text-[10px] transition-opacity duration-150 ${
                    pinned
                      ? "opacity-40 hover:opacity-70"
                      : "opacity-0 group-hover/item:opacity-30 hover:!opacity-70"
                  }`}
                  title={pinned ? "Unpin" : "Pin to top"}
                >
                  <AppIcon name="pin" size={13} />
                </button>
              </Link>
            );
          })}
        </div>
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          isPinned={isPinned(menu.href)}
          isFull={isFull()}
          onPin={() => onPin(menu.href)}
          onUnpin={() => onUnpin(menu.href)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
