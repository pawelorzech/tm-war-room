'use client';

import { useState } from 'react';
import type {
  WeeklyComparisonResponse,
  PinnedWeek,
  RankedCompanyRow,
} from '@/types/company-director';

function formatMoney(n: number | undefined | null): string {
  if (n == null) return '$—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface Props {
  comparison: WeeklyComparisonResponse | null;
  comparisonLoading: boolean;
  pinned: PinnedWeek[];
  scope: 'same_type' | 'all';
  onScopeChange: (s: 'same_type' | 'all') => void;
  onPinCurrent: (label: string, note?: string) => Promise<void>;
  onUnpin: (id: number) => Promise<void>;
  onReload: () => void;
}

export function WeeklyComparisonView({
  comparison,
  comparisonLoading,
  pinned,
  scope,
  onScopeChange,
  onPinCurrent,
  onUnpin,
  onReload,
}: Props) {
  const [pinLabel, setPinLabel] = useState('');
  const [pinNote, setPinNote] = useState('');
  const [pinning, setPinning] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  if (comparisonLoading && !comparison) {
    return <div className="text-text-muted text-sm">Loading comparison…</div>;
  }
  if (!comparison) {
    return (
      <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-4 text-center text-text-muted text-sm">
        <p>No comparison data yet.</p>
        <button
          onClick={onReload}
          className="mt-2 px-3 py-1.5 text-xs rounded-lg bg-torn-green/20 text-torn-green hover:bg-torn-green/30"
        >
          Load comparison
        </button>
      </div>
    );
  }

  const { ranked, viewer_company_id, viewer_rank, viewer_snapshot, viewer_weekly_sales,
          week_start_ts, week_end_ts, week_label, tracked_total } = comparison;

  const doPin = async () => {
    if (!pinLabel.trim()) {
      setPinError('Label required');
      return;
    }
    setPinning(true);
    setPinError(null);
    try {
      await onPinCurrent(pinLabel.trim(), pinNote.trim() || undefined);
      setPinLabel('');
      setPinNote('');
    } catch (e) {
      setPinError(e instanceof Error ? e.message : 'Failed to pin');
    } finally {
      setPinning(false);
    }
  };

  const alreadyPinned = pinned.some((p) => p.week_start_ts === week_start_ts);

  return (
    <div className="space-y-5">
      {/* Header + scope switcher */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Weekly comparison</h2>
          <div className="text-xs text-text-muted mt-1">
            <strong className="text-text-secondary">{week_label}</strong> ·{' '}
            {formatDate(week_start_ts)} → {formatDate(week_end_ts)} · anchor Mon 18:00 TCT
          </div>
          <p className="text-[10px] text-text-muted mt-0.5">
            Tracked companies: <strong>{tracked_total}</strong> · rivals&apos; numbers = Torn&apos;s public rolling 7-day
          </p>
        </div>

        <div className="flex gap-1 text-xs">
          {(['same_type', 'all'] as const).map((s) => (
            <button
              key={s}
              onClick={() => onScopeChange(s)}
              className={`px-2.5 py-1 rounded transition-colors ${
                scope === s
                  ? 'bg-torn-green/20 text-torn-green'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {s === 'same_type' ? 'My type' : 'All class-10'}
            </button>
          ))}
        </div>
      </div>

      {/* Own stats card */}
      <section className="bg-bg-card border border-torn-green/30 rounded-xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-text-primary">Your week</h3>
          {viewer_rank != null && (
            <span className="text-[11px] uppercase tracking-wide bg-torn-green/20 text-torn-green px-2 py-0.5 rounded-full font-semibold">
              Rank #{viewer_rank}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="bg-bg-elevated rounded px-2 py-1.5">
            <div className="text-text-muted">Anchored sales (this week)</div>
            <div className="text-text-primary font-semibold">
              {formatMoney(viewer_weekly_sales?.total_worth ?? null)}
            </div>
            <div className="text-[10px] text-text-muted">
              {viewer_weekly_sales?.total_amount.toLocaleString() ?? 0} units
            </div>
          </div>
          <div className="bg-bg-elevated rounded px-2 py-1.5">
            <div className="text-text-muted">Rolling weekly income (Torn)</div>
            <div className="text-text-primary font-semibold">
              {formatMoney(viewer_snapshot?.weekly_income ?? null)}
            </div>
            <div className="text-[10px] text-text-muted">
              {viewer_snapshot?.weekly_customers?.toLocaleString() ?? 0} customers
            </div>
          </div>
          <div className="bg-bg-elevated rounded px-2 py-1.5">
            <div className="text-text-muted">Daily income</div>
            <div className="text-text-primary font-semibold">
              {formatMoney(viewer_snapshot?.daily_income ?? null)}
            </div>
          </div>
          <div className="bg-bg-elevated rounded px-2 py-1.5">
            <div className="text-text-muted">Staffing</div>
            <div className="text-text-primary font-semibold">
              {viewer_snapshot
                ? `${viewer_snapshot.employees_hired ?? 0} / ${viewer_snapshot.employees_capacity ?? 0}`
                : '—'}
            </div>
          </div>
        </div>

        {viewer_weekly_sales && viewer_weekly_sales.products.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-text-secondary hover:text-torn-green">
              Product breakdown ({viewer_weekly_sales.products.length})
            </summary>
            <table className="w-full mt-2 text-xs">
              <thead>
                <tr className="text-text-muted border-b border-text-secondary/10">
                  <th className="py-1 text-left">Product</th>
                  <th className="py-1 text-right">Sold</th>
                  <th className="py-1 text-right">Worth</th>
                </tr>
              </thead>
              <tbody>
                {viewer_weekly_sales.products
                  .slice()
                  .sort((a, b) => b.worth - a.worth)
                  .map((p) => (
                    <tr key={p.product_name}>
                      <td className="py-0.5 text-text-secondary">{p.product_name}</td>
                      <td className="py-0.5 text-right text-text-secondary">
                        {p.amount.toLocaleString()}
                      </td>
                      <td className="py-0.5 text-right text-text-primary">{formatMoney(p.worth)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </details>
        )}
      </section>

      {/* Pin this week */}
      <section className="bg-bg-card border border-text-secondary/15 rounded-xl p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Pin this week</h3>
            <p className="text-[11px] text-text-muted mt-0.5">
              Saves a bookmark you can overlay later (e.g. compare next Halloween to this one).
            </p>
          </div>
          {alreadyPinned && (
            <span className="text-[10px] uppercase tracking-wide bg-torn-green/20 text-torn-green px-2 py-0.5 rounded-full">
              Pinned
            </span>
          )}
        </div>
        {!alreadyPinned && (
          <div className="flex flex-wrap gap-2 items-end">
            <input
              type="text"
              value={pinLabel}
              onChange={(e) => setPinLabel(e.target.value)}
              placeholder="Label (e.g. Halloween 2025)"
              maxLength={80}
              className="flex-1 min-w-[180px] bg-bg-elevated border border-text-secondary/20 rounded px-2 py-1 text-sm"
            />
            <input
              type="text"
              value={pinNote}
              onChange={(e) => setPinNote(e.target.value)}
              placeholder="Note (optional)"
              maxLength={500}
              className="flex-1 min-w-[180px] bg-bg-elevated border border-text-secondary/20 rounded px-2 py-1 text-sm"
            />
            <button
              onClick={doPin}
              disabled={pinning || !pinLabel.trim()}
              className="px-3 py-1.5 text-xs rounded-lg bg-torn-green/20 text-torn-green hover:bg-torn-green/30 disabled:opacity-50 whitespace-nowrap"
            >
              {pinning ? 'Pinning…' : 'Pin week'}
            </button>
          </div>
        )}
        {pinError && <div className="text-xs text-danger">{pinError}</div>}
      </section>

      {/* Pinned weeks list */}
      {pinned.length > 0 && (
        <section className="bg-bg-card border border-text-secondary/15 rounded-xl p-3 space-y-2">
          <h3 className="text-sm font-semibold text-text-primary">
            Pinned weeks ({pinned.length})
          </h3>
          <ul className="space-y-1">
            {pinned.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 text-xs text-text-secondary border border-text-secondary/10 rounded px-2 py-1.5"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-text-primary truncate">{p.label}</div>
                  <div className="text-[10px] text-text-muted">
                    {p.label_auto ?? formatDate(p.week_start_ts)}
                    {p.note && ` · ${p.note}`}
                  </div>
                </div>
                <button
                  onClick={() => onUnpin(p.id)}
                  className="text-text-muted hover:text-danger text-xs shrink-0"
                  title="Unpin"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Ranked table */}
      <section className="bg-bg-card border border-text-secondary/15 rounded-xl p-3 space-y-2">
        <h3 className="text-sm font-semibold text-text-primary">
          Top {ranked.length} {scope === 'same_type' ? 'in your type' : 'overall'}
        </h3>
        {ranked.length === 0 ? (
          <p className="text-xs text-text-muted">
            No competitor snapshots yet — we need a discovery cycle first. Check back tomorrow.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-text-muted border-b border-text-secondary/15">
                  <th className="py-1.5 px-1">#</th>
                  <th className="py-1.5 px-1">Company</th>
                  <th className="py-1.5 px-1 text-right">Weekly income</th>
                  <th className="py-1.5 px-1 text-right">Customers</th>
                  <th className="py-1.5 px-1 text-right">Daily</th>
                  <th className="py-1.5 px-1 text-right">Staff</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((r: RankedCompanyRow, idx: number) => {
                  const isSelf = r.company_id === viewer_company_id;
                  return (
                    <tr
                      key={r.company_id}
                      className={`border-b border-text-secondary/10 ${
                        isSelf ? 'bg-torn-green/5' : 'hover:bg-bg-elevated/40'
                      }`}
                    >
                      <td className="py-1.5 px-1 text-text-muted">{idx + 1}</td>
                      <td className="py-1.5 px-1">
                        <a
                          href={`https://www.torn.com/joblist.php#!p=corpinfo&ID=${r.company_id}`}
                          target="_blank" rel="noopener noreferrer"
                          className={`hover:text-torn-green ${
                            isSelf ? 'font-semibold text-torn-green' : 'text-text-primary'
                          }`}
                        >
                          {r.tracked_name ?? `#${r.company_id}`}
                        </a>
                        {isSelf && (
                          <span className="ml-1 text-[10px] uppercase text-torn-green">you</span>
                        )}
                      </td>
                      <td className="py-1.5 px-1 text-right text-text-primary font-semibold">
                        {formatMoney(r.weekly_income)}
                      </td>
                      <td className="py-1.5 px-1 text-right text-text-secondary">
                        {r.weekly_customers?.toLocaleString() ?? '—'}
                      </td>
                      <td className="py-1.5 px-1 text-right text-text-secondary">
                        {formatMoney(r.daily_income)}
                      </td>
                      <td className="py-1.5 px-1 text-right text-text-muted">
                        {r.employees_hired ?? 0}/{r.employees_capacity ?? 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[10px] text-text-muted pt-1">
          Rivals ranked by Torn&apos;s rolling 7-day weekly income (the only public metric).
          Your own &quot;anchored sales&quot; above is computed from our daily stock snapshots,
          so it matches a true Mon 18:00 TCT week.
        </p>
      </section>
    </div>
  );
}
