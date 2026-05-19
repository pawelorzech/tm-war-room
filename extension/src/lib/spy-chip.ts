// Compact one-line representation of a spy estimate for hospital/jail list
// rows. Replaces the verbose "VERIFIED SPY 4,781,861,924 4 DAYS OLD - TORNSTATS"
// pill with a short chip like "4.78B verified" — full attribution moves into
// the tooltip so the list row stays scannable.

import { formatTotalRange, bucketCaption } from './spy-display';
import type { SpyEstimate, Bucket } from './spy-display';
import type { WarOffLimits } from '../types';

function fmtCompact(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(Math.round(n));
}

export function spyChipLabel(spy: SpyEstimate): string {
  const bucket: Bucket = spy.bucket ?? 'rough_guess';
  if (bucket === 'verified') {
    return spy.total > 0 ? `${fmtCompact(spy.total)} verified` : 'verified';
  }
  if (bucket === 'endgame') return 'endgame';
  const range = formatTotalRange(spy.total, spy.total_range, bucket);
  if (bucket === 'estimate') {
    return range ? `${range} est.` : '? est.';
  }
  return range ? `${range} ?` : '? guess';
}

export function spyChipTooltip(spy: SpyEstimate, offLimits: WarOffLimits | null): string {
  const bucket: Bucket = spy.bucket ?? 'rough_guess';
  const label =
    bucket === 'verified' ? 'Verified spy'
      : bucket === 'estimate' ? 'Stat estimate'
        : bucket === 'rough_guess' ? 'Rough guess'
          : 'Endgame player';
  const bits: string[] = [label];
  if (bucket === 'verified' && spy.total > 0) {
    bits.push(`Total ${spy.total.toLocaleString('en-US')}`);
  }
  bits.push(bucketCaption(spy));
  const body = bits.join(' · ');
  if (offLimits) {
    const reason = offLimits.reason || 'medded/dipped';
    const flagger = offLimits.set_by_name || 'faction';
    return `WAR OFF-LIMITS — ${reason} (flagged by ${flagger}) · ${body}`;
  }
  return body;
}

export function buildSpyChip(
  spy: SpyEstimate,
  offLimits: WarOffLimits | null,
): HTMLElement {
  const chip = document.createElement('span');
  const bucket: Bucket = spy.bucket ?? 'rough_guess';
  chip.classList.add('spy-chip', `tm-bucket-${bucket}`);
  if (offLimits) chip.classList.add('tm-off-limits');
  chip.textContent = spyChipLabel(spy);
  chip.setAttribute('title', spyChipTooltip(spy, offLimits));
  return chip;
}

// Single source of truth for the row-edge stripe colour. Hospital + jail both
// import this so the priority order stays in sync.
export type RoleStripeRole = 'tm_mate' | 'off_limits' | 'war_enemy' | 'target' | null;

export function pickStripeRole(d: {
  tm_mate: boolean;
  war_enemy: boolean;
  off_limits: WarOffLimits | null;
  target: { tag?: string | null } | null;
}): RoleStripeRole {
  if (d.tm_mate) return 'tm_mate';
  if (d.off_limits) return 'off_limits';
  if (d.war_enemy) return 'war_enemy';
  if (d.target) return 'target';
  return null;
}

const STRIPE_COLOR: Record<Exclude<RoleStripeRole, null>, string> = {
  tm_mate: '#3fb950',
  off_limits: '#f85149',
  war_enemy: '#f85149',
  target: '#a78bfa',
};

// Inset box-shadow paints the stripe inside the row without shifting layout —
// border-left would push the row content right by 4px on every list page.
export function stripeBoxShadow(role: RoleStripeRole): string {
  if (!role) return '';
  return `inset 4px 0 0 ${STRIPE_COLOR[role]}`;
}
