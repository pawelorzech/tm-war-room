"use client";

export type EnemyStatusFilter = "okay" | "hospital";
export type EnemyActivityFilter = "online" | "idle" | "offline";
export type EnemyDiplomaticFilter = "off_limits_only" | "hide_off_limits";

export interface EnemyFilterState {
  status: EnemyStatusFilter[];
  activity: EnemyActivityFilter[];
  diplomatic: EnemyDiplomaticFilter | null;
}

export const EMPTY_ENEMY_FILTER: EnemyFilterState = {
  status: [],
  activity: [],
  diplomatic: null,
};

const STATUS_VALUES: readonly EnemyStatusFilter[] = ["okay", "hospital"];
const ACTIVITY_VALUES: readonly EnemyActivityFilter[] = [
  "online",
  "idle",
  "offline",
];
const DIPLOMATIC_VALUES: readonly EnemyDiplomaticFilter[] = [
  "off_limits_only",
  "hide_off_limits",
];

const STATUS_LABELS: Record<EnemyStatusFilter, string> = {
  okay: "Okay",
  hospital: "Hospital",
};
const ACTIVITY_LABELS: Record<EnemyActivityFilter, string> = {
  online: "Online",
  idle: "Idle",
  offline: "Offline",
};
const DIPLOMATIC_LABELS: Record<EnemyDiplomaticFilter, string> = {
  off_limits_only: "Off-limits only",
  hide_off_limits: "Hide off-limits",
};

interface EnemyFilterProps {
  value: EnemyFilterState;
  onChange: (value: EnemyFilterState) => void;
  showDiplomatic?: boolean;
}

function toggle<T extends string>(arr: readonly T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

export function EnemyFilter({ value, onChange, showDiplomatic = false }: EnemyFilterProps) {
  const hasAny =
    value.status.length > 0 ||
    value.activity.length > 0 ||
    value.diplomatic !== null;

  return (
    <div className="flex flex-col gap-1.5">
      <ChipRow
        label="Status"
        options={STATUS_VALUES}
        labels={STATUS_LABELS}
        selected={value.status}
        onToggle={(v) =>
          onChange({ ...value, status: toggle(value.status, v) })
        }
      />
      <ChipRow
        label="Activity"
        options={ACTIVITY_VALUES}
        labels={ACTIVITY_LABELS}
        selected={value.activity}
        onToggle={(v) =>
          onChange({ ...value, activity: toggle(value.activity, v) })
        }
        trailing={
          !showDiplomatic && hasAny ? (
            <button
              type="button"
              onClick={() => onChange(EMPTY_ENEMY_FILTER)}
              className="text-xs text-text-muted hover:text-torn-green transition-colors px-1.5 py-1"
            >
              Clear
            </button>
          ) : null
        }
      />
      {showDiplomatic ? (
        <ChipRow
          label="Diplomatic"
          options={DIPLOMATIC_VALUES}
          labels={DIPLOMATIC_LABELS}
          selected={value.diplomatic ? [value.diplomatic] : []}
          onToggle={(v) =>
            onChange({
              ...value,
              diplomatic: value.diplomatic === v ? null : v,
            })
          }
          trailing={
            hasAny ? (
              <button
                type="button"
                onClick={() => onChange(EMPTY_ENEMY_FILTER)}
                className="text-xs text-text-muted hover:text-torn-green transition-colors px-1.5 py-1"
              >
                Clear
              </button>
            ) : null
          }
        />
      ) : null}
    </div>
  );
}

interface ChipRowProps<T extends string> {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  selected: T[];
  onToggle: (v: T) => void;
  trailing?: React.ReactNode;
}

function ChipRow<T extends string>({
  label,
  options,
  labels,
  selected,
  onToggle,
  trailing,
}: ChipRowProps<T>) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-text-muted uppercase tracking-wider w-14 shrink-0">
        {label}
      </span>
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            aria-pressed={active}
            className={`text-xs px-2.5 py-1 rounded-md border font-medium transition-all active:scale-95 ${
              active
                ? "bg-torn-green/20 border-torn-green/30 text-torn-green"
                : "bg-bg-elevated border-border text-text-secondary hover:text-text-primary"
            }`}
          >
            {labels[opt]}
          </button>
        );
      })}
      {trailing ? <span className="ml-auto">{trailing}</span> : null}
    </div>
  );
}

export function applyEnemyFilter<
  T extends {
    id: number;
    last_action: { status: string };
    status: { state: string };
  },
>(
  members: T[],
  filter: EnemyFilterState,
  offLimitsIds?: Set<number>,
): T[] {
  const noStatus = filter.status.length === 0;
  const noActivity = filter.activity.length === 0;
  const noDiplomatic = filter.diplomatic === null;
  if (noStatus && noActivity && noDiplomatic) {
    return members;
  }
  return members.filter((m) => {
    if (filter.status.length > 0) {
      const s: EnemyStatusFilter | null =
        m.status.state === "Okay"
          ? "okay"
          : m.status.state === "Hospital"
            ? "hospital"
            : null;
      if (!s || !filter.status.includes(s)) return false;
    }
    if (filter.activity.length > 0) {
      const a = m.last_action.status.toLowerCase();
      if (
        a !== "online" &&
        a !== "idle" &&
        a !== "offline"
      ) {
        return false;
      }
      if (!filter.activity.includes(a as EnemyActivityFilter)) return false;
    }
    if (filter.diplomatic && offLimitsIds) {
      const flagged = offLimitsIds.has(m.id);
      if (filter.diplomatic === "off_limits_only" && !flagged) return false;
      if (filter.diplomatic === "hide_off_limits" && flagged) return false;
    }
    return true;
  });
}

function parseList<T extends string>(
  raw: string | null,
  allowed: readonly T[],
): T[] {
  if (!raw) return [];
  const out: T[] = [];
  for (const part of raw.split(",")) {
    const v = part.trim().toLowerCase();
    if ((allowed as readonly string[]).includes(v) && !out.includes(v as T)) {
      out.push(v as T);
    }
  }
  return out;
}

function parseSingle<T extends string>(
  raw: string | null,
  allowed: readonly T[],
): T | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  return (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

export function filterFromSearchParams(
  sp: URLSearchParams,
): EnemyFilterState {
  return {
    status: parseList(sp.get("status"), STATUS_VALUES),
    activity: parseList(sp.get("activity"), ACTIVITY_VALUES),
    diplomatic: parseSingle(sp.get("diplomatic"), DIPLOMATIC_VALUES),
  };
}

export function filterToSearchParams(
  filter: EnemyFilterState,
): URLSearchParams {
  const sp = new URLSearchParams();
  if (filter.status.length > 0) {
    sp.set("status", filter.status.join(","));
  }
  if (filter.activity.length > 0) {
    sp.set("activity", filter.activity.join(","));
  }
  if (filter.diplomatic) {
    sp.set("diplomatic", filter.diplomatic);
  }
  return sp;
}

export function describeFilter(filter: EnemyFilterState): string {
  const parts: string[] = [];
  for (const s of filter.status) parts.push(STATUS_LABELS[s]);
  for (const a of filter.activity) parts.push(ACTIVITY_LABELS[a]);
  if (filter.diplomatic) parts.push(DIPLOMATIC_LABELS[filter.diplomatic]);
  return parts.join(", ");
}
