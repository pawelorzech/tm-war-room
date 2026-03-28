'use client';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { formatStatShort } from '@/lib/format';

ChartJS.register(CategoryScale, LinearScale, LogarithmicScale, PointElement, LineElement, Title, Tooltip, Legend);

interface HappyRelevanceChartProps {
  currentStat: number;
  happy: number;
}

export function HappyRelevanceChart({ currentStat, happy }: HappyRelevanceChartProps) {
  // Generate data points on log scale from 1K to 10B
  const statPoints: number[] = [];
  for (let exp = 3; exp <= 10; exp += 0.2) {
    statPoints.push(Math.round(Math.pow(10, exp)));
  }

  const happyComponent = 0.00226263 * happy;
  const percentages = statPoints.map(stat => {
    const statComponent = 0.00019106 * stat;
    const total = statComponent + happyComponent + 0.55;
    return (happyComponent / total) * 100;
  });

  // Find user position index
  const userIndex = statPoints.findIndex(s => s >= currentStat);
  const userPercent = (() => {
    const sc = 0.00019106 * currentStat;
    return (happyComponent / (sc + happyComponent + 0.55)) * 100;
  })();

  const data = {
    labels: statPoints.map(s => formatStatShort(s)),
    datasets: [
      {
        label: 'Happy Contribution %',
        data: percentages,
        borderColor: '#f39c12',
        backgroundColor: 'rgba(243, 156, 18, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        pointHitRadius: 10,
      },
      // User marker
      {
        label: `You (${formatStatShort(currentStat)})`,
        data: statPoints.map((_, i) => i === (userIndex >= 0 ? userIndex : statPoints.length - 1) ? userPercent : null),
        borderColor: '#7ca900',
        backgroundColor: '#7ca900',
        pointRadius: 8,
        pointStyle: 'crossRot' as const,
        showLine: false,
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
          label: (ctx: any) => ctx.parsed.y !== null ? `${ctx.parsed.y.toFixed(2)}%` : '',
        },
      },
    },
    scales: {
      x: {
        ticks: { color: '#a0a0a0', maxRotation: 45 },
        grid: { color: 'rgba(255,255,255,0.05)' },
      },
      y: {
        min: 0,
        max: 60,
        ticks: {
          color: '#a0a0a0',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          callback: (val: any) => `${val}%`,
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
