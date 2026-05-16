// Shared formatting helpers used across multiple inject modules.
//
// Kept tiny on purpose — every inject module had its own copy of escapeHtml
// (and a few had formatTotal), which cost ~700 bytes in the minified bundle.
// Centralising them recovered enough headroom to fit new overlays under the
// 150 KiB budget.

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function formatTotal(total: number): string {
  if (total >= 1_000_000_000) return `${(total / 1_000_000_000).toFixed(2)}B`;
  if (total >= 1_000_000) return `${(total / 1_000_000).toFixed(1)}M`;
  if (total >= 1_000) return `${(total / 1_000).toFixed(0)}K`;
  return String(total);
}
