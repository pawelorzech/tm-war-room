'use client';

import { useMemo } from 'react';
import type { CompanyEmployee, TrainsAlertRow } from '@/types/company-director';

interface Props {
  employees: [string, CompanyEmployee][];
  alerts: TrainsAlertRow[];
  onToggle: (target_player_id: number, enabled: boolean, threshold_days?: number) => Promise<void>;
}

export function TrainsAlertConfig({ employees, alerts, onToggle }: Props) {
  const alertedIds = useMemo(() => new Set(alerts.map((a) => a.target_player_id)), [alerts]);

  if (employees.length === 0) return null;

  return (
    <section className="bg-bg-card border border-text-secondary/15 rounded-xl p-3 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">Unused trains alerts</h3>
        <p className="text-[11px] text-text-muted mt-0.5">
          Ping these employees if your company has training credits sitting unused for 3+ days.
          Delivered via in-app notifications (and push if they enabled it in Settings).
        </p>
      </div>
      <ul className="space-y-1">
        {employees.map(([id, e]) => {
          const pid = Number(id);
          const enabled = alertedIds.has(pid);
          return (
            <li
              key={id}
              className="flex items-center justify-between gap-2 text-xs border border-text-secondary/10 rounded px-2 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium text-text-primary truncate">{e.name}</div>
                <div className="text-[10px] text-text-muted">
                  {e.position} · eff {e.effectiveness?.total ?? 0}
                </div>
              </div>
              <button
                onClick={() => onToggle(pid, !enabled)}
                className={`px-2 py-1 text-[10px] uppercase tracking-wide rounded font-semibold transition-colors ${
                  enabled
                    ? 'bg-torn-green/20 text-torn-green hover:bg-torn-green/30'
                    : 'bg-bg-elevated text-text-muted hover:text-text-secondary'
                }`}
              >
                {enabled ? 'Alerting' : 'Off'}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
