"use client";

import React, { useState, useMemo, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { fmtCD, fmtNum } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { useWarOffLimits } from "@/hooks/useWarOffLimits";
import { EnemyCard } from "./EnemyCard";
import {
  EnemyFilter,
  applyEnemyFilter,
  filterFromSearchParams,
  filterToSearchParams,
  describeFilter,
} from "./EnemyFilter";
import type { EnemyFilterState } from "./EnemyFilter";
import { OffLimitsModal } from "./OffLimitsModal";
import { OffLimitsConfirmModal } from "./OffLimitsConfirmModal";
import type { EnemyResponse, EnemyMember, WarOffLimits } from "@/types/war";

type EnemySortCol =
  | "threat_score"
  | "name"
  | "level"
  | "state"
  | "xanax"
  | "atk_won";

interface SortState {
  col: EnemySortCol;
  asc: boolean;
}

interface EnemyTableProps {
  data: EnemyResponse | null;
  onLoadEnemy: (factionId: number) => void;
  warId: number | null;
}

function getEnemySortValue(m: EnemyMember, col: EnemySortCol): string | number {
  switch (col) {
    case "name":
      return m.name.toLowerCase();
    case "level":
      return m.level;
    case "threat_score":
      return m.threat_score;
    case "state":
      return m.status.state + m.last_action.status;
    case "xanax":
      return m.personal_stats?.xanax_taken ?? -1;
    case "atk_won":
      return m.personal_stats?.attacks_won ?? -1;
    default:
      return 0;
  }
}

const THREAT_COLORS: Record<string, string> = {
  easy: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/60 dark:text-green-400 dark:border-green-700/40",
  medium: "bg-yellow-100 text-yellow-900 border-yellow-300 dark:bg-yellow-900/60 dark:text-yellow-400 dark:border-yellow-700/40",
  hard: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/60 dark:text-red-400 dark:border-red-700/40",
  avoid: "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/60 dark:text-purple-400 dark:border-purple-700/40",
  unknown: "bg-bg-elevated text-text-muted border-border",
};

const THREAT_GLOW: Record<string, string> = {
  easy: "0 0 8px rgba(74, 222, 128, 0.15)",
  medium: "0 0 8px rgba(250, 204, 21, 0.15)",
  hard: "0 0 8px rgba(248, 113, 113, 0.15)",
  avoid: "0 0 8px rgba(192, 132, 252, 0.2)",
  unknown: "none",
};

type ModalState =
  | { kind: "add"; member: EnemyMember }
  | { kind: "edit"; entry: WarOffLimits; member: EnemyMember }
  | { kind: "confirm"; entry: WarOffLimits; member: EnemyMember }
  | null;

const EnemyTableRow = React.memo(function EnemyTableRow({
  member: m,
  hasBaseline,
  now,
  entry,
  canFlag,
  canEditEntry,
  handleAttackBlocked,
  handleRequestFlag,
  handleRequestEdit,
  handleRequestRemove,
}: {
  member: EnemyMember;
  hasBaseline: boolean;
  now: number;
  entry: WarOffLimits | null;
  canFlag: boolean;
  canEditEntry: boolean | null;
  handleAttackBlocked: (member: EnemyMember, entry: WarOffLimits) => void;
  handleRequestFlag: (member: EnemyMember) => void;
  handleRequestEdit: (entry: WarOffLimits, member: EnemyMember) => void;
  handleRequestRemove: (entry: WarOffLimits) => void;
}) {
  const ok = m.last_action.status !== "Offline" && m.status.state === "Okay";
  const isHosp = m.status.state === "Hospital";
  const st = m.status.state !== "Okay" ? m.status.state : m.last_action.status;
  const ps = m.personal_stats;
  const xr = ps ? `${fmtNum(ps.xanax_taken)}/${fmtNum(ps.refills)}` : "—";
  const aw = ps ? fmtNum(ps.attacks_won) : "—";
  const hospTime = isHosp && m.status.until ? ` (${fmtCD(m.status.until - now)})` : "";
  const dotColor = ok
    ? "bg-green-500 text-green-500"
    : isHosp
      ? "bg-yellow-500 text-yellow-500"
      : "bg-red-500 text-red-500";

  const tip = ps
    ? `Score: ${m.threat_score}/100\nXanax: ${ps.xanax_taken.toLocaleString()}\nRefills: ${ps.refills.toLocaleString()}\nSEs: ${ps.stat_enhancers_used}\nAtk won: ${ps.attacks_won.toLocaleString()}\nDef won: ${ps.defends_won.toLocaleString()}\nNW: $${fmtNum(ps.networth)}\nBest beaten: Lv${ps.highest_beaten}`
    : "No TornStats data";

  const threatLabel = m.threat_label || "unknown";
  const threatCell = hasBaseline ? (
    <span
      className={`rounded-md px-2 py-0.5 text-xs font-semibold border ${
        THREAT_COLORS[threatLabel] || THREAT_COLORS.unknown
      }`}
      title={tip}
      style={{ boxShadow: THREAT_GLOW[threatLabel] || THREAT_GLOW.unknown }}
    >
      {m.threat_label} {m.threat_score}
    </span>
  ) : (
    <span
      className={`rounded-md px-2 py-0.5 text-xs font-medium border cursor-pointer ${THREAT_COLORS.unknown}`}
      title="Register your API key to see threat levels"
    >
      add key
    </span>
  );

  return (
    <tr
      className={`border-b border-border-light hover:bg-bg-elevated/50 transition-colors group ${
        entry ? "bg-torn-red/[0.04]" : ""
      }`}
    >
      <td className="py-2 px-2">
        <span
          className={`w-2.5 h-2.5 rounded-full inline-block ${dotColor}`}
          style={ok || isHosp ? { boxShadow: "0 0 6px currentColor" } : undefined}
        />
      </td>
      <td className="py-2 px-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <a
            href={m.profile_url}
            target="_blank" rel="noopener noreferrer"
            className="text-text-primary hover:text-torn-green transition-colors"
          >
            {m.name}
          </a>
          {entry ? (
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold border bg-torn-red/15 text-torn-red border-torn-red/40"
              title={`Off-limits by ${entry.set_by_name}${entry.reason ? `: ${entry.reason}` : ""}`}
            >
              {"🚫"} {entry.set_by_name}
            </span>
          ) : null}
        </div>
      </td>
      <td className="py-2 px-2 text-text-muted">{m.level}</td>
      <td className="py-2 px-2">{threatCell}</td>
      <td className="py-2 px-2">
        {isHosp ? (
          <span className="text-torn-yellow font-mono text-xs">
            {st}
            {hospTime}
          </span>
        ) : ok ? (
          <span className="text-torn-green">{st}</span>
        ) : (
          <span className="text-text-muted">{st}</span>
        )}
      </td>
      <td className="py-2 px-2 text-text-muted">
        {m.last_action.relative}
      </td>
      <td className="py-2 px-2 text-text-muted font-mono text-xs">{xr}</td>
      <td className="py-2 px-2 text-text-muted font-mono text-xs">{aw}</td>
      <td className="py-2 px-2">
        <div className="flex gap-1.5 items-center">
          <a
            href={m.attack_url}
            target="_blank" rel="noopener noreferrer"
            className={`text-xs px-2.5 py-1 rounded-md font-semibold transition-all active:scale-95 ${
              isHosp
                ? "bg-bg-elevated text-text-muted border border-border"
                : entry
                  ? "bg-torn-red/15 text-torn-red border border-torn-red/40 hover:bg-torn-red/25"
                  : "bg-torn-green/20 text-torn-green border border-torn-green/30 hover:bg-torn-green/30 hover:shadow-[0_0_12px_rgba(63,185,80,0.15)]"
            }`}
            onClick={(e) => {
              if (entry) {
                e.preventDefault();
                handleAttackBlocked(m, entry);
              }
            }}
          >
            {isHosp ? "Hosp" : "Attack"}
          </a>
          <a
            href={m.stats_url}
            target="_blank" rel="noopener noreferrer"
            className="text-xs px-2.5 py-1 rounded-md bg-bg-elevated text-text-secondary border border-border hover:text-text-primary hover:border-border transition-colors"
          >
            Stats
          </a>
          {canFlag && !entry ? (
            <button
              type="button"
              onClick={() => handleRequestFlag(m)}
              className="text-xs px-2 py-1 rounded-md bg-bg-elevated text-text-muted border border-border hover:text-torn-red hover:border-torn-red/40 transition-colors"
              title="Flag as off-limits"
            >
              {"🚫"}
            </button>
          ) : null}
          {canEditEntry && entry ? (
            <>
              <button
                type="button"
                onClick={() => handleRequestEdit(entry, m)}
                className="text-xs px-2 py-1 rounded-md bg-bg-elevated text-text-muted border border-border hover:text-text-primary transition-colors"
                title="Edit off-limit reason"
              >
                {"✎"}
              </button>
              <button
                type="button"
                onClick={() => handleRequestRemove(entry)}
                className="text-xs px-2 py-1 rounded-md bg-bg-elevated text-text-muted border border-border hover:text-torn-red hover:border-torn-red/40 transition-colors"
                title="Remove off-limit"
              >
                {"✕"}
              </button>
            </>
          ) : null}
        </div>
      </td>
    </tr>
  );
});

export function EnemyTable({ data, onLoadEnemy, warId }: EnemyTableProps) {
  const [sort, setSort] = useState<SortState>({
    col: "threat_score",
    asc: true,
  });
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filter = useMemo<EnemyFilterState>(
    () => filterFromSearchParams(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const setFilter = useCallback(
    (next: EnemyFilterState) => {
      const qs = filterToSearchParams(next).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );
  const [factionInput, setFactionInput] = useState("");
  const [modal, setModal] = useState<ModalState>(null);

  const auth = useAuth();
  const isAdmin = auth.role === "admin" || auth.role === "superadmin";
  const offLimits = useWarOffLimits(warId);
  const canFlag = warId !== null && auth.playerId !== null;

  const now = Math.floor(Date.now() / 1000);

  const ms = useMemo(() => data?.members ?? [], [data?.members]);
  const offLimitsIds = useMemo(() => {
    const set = new Set<number>();
    for (const e of offLimits.entries) set.add(e.player_id);
    return set;
  }, [offLimits.entries]);

  const filtered = useMemo(
    () => applyEnemyFilter(ms, filter, offLimitsIds),
    [ms, filter, offLimitsIds],
  );

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const va = getEnemySortValue(a, sort.col);
      const vb = getEnemySortValue(b, sort.col);
      const cmp =
        typeof va === "string" && typeof vb === "string"
          ? va.localeCompare(vb)
          : (va as number) - (vb as number);
      return sort.asc ? cmp : -cmp;
    });
  }, [filtered, sort]);

  const handleRequestFlag = useCallback((member: EnemyMember) => {
    setModal({ kind: "add", member });
  }, []);
  const handleRequestEdit = useCallback((entry: WarOffLimits, member: EnemyMember) => {
    setModal({ kind: "edit", entry, member });
  }, []);
  const handleRequestRemove = useCallback(async (entry: WarOffLimits) => {
    if (!warId) return;
    if (!confirm(`Remove off-limit flag on ${entry.player_name}?`)) return;
    try {
      await offLimits.remove(entry.player_id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to remove");
    }
  }, [warId, offLimits]);
  const handleAttackBlocked = useCallback((member: EnemyMember, entry: WarOffLimits) => {
    setModal({ kind: "confirm", entry, member });
  }, []);

  if (!data?.faction) {
    return (
      <div className="space-y-3">
        <p className="text-text-secondary text-sm">
          No enemy faction loaded.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Faction ID"
            value={factionInput}
            onChange={(e) => setFactionInput(e.target.value)}
            className="bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text-primary w-40 focus:outline-none focus:border-torn-green/50 transition-colors"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const fid = parseInt(factionInput.trim());
                if (fid) onLoadEnemy(fid);
              }
            }}
          />
          <button
            onClick={() => {
              const fid = parseInt(factionInput.trim());
              if (fid) onLoadEnemy(fid);
            }}
            className="bg-torn-green/20 text-torn-green border border-torn-green/30 rounded-lg px-4 py-2 text-sm font-semibold hover:bg-torn-green/30 hover:shadow-[0_0_12px_rgba(63,185,80,0.15)] transition-all active:scale-95"
          >
            Load Enemy
          </button>
        </div>
      </div>
    );
  }

  const f = data.faction;
  const hasBaseline = data.threat_mode === "relative";

  let atk = 0,
    hosp = 0;
  for (const m of ms) {
    if (m.last_action.status !== "Offline" && m.status.state === "Okay") atk++;
    if (m.status.state === "Hospital") hosp++;
  }

  const toggleSort = (col: EnemySortCol) => {
    if (sort.col === col) {
      setSort({ col, asc: !sort.asc });
    } else {
      setSort({ col, asc: col === "name" });
    }
  };

  const SortArrow = ({ col }: { col: EnemySortCol }) =>
    sort.col === col ? (
      <span className="ml-1 text-torn-green">
        {sort.asc ? "▲" : "▼"}
      </span>
    ) : null;

  const filterDescription = describeFilter(filter);
  const filterNote = filterDescription
    ? ` (showing ${filtered.length} — ${filterDescription})`
    : "";

  const threatInfo =
    data.threat_mode === "relative"
      ? `Threat relative to ${data.threat_baseline}`
      : "Register your API key to see personalized threat levels";

  const offLimitsCount = offLimits.entries.length;

  return (
    <div>
      {/* Summary */}
      <div className="text-sm text-text-secondary mb-1">
        <a
          href={`https://www.torn.com/factions.php?step=profile&ID=${f.id}`}
          target="_blank" rel="noopener noreferrer"
          className="font-bold text-text-primary hover:text-torn-green transition-colors"
        >
          {f.name}
        </a>{" "}
        [{f.tag}] {"—"} {f.rank_name} ({f.wins}W) {"—"}{" "}
        <span className="text-torn-green font-medium">{atk}</span> attackable,{" "}
        <span className="text-torn-yellow font-medium">{hosp}</span> hospital,{" "}
        {ms.length} total{filterNote}
        {warId && offLimitsCount > 0 ? (
          <>
            {" "}
            {"—"}{" "}
            <span className="text-torn-red font-medium">
              {"🚫"} {offLimitsCount} off-limits
            </span>
          </>
        ) : null}
      </div>
      <div className="text-xs text-text-muted mb-3">{threatInfo}</div>

      {/* Filter + sort controls */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <EnemyFilter value={filter} onChange={setFilter} showDiplomatic={!!warId} />

        {/* Mobile sort dropdown */}
        <div className="lg:hidden flex items-center gap-1.5">
          <select
            className="bg-bg-elevated border border-border rounded-lg px-2 py-1.5 text-sm text-text-primary appearance-none focus:outline-none focus:border-torn-green/50 transition-colors"
            value={sort.col}
            onChange={(e) => {
              const col = e.target.value as EnemySortCol;
              if (sort.col === col) {
                setSort({ col, asc: !sort.asc });
              } else {
                setSort({ col, asc: col === "name" });
              }
            }}
          >
            <option value="threat_score">Sort: Threat</option>
            <option value="name">Sort: Name</option>
            <option value="level">Sort: Level</option>
            <option value="state">Sort: Status</option>
            <option value="xanax">Sort: Xanax</option>
            <option value="atk_won">Sort: Atk Won</option>
          </select>
          <button
            className={`border rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all active:scale-95 ${
              sort.asc
                ? "bg-bg-elevated border-border text-text-primary"
                : "bg-torn-green/10 border-torn-green/30 text-torn-green"
            }`}
            onClick={() => setSort({ ...sort, asc: !sort.asc })}
            title={sort.asc ? "Ascending" : "Descending"}
          >
            {sort.asc ? "▲" : "▼"}
          </button>
        </div>

        <span className="text-xs text-text-muted ml-auto font-mono">
          {filtered.length} shown
        </span>
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-2">
        {sorted.map((m) => {
          const entry = offLimits.byPlayer.get(m.id) ?? null;
          return (
            <EnemyCard
              key={m.id}
              member={m}
              hasBaseline={hasBaseline}
              offLimits={entry}
              canFlag={canFlag}
              isMyEntry={entry?.set_by === auth.playerId}
              isAdmin={isAdmin}
              onRequestFlag={handleRequestFlag}
              onRequestEdit={(e) => handleRequestEdit(e, m)}
              onRequestRemove={handleRequestRemove}
              onAttackBlocked={handleAttackBlocked}
            />
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
              <th className="py-2.5 px-2 w-6"></th>
              <th
                className="py-2.5 px-2 cursor-pointer hover:text-text-primary transition-colors select-none"
                onClick={() => toggleSort("name")}
              >
                Name
                <SortArrow col="name" />
              </th>
              <th
                className="py-2.5 px-2 cursor-pointer hover:text-text-primary transition-colors select-none"
                onClick={() => toggleSort("level")}
              >
                Lvl
                <SortArrow col="level" />
              </th>
              <th
                className="py-2.5 px-2 cursor-pointer hover:text-text-primary transition-colors select-none"
                onClick={() => toggleSort("threat_score")}
              >
                Threat
                <SortArrow col="threat_score" />
              </th>
              <th
                className="py-2.5 px-2 cursor-pointer hover:text-text-primary transition-colors select-none"
                onClick={() => toggleSort("state")}
              >
                Status
                <SortArrow col="state" />
              </th>
              <th className="py-2.5 px-2">Last Action</th>
              <th
                className="py-2.5 px-2 cursor-pointer hover:text-text-primary transition-colors select-none"
                onClick={() => toggleSort("xanax")}
              >
                Xan/Ref
                <SortArrow col="xanax" />
              </th>
              <th
                className="py-2.5 px-2 cursor-pointer hover:text-text-primary transition-colors select-none"
                onClick={() => toggleSort("atk_won")}
              >
                Atk Won
                <SortArrow col="atk_won" />
              </th>
              <th className="py-2.5 px-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => {
              const entry = offLimits.byPlayer.get(m.id) ?? null;
              const isMyEntry = entry?.set_by === auth.playerId;
              const canEditEntry = entry && (isMyEntry || isAdmin);

              return (
                <EnemyTableRow
                  key={m.id}
                  member={m}
                  hasBaseline={hasBaseline}
                  now={now}
                  entry={entry}
                  canFlag={canFlag}
                  canEditEntry={canEditEntry}
                  handleAttackBlocked={handleAttackBlocked}
                  handleRequestFlag={handleRequestFlag}
                  handleRequestEdit={handleRequestEdit}
                  handleRequestRemove={handleRequestRemove}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {modal?.kind === "add" ? (
        <OffLimitsModal
          mode="add"
          playerName={modal.member.name}
          onCancel={() => setModal(null)}
          onSubmit={async (reason) => {
            await offLimits.add(modal.member.id, modal.member.name, reason);
            setModal(null);
          }}
        />
      ) : null}
      {modal?.kind === "edit" ? (
        <OffLimitsModal
          mode="edit"
          playerName={modal.member.name}
          initialReason={modal.entry.reason}
          onCancel={() => setModal(null)}
          onSubmit={async (reason) => {
            await offLimits.update(modal.entry.player_id, reason);
            setModal(null);
          }}
        />
      ) : null}
      {modal?.kind === "confirm" ? (
        <OffLimitsConfirmModal
          entry={modal.entry}
          attackUrl={modal.member.attack_url}
          onCancel={() => setModal(null)}
          onConfirm={() => setModal(null)}
        />
      ) : null}
    </div>
  );
}
