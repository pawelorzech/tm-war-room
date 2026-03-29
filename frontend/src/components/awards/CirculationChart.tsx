'use client';

import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface CirculationPoint {
  snapshot_date: string;
  circulation: number;
}

export function CirculationChart({ history }: { history: CirculationPoint[] }) {
  // API returns DESC order, reverse for chronological display
  const sorted = useMemo(() => [...history].reverse(), [history]);

  const data = useMemo(() => {
    const labels = sorted.map(p => {
      const d = new Date(p.snapshot_date + 'T00:00:00');
      return `${d.getMonth() + 1}/${d.getDate()}`;
    });

    return {
      labels,
      datasets: [{
        label: 'Circulation',
        data: sorted.map(p => p.circulation),
        borderColor: '#3fb950',
        backgroundColor: 'rgba(63,185,80,0.1)',
        borderWidth: 2,
        pointRadius: sorted.length > 50 ? 0 : 3,
        fill: true,
        tension: 0.3,
      }],
    };
  }, [sorted]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options = useMemo((): any => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: { raw: unknown }) => `${(ctx.raw as number).toLocaleString()} players`,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: '#484f58', maxTicksLimit: 10 },
        grid: { color: 'rgba(48,54,61,0.3)' },
      },
      y: {
        ticks: {
          color: '#484f58',
          callback: (v: number | string) => Number(v).toLocaleString(),
        },
        grid: { color: 'rgba(48,54,61,0.3)' },
      },
    },
    interaction: { intersect: false, mode: 'index' as const },
  }), []);

  if (sorted.length < 2) {
    return (
      <div className="h-48 flex items-center justify-center text-text-muted text-sm">
        Circulation tracking started recently. Check back in a few days for trend data.
      </div>
    );
  }

  return (
    <div className="h-48">
      <Line data={data} options={options} />
    </div>
  );
}
