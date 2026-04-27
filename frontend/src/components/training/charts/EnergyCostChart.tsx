'use client';
import '@/lib/chartjs-setup';
import { Bar } from 'react-chartjs-2';
import { formatMoney } from '@/lib/format';

interface EnergyCostChartProps {
  gainPerEnergy: number;
}

export function EnergyCostChart({ gainPerEnergy }: EnergyCostChartProps) {
  if (gainPerEnergy <= 0) return <p className="text-text-secondary text-sm">Enter stats to see cost comparison.</p>;

  const sources = [
    { name: 'Natural Energy', cost: 0, energy: 150 },
    { name: 'Xanax', cost: 839_000, energy: 250 },
    { name: 'Point Refill', cost: 845_000, energy: 150 },
    { name: 'LSD', cost: 150_000, energy: 50 },
    { name: 'Energy Can (x6)', cost: 12_600_000, energy: 150 },
    { name: 'FHC (use)', cost: 12_500_000, energy: 150 },
  ];

  const costPer1KStat = sources.map(s => {
    const totalGain = gainPerEnergy * s.energy;
    return totalGain > 0 ? (s.cost / totalGain) * 1000 : 0;
  });

  const colors = costPer1KStat.map(c => {
    if (c === 0) return '#7ca900'; // free
    if (c < 5) return '#7ca900';
    if (c < 20) return '#f39c12';
    return '#e74c3c';
  });

  const data = {
    labels: sources.map(s => s.name),
    datasets: [
      {
        label: 'Cost per 1K Stat',
        data: costPer1KStat,
        backgroundColor: colors,
        borderColor: colors.map(c => c),
        borderWidth: 1,
      },
    ],
  };

  const options = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          label: (ctx: any) => ctx.parsed.x === 0 ? 'Free!' : `${formatMoney(ctx.parsed.x)} per 1K stat`,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: '#a0a0a0',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          callback: (val: any) => val === 0 ? 'Free' : formatMoney(val as number),
        },
        grid: { color: 'rgba(255,255,255,0.05)' },
      },
      y: {
        ticks: { color: '#a0a0a0' },
        grid: { display: false },
      },
    },
  };

  return (
    <div className="h-64 w-full">
      <Bar data={data} options={options as any} />
    </div>
  );
}
