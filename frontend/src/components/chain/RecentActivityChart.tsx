'use client';

import '@/lib/chartjs-setup';
import { useMemo } from 'react';
import { Chart } from 'react-chartjs-2';

interface TimelineBucket {
  bucket_start: number;
  hits: number;
  respect: number;
  wins: number;
  losses: number;
  active_members: number;
}

export function RecentActivityChart({ timeline }: { timeline: TimelineBucket[] }) {
  const data = useMemo(() => {
    const labels = timeline.map(t => {
      const d = new Date(t.bucket_start * 1000);
      return `${d.getHours().toString().padStart(2, '0')}:00`;
    });
    return {
      labels,
      datasets: [
        {
          type: 'bar' as const,
          label: 'Wins',
          data: timeline.map(t => t.wins),
          backgroundColor: 'rgba(63,185,80,0.75)',
          borderColor: '#3fb950',
          borderWidth: 0,
          stack: 'attacks',
          yAxisID: 'y',
          order: 2,
        },
        {
          type: 'bar' as const,
          label: 'Losses',
          data: timeline.map(t => t.losses),
          backgroundColor: 'rgba(248,81,73,0.7)',
          borderColor: '#f85149',
          borderWidth: 0,
          stack: 'attacks',
          yAxisID: 'y',
          order: 2,
        },
        {
          type: 'line' as const,
          label: 'Active members',
          data: timeline.map(t => t.active_members),
          borderColor: '#58a6ff',
          backgroundColor: 'rgba(88,166,255,0.1)',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.3,
          yAxisID: 'y1',
          order: 1,
        },
      ],
    };
  }, [timeline]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options = useMemo((): any => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' as const },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: { color: '#8b949e', usePointStyle: true, pointStyle: 'circle', padding: 12, boxWidth: 8 },
      },
      tooltip: {
        callbacks: {
          title: (items: { dataIndex: number }[]) => {
            const idx = items[0]?.dataIndex ?? 0;
            const t = timeline[idx];
            if (!t) return '';
            const d = new Date(t.bucket_start * 1000);
            return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          },
          afterBody: (items: { dataIndex: number }[]) => {
            const idx = items[0]?.dataIndex ?? 0;
            const t = timeline[idx];
            if (!t) return '';
            const respect = t.respect >= 1000 ? `${(t.respect / 1000).toFixed(1)}k` : t.respect.toFixed(1);
            return [`Respect: ${respect}`, `Hits total: ${t.hits}`];
          },
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        ticks: { color: '#484f58', maxTicksLimit: 12, autoSkip: true },
        grid: { display: false },
      },
      y: {
        stacked: true,
        beginAtZero: true,
        position: 'left' as const,
        ticks: { color: '#484f58', precision: 0 },
        grid: { color: 'rgba(48,54,61,0.3)' },
        title: { display: true, text: 'Hits', color: '#484f58', font: { size: 10 } },
      },
      y1: {
        beginAtZero: true,
        position: 'right' as const,
        ticks: { color: '#484f58', precision: 0 },
        grid: { display: false },
        title: { display: true, text: 'Members', color: '#484f58', font: { size: 10 } },
      },
    },
  }), [timeline]);

  return (
    <div className="h-56 sm:h-64">
      <Chart type="bar" data={data} options={options} />
    </div>
  );
}
