"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";

type Assist = Awaited<ReturnType<typeof api.chatGetAssist>>;

const REFRESH_MS = 10_000;

const STATUS_COLOR: Record<string, string> = {
  Okay: "text-torn-green",
  Hospital: "text-torn-red",
  Jail: "text-torn-red",
  Traveling: "text-torn-blue",
  Abroad: "text-torn-blue",
  Federal: "text-torn-red",
};

interface Props {
  assistId: number;
  selfId: number | null;
}

/** Pinned chain-assist coordination card.
 *
 *  Posts as a bot message via `/chain target <ID>`. Each card displays:
 *
 *  - the target with their current Torn status (poll-refreshed)
 *  - the list of hitters who joined
 *  - a Join button + Attack button (deep-link)
 *  - a back-up indicator when the target leaves hospital
 */
export function ChainAssistCard({ assistId, selfId }: Props) {
  const [assist, setAssist] = useState<Assist | null>(null);
  const [joining, setJoining] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.chatGetAssist(assistId)
      .then(setAssist)
      .catch(err => setError(err instanceof Error ? err.message : "Failed to load assist"));
  }, [assistId]);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  if (error && !assist) {
    return (
      <div className="mt-1 px-2 py-1 rounded border border-torn-red/40 bg-bg-elevated text-[11px] text-torn-red">
        Chain assist #{assistId}: {error}
      </div>
    );
  }
  if (!assist) {
    return (
      <div className="mt-1 px-2 py-1 rounded border border-border bg-bg-elevated text-[11px] text-text-muted">
        Loading chain assist…
      </div>
    );
  }

  const closed = assist.ended_at !== null;
  const isLeader = selfId != null && selfId === assist.started_by;
  const alreadyHitting = selfId != null && assist.hitters.some(h => h.id === selfId);
  const statusClass = STATUS_COLOR[assist.target_status_state] ?? "text-text-muted";
  const attackUrl = `https://www.torn.com/page.php?sid=attack&user2ID=${assist.target_id}`;
  const profileUrl = `https://www.torn.com/profiles.php?XID=${assist.target_id}`;

  const handleJoin = async () => {
    if (joining || closed) return;
    setJoining(true);
    try {
      const next = await api.chatJoinAssist(assistId);
      setAssist(prev => (prev ? { ...prev, hitters: next.hitters, ended_at: next.ended_at } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Join failed");
    } finally {
      setJoining(false);
    }
  };

  const handleEnd = async () => {
    if (ending || closed) return;
    setEnding(true);
    try {
      await api.chatEndAssist(assistId);
      setAssist(prev => (prev ? { ...prev, ended_at: Math.floor(Date.now() / 1000) } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "End failed");
    } finally {
      setEnding(false);
    }
  };

  return (
    <div className={`mt-1 rounded border bg-bg-elevated ${closed ? "border-border" : "border-torn-red/40"} overflow-hidden`}>
      <div className="px-2 py-1.5 flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] px-1.5 rounded font-bold uppercase ${closed ? "bg-text-muted/30 text-text-muted" : "bg-torn-red text-white"}`}>
          {closed ? "Closed" : "Chain"}
        </span>
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-text-primary hover:underline truncate"
        >
          {assist.target_name || `Player ${assist.target_id}`}
        </a>
        <span className={`text-[11px] ${statusClass}`}>
          · {assist.target_status_state || "?"}
        </span>
        <span className="text-[11px] text-text-muted">
          · led by {assist.started_by_name || `#${assist.started_by}`}
        </span>
        {!closed && (
          <a
            href={attackUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-[11px] font-medium text-torn-red px-2 py-0.5 rounded hover:bg-torn-red/10 transition-colors"
          >
            Attack
          </a>
        )}
      </div>
      <div className="px-2 pb-1.5 flex items-center gap-1.5 flex-wrap">
        {assist.hitters.length === 0 ? (
          <span className="text-[11px] text-text-muted italic">No one's joined yet.</span>
        ) : (
          assist.hitters.map(h => (
            <span
              key={h.id}
              className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-torn-green/10 text-torn-green text-[11px]"
            >
              {h.name}
            </span>
          ))
        )}
        {!closed && !alreadyHitting && (
          <button
            onClick={handleJoin}
            disabled={joining}
            className="ml-1 text-[11px] px-2 py-0.5 rounded bg-torn-green text-white hover:bg-torn-green/80 disabled:opacity-50"
          >
            {joining ? "Joining…" : "I'm hitting"}
          </button>
        )}
        {!closed && isLeader && (
          <button
            onClick={handleEnd}
            disabled={ending}
            className="ml-auto text-[11px] text-text-muted hover:text-torn-red px-2 py-0.5 rounded disabled:opacity-50"
          >
            {ending ? "Closing…" : "End"}
          </button>
        )}
      </div>
    </div>
  );
}

/** Regex that picks out an assist id from a bot message body. The bot
 *  posts ``:chain-assist:<id>: <human readable summary>`` — frontend
 *  matches the marker and replaces it with the card. */
export const CHAIN_ASSIST_MARKER_RE = /^:chain-assist:(\d+):/;
