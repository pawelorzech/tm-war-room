"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";

type Digest = Awaited<ReturnType<typeof api.chatOcDigest>>;

const REFRESH_MS = 300_000; // 5 min
const COLLAPSED_KEY = "oc-digest-collapsed";

/** OC 2.0 readiness digest pinned at the top of #general (or #leadership).
 *  Collapsible by member; preference persisted in localStorage. Hides
 *  itself when there are no OCs to report on. */
// Hard cap on how many chips appear per section when expanded — the dock
// width can't fit the full faction's traveling list, and the summary
// counts already tell the leader-level story.
const CHIP_CAP = 5;

export function OCDigestCard() {
  const [digest, setDigest] = useState<Digest | null>(null);
  // Default collapsed so the card never towers over the message list when
  // many members are traveling. Expand by member preference.
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    try {
      const pref = localStorage.getItem(COLLAPSED_KEY);
      if (pref === "0") setCollapsed(false);
    } catch { /* localStorage unavailable */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchIt = () => {
      api.chatOcDigest()
        .then(r => { if (!cancelled) setDigest(r); })
        .catch(() => { if (!cancelled) setDigest(null); });
    };
    fetchIt();
    const t = setInterval(fetchIt, REFRESH_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  if (!digest || !digest.active) return null;
  const counts = digest.counts ?? { ready: 0, waiting: 0, blocked_tools: 0, traveling: 0 };
  // Empty queue → hide the card; no signal to share.
  if (counts.ready === 0 && counts.waiting === 0) return null;

  const toggle = () => {
    setCollapsed(c => {
      const next = !c;
      try { localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };

  const readyShown = (digest.ready ?? []).slice(0, CHIP_CAP);
  const readyExtra = (digest.ready?.length ?? 0) - readyShown.length;
  const toolsShown = (digest.blocked_by_tool ?? []).slice(0, CHIP_CAP);
  const toolsExtra = (digest.blocked_by_tool?.length ?? 0) - toolsShown.length;
  const travelShown = (digest.traveling_members ?? []).slice(0, CHIP_CAP);
  const travelExtra = (digest.traveling_members?.length ?? 0) - travelShown.length;

  return (
    <div className="border-b border-torn-yellow/40 bg-torn-yellow/5 px-3 py-2 shrink-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-torn-yellow text-black font-bold uppercase shrink-0">
          OC 2.0
        </span>
        <span className="text-sm text-text-primary">
          <span className="text-torn-green font-medium">{counts.ready}</span> ready
          {" · "}
          <span className="text-text-muted">{counts.waiting} waiting</span>
          {counts.blocked_tools > 0 && (
            <>
              {" · "}
              <span className="text-torn-red">{counts.blocked_tools}</span> tool gap{counts.blocked_tools === 1 ? "" : "s"}
            </>
          )}
          {counts.traveling > 0 && (
            <>
              {" · "}
              <span className="text-torn-blue">{counts.traveling}</span> traveling
            </>
          )}
        </span>
        <button
          onClick={toggle}
          className="ml-auto text-text-muted hover:text-text-primary text-xs px-1"
          aria-label={collapsed ? "Expand OC digest" : "Collapse OC digest"}
        >
          {collapsed ? "▾" : "▴"}
        </button>
      </div>

      {!collapsed && (
        <div className="mt-2 flex flex-col gap-1.5">
          {readyShown.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-[10px] text-torn-green uppercase tracking-wide">Ready:</span>
              {readyShown.map(c => (
                <span key={c.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-torn-green/40 bg-bg-elevated text-[11px]">
                  <span className="text-text-primary">{c.name}</span>
                  <span className="text-text-muted">{c.filled}/{c.total}</span>
                </span>
              ))}
              {readyExtra > 0 && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-border bg-bg-elevated text-[11px] text-text-muted">
                  +{readyExtra} more
                </span>
              )}
            </div>
          )}
          {toolsShown.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-[10px] text-torn-red uppercase tracking-wide">Missing tools:</span>
              {toolsShown.map(t => (
                <span key={t.tool} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-torn-red/40 bg-bg-elevated text-[11px]">
                  <span className="text-text-primary">{t.tool}</span>
                  {t.count > 1 && <span className="text-text-muted">×{t.count}</span>}
                </span>
              ))}
              {toolsExtra > 0 && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-border bg-bg-elevated text-[11px] text-text-muted">
                  +{toolsExtra} more
                </span>
              )}
            </div>
          )}
          {travelShown.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-[10px] text-torn-blue uppercase tracking-wide">Traveling:</span>
              {travelShown.map(m => (
                <span key={m.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-torn-blue/40 bg-bg-elevated text-[11px]">
                  <span className="text-text-primary">{m.name}</span>
                  <span className="text-text-muted">{m.status_text}</span>
                </span>
              ))}
              {travelExtra > 0 && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-border bg-bg-elevated text-[11px] text-text-muted">
                  +{travelExtra} more
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
