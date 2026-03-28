'use client';

import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface Snapshot {
  snapshot_date: string;
  strength: number;
  defense: number;
  speed: number;
  dexterity: number;
  total: number;
}

const COLORS = {
  strength: { border: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  defense: { border: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  speed: { border: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  dexterity: { border: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
  total: { border: '#3fb950', bg: 'rgba(63,185,80,0.1)' },
};

export function StatGrowthChart({ snapshots }: { snapshots: Snapshot[] }) {
  const data = useMemo(() => {
    const labels = snapshots.map(s => {
      const d = new Date(s.snapshot_date);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    });

    return {
      labels,
      datasets: [
        {
          label: 'Total',
          data: snapshots.map(s => s.total),
          borderColor: COLORS.total.border,
          backgroundColor: COLORS.total.bg,
          borderWidth: 2,
          pointRadius: snapshots.length > 30 ? 0 : 3,
          fill: true,
          tension: 0.3,
        },
        {
          label: 'STR',
          data: snapshots.map(s => s.strength),
          borderColor: COLORS.strength.border,
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.3,
          hidden: true,
        },
        {
          label: 'DEF',
          data: snapshots.map(s => s.defense),
          borderColor: COLORS.defense.border,
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.3,
          hidden: true,
        },
        {
          label: 'SPD',
          data: snapshots.map(s => s.speed),
          borderColor: COLORS.speed.border,
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.3,
          hidden: true,
        },
        {
          label: 'DEX',
          data: snapshots.map(s => s.dexterity),
          borderColor: COLORS.dexterity.border,
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.3,
          hidden: true,
        },
      ],
    };
  }, [snapshots]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options = useMemo((): any => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: { color: '#8b949e', usePointStyle: true, pointStyle: 'circle', padding: 15 },
      },
      tooltip: {
        callbacks: {
          label: (ctx: { dataset: { label: string }; raw: unknown }) => {
            const val = ctx.raw as number;
            const label = ctx.dataset.label;
            if (val >= 1e9) return `${label}: ${(val / 1e9).toFixed(3)}B`;
            if (val >= 1e6) return `${label}: ${(val / 1e6).toFixed(1)}M`;
            return `${label}: ${val.toLocaleString()}`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { color: '#484f58', maxTicksLimit: 15 },
        grid: { color: 'rgba(48,54,61,0.3)' },
      },
      y: {
        ticks: {
          color: '#484f58',
          callback: (value: number | string) => {
            const v = Number(value);
            if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
            if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
            return String(v);
          },
        },
        grid: { color: 'rgba(48,54,61,0.3)' },
      },
    },
    interaction: { intersect: false, mode: 'index' as const },
  }), []);

  return (
    <div className="h-72">
      <Line data={data} options={options} />
    </div>
  );
}
