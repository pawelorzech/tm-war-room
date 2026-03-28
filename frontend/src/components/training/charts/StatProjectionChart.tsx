'use client';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { formatStatShort } from '@/lib/format';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface StatProjectionChartProps {
  currentStat: number;
  gainPerDay: number;
}

export function StatProjectionChart({ currentStat, gainPerDay }: StatProjectionChartProps) {
  const days = Array.from({ length: 366 }, (_, i) => i);
  const values = days.map(d => currentStat + gainPerDay * d);

  const data = {
    labels: days,
    datasets: [
      {
        label: 'Current Strategy',
        data: values,
        borderColor: '#7ca900',
        backgroundColor: 'rgba(124, 169, 0, 0.1)',
        fill: true,
        tension: 0.1,
        pointRadius: 0,
        pointHitRadius: 10,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, labels: { color: '#a0a0a0' } },
      tooltip: {
        callbacks: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          title: (ctx: any) => `Day ${ctx[0].label}`,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          label: (ctx: any) => `${formatStatShort(ctx.parsed.y)} stat`,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: '#a0a0a0',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          callback: (val: any) => [0, 30, 90, 180, 365].includes(val) ? `Day ${val}` : '',
          maxRotation: 0,
        },
        grid: { color: 'rgba(255,255,255,0.05)' },
      },
      y: {
        ticks: {
          color: '#a0a0a0',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          callback: (val: any) => formatStatShort(val as number),
        },
        grid: { color: 'rgba(255,255,255,0.05)' },
      },
    },
  };

  return (
    <div className="h-64 w-full">
      <Line data={data} options={options as any} />
    </div>
  );
}
