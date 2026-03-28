"use client";

export type EnemyFilterValue =
  | "all"
  | "okay"
  | "online"
  | "idle"
  | "offline"
  | "hospital";

interface EnemyFilterProps {
  value: EnemyFilterValue;
  onChange: (value: EnemyFilterValue) => void;
}

const OPTIONS: { value: EnemyFilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "okay", label: "Attackable" },
  { value: "online", label: "Online" },
  { value: "idle", label: "Idle" },
  { value: "offline", label: "Offline" },
  { value: "hospital", label: "Hospital" },
];

export function EnemyFilter({ value, onChange }: EnemyFilterProps) {
  return (
    <select
      className="bg-bg-elevated border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary appearance-none focus:outline-none focus:border-torn-green/50 transition-colors"
      value={value}
      onChange={(e) => onChange(e.target.value as EnemyFilterValue)}
    >
      {OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export function applyEnemyFilter<
  T extends {
    last_action: { status: string };
    status: { state: string };
  },
>(members: T[], filter: EnemyFilterValue): T[] {
  if (filter === "all") return members;
  return members.filter((m) => {
    switch (filter) {
      case "online":
        return m.last_action.status === "Online";
      case "idle":
        return m.last_action.status === "Idle";
      case "offline":
        return m.last_action.status === "Offline";
      case "hospital":
        return m.status.state === "Hospital";
      case "okay":
        return (
          m.status.state === "Okay" && m.last_action.status !== "Offline"
        );
      default:
        return true;
    }
  });
}
