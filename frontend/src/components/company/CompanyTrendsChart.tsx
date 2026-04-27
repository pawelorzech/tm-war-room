'use client';

import '@/lib/chartjs-setup';
import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';

interface CompanyTrendRow {
  snapshot_date: string;
  company_funds?: number | null;
  company_bank?: number | null;
  advertising_budget?: number | null;
  popularity?: number | null;
  efficiency?: number | null;
  environment?: number | null;
  daily_income?: number | null;
  weekly_income?: number | null;
  employees_hired?: number | null;
}

type Metric =
  | 'company_funds'
  | 'company_bank'
  | 'advertising_budget'
  | 'popularity'
  | 'efficiency'
  | 'environment'
  | 'daily_income'
  | 'weekly_income'
  | 'employees_hired';

const METRIC_LABELS: Record<Metric, string> = {
  company_funds: 'Funds',
  company_bank: 'Bank',
  advertising_budget: 'Ad budget',
  popularity: 'Popularity',
  efficiency: 'Efficiency',
  environment: 'Environment',
  daily_income: 'Daily income',
  weekly_income: 'Weekly income',
  employees_hired: 'Employees',
};

const METRIC_COLORS: Record<Metric, string> = {
  company_funds: '#3fb950',
  company_bank: '#3b82f6',
  advertising_budget: '#f59e0b',
  popularity: '#8b5cf6',
  efficiency: '#ef4444',
  environment: '#14b8a6',
  daily_income: '#22d3ee',
  weekly_income: '#d946ef',
  employees_hired: '#94a3b8',
};

export function CompanyTrendsChart({
  rows,
  metrics,
}: {
  rows: CompanyTrendRow[];
  metrics: Metric[];
}) {
  const data = useMemo(() => {
    const labels = rows.map((r) => {
      const d = new Date(r.snapshot_date);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    });
    return {
      labels,
      datasets: metrics.map((m, i) => ({
        label: METRIC_LABELS[m],
        data: rows.map((r) => r[m] ?? null),
        borderColor: METRIC_COLORS[m],
        backgroundColor: `${METRIC_COLORS[m]}20`,
        borderWidth: 2,
        pointRadius: rows.length > 30 ? 0 : 2.5,
        tension: 0.3,
        fill: i === 0,
      })),
    };
  }, [rows, metrics]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options = useMemo((): any => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: { color: '#8b949e', usePointStyle: true, pointStyle: 'circle', padding: 12, font: { size: 11 } },
      },
      tooltip: {
        callbacks: {
          label: (ctx: { dataset: { label: string }; raw: unknown }) => {
            const val = ctx.raw as number | null;
            if (val == null) return `${ctx.dataset.label}: —`;
            if (Math.abs(val) >= 1e9) return `${ctx.dataset.label}: $${(val / 1e9).toFixed(2)}B`;
            if (Math.abs(val) >= 1e6) return `${ctx.dataset.label}: $${(val / 1e6).toFixed(2)}M`;
            if (Math.abs(val) >= 1e3) return `${ctx.dataset.label}: ${val.toLocaleString()}`;
            return `${ctx.dataset.label}: ${val}`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { color: '#484f58', maxTicksLimit: 12 },
        grid: { color: 'rgba(48,54,61,0.3)' },
      },
      y: {
        ticks: {
          color: '#484f58',
          callback: (value: number | string) => {
            const v = Number(value);
            if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
            if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
            if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
            return String(v);
          },
        },
        grid: { color: 'rgba(48,54,61,0.3)' },
      },
    },
    interaction: { intersect: false, mode: 'index' as const },
  }), []);

  return (
    <div className="h-64">
      <Line data={data} options={options} />
    </div>
  );
}
