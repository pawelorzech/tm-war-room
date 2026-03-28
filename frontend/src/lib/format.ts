// War Room formatters
export function fmtCD(seconds: number): string {
  if (!seconds || seconds <= 0) return "\u2014";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function fmtNum(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

// Training Guide formatters
export function formatStatShort(value: number): string {
  if (value === 0) return '0';
  if (value >= 1_000_000_000) {
    const b = value / 1_000_000_000;
    return b >= 10 ? `${Math.round(b)}B` : `${b.toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return m >= 100 ? `${Math.round(m)}M` : `${m.toFixed(1).replace(/\.?0+$/, '')}M`;
  }
  if (value >= 1_000) {
    const k = value / 1_000;
    return k >= 100 ? `${Math.round(k)}K` : `${k.toFixed(1).replace(/\.?0+$/, '')}K`;
  }
  return Math.round(value).toString();
}

export function formatStatFull(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

export function formatMoney(value: number): string {
  if (value === 0) return '$0';
  if (value >= 1_000_000_000) {
    const b = value / 1_000_000_000;
    return `$${b.toFixed(1).replace(/\.?0+$/, '')}B`;
  }
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `$${m.toFixed(1).replace(/\.?0+$/, '')}M`;
  }
  if (value >= 1_000) {
    const k = value / 1_000;
    return `$${k.toFixed(0).replace(/\.?0+$/, '')}K`;
  }
  if (value < 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(0)}`;
}

export function formatMultiplier(value: number): string {
  if (value >= 100) return `${Math.round(value)}x`;
  return `${value.toFixed(1)}x`;
}

export function formatPercent(value: number, decimals?: number): string {
  if (decimals !== undefined) {
    return `${value.toFixed(decimals)}%`;
  }
  if (value < 0.01) return `${value.toFixed(3)}%`;
  if (value < 1) return `${value.toFixed(2)}%`;
  return `${value.toFixed(1)}%`;
}
