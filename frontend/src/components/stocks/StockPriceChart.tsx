'use client';

import '@/lib/chartjs-setup';
import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';

interface PricePoint {
  price: number;
  recorded_at: number;
}

export function StockPriceChart({ prices, name }: { prices: PricePoint[]; name: string }) {
  const data = useMemo(() => {
    const labels = prices.map(p => {
      const d = new Date(p.recorded_at * 1000);
      return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    });

    return {
      labels,
      datasets: [{
        label: name,
        data: prices.map(p => p.price),
        borderColor: '#3fb950',
        backgroundColor: 'rgba(63,185,80,0.1)',
        borderWidth: 2,
        pointRadius: prices.length > 50 ? 0 : 2,
        fill: true,
        tension: 0.3,
      }],
    };
  }, [prices, name]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options = useMemo((): any => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: { raw: unknown }) => `$${(ctx.raw as number).toFixed(2)}`,
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
          callback: (v: number | string) => `$${Number(v).toFixed(2)}`,
        },
        grid: { color: 'rgba(48,54,61,0.3)' },
      },
    },
    interaction: { intersect: false, mode: 'index' as const },
  }), []);

  if (prices.length < 2) {
    return (
      <div className="h-48 flex items-center justify-center text-text-muted text-sm">
        Not enough data yet — price history starts building after deploy.
      </div>
    );
  }

  return (
    <div className="h-48">
      <Line data={data} options={options} />
    </div>
  );
}
